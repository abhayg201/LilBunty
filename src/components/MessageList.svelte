<script lang="ts">
  import { Badge, Spinner } from 'flowbite-svelte';
  import { Sparkles } from 'lucide-svelte';
  import { marked, type MarkedOptions } from 'marked';
  import hljs from 'highlight.js';
  import 'highlight.js/styles/github.css';
  import SvelteMarkdown from '@humanspeak/svelte-markdown';
  import type { Message } from '../models/thread';
  import { onMount } from 'svelte';

  export let messages: Message[] = [];
  export let generating = false;
  export let response = '';

  let responseDiv: HTMLDivElement | null = null;

  onMount(() => {
    marked.setOptions({
      highlight: (code: string, lang: string) => {
        return hljs.highlightAuto(code, [lang]).value;
      },
    } as MarkedOptions);
  });

  // Auto-scroll to bottom when response updates
  $: if (response && responseDiv && generating) {
    setTimeout(() => {
      if (responseDiv) responseDiv.scrollTop = responseDiv.scrollHeight;
    }, 0);
  }
</script>

{#if messages.length > 0 || generating}
  <div class="flex-1 overflow-hidden">
    <div class="p-4 border-b border-gray-200 dark:border-gray-600 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
      <div class="flex items-center justify-between">
        <h4 class="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Sparkles class="w-4 h-4 text-blue-500" />
          Conversation
        </h4>
        <Badge color="blue" class="text-xs">
          {messages.length + (generating ? 1 : 0)} messages
        </Badge>
      </div>
    </div>

    <div
      class="max-h-64 overflow-y-auto p-4 space-y-4"
      bind:this={responseDiv}
    >
      {#each messages as message}
        <div class="flex gap-3 {message.role === 'user' ? 'flex-row-reverse' : ''}">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 px-2 {message.role === 'user' ? 'justify-end' : 'justify-start'}">
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

      {#if generating}
        <div class="flex gap-3">
          
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