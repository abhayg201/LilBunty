<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import { selectedText } from '../lib/stores';

  const dispatch = createEventDispatcher<{
    'add-context': { text: string };
    'close': void;
  }>();

  function handleAddContext() {
    const text = get(selectedText);
    if (text && text.trim()) {
      dispatch('add-context', { text });
      console.log('Adding context:', text);
    }
  }

  function handleClose() {
    dispatch('close');
  }
</script>

<div class="context-add-overlay">
  <button 
    class="context-add-btn"
    on:click={handleAddContext}
    title="Add selected text as context"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 5v14M5 12h14"/>
    </svg>
    Add Context
  </button>
  
  <!-- svelte-ignore a11y_consider_explicit_label -->
  <button 
    class="context-close-btn"
    on:click={handleClose}
    title="Close"
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  </button>
</div>

<style>
  .context-add-overlay {
    display: flex;
    align-items: center;
    gap: 4px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-family: system-ui, -apple-system, sans-serif;
    z-index: 9999;
  }

  .context-add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .context-add-btn:hover {
    background: #2563eb;
    transform: translateY(-1px);
  }

  .context-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: 4px;
    padding: 6px;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .context-close-btn:hover {
    background: #f1f5f9;
    color: #475569;
  }
</style> 