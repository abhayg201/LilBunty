<script lang="ts">
  import { Spinner } from 'flowbite-svelte';
  import { History } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';

  export let threadList: any[] = [];
  export let isLoadingThread = false;
  export let currentThreadId: string | null = null;

  const dispatch = createEventDispatcher();

  function loadThread(threadId: string) {
    dispatch('select', threadId);
  }

  function toggleThreadFavorite(threadId: string, event: Event) {
    event.stopPropagation();
    dispatch('favorite', threadId);
  }
</script>

<div class="border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
  <div class="p-4">
    <h4 class="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
      <History class="w-4 h-4 text-blue-500" />
      Recent Conversations
    </h4>
    
    <div class="max-h-40 overflow-y-auto space-y-2">
      {#if isLoadingThread}
        <div class="flex items-center justify-center py-4">
          <Spinner class="w-4 h-4 mr-2" />
          <span class="text-xs text-gray-500 dark:text-gray-400">Loading...</span>
        </div>
      {:else}
        {#each threadList as threadSummary}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="w-full p-3 rounded-lg border text-left transition-all duration-200 hover:shadow-md cursor-pointer {currentThreadId === threadSummary.id
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
              : 'bg-white dark:bg-gray-600 border-gray-200 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500'}"
            on:click={() => loadThread(threadSummary.id)}
          >
            <div class="flex items-start justify-between">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate text-gray-900 dark:text-white">
                  {threadSummary.title}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                  {threadSummary.domain}
                </div>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {threadSummary.messageCount} messages • {new Date(threadSummary.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <button
                class="text-sm transition-transform hover:scale-110 {threadSummary.favorite ? 'text-yellow-500' : 'text-gray-400'}"
                on:click|stopPropagation={(e) => toggleThreadFavorite(threadSummary.id, e)}
                title={threadSummary.favorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                ★
              </button>
            </div>
          </div>
        {/each}

        {#if threadList.length === 0}
          <div class="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
            No conversations yet. Start by asking a question!
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div> 