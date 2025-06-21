<script lang="ts">
  import { Spinner } from 'flowbite-svelte';
  import { Plus, History } from 'lucide-svelte';
  import {
    chatContainerVisible,
    selectedText,
    currentThread,
    threadList,
    isLoadingThread,
    showThreadHistory,
    overlayPosition,
  } from '../lib/stores';
  import { ThreadMessaging, BrowserMessaging } from '../services/browser-messaging';
  import type { Thread, Message } from '../models/thread';
  import { onDestroy, onMount } from 'svelte';
  import Tiptap from '$lib/components/Tiptap.svelte';
  import { extractDomain } from '../models/thread';
  import ChatHeader from './ChatHeader.svelte';
  import MessageList from './MessageList.svelte';
  import ChatInput from './ChatInput.svelte';
  import ThreadHistory from './ThreadHistory.svelte';

  let response = '';
  let generating = false;
  let port: chrome.runtime.Port;
  let shadowRoot: ShadowRoot | null = null;
  let chatOverlay: HTMLDivElement ;
  let dragOffset = { x: 0, y: 0 };

  let dragging = false;
  let tiptapEditor: Tiptap | undefined;
  let chatColour = 'black';

  let currentThreadData: Thread | null = null;
  let messages: Message[] = [];

  // Subscribe to current thread changes
  $: if ($currentThread) {
    currentThreadData = $currentThread;
    messages = currentThreadData?.messages || [];
  }
  $: if (dragging) {
    chatColour = '#444';
  } else {
    chatColour = 'black';
  }

  onMount(async () => {
    // Find the shadow root (if any)
    if (chatOverlay) {
      shadowRoot = chatOverlay!.getRootNode() as ShadowRoot;
    }

    const mountEvent = new CustomEvent('chat-overlay-mounted');
    chatOverlay?.dispatchEvent(mountEvent);

    // Listen for position updates from content script (for dragging)
    if (chatOverlay) {
      chatOverlay.addEventListener('position-update', e => {
        const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
        overlayPosition.set({ x, y });
      });
      document.addEventListener('drag-end', e => {
        dragging = false;
      });
    }

    // Listen for add-context-item events from the context add overlay
    document.addEventListener('add-context-item', (e) => {
      console.log('add-context-item event', e);
      const { text, label } = (e as CustomEvent).detail;
      if (tiptapEditor && tiptapEditor.addContextItem) {
        tiptapEditor.addContextItem(label, text);
        console.log('Context item added to editor:', { label, text });
      }
    });

    // Initialize thread management
    await initializeThread();
    await loadThreadHistory();
  });

  async function initializeThread() {
    console.log('New thread init');
    isLoadingThread.set(true);
    try {
      // First, check if there's an existing thread for this selected text and URL
      const currentUrl = window.location.href;
      const summariesResponse = await ThreadMessaging.getThreadSummaries(
        { domain: extractDomain(currentUrl) },
        10
      );

      if (summariesResponse.success) {
        const sortedSummaries = summariesResponse.data.sort(
          (a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        // Get the latest thread
        const latestThread = sortedSummaries[0];

        if (latestThread) {
          // Load the existing thread
          const threadResponse = await ThreadMessaging.getThread(latestThread.id);
          if (threadResponse.success && threadResponse.data) {
            currentThread.set(threadResponse.data);
            return;
          }
        } else {
          const response = await ThreadMessaging.createThread(currentUrl);
          if (response.success) {
            currentThread.set(response.data);
          }
        }
      }
    } catch (error) {
      console.error('Error initializing thread:', error);
    } finally {
      isLoadingThread.set(false);
    }
  }

  async function loadThreadHistory() {
    try {
      const response = await ThreadMessaging.getThreadSummaries({}, 20);
      if (response.success) {
        threadList.set(response.data);
      }
    } catch (error) {
      console.error('Error loading thread history:', error);
    }
  }

  async function loadThread(threadId: string) {
    isLoadingThread.set(true);
    try {
      const threadResponse = await ThreadMessaging.getThread(threadId);
      if (threadResponse.success && threadResponse.data) {
        currentThread.set(threadResponse.data);
        // Clear any current response being typed
        response = '';
        if (tiptapEditor) {
          tiptapEditor.clear();
        }
      }
    } catch (error) {
      console.error('Error loading thread:', error);
    } finally {
      isLoadingThread.set(false);
    }
  }

  async function createNewThread() {
    isLoadingThread.set(true);
    try {
      const currentUrl = window.location.href;
      const threadResponse = await ThreadMessaging.createThread(currentUrl);
      if (threadResponse.success) {
        // Set the new thread as current
        currentThread.set(threadResponse.data);

        // Clear any current response and editor
        response = '';
        if (tiptapEditor) {
          tiptapEditor.clear();
        }

        // Refresh thread list to show the new thread
        await loadThreadHistory();
      }
    } catch (error) {
      console.error('Error creating new thread:', error);
    } finally {
      isLoadingThread.set(false);
    }
  }

  async function toggleThreadFavorite(threadId: string) {
    try {
      await ThreadMessaging.toggleFavorite(threadId);
      // Refresh thread list to show updated favorite status
      await loadThreadHistory();

      // Also refresh current thread if it's the one being favorited
      if ($currentThread?.id === threadId) {
        const threadResponse = await ThreadMessaging.getThread(threadId);
        if (threadResponse.success && threadResponse.data) {
          currentThread.set(threadResponse.data);
        }
      }
    } catch (error) {
      console.error('Error toggling thread favorite:', error);
    }
  }

  function onDragStart(event: CustomEvent) {
    const mouseEvent = event.detail as MouseEvent;
    dragging = true;
    console.log('onDragStart event', mouseEvent);

    // Get the shadowHost position for proper offset calculation
    const shadowHost = shadowRoot?.host as HTMLElement;
    if (shadowHost) {
      const hostRect = shadowHost.getBoundingClientRect();
      dragOffset = {
        x: mouseEvent.clientX - hostRect.left,
        y: mouseEvent.clientY - hostRect.top,
      };
    }

    // Dispatch start event to content script
    const dragStartEvent = new CustomEvent('drag-start', {
      detail: {
        offset: dragOffset,
        initialPos: { x: 0, y: 0 },
        clientPostion: { x: mouseEvent.clientX, y: mouseEvent.clientY }, // shadowHost handles actual position
      },
    });
    document.dispatchEvent(dragStartEvent);
  }

  function handleClose() {
    chatContainerVisible.set(false);
    response = '';
    if (tiptapEditor) {
      tiptapEditor.clear();
    }
    generating = false;
    if (port) port.disconnect();

    // Clear thread state
    currentThread.set(null);
    showThreadHistory.set(false);
  }

  function handleTiptapSend(event: CustomEvent) {
    const { content, model } = event.detail;
    // Use the content from the editor and trigger the AI request
    sendToGPT();
  }

  async function sendToGPT() {
    if (!$currentThread) return;

    const finalPrompt = tiptapEditor?.getText() || 'Please help me understand this text:';
    const context = {
      selectedText: $selectedText,
    };
    // Save user message to thread
    try {
      await ThreadMessaging.addMessage($currentThread.id, 'user', finalPrompt, undefined, context);
      // Refresh current thread data
      const threadResponse = await ThreadMessaging.getThread($currentThread.id);
      if (threadResponse.success && threadResponse.data) {
        currentThread.set(threadResponse.data);
      }
    } catch (error) {
      console.error('Error saving user message:', error);
    }

    generating = true;
    response = '';
    // Remove previous listener and disconnect port if any
    if (port) {
      port.disconnect();
    }

    // Open a port for streaming
    const messaging = BrowserMessaging.getInstance();
    port = messaging.connect();
    port.postMessage({
      type: 'QUERY_OPENAI_STREAM',
      payload: {
        threadId: $currentThread.id, // Pass thread ID for context
      },
    });

    port.onMessage.addListener(handleStreamMessage);
  }

  async function handleStreamMessage(msg: any) {
    if (msg.type === 'STREAM_CHUNK') {
      response += msg.chunk;
    } else if (msg.type === 'STREAM_DONE') {
      generating = false;
      console.log('STREAM_DONE', msg);
      port.disconnect();

      // Save assistant response to thread
      if (response && $currentThread) {
        try {
          await ThreadMessaging.addMessage($currentThread.id, 'assistant', response, {
            response_id: msg.response_id,
          });
          // Refresh current thread data and thread list
          const threadResponse = await ThreadMessaging.getThread($currentThread.id);
          if (threadResponse.success && threadResponse.data) {
            currentThread.set(threadResponse.data);
          }
          await loadThreadHistory(); // Refresh thread list

          // Clear the editor for next message
          if (tiptapEditor) {
            tiptapEditor.clear();
          }
        } catch (error) {
          console.error('Error saving assistant message:', error);
        }
      }
    } else if (msg.type === 'STREAM_ERROR') {
      response = 'Error: ' + msg.error;
      generating = false;
      port.disconnect();
    }
  }

  onDestroy(() => {
    if (port) port.disconnect();
  });
</script>

<!-- {#if $chatContainerVisible} -->
  <div
    style="background: {chatColour} !important;"
    class="chat-overlay rounded-xl text-white
  {dragging ? 'dragging' : ''}"
    bind:this={chatOverlay}
  >
    <ChatHeader on:dragstart={onDragStart} on:close={handleClose} />
    <div
      class="chat-card w-[500px] max-w-[90vw] max-h-[80vh] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
    >
      <!-- Controls -->
      <div class="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
        <div class="flex items-center gap-2">
          <button
            on:click={createNewThread}
            disabled={$isLoadingThread}
            class="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs rounded-md transition-colors duration-200"
          >
            {#if $isLoadingThread}
              <Spinner class="w-3 h-3" />
            {:else}
              <Plus class="w-3 h-3" />
            {/if}
            New Chat
          </button>

          <button
            on:click={() => showThreadHistory.set(!$showThreadHistory)}
            class="flex items-center gap-2 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-xs rounded-md transition-colors duration-200"
          >
            <History class="w-3 h-3" />
            {$showThreadHistory ? 'Hide' : 'Show'} History
          </button>
        </div>
      </div>

      <!-- Conversation History -->
      <MessageList {messages} {generating} {response} />

      <!-- Input Area -->
      <ChatInput 
      bind:tiptapEditor 
      disabled={loading} 
      chatOverlay={chatOverlay} 
      on:send={handleTiptapSend} />

      <!-- Thread History Panel -->
      {#if $showThreadHistory}
        <ThreadHistory
          threadList={$threadList}
          isLoadingThread={$isLoadingThread}
          currentThreadId={$currentThread?.id || null}
          on:select={e => loadThread(e.detail)}
          on:favorite={e => toggleThreadFavorite(e.detail)}
        />
      {/if}
    </div>
  </div>
<!-- {/if} -->
