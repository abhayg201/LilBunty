<script lang="ts">
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from '$lib/components/ui/card'
  import { Button } from '$lib/components/ui/button'
  import { Separator } from '$lib/components/ui/separator'
  import { 
    chatContainerVisible, 
    selectedText,
    currentThread,
    threadList,
    isLoadingThread,
    showThreadHistory,
    overlayPosition
  } from '../lib/stores'
  import {
    ContextService,
    type UserPreferences,
  } from '../services/context-service'
  import { ThreadService } from '../services/thread-service'
  import { ThreadMessaging, BrowserMessaging } from '../services/browser-messaging'
  import type { Thread, Message } from '../models/thread'
  import { onDestroy, onMount } from 'svelte'
  import { marked, type MarkedOptions } from 'marked'
  import hljs from 'highlight.js'
  import 'highlight.js/styles/github.css'
  import Tiptap from '$lib/components/Tiptap.svelte'

  let response = ''
  let loading = false
  let customPrompt = ''
  let selectedPromptType = ''
  let port: chrome.runtime.Port
  let responseDiv: HTMLDivElement | null = null
  let shadowRoot: ShadowRoot | null = null
  let chatOverlay: HTMLDivElement | null = null
  let dragOffset = { x: 0, y: 0 }
  let dragging = false
  let tiptapEditor: Tiptap | undefined

  const userPrefs: Partial<UserPreferences> = {}
  const threadService = ThreadService.getInstance()
  
  let currentThreadData: Thread | null = null
  let messages: Message[] = []
  
  // Subscribe to current thread changes
  $: if ($currentThread) {
    currentThreadData = $currentThread
    messages = currentThreadData?.messages || []
  }

  onMount(async () => {
    // Find the shadow root (if any)
    if (chatOverlay) {
      shadowRoot = chatOverlay!.getRootNode() as ShadowRoot
    }

    const mountEvent = new CustomEvent('chat-overlay-mounted')
    chatOverlay?.dispatchEvent(mountEvent)

    // Listen for position updates from content script (for dragging)
    if (chatOverlay) {
      chatOverlay.addEventListener('position-update', (e) => {
        const { x, y } = (e as CustomEvent<{x: number, y: number}>).detail;
        overlayPosition.set({ x, y });
        console.log("position-update", x, y);
      });
    }

    // Initialize thread management
    await initializeThread()
    await loadThreadHistory()
  })

  async function initializeThread() {
    if (!$selectedText) return
    console.log("New thread init")
    isLoadingThread.set(true)
    try {
      // First, check if there's an existing thread for this selected text and URL
      const currentUrl = window.location.href
      const summariesResponse = await ThreadMessaging.getThreadSummaries({ domain: extractDomain(currentUrl) }, 10)
      
      if (summariesResponse.success) {
        // Look for a thread with the same selected text
        const existingThread = summariesResponse.data.find((summary: any) => 
          summary.selectedText === $selectedText
        )
        
        if (existingThread) {
          // Load the existing thread
          const threadResponse = await ThreadMessaging.getThread(existingThread.id)
          if (threadResponse.success && threadResponse.data) {
            currentThread.set(threadResponse.data)
            return
          }
        }
      }
      
      // Create a new thread if no existing one found
      const response = await ThreadMessaging.createThread($selectedText, currentUrl)
      if (response.success) {
        currentThread.set(response.data)
      }
    } catch (error) {
      console.error('Error initializing thread:', error)
    } finally {
      isLoadingThread.set(false)
    }
  }

  function extractDomain(url: string): string {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname.replace('www.', '')
    } catch {
      return 'unknown'
    }
  }

  async function loadThreadHistory() {
    try {
      const response = await ThreadMessaging.getThreadSummaries({}, 20)
      if (response.success) {
        threadList.set(response.data)
      }
    } catch (error) {
      console.error('Error loading thread history:', error)
    }
  }

  async function loadThread(threadId: string) {
    isLoadingThread.set(true)
    try {
      const threadResponse = await ThreadMessaging.getThread(threadId)
      if (threadResponse.success && threadResponse.data) {
        currentThread.set(threadResponse.data)
        // Clear any current response being typed
        response = ''
        if (tiptapEditor) {
          tiptapEditor.clear()
        }
      }
    } catch (error) {
      console.error('Error loading thread:', error)
    } finally {
      isLoadingThread.set(false)
    }
  }

  async function toggleThreadFavorite(threadId: string) {
    try {
      await ThreadMessaging.toggleFavorite(threadId)
      // Refresh thread list to show updated favorite status
      await loadThreadHistory()
      
      // Also refresh current thread if it's the one being favorited
      if ($currentThread?.id === threadId) {
        const threadResponse = await ThreadMessaging.getThread(threadId)
        if (threadResponse.success && threadResponse.data) {
          currentThread.set(threadResponse.data)
        }
      }
    } catch (error) {
      console.error('Error toggling thread favorite:', error)
    }
  }

  function onDragStart(event: MouseEvent) {
    dragging = true
    console.log("onDragStart event", event);
    
    // Get the shadowHost position for proper offset calculation
    const shadowHost = shadowRoot?.host as HTMLElement;
    if (shadowHost) {
      const hostRect = shadowHost.getBoundingClientRect();
      dragOffset = {
        x: event.clientX - hostRect.left,
        y: event.clientY - hostRect.top,
      }
    }
    
    // Dispatch start event to content script
    const dragStartEvent = new CustomEvent('drag-start', { 
      detail: { 
        offset: dragOffset,
        initialPos: { x: 0, y: 0 } // shadowHost handles actual position
      } 
    })
    document.dispatchEvent(dragStartEvent)
  }

  // function onDragEnd() {
  //   dragging = false
    
  //   // Dispatch end event to content script
  //   const dragEndEvent = new CustomEvent('drag-end')
  //   document.dispatchEvent(dragEndEvent)
  // }
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
  ]

  function handleClose() {
    chatContainerVisible.set(false)
    response = ''
    if (tiptapEditor) {
      tiptapEditor.clear()
    }
    selectedPromptType = ''
    loading = false
    if (port) port.disconnect()
    
    // Clear thread state
    currentThread.set(null)
    showThreadHistory.set(false)
  }

  function selectPromptTemplate(template: (typeof promptTemplates)[0]) {
    selectedPromptType = template.id
    customPrompt = template.prompt
  }

  function handleTiptapSend(event: CustomEvent) {
    const { content, model } = event.detail;
    // Use the content from the editor and trigger the AI request
    sendToGPT();
  }

  async function sendToGPT() {
    if (!$selectedText || !$currentThread) return

    const finalPrompt = tiptapEditor?.getText() || 'Please help me understand this text:'
    
    // Save user message to thread
    try {
      await ThreadMessaging.addMessage($currentThread.id, 'user', finalPrompt)
      // Refresh current thread data
      const threadResponse = await ThreadMessaging.getThread($currentThread.id)
      if (threadResponse.success && threadResponse.data) {
        currentThread.set(threadResponse.data)
      }
    } catch (error) {
      console.error('Error saving user message:', error)
    }

    loading = true
    response = ''
    // Remove previous listener and disconnect port if any
    if (port) {
      port.disconnect()
    }

    // Open a port for streaming
    const messaging = BrowserMessaging.getInstance()
    port = messaging.connect()
    port.postMessage({
      type: 'QUERY_OPENAI_STREAM',
      payload: {
        systemPrompt: finalPrompt,
        userPrompt: $selectedText,
        threadId: $currentThread.id, // Pass thread ID for context
      },
    })

    port.onMessage.addListener(handleStreamMessage)
  }

  async function handleStreamMessage(msg: any) {
    if (msg.type === 'STREAM_CHUNK') {
      response += msg.chunk

      // Auto-scroll to bottom as new text arrives
      setTimeout(() => {
        if (responseDiv) responseDiv.scrollTop = responseDiv.scrollHeight
      }, 0)
    } else if (msg.type === 'STREAM_DONE') {
      loading = false
      port.disconnect()
      
      // Save assistant response to thread
      if (response && $currentThread) {
        try {
          await ThreadMessaging.addMessage($currentThread.id, 'assistant', response)
          // Refresh current thread data and thread list
          const threadResponse = await ThreadMessaging.getThread($currentThread.id)
          if (threadResponse.success && threadResponse.data) {
            currentThread.set(threadResponse.data)
          }
          await loadThreadHistory() // Refresh thread list
          
          // Clear the editor for next message
          if (tiptapEditor) {
            tiptapEditor.clear()
          }
        } catch (error) {
          console.error('Error saving assistant message:', error)
        }
      }
    } else if (msg.type === 'STREAM_ERROR') {
      response = 'Error: ' + msg.error
      loading = false
      port.disconnect()
    }
  }

  onDestroy(() => {
    if (port) port.disconnect()
  })
  // // Auto-select first prompt template on mount
  // $: if (
  //   $chatContainerVisible &&
  //   !selectedPromptType &&
  //   promptTemplates.length > 0
  // ) {
  //   selectPromptTemplate(promptTemplates[0])
  // }
  marked.setOptions({
    highlight: (code: string, lang: string) => {
      return hljs.highlightAuto(code, [lang]).value
    },
  } as MarkedOptions)
</script>

{#if $chatContainerVisible}
  <div
    class="chat-overlay {dragging ? 'dragging' : ''}"
    bind:this={chatOverlay}
  >
    <Card class="chat-card">
      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <CardTitle class="text-lg">AI Assistant</CardTitle>
          <div class="flex items-center gap-2">
            <!-- Drag handle -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="drag-handle"
              title="Drag"
              on:mousedown={(e) => onDragStart(e as MouseEvent)}
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
            <Button
              variant="ghost"
              size="icon"
              on:click={handleClose}
              class="h-8 w-8"
            >
              <span class="text-lg">×</span>
            </Button>
          </div>
        </div>
        <CardDescription>Chat about your selected text</CardDescription>
      </CardHeader>

        <!-- Conversation History -->
        {#if messages.length > 0 || loading}
          <Separator />
          <div class="conversation-section">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-medium">Conversation:</h4>
              <div class="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  on:click={() => showThreadHistory.set(!$showThreadHistory)}
                  class="text-xs"
                >
                  {$showThreadHistory ? 'Hide' : 'Show'} History
                </Button>
              </div>
            </div>
            
            <div class="messages-container max-h-60 overflow-y-auto space-y-3" bind:this={responseDiv}>
              {#each messages as message}
                <div class="message-bubble {message.role}">
                  <div class="message-header">
                    <span class="message-role">{message.role === 'user' ? 'You' : 'AI'}</span>
                    <span class="message-time">{new Date(message.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div class="message-content markdown-body">
                    {@html marked.parse(message.content)}
                  </div>
                </div>
              {/each}
              
              {#if loading}
                <div class="message-bubble assistant">
                  <div class="message-header">
                    <span class="message-role">AI</span>
                    <div class="flex items-center space-x-2 text-sm text-muted-foreground">
                      <div class="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full"></div>
                      <span>{response ? 'Streaming...' : 'Thinking...'}</span>
                    </div>
                  </div>
                  {#if response}
                    <div class="message-content markdown-body">
                      {@html marked.parse(response)}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/if}

      <CardContent class="space-y-4">
        <!-- Selected Text Display -->
        <div class="selected-text-section">
          <h4 class="text-sm font-medium text-muted-foreground mb-2">
            Selected Text:
          </h4>
          <div class="bg-muted p-3 rounded-md text-sm max-h-20 overflow-y-auto">
            "{$selectedText}"
          </div>
        </div>

        <Separator />

        <!-- Prompt Templates -->
        <!-- <div class="prompt-templates">
          <h4 class="text-sm font-medium mb-3">Quick Actions:</h4>
          <div class="flex flex-wrap gap-2">
            {#each promptTemplates as template}
              <Button
                variant={selectedPromptType === template.id
                  ? 'default'
                  : 'outline'}
                size="sm"
                on:click={() => selectPromptTemplate(template)}
                class="text-xs"
              >
                {template.label}
              </Button>
            {/each}
          </div>
        </div> -->

        <!-- Custom Prompt Input -->
        <div class="custom-prompt">
          <Tiptap
            bind:this={tiptapEditor}
            placeholder="Ask anything"
            disabled={loading}
            minHeight="44px"
            on:send={handleTiptapSend}
          />
        </div>

      

        <!-- Thread History Panel -->
        {#if $showThreadHistory}
          <Separator />
          <div class="thread-history-section">
            <h4 class="text-sm font-medium mb-3">Recent Conversations:</h4>
            <div class="thread-list max-h-40 overflow-y-auto space-y-2">
              {#if $isLoadingThread}
                <div class="flex items-center justify-center py-4">
                  <div class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                  <span class="ml-2 text-xs text-muted-foreground">Loading...</span>
                </div>
              {:else}
                {#each $threadList as threadSummary}
                  <div
                    class="thread-item p-2 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors"
                    class:active={$currentThread?.id === threadSummary.id}
                    on:click={() => loadThread(threadSummary.id)}
                    role="button"
                    tabindex="0"
                  >
                    <div class="flex items-start justify-between">
                      <div class="flex-1 min-w-0">
                        <div class="text-xs font-medium truncate">{threadSummary.title}</div>
                        <div class="text-xs text-muted-foreground truncate mt-1">{threadSummary.domain}</div>
                        <div class="text-xs text-muted-foreground mt-1">
                          {threadSummary.messageCount} messages • {new Date(threadSummary.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        class="text-xs hover:scale-110 transition-transform"
                        class:text-yellow-500={threadSummary.favorite}
                        class:text-gray-400={!threadSummary.favorite}
                        on:click|stopPropagation={() => toggleThreadFavorite(threadSummary.id)}
                        title={threadSummary.favorite ? 'Remove from favorites' : 'Add to favorites'}
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
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 12px;
    overflow: hidden;
    backdrop-filter: blur(8px);
    box-shadow: 
      0 20px 25px -5px rgb(0 0 0 / 0.1),
      0 10px 10px -5px rgb(0 0 0 / 0.04);
  }

  .drag-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 4px;
    cursor: grab;
    transition: background-color 0.2s ease;
  }

  .drag-handle:hover {
    background: hsl(var(--muted));
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .selected-text-section,
  .custom-prompt,
  .conversation-section,
  .thread-history-section {
    animation: fadeInUp 0.3s ease-out;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .selected-text-section {
    background: linear-gradient(135deg, hsl(var(--muted) / 0.3), hsl(var(--muted) / 0.1));
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
    padding: 16px;
  }

  .selected-text-section h4 {
    color: hsl(var(--primary));
    font-weight: 600;
    margin-bottom: 8px;
  }

  .selected-text-section div {
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    padding: 12px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
    line-height: 1.5;
    max-height: 120px;
    overflow-y: auto;
  }

  .custom-prompt {
    background: linear-gradient(135deg, hsl(var(--accent) / 0.1), transparent);
    border-radius: 8px;
    padding: 16px;
  }

  .custom-prompt h4 {
    color: hsl(var(--primary));
    font-weight: 600;
    margin-bottom: 12px;
  }

  .conversation-section,
  .thread-history-section {
    background: linear-gradient(135deg, hsl(var(--primary) / 0.05), transparent);
    border-radius: 8px;
    padding: 16px;
  }

  .conversation-section h4,
  .thread-history-section h4 {
    color: hsl(var(--primary));
    font-weight: 600;
    margin-bottom: 12px;
  }

  .messages-container {
    scrollbar-width: thin;
  }

  .message-bubble {
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 12px;
    padding: 12px;
    position: relative;
  }

  .message-bubble.user {
    background: linear-gradient(135deg, hsl(var(--primary) / 0.1), hsl(var(--primary) / 0.05));
    border-color: hsl(var(--primary) / 0.2);
    margin-left: 20px;
  }

  .message-bubble.assistant {
    background: linear-gradient(135deg, hsl(var(--accent) / 0.1), hsl(var(--accent) / 0.05));
    border-color: hsl(var(--accent) / 0.2);
    margin-right: 20px;
  }

  .message-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .message-role {
    font-weight: 600;
    font-size: 0.75rem;
    color: hsl(var(--primary));
  }

  .message-time {
    font-size: 0.7rem;
    color: hsl(var(--muted-foreground));
  }

  .message-content {
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .message-content :global(p) {
    margin: 4px 0;
  }

  .message-content :global(p:first-child) {
    margin-top: 0;
  }

  .message-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .thread-item {
    transition: all 0.2s ease;
  }

  .thread-item:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgb(0 0 0 / 0.1);
  }

  .thread-item.active {
    background: hsl(var(--primary) / 0.1);
    border-color: hsl(var(--primary));
  }

  .markdown-body {
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    padding: 16px;
    font-size: 14px;
    line-height: 1.6;
    max-height: 300px;
    overflow-y: auto;
  }

  /* Custom scrollbar styling */
  .markdown-body::-webkit-scrollbar,
  .selected-text-section div::-webkit-scrollbar {
    width: 6px;
  }

  .markdown-body::-webkit-scrollbar-track,
  .selected-text-section div::-webkit-scrollbar-track {
    background: hsl(var(--muted) / 0.3);
    border-radius: 3px;
  }

  .markdown-body::-webkit-scrollbar-thumb,
  .selected-text-section div::-webkit-scrollbar-thumb {
    background: hsl(var(--muted-foreground) / 0.3);
    border-radius: 3px;
  }

  .markdown-body::-webkit-scrollbar-thumb:hover,
  .selected-text-section div::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--muted-foreground) / 0.5);
  }

  /* Loading animation improvements */
  .loading-spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* Dragging cursor for body */
  :global(body.dragging-cursor) {
    cursor: grabbing !important;
    user-select: none !important;
  }

  /* Enhanced markdown styling */
  :global(.markdown-body h1, .markdown-body h2, .markdown-body h3) {
    color: hsl(var(--foreground));
    font-weight: 600;
    margin: 16px 0 8px 0;
  }

  :global(.markdown-body h1) {
    font-size: 1.25em;
    border-bottom: 1px solid hsl(var(--border));
    padding-bottom: 8px;
  }

  :global(.markdown-body h2) {
    font-size: 1.1em;
  }

  :global(.markdown-body h3) {
    font-size: 1em;
  }

  :global(.markdown-body p) {
    margin: 8px 0;
  }

  :global(.markdown-body code) {
    background: hsl(var(--muted));
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  }

  :global(.markdown-body pre) {
    background: hsl(var(--muted));
    padding: 12px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 12px 0;
  }

  :global(.markdown-body pre code) {
    background: transparent;
    padding: 0;
  }

  :global(.markdown-body ul, .markdown-body ol) {
    margin: 8px 0;
    padding-left: 20px;
  }

  :global(.markdown-body li) {
    margin: 4px 0;
  }

  :global(.markdown-body blockquote) {
    border-left: 4px solid hsl(var(--primary));
    padding-left: 12px;
    margin: 12px 0;
    color: hsl(var(--muted-foreground));
    font-style: italic;
  }
</style>
