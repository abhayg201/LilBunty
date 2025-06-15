<script lang="ts">
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Separator } from '$lib/components/ui/separator';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import {
    chatContainerVisible,
    selectedText,
    currentThread,
    threadList,
    isLoadingThread,
    showThreadHistory,
    overlayPosition,
  } from '../lib/stores';
  import { ContextService, type UserPreferences } from '../services/context-service';
  import { ThreadMessaging, BrowserMessaging } from '../services/browser-messaging';
  import type { Thread, Message } from '../models/thread';
  import { onDestroy, onMount } from 'svelte';
  import { marked, type MarkedOptions } from 'marked';
  import hljs from 'highlight.js';
  import 'highlight.js/styles/github.css';
  import Tiptap from '$lib/components/Tiptap.svelte';
  import SvelteMarkdown from '@humanspeak/svelte-markdown';

  let response = '';
  let loading = false;
  let customPrompt = '';
  let selectedPromptType = '';
  let port: chrome.runtime.Port;
  let responseDiv: HTMLDivElement | null = null;
  let shadowRoot: ShadowRoot | null = null;
  let chatOverlay: HTMLDivElement | null = null;
  let dragOffset = { x: 0, y: 0 };
  let dragging = false;
  let tiptapEditor: Tiptap | undefined;

  let currentThreadData: Thread | null = null;
  let messages: Message[] = [];

  // Subscribe to current thread changes
  $: if ($currentThread) {
    currentThreadData = $currentThread;
    messages = currentThreadData?.messages || [];
  }

  onMount(async () => {
    // Find the shadow root (if any)
    if (chatOverlay) {
      shadowRoot = chatOverlay!.getRootNode() as ShadowRoot;
    }

    const mountEvent = new CustomEvent('chat-overlay-mounted');
    chatOverlay?.dispatchEvent(mountEvent);

    // Listen for position updates from content script (for dragging)
    if (chatOverlay) {
      chatOverlay.addEventListener('position-update', e => {
        const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
        overlayPosition.set({ x, y });
        console.log('position-update', x, y);
      });
    }

    // Initialize thread management
    await initializeThread();
    await loadThreadHistory();
  });

  async function initializeThread() {
    if (!$selectedText) return;
    console.log('New thread init');
    isLoadingThread.set(true);
    try {
      // First, check if there's an existing thread for this selected text and URL
      const currentUrl = window.location.href;
      const summariesResponse = await ThreadMessaging.getThreadSummaries(
        { domain: extractDomain(currentUrl) },
        10
      );

      if (summariesResponse.success) {
        // Look for a thread with the same selected text
        const existingThread = summariesResponse.data.find(
          (summary: any) => summary.selectedText === $selectedText
        );

        if (existingThread) {
          // Load the existing thread
          const threadResponse = await ThreadMessaging.getThread(existingThread.id);
          if (threadResponse.success && threadResponse.data) {
            currentThread.set(threadResponse.data);
            return;
          }
        }
      }

      // Create a new thread if no existing one found
      const response = await ThreadMessaging.createThread(currentUrl);
      if (response.success) {
        currentThread.set(response.data);
      }
    } catch (error) {
      console.error('Error initializing thread:', error);
    } finally {
      isLoadingThread.set(false);
    }
  }

  function extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  async function loadThreadHistory() {
    try {
      const response = await ThreadMessaging.getThreadSummaries({}, 20);
      if (response.success) {
        threadList.set(response.data);
      }
    } catch (error) {
      console.error('Error loading thread history:', error);
    }
  }

  async function loadThread(threadId: string) {
    isLoadingThread.set(true);
    try {
      const threadResponse = await ThreadMessaging.getThread(threadId);
      if (threadResponse.success && threadResponse.data) {
        currentThread.set(threadResponse.data);
        // Clear any current response being typed
        response = '';
        if (tiptapEditor) {
          tiptapEditor.clear();
        }
      }
    } catch (error) {
      console.error('Error loading thread:', error);
    } finally {
      isLoadingThread.set(false);
    }
  }

  async function toggleThreadFavorite(threadId: string) {
    try {
      await ThreadMessaging.toggleFavorite(threadId);
      // Refresh thread list to show updated favorite status
      await loadThreadHistory();

      // Also refresh current thread if it's the one being favorited
      if ($currentThread?.id === threadId) {
        const threadResponse = await ThreadMessaging.getThread(threadId);
        if (threadResponse.success && threadResponse.data) {
          currentThread.set(threadResponse.data);
        }
      }
    } catch (error) {
      console.error('Error toggling thread favorite:', error);
    }
  }

  function onDragStart(event: MouseEvent) {
    dragging = true;
    console.log('onDragStart event', event);

    // Get the shadowHost position for proper offset calculation
    const shadowHost = shadowRoot?.host as HTMLElement;
    if (shadowHost) {
      const hostRect = shadowHost.getBoundingClientRect();
      dragOffset = {
        x: event.clientX - hostRect.left,
        y: event.clientY - hostRect.top,
      };
    }

    // Dispatch start event to content script
    const dragStartEvent = new CustomEvent('drag-start', {
      detail: {
        offset: dragOffset,
        initialPos: { x: 0, y: 0 }, // shadowHost handles actual position
      },
    });
    document.dispatchEvent(dragStartEvent);
  }

  // Predefined prompt templates
  const promptTemplates = [
    {
      id: 'explain',
      label: 'Explain',
      prompt: 'Please explain this text in simple terms:',
    },
    {
      id: 'summarize',
      label: 'Summarize',
      prompt: 'Please provide a concise summary of:',
    },
    {
      id: 'translate',
      label: 'Translate',
      prompt: 'Please translate this text to English:',
    },
    {
      id: 'analyze',
      label: 'Analyze',
      prompt: 'Please analyze and provide insights about:',
    },
    {
      id: 'questions',
      label: 'Ask Questions',
      prompt: 'Generate thoughtful questions about:',
    },
  ];

  function handleClose() {
    chatContainerVisible.set(false);
    response = '';
    if (tiptapEditor) {
      tiptapEditor.clear();
    }
    selectedPromptType = '';
    loading = false;
    if (port) port.disconnect();

    // Clear thread state
    currentThread.set(null);
    showThreadHistory.set(false);
  }

  function selectPromptTemplate(template: (typeof promptTemplates)[0]) {
    selectedPromptType = template.id;
    customPrompt = template.prompt;
  }

  function handleTiptapSend(event: CustomEvent) {
    const { content, model } = event.detail;
    // Use the content from the editor and trigger the AI request
    sendToGPT();
  }

  async function sendToGPT() {
    if (!$currentThread) return;

    const finalPrompt = tiptapEditor?.getText() || 'Please help me understand this text:';
    const context = {
      selectedText: $selectedText,
    };
    // Save user message to thread
    try {
      await ThreadMessaging.addMessage($currentThread.id, 'user', finalPrompt, undefined, context);
      // Refresh current thread data
      const threadResponse = await ThreadMessaging.getThread($currentThread.id);
      if (threadResponse.success && threadResponse.data) {
        currentThread.set(threadResponse.data);
      }
    } catch (error) {
      console.error('Error saving user message:', error);
    }

    loading = true;
    response = '';
    // Remove previous listener and disconnect port if any
    if (port) {
      port.disconnect();
    }

    // Open a port for streaming
    const messaging = BrowserMessaging.getInstance();
    port = messaging.connect();
    port.postMessage({
      type: 'QUERY_OPENAI_STREAM',
      payload: {
        threadId: $currentThread.id, // Pass thread ID for context
      },
    });

    port.onMessage.addListener(handleStreamMessage);
  }

  async function handleStreamMessage(msg: any) {
    if (msg.type === 'STREAM_CHUNK') {
      response += msg.chunk;

      // Auto-scroll to bottom as new text arrives
      setTimeout(() => {
        if (responseDiv) responseDiv.scrollTop = responseDiv.scrollHeight;
      }, 0);
    } else if (msg.type === 'STREAM_DONE') {
      loading = false;
      port.disconnect();

      // Save assistant response to thread
      if (response && $currentThread) {
        try {
          await ThreadMessaging.addMessage($currentThread.id, 'assistant', response);
          // Refresh current thread data and thread list
          const threadResponse = await ThreadMessaging.getThread($currentThread.id);
          if (threadResponse.success && threadResponse.data) {
            currentThread.set(threadResponse.data);
          }
          await loadThreadHistory(); // Refresh thread list

          // Clear the editor for next message
          if (tiptapEditor) {
            tiptapEditor.clear();
          }
        } catch (error) {
          console.error('Error saving assistant message:', error);
        }
      }
    } else if (msg.type === 'STREAM_ERROR') {
      response = 'Error: ' + msg.error;
      loading = false;
      port.disconnect();
    }
  }

  onDestroy(() => {
    if (port) port.disconnect();
  });

  marked.setOptions({
    highlight: (code: string, lang: string) => {
      return hljs.highlightAuto(code, [lang]).value;
    },
  } as MarkedOptions);
</script>

{#if $chatContainerVisible}
  <div class="chat-overlay {dragging ? 'dragging' : ''}" bind:this={chatOverlay}>
    <Card class="chat-card bg-background border border-border rounded-xl overflow-hidden shadow-xl">
      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <CardTitle class="text-lg">AI Assistant</CardTitle>
          <div class="flex items-center gap-2">
            <!-- Drag handle -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="drag-handle flex items-center justify-center p-1 rounded hover:bg-muted transition-colors"
              title="Drag"
              on:mousedown={e => onDragStart(e as MouseEvent)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="5" cy="6" r="1.5" fill="#bbb" />
                <circle cx="5" cy="10" r="1.5" fill="#bbb" />
                <circle cx="5" cy="14" r="1.5" fill="#bbb" />
                <circle cx="10" cy="6" r="1.5" fill="#bbb" />
                <circle cx="10" cy="10" r="1.5" fill="#bbb" />
                <circle cx="10" cy="14" r="1.5" fill="#bbb" />
              </svg>
            </div>
            <Button variant="ghost" size="icon" on:click={handleClose} class="h-8 w-8">
              <span class="text-lg">×</span>
            </Button>
          </div>
        </div>
        <CardDescription>Chat about your selected text</CardDescription>
      </CardHeader>

      <!-- Conversation History -->
      {#if messages.length > 0 || loading}
        <Separator />
        <div
          class="conversation-section bg-gradient-to-br from-primary/5 to-transparent rounded-lg p-4 animate-fade-in-up"
        >
          <div class="flex items-center justify-between mb-4">
            <h4 class="text-sm font-semibold text-primary">Conversation</h4>
            <div class="flex items-center gap-2">
              <Badge variant="secondary" class="text-xs">
                {messages.length + (loading ? 1 : 0)} messages
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                on:click={() => showThreadHistory.set(!$showThreadHistory)}
                class="text-xs h-7"
              >
                {$showThreadHistory ? 'Hide' : 'Show'} History
              </Button>
            </div>
          </div>

          <div
            class="thread-container max-h-64 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400"
            bind:this={responseDiv}
          >
            {#each messages as message}
              <div
                class="message-item flex gap-3 animate-fade-in-up {message.role === 'user'
                  ? 'flex-row-reverse'
                  : ''}"
              >
                <div class="message-content-wrapper flex-1 min-w-0">
                  <div
                    class="flex items-center gap-2 mb-2 {message.role === 'user'
                      ? 'justify-end'
                      : 'justify-start'}"
                  >
                    <span
                      class="text-xs font-medium {message.role === 'user'
                        ? 'text-primary'
                        : 'text-accent-foreground'}"
                    >
                      {message.role === 'user' ? 'You' : 'AI Assistant'}
                    </span>
                    <Badge variant="outline" class="text-xs h-5">
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Badge>
                  </div>

                  <div
                    class="message-bubble rounded-2xl px-4 py-3 max-w-full break-words transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg {message.role ===
                    'user'
                      ? 'user-message bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-br-md'
                      : 'ai-message bg-muted border border-border rounded-bl-md'}"
                  >
                    <div class="message-text text-sm leading-relaxed">
                      <SvelteMarkdown source={message.content} />
                    </div>
                  </div>
                </div>
              </div>
            {/each}

            {#if loading}
              <div class="message-item flex gap-3 animate-fade-in-up">

                <div class="message-content-wrapper flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-medium text-accent-foreground">AI Assistant</span>
                    <div class="flex items-center gap-1">
                      <div
                        class="animate-spin h-3 w-3 border-2 border-accent border-t-transparent rounded-full"
                      ></div>
                      <Badge variant="secondary" class="text-xs h-5">
                        {response ? 'Streaming...' : 'Thinking...'}
                      </Badge>
                    </div>
                  </div>

                  {#if response}
                    <div
                      class="message-bubble rounded-2xl px-4 py-3 max-w-full break-words transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ai-message bg-muted border border-border rounded-bl-md"
                    >
                      <div class="message-text text-sm leading-relaxed">
                        {@html marked.parse(response)}
                      </div>
                    </div>
                  {:else}
                    <div
                      class="message-bubble rounded-2xl px-4 py-3 max-w-full break-words ai-message bg-gradient-to-r from-muted to-muted/80 border border-dashed border-border rounded-bl-md min-h-12 flex items-center"
                    >
                      <div class="flex items-center gap-2 text-muted-foreground">
                        <div class="flex space-x-1">
                          <div class="w-2 h-2 bg-current rounded-full animate-bounce"></div>
                          <div
                            class="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:0.1s]"
                          ></div>
                          <div
                            class="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:0.2s]"
                          ></div>
                        </div>
                        <span class="text-xs">AI is typing...</span>
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <CardContent class="space-y-4">
        <!-- Selected Text Display -->
        <div
          class="selected-text-section bg-gradient-to-br from-muted/30 to-muted/10 border border-border rounded-lg p-4 animate-fade-in-up"
        >
          <h4 class="text-sm font-semibold text-primary mb-2">Selected Text:</h4>
          <div
            class="bg-background border border-border rounded-md p-3 text-sm max-h-20 overflow-y-auto font-mono leading-relaxed scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300"
          >
            "{$selectedText}"
          </div>
        </div>

        <Separator />

        <!-- Custom Prompt Input -->
        <div
          class="custom-prompt bg-gradient-to-br from-accent/10 to-transparent rounded-lg p-4 animate-fade-in-up"
        >
          <Tiptap
            bind:this={tiptapEditor}
            placeholder="Ask anything"
            disabled={loading}
            minHeight="32px"
            on:send={handleTiptapSend}
          />
        </div>

        <!-- Thread History Panel -->
        {#if $showThreadHistory}
          <Separator />
          <div
            class="thread-history-section bg-gradient-to-br from-primary/5 to-transparent rounded-lg p-4 animate-fade-in-up"
          >
            <h4 class="text-sm font-semibold text-primary mb-3">Recent Conversations:</h4>
            <div
              class="thread-list max-h-40 overflow-y-auto space-y-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300"
            >
              {#if $isLoadingThread}
                <div class="flex items-center justify-center py-4">
                  <div
                    class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"
                  ></div>
                  <span class="ml-2 text-xs text-muted-foreground">Loading...</span>
                </div>
              {:else}
                {#each $threadList as threadSummary}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div
                    class="thread-item p-2 rounded-md border cursor-pointer transition-all duration-200 hover:bg-muted/50 hover:-translate-y-0.5 hover:shadow-md {$currentThread?.id ===
                    threadSummary.id
                      ? 'bg-primary/10 border-primary'
                      : 'hover:bg-muted/50'}"
                    on:click={() => loadThread(threadSummary.id)}
                    role="button"
                    tabindex="0"
                  >
                    <div class="flex items-start justify-between">
                      <div class="flex-1 min-w-0">
                        <div class="text-xs font-medium truncate">{threadSummary.title}</div>
                        <div class="text-xs text-muted-foreground truncate mt-1">
                          {threadSummary.domain}
                        </div>
                        <div class="text-xs text-muted-foreground mt-1">
                          {threadSummary.messageCount} messages • {new Date(
                            threadSummary.updatedAt
                          ).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        class="text-xs transition-transform hover:scale-110 {threadSummary.favorite
                          ? 'text-yellow-500'
                          : 'text-gray-400'}"
                        on:click|stopPropagation={() => toggleThreadFavorite(threadSummary.id)}
                        title={threadSummary.favorite
                          ? 'Remove from favorites'
                          : 'Add to favorites'}
                      >
                        ★
                      </button>
                    </div>
                  </div>
                {/each}

                {#if $threadList.length === 0}
                  <div class="text-xs text-muted-foreground text-center py-4">
                    No previous conversations
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        {/if}
      </CardContent>
    </Card>
  </div>
{/if}

<style>
  /* Essential component-specific styles only - thread styling now handled by Tailwind + shadow-styles.css */
  .chat-overlay {
    position: relative;
    z-index: 10000;
    animation: slideIn 0.2s ease-out;
    filter: drop-shadow(0 25px 25px rgb(0 0 0 / 0.15));
  }

  .chat-overlay.dragging {
    cursor: grabbing;
    user-select: none;
  }

  .chat-card {
    width: 420px;
    max-width: 90vw;
    max-height: 80vh;
    backdrop-filter: blur(8px);
  }

  .drag-handle {
    cursor: grab;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
