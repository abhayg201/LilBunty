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
  import { ContextService, type UserPreferences } from "../services/context-service";
  import { onDestroy, onMount } from 'svelte';
  import { marked, type MarkedOptions } from 'marked';
  import hljs from 'highlight.js';
  import 'highlight.js/styles/github.css';

  let response = ''
  let loading = false
  let customPrompt = ''
  let selectedPromptType = ''
  let port: chrome.runtime.Port;
  let responseDiv: HTMLDivElement | null = null;
  let shadowRoot: ShadowRoot | null = null;
  let chatOverlay: HTMLDivElement  | null = null;
  let pos = { x: 100, y: 100 };
  let offset = { x: 0, y: 0 };
  let dragging = false;

  const userPrefs: Partial<UserPreferences> = {};


  onMount(() => {
    // Find the shadow root (if any)
      if (chatOverlay ) {
        shadowRoot = chatOverlay!.getRootNode() as ShadowRoot;
      }
  });
  function onDragStart(event: MouseEvent) {
    dragging = true;
    offset = {
      x: event.clientX - pos.x,
      y: event.clientY - pos.y
    };
    const root = shadowRoot || window;
    root.addEventListener('mousemove', onDragMove as EventListener);
    root.addEventListener('mouseup', onDragEnd as EventListener);
    document.body.classList.add('dragging-cursor');
  }

  function onDragMove(event: MouseEvent) {
    if (!dragging) return;
    const newPos = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    pos = newPos;
    // Emit event to parent
    const dragEvent = new CustomEvent('move', { detail: newPos });
    chatOverlay?.dispatchEvent(dragEvent);
  }

  function onDragEnd() {
    dragging = false;
    const root = shadowRoot || window;
    root.removeEventListener('mousemove', onDragMove as EventListener);
    root.removeEventListener('mouseup', onDragEnd as EventListener);
    document.body.classList.remove('dragging-cursor');
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
    customPrompt = ''
    selectedPromptType = ''
    loading = false;
    if (port) port.disconnect();
  }

  function selectPromptTemplate(template: (typeof promptTemplates)[0]) {
    selectedPromptType = template.id
    customPrompt = template.prompt

  }
  
  async function sendToGPT() {
    if (!$selectedText) return

    const finalPrompt = customPrompt || 'Please help me understand this text:'

    loading = true
    response = ''
    // Remove previous listener and disconnect port if any
    if (port) {
      port.disconnect();
    }
    //commented out for streaming
    // try {
    //   // Gather context and prompts
    //   const context = ContextService.getContextualInfo($selectedText);
    //   const { systemPrompt, userPrompt } = ContextService.generateEnhancedAgenticPrompt($selectedText, context, userPrefs);
    //   // Send message to background script
    //   const result = await chrome.runtime.sendMessage({
    //     type: 'QUERY_OPENAI',
    //     payload: { systemPrompt, userPrompt }
    //   });

    //   response = result.answer || 'No response received'
    // } catch (error) {
    //   console.error('Error sending message:', error)
    //   response = 'Error getting response'
    // } finally {
    //   loading = false
    // }

    // Open a port for streaming
    port = chrome.runtime.connect();
    port.postMessage({
      type: 'QUERY_OPENAI_STREAM',
      payload: {
        systemPrompt: finalPrompt,
        userPrompt: $selectedText
      }
    });

    port.onMessage.addListener(handleStreamMessage);
  }
  function handleStreamMessage(msg: any) {
    if (msg.type === 'STREAM_CHUNK') {
      response += msg.chunk;

      // Auto-scroll to bottom as new text arrives
      setTimeout(() => {
        if (responseDiv) responseDiv.scrollTop = responseDiv.scrollHeight;
      }, 0);

    } else if (msg.type === 'STREAM_DONE') {
      loading = false;
      port.disconnect();
    } else if (msg.type === 'STREAM_ERROR') {
      response = 'Error: ' + msg.error;
      loading = false;
      port.disconnect();
    }
  }

    onDestroy(() => {
      if (port) port.disconnect();
    });
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
      return hljs.highlightAuto(code, [lang]).value;
    }
  } as MarkedOptions);
</script>

{#if $chatContainerVisible}
  <div class="chat-overlay {dragging ? 'dragging' : ''}"
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
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="5" cy="6" r="1.5" fill="#bbb"/>
                <circle cx="5" cy="10" r="1.5" fill="#bbb"/>
                <circle cx="5" cy="14" r="1.5" fill="#bbb"/>
                <circle cx="10" cy="6" r="1.5" fill="#bbb"/>
                <circle cx="10" cy="10" r="1.5" fill="#bbb"/>
                <circle cx="10" cy="14" r="1.5" fill="#bbb"/>
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
          <h4 class="text-sm font-medium mb-2">Custom Prompt:</h4>
          <textarea
            bind:value={customPrompt}
            placeholder="Enter your custom prompt here..."
            class="w-full min-h-[80px] p-3 text-sm border border-input bg-background rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            rows="3"
            disabled={loading}
          ></textarea>
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
                    {response ? 'Streaming response...' : 'Waiting for response...'}
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

      <CardFooter class="pt-3">
        <Button
          on:click={sendToGPT}
          disabled={loading }
          class="w-full"
        >
          {loading ? 'Sending...' : 'Send to AI'}
        </Button>
      </CardFooter>
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

  .selected-text-section,
  .prompt-templates,
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

  @import 'github-markdown-css/github-markdown.css';
  .markdown-body {
    /* Optionally override background, font, etc. */
    background: transparent;
  }
  
</style>
