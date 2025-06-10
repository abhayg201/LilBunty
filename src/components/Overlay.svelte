<script lang="ts">
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import { chatContainerVisible, selectedText } from '../lib/stores'
  import ChatContainer from './ChatContainer.svelte'

  export let visible = false


  async function handleClick() {
    console.log('Badge clicked, selectedText:', $selectedText)
    chatContainerVisible.set(true)
  }

</script>

{#if visible && !$chatContainerVisible && $selectedText}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="widget-opener" on:click={handleClick}>
    <Badge
      variant="default"
      class="cursor-pointer hover:scale-105 transition-transform px-3 py-2 text-sm font-medium"
    >
      ✨ AI Assistant
    </Badge>
  </div>
{/if}

{#if $chatContainerVisible}
  <ChatContainer />
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
