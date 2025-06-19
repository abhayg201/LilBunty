<script lang="ts">
  import { Card, Button, Badge, Avatar, Spinner } from 'flowbite-svelte';
  import { Plus, X, History, Sparkles, Send } from 'lucide-svelte';
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
        const sortedSummaries = summariesResponse.data.sort(
          (a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        // Get the latest thread
        const latestThread = sortedSummaries[0];

        if (latestThread) {
          // Load the existing thread
          const threadResponse = await ThreadMessaging.getThread(latestThread.id);
          if (threadResponse.success && threadResponse.data) {
            currentThread.set(threadResponse.data);
            return;
          }
        } else {
          const response = await ThreadMessaging.createThread(currentUrl);
          if (response.success) {
            currentThread.set(response.data);
          }
        }
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

  async function createNewThread() {
    isLoadingThread.set(true);
    try {
      const currentUrl = window.location.href;
      const threadResponse = await ThreadMessaging.createThread(currentUrl);
      if (threadResponse.success) {
        // Set the new thread as current
        currentThread.set(threadResponse.data);
        
        // Clear any current response and editor
        response = '';
        if (tiptapEditor) {
          tiptapEditor.clear();
        }
        
        // Refresh thread list to show the new thread
        await loadThreadHistory();
      }
    } catch (error) {
      console.error('Error creating new thread:', error);
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
      console.log('onDragStart onupdate', event.clientX, event.clientY, hostRect.left, hostRect.top);
    }

    // Dispatch start event to content script
    const dragStartEvent = new CustomEvent('drag-start', {
      detail: {
        offset: dragOffset,
        initialPos: { x: 0, y: 0 },
        clientPostion: { x: event.clientX, y: event.clientY }, // shadowHost handles actual position
      },
    });
    document.dispatchEvent(dragStartEvent);
  }

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
      console.log('STREAM_DONE', msg);
      port.disconnect();

      // Save assistant response to thread
      if (response && $currentThread) {
        try {
          await ThreadMessaging.addMessage($currentThread.id, 'assistant', response, {
            response_id: msg.response_id,
          });
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
  <div class="chat-overlay rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white 
  {dragging ? 'dragging' : ''}" bind:this={chatOverlay}>
    <!-- Header -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="flex items-center chat-header justify-between p-4 cursor-grab active:cursor-grabbing" on:mousedown={onDragStart} 
      title="Drag to move"
      aria-label="Drag to move chat window" >
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <Sparkles class="w-5 h-5" />
        </div>
        <div>
          <h3 class="font-semibold text-lg">AI Assistant</h3>
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        <!-- Drag handle -->
       
        
        <button
          class="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
          on:click={handleClose}
          title="Close"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </div>
    <div class="chat-card w-[500px] max-w-[90vw] max-h-[80vh] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      

      <!-- Controls -->
      <div class="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
        <div class="flex items-center gap-2">
          <button
            on:click={createNewThread}
            disabled={$isLoadingThread}
            class="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs rounded-md transition-colors duration-200"
          >
            {#if $isLoadingThread}
              <Spinner class="w-3 h-3" />
            {:else}
              <Plus class="w-3 h-3" />
            {/if}
            New Chat
          </button>
          
          <button
            on:click={() => showThreadHistory.set(!$showThreadHistory)}
            class="flex items-center gap-2 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-xs rounded-md transition-colors duration-200"
          >
            <History class="w-3 h-3" />
            {$showThreadHistory ? 'Hide' : 'Show'} History
          </button>
        </div>
      </div>

      <!-- Conversation History -->
      {#if messages.length > 0 || loading}
        <div class="flex-1 overflow-hidden">
          <div class="p-4 border-b border-gray-200 dark:border-gray-600 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
            <div class="flex items-center justify-between">
              <h4 class="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles class="w-4 h-4 text-blue-500" />
                Conversation
              </h4>
              <Badge color="blue" class="text-xs">
                {messages.length + (loading ? 1 : 0)} messages
              </Badge>
            </div>
          </div>

          <div
            class="max-h-64 overflow-y-auto p-4 space-y-4"
            bind:this={responseDiv}
          >
            {#each messages as message}
              <div class="flex gap-3 {message.role === 'user' ? 'flex-row-reverse' : ''}">
                <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 {message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}">
                  {message.role === 'user' ? '👤' : '🤖'}
                </div>
                
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1 {message.role === 'user' ? 'justify-end' : 'justify-start'}">
                    <span class="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {message.role === 'user' ? 'You' : 'AI Assistant'}
                    </span>
                    <span class="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div class="rounded-2xl px-4 py-3 max-w-full {message.role === 'user'
                    ? 'bg-blue-500 text-white rounded-br-md'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md'}">
                    <div class="text-sm leading-relaxed">
                      <SvelteMarkdown source={message.content} />
                    </div>
                  </div>
                </div>
              </div>
            {/each}

            {#if loading}
              <div class="flex gap-3">
                <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                  🤖
                </div>
                
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-medium text-gray-500 dark:text-gray-400">AI Assistant</span>
                    <div class="flex items-center gap-1">
                      <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <span class="text-xs text-gray-400">
                        {response ? 'Typing...' : 'Thinking...'}
                      </span>
                    </div>
                  </div>

                  {#if response}
                    <div class="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                      <div class="text-sm leading-relaxed">
                        {@html marked.parse(response)}
                      </div>
                    </div>
                  {:else}
                    <div class="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                      <div class="flex space-x-1">
                        <div class="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                        <div class="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.1s]"></div>
                        <div class="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                      </div>
                      <span class="text-xs text-gray-500 dark:text-gray-400">AI is thinking...</span>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Input Area -->
      <div class="p-4 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
        <div class="bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
          <Tiptap
            bind:this={tiptapEditor}
            placeholder="Ask anything about the selected text..."
            disabled={loading}
            minHeight="40px"
            on:send={handleTiptapSend}
          />
        </div>
      </div>

      <!-- Thread History Panel -->
      {#if $showThreadHistory}
        <div class="border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
          <div class="p-4">
            <h4 class="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <History class="w-4 h-4 text-blue-500" />
              Recent Conversations
            </h4>
            
            <div class="max-h-40 overflow-y-auto space-y-2">
              {#if $isLoadingThread}
                <div class="flex items-center justify-center py-4">
                  <Spinner class="w-4 h-4 mr-2" />
                  <span class="text-xs text-gray-500 dark:text-gray-400">Loading...</span>
                </div>
              {:else}
                {#each $threadList as threadSummary}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="w-full p-3 rounded-lg border text-left transition-all duration-200 hover:shadow-md cursor-pointer {$currentThread?.id === threadSummary.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                      : 'bg-white dark:bg-gray-600 border-gray-200 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500'}"
                    on:click={() => loadThread(threadSummary.id)}
                  >
                    <div class="flex items-start justify-between">
                      <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium truncate text-gray-900 dark:text-white">
                          {threadSummary.title}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                          {threadSummary.domain}
                        </div>
                        <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {threadSummary.messageCount} messages • {new Date(threadSummary.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        class="text-sm transition-transform hover:scale-110 {threadSummary.favorite ? 'text-yellow-500' : 'text-gray-400'}"
                        on:click|stopPropagation={() => toggleThreadFavorite(threadSummary.id)}
                        title={threadSummary.favorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        ★
                      </button>
                    </div>
                  </div>
                {/each}

                {#if $threadList.length === 0}
                  <div class="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                    No conversations yet. Start by asking a question!
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
