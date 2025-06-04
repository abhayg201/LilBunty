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
  import { Badge } from '$lib/components/ui/badge'
  import { Separator } from '$lib/components/ui/separator'
  import { chatContainerVisible, selectedText } from '../lib/stores'
  import { ContextService, type UserPreferences } from "../services/context-service";

  let response = ''
  let loading = false
  let customPrompt = ''
  let selectedPromptType = ''

  const userPrefs: Partial<UserPreferences> = {};

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

    try {
      // Gather context and prompts
      const context = ContextService.getContextualInfo($selectedText);
      const { systemPrompt, userPrompt } = ContextService.generateEnhancedAgenticPrompt($selectedText, context, userPrefs);
      // Send message to background script
      const result = await chrome.runtime.sendMessage({
        type: 'QUERY_OPENAI',
        payload: { systemPrompt, userPrompt }
      });

      response = result.answer || 'No response received'
    } catch (error) {
      console.error('Error sending message:', error)
      response = 'Error getting response'
    } finally {
      loading = false
    }
  }

  // Auto-select first prompt template on mount
//   $: if (
//     $chatContainerVisible &&
//     !selectedPromptType &&
//     promptTemplates.length > 0
//   ) {
//     selectPromptTemplate(promptTemplates[0])
//   }
// </script>

{#if $chatContainerVisible}
  <div class="chat-overlay">
    <Card class="chat-card">
      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <CardTitle class="text-lg">AI Assistant</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            on:click={handleClose}
            class="h-8 w-8"
          >
            <span class="text-lg">×</span>
          </Button>
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
        <div class="prompt-templates">
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
        </div>

        <!-- Custom Prompt Input -->
        <div class="custom-prompt">
          <h4 class="text-sm font-medium mb-2">Custom Prompt:</h4>
          <textarea
            bind:value={customPrompt}
            placeholder="Enter your custom prompt here..."
            class="w-full min-h-[80px] p-3 text-sm border border-input bg-background rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            rows="3"
          ></textarea>
        </div>

        <!-- Response Section -->
        {#if loading || response}
          <Separator />
          <div class="response-section">
            <h4 class="text-sm font-medium mb-2">Response:</h4>
            {#if loading}
              <div
                class="flex items-center space-x-2 text-sm text-muted-foreground"
              >
                <div
                  class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"
                ></div>
                <span>Getting response...</span>
              </div>
            {:else if response}
              <div
                class="bg-muted p-3 rounded-md text-sm max-h-40 overflow-y-auto"
              >
                {response}
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
  .chat-overlay {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2147483647;
    pointer-events: auto;
    animation: slideIn 0.2s ease-out;
  }

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
</style>
