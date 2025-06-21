<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { createEventDispatcher } from 'svelte';
  import { chatContainerVisible, selectedText } from '../lib/stores';
  import { get } from 'svelte/store';

  export let visible = false;
  let badgeOverlay: HTMLElement | null = null;

  const dispatch = createEventDispatcher<{
    'add-context-item': { text: string };
    'close': void;
  }>();

  function handleAddContext() {
    const text = get(selectedText);
    if (text && text.trim()) {
      dispatch('add-context-item', { text });
      console.log('Adding context:', text);
    }
  }

  function handleClose() {
    dispatch('close');
  }

  // async function handleClick() {
  //   if (!badgeOverlay) return;
  //   console.log('Badge clicked, selectedText:', $selectedText);
  //   chatContainerVisible.set(true);
  // }
</script>

{#if visible && $selectedText}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="widget-opener" bind:this={badgeOverlay} on:click={handleAddContext}>
    <Badge
      variant="default"
      class="cursor-pointer hover:scale-105 transition-transform px-3 py-2 text-sm font-medium"
    >
      ✨
    </Badge>
  </div>
{/if}



<style>
  .widget-opener {
    position: fixed;
    z-index: 2147483647;
    pointer-events: auto;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
