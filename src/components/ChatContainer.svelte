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
  import { chatContainerVisible, selectedText } from '../lib/stores'
  import {
    ContextService,
    type UserPreferences,
  } from '../services/context-service'
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
  let pos = { x: 100, y: 100 }
  let offset = { x: 0, y: 0 }
  let dragging = false
  let tiptapEditor: Tiptap | undefined

  const userPrefs: Partial<UserPreferences> = {}

  onMount(() => {
    // Find the shadow root (if any)
    if (chatOverlay) {
      shadowRoot = chatOverlay!.getRootNode() as ShadowRoot
    }

    const mountEvent = new CustomEvent('chat-overlay-mounted')
    chatOverlay?.dispatchEvent(mountEvent)

    // Listen for position updates from content script
    if (chatOverlay) {
      chatOverlay.addEventListener('position-update', (e) => {
        const { x, y } = (e as CustomEvent<{x: number, y: number}>).detail;
        pos = { x, y };
      });
    }
  })

  function onDragStart(event: MouseEvent) {
    dragging = true
    console.log("onDragStart event", event);
    offset = {
      x: event.clientX - pos.x,
      y: event.clientY - pos.y,
    }
    
    // Dispatch start event to content script
    const dragStartEvent = new CustomEvent('drag-start', { 
      detail: { 
        offset,
        initialPos: pos
      } 
    })
    document.dispatchEvent(dragStartEvent)
  }

  function onDragEnd() {
    dragging = false
    
    // Dispatch end event to content script
    const dragEndEvent = new CustomEvent('drag-end')
    document.dispatchEvent(dragEndEvent)
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
    if (!$selectedText) return

    const finalPrompt = tiptapEditor?.getText() || 'Please help me understand this text:'

    loading = true
    response = ''
    // Remove previous listener and disconnect port if any
    if (port) {
      port.disconnect()
    }

    // Open a port for streaming
    port = chrome.runtime.connect()
    port.postMessage({
      type: 'QUERY_OPENAI_STREAM',
      payload: {
        systemPrompt: finalPrompt,
        userPrompt: $selectedText,
      },
    })

    port.onMessage.addListener(handleStreamMessage)
  }

  function handleStreamMessage(msg: any) {
    if (msg.type === 'STREAM_CHUNK') {
      response += msg.chunk

      // Auto-scroll to bottom as new text arrives
      setTimeout(() => {
        if (responseDiv) responseDiv.scrollTop = responseDiv.scrollHeight
      }, 0)
    } else if (msg.type === 'STREAM_DONE') {
      loading = false
      port.disconnect()
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
    style="left: {pos.x}px; top: {pos.y}px;"
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

        <!-- Response Section -->
        {#if loading || response}
          <Separator />
          <div class="response-section">
            <h4 class="text-sm font-medium mb-2">Response:</h4>
            {#if loading}
              <div
                class="flex items-center mb-2 space-x-2 text-sm text-muted-foreground"
              >
                <div
                  class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"
                ></div>
                <span>
                  {response
                    ? 'Streaming response...'
                    : 'Waiting for response...'}
                </span>
              </div>
            {/if}
            {#if response}
              <div
                class="bg-muted p-3 rounded-md text-sm max-h-40 overflow-y-auto markdown-body"
                bind:this={responseDiv}
              >
                {@html marked.parse(response)}
              </div>
            {/if}
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
      transform: translate(-50%, -50%) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  .chat-overlay {
    position: fixed;
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
  .response-section {
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

  .response-section {
    background: linear-gradient(135deg, hsl(var(--primary) / 0.05), transparent);
    border-radius: 8px;
    padding: 16px;
  }

  .response-section h4 {
    color: hsl(var(--primary));
    font-weight: 600;
    margin-bottom: 12px;
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
