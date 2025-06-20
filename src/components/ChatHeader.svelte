<script lang="ts">
  import { Sparkles, X } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  function onDragStart(event: MouseEvent) {
    dispatch('dragstart', event);
  }

  function handleClose() {
    dispatch('close');
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="flex items-center chat-header justify-between p-4 cursor-grab active:cursor-grabbing"
  on:mousedown={onDragStart}
  title="Drag to move"
  aria-label="Drag to move chat window"
>
  <div class="flex items-center gap-3">
    <div class="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
      <Sparkles class="w-5 h-5" />
    </div>
    <div>
      <h3 class="font-semibold text-lg">Buntyy</h3>
    </div>
  </div>

  <div class="flex items-center gap-2">
    <button
      class="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
      on:click={handleClose}
      title="Close"
    >
      <X class="w-5 h-5" />
    </button>
  </div>
</div>
