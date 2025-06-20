<script lang="ts">
  import Tiptap from '$lib/components/Tiptap.svelte';
  import { createEventDispatcher } from 'svelte';

  export let disabled = false;
  export let tiptapEditor: Tiptap | undefined = undefined;

  const dispatch = createEventDispatcher();

  function handleTiptapSend(event: CustomEvent) {
    dispatch('send', event.detail);
  }
</script>

<div class="p-4 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
  <div class="bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
    <Tiptap
      bind:this={tiptapEditor}
      placeholder="Ask anything about the selected text..."
      disabled={disabled}
      minHeight="40px"
      on:send={handleTiptapSend}
    />
  </div>
</div> 