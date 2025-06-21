import { mount, unmount } from 'svelte';
import TextSelectOverlay from '../components/TextSelectOverlay.svelte';
import ContextAddButton from '../components/ContextAddButton.svelte';
import shadowStylesText from './shadow-styles.css?inline';
import appStylesText from '../app.css?inline';
import {
  selectedText,
  chatContainerVisible,
  overlayPosition,
  contextAddOverlayVisible,
} from '../lib/stores';
import {
  setupFloatingPosition,
  createPersistentVirtualElement,
  createScrollAwarePersistentVirtualElement,
  createFixedVirtualElement,
} from '../lib/utils/floating-position';
import ChatInput from '../components/ChatInput.svelte';
import ChatContainer from '../components/ChatContainer.svelte';

// https://developer.chrome.com/docs/extensions/mv3/content_scripts/

// Import global styles
let overlayInstance: any = null;
let shadowHost: HTMLElement;
let shadowRoot: ShadowRoot | null = null;
let overlayContainer: HTMLElement;

// Context add overlay variables
let contextAddOverlayInstance: any = null;
let contextAddShadowHost: HTMLElement;
let contextAddShadowRoot: ShadowRoot | null = null;
let contextAddOverlayContainer: HTMLElement;

function createOverlayContainer() {
  if (shadowHost && shadowRoot && overlayContainer) {
    return overlayContainer;
  }

  // Create shadow host
  shadowHost = document.createElement('div');
  shadowHost.id = 'text-selection-overlay-host';
  shadowHost.style.position = 'fixed';
  shadowHost.style.zIndex = '2147483647';
  shadowHost.style.pointerEvents = 'auto';
  shadowHost.style.display = 'none';

  // Attach shadow DOM
  shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  // Add main app styles (includes Tailwind and CSS variables) to shadow DOM
  const appStyle = document.createElement('style');
  appStyle.textContent = appStylesText;
  shadowRoot.appendChild(appStyle);

  // Add custom shadow styles to shadow DOM
  const shadowStyle = document.createElement('style');
  shadowStyle.textContent = shadowStylesText;
  shadowRoot.appendChild(shadowStyle);

  // Create container inside shadow DOM
  overlayContainer = document.createElement('div');
  overlayContainer.id = 'text-selection-overlay';
  overlayContainer.style.position = 'relative';
  overlayContainer.style.zIndex = '1';
  overlayContainer.style.pointerEvents = 'auto';

  shadowRoot.appendChild(overlayContainer);
  document.body.appendChild(shadowHost);

  return overlayContainer;
}

function createContextAddOverlayContainer() {
  if (contextAddShadowHost && contextAddShadowRoot && contextAddOverlayContainer) {
    return contextAddOverlayContainer;
  }

  // Create shadow host for context add overlay
  contextAddShadowHost = document.createElement('div');
  contextAddShadowHost.id = 'context-add-overlay-host';
  contextAddShadowHost.style.position = 'fixed';
  contextAddShadowHost.style.zIndex = '2147483648'; // Higher than main overlay
  contextAddShadowHost.style.pointerEvents = 'auto';
  contextAddShadowHost.style.display = 'none';

  // Attach shadow DOM
  contextAddShadowRoot = contextAddShadowHost.attachShadow({ mode: 'open' });

  // Add main app styles (includes Tailwind and CSS variables) to shadow DOM
  const appStyle = document.createElement('style');
  appStyle.textContent = appStylesText;
  contextAddShadowRoot.appendChild(appStyle);

  // Add custom shadow styles to shadow DOM
  const shadowStyle = document.createElement('style');
  shadowStyle.textContent = shadowStylesText;
  contextAddShadowRoot.appendChild(shadowStyle);

  // Create container inside shadow DOM
  contextAddOverlayContainer = document.createElement('div');
  contextAddOverlayContainer.id = 'context-add-overlay';
  contextAddOverlayContainer.style.position = 'relative';
  contextAddOverlayContainer.style.zIndex = '1';
  contextAddOverlayContainer.style.pointerEvents = 'auto';

  contextAddShadowRoot.appendChild(contextAddOverlayContainer);
  document.body.appendChild(contextAddShadowHost);

  return contextAddOverlayContainer;
}

function showContextAddOverlay() {
  const container = createContextAddOverlayContainer();

  // Destroy existing instance if it exists
  if (contextAddOverlayInstance) {
    unmount(contextAddOverlayInstance);
    contextAddOverlayInstance = null;
  }

  // Show the contextAddShadowHost
  contextAddShadowHost.style.display = 'block';

  // Create virtual element based on actual selection bounds
  const virtualElement = createScrollAwarePersistentVirtualElement({ x: 0, y: 0 }, false);

  // Set up static position that doesn't change during scroll
  const cleanup = setupFloatingPosition(
    virtualElement,
    contextAddShadowHost,
    {
      placement: 'top-start',
      offsetValue: 8,
      yAdjustment: -10,
      fallbackPlacements: ['bottom-start', 'top-end', 'bottom-end'],
      padding: 8,
    },
    (posX: any, posY: any) => {
      console.log('ContextAddOverlay positioned at:', { x: posX, y: posY });
    }
  );

  // Store cleanup function for later use
  (contextAddShadowHost as any).__floatingCleanup = cleanup;

  // Mount new instance with event handlers
  contextAddOverlayInstance = mount(TextSelectOverlay, {
    target: container,
    props: { visible: true },
  });

  // Listen for add-context event
  container.addEventListener('add-context', event => {
    const { text } = (event as CustomEvent).detail;
    handleAddContext(text);
  });

  // Listen for close event
  container.addEventListener('close', () => {
    hideContextAddOverlay();
  });
}

function hideContextAddOverlay() {
  if (contextAddShadowHost) {
    contextAddShadowHost.style.display = 'none';

    // Cleanup autoUpdate if it exists
    if ((contextAddShadowHost as any).__floatingCleanup) {
      (contextAddShadowHost as any).__floatingCleanup();
      (contextAddShadowHost as any).__floatingCleanup = null;
    }
  }

  if (contextAddOverlayInstance) {
    unmount(contextAddOverlayInstance);
    contextAddOverlayInstance = null;
  }
}

function handleAddContext(text: string) {
  // Show the main chat overlay if it's not visible
  if (!overlayInstance) {
    showBuntyOverlay(document.body.clientWidth * 0.6, document.body.clientHeight * 0.1);
  }

  // Dispatch event to add context to the chat container
  document.dispatchEvent(
    new CustomEvent('add-context-item', {
      detail: { text, label: 'Selected Text' },
    })
  );

  // Hide the context add overlay
  hideContextAddOverlay();
  contextAddOverlayVisible.set(false);

  // Show the chat container
  chatContainerVisible.set(true);
}

function showBuntyOverlay(x: number, y: number) {
  const container = createOverlayContainer();

  // Destroy existing instance if it exists
  if (overlayInstance) {
    unmount(overlayInstance);
    overlayInstance = null;
  }

  // Show the shadowHost
  shadowHost.style.display = 'block';

  if (isDraggedPosition && manualPosition) {
    // Use previously dragged manual position
    shadowHost.style.top = `${manualPosition.y}px`;
    shadowHost.style.left = `${manualPosition.x}px`;
    overlayPosition.set(manualPosition);
    console.log('Reusing manual dragged position:', manualPosition);
  } else {
    // Create virtual element based on actual selection bounds
    const virtualElement = createScrollAwarePersistentVirtualElement({ x, y }, true);

    // Set up static position that doesn't change during scroll
    const cleanup = setupFloatingPosition(
      virtualElement,
      shadowHost,
      {
        placement: 'right-start',
        offsetValue: 10,
        yAdjustment: 25,
        fallbackPlacements: ['top-start', 'bottom-start', 'left-start'],
        padding: 8,
      },
      (posX: any, posY: any) => {
        // Update the overlay position store
        overlayPosition.set({ x: posX, y: posY });
        console.log('ShadowHost positioned at:', { x: posX, y: posY });
      }
    );

    // Store cleanup function for later use
    (shadowHost as any).__floatingCleanup = cleanup;
  }

  // Wait for the next tick to ensure the Svelte component is rendered
  setTimeout(() => {
    listenForChatOverlayMounted();
    setupDragListeners();
  }, 10);

  // Mount new instance
  overlayInstance = mount(ChatContainer, { target: container, props: {} });
}

function listenForChatOverlayMounted() {
  if (!shadowRoot) return;
  const badgeOverlay = shadowRoot.querySelector('.widget-opener');
  if (!badgeOverlay) return;
  console.log('badgeOverlay', badgeOverlay);
  badgeOverlay.addEventListener('chat-overlay-mounted', () => {});
}

// Drag state
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let floatingCleanup: (() => void) | null = null;
let isDraggedPosition = false;
let manualPosition: { x: number; y: number } | null = null;

function setupDragListeners() {
  console.log('setupDragListeners');
  if (!shadowRoot) return;
  console.log('shadowRoot', shadowRoot);
  // Listen for drag start events from the component
  document.addEventListener('drag-start', e => {
    console.log('drag-start event', e);
    const { offset, initialPos } = (e as CustomEvent).detail;
    isDragging = true;
    dragOffset = offset;

    document.addEventListener('mousemove', handleDragMove as EventListener);
    document.addEventListener('mouseup', handleDragEnd as EventListener);
    document.body.classList.add('dragging-cursor');

    console.log('Drag started', { offset, initialPos });
  });
}

function handleDragMove(event: Event) {
  console.log('handleDragMove event', event);
  const mouseEvent = event as MouseEvent;
  if (!isDragging || !shadowHost) return;

  const newPos = {
    x: mouseEvent.clientX - dragOffset.x,
    y: mouseEvent.clientY - dragOffset.y,
  };

  // Update shadow host position
  shadowHost.style.top = `${newPos.y}px`;
  shadowHost.style.left = `${newPos.x}px`;

  // Store the manual position
  manualPosition = newPos;
  isDraggedPosition = true;

  // Notify component of position change
  if (shadowRoot) {
    const chatOverlay = shadowRoot.querySelector('.chat-overlay');
    if (chatOverlay) {
      const positionUpdateEvent = new CustomEvent('position-update', {
        detail: newPos,
      });
      chatOverlay.dispatchEvent(positionUpdateEvent);
    }
  }
}

function handleDragEnd() {
  console.log('handleDragEnd');
  if (!isDragging || !shadowHost) return;

  isDragging = false;

  document.removeEventListener('mousemove', handleDragMove as EventListener);
  document.removeEventListener('mouseup', handleDragEnd as EventListener);
  document.body.classList.remove('dragging-cursor');
  document.dispatchEvent(new CustomEvent('drag-end'));
  console.log('Drag ended');

  // After drag, keep element fixed relative to viewport on scroll by attaching floating position to fixed virtual element
  if (manualPosition && shadowHost) {
    // Ensure any previous cleanup stopped
    if ((shadowHost as any).__floatingCleanup) {
      (shadowHost as any).__floatingCleanup();
    }
    const fixedVE = createFixedVirtualElement(manualPosition);
    const cleanup = setupFloatingPosition(fixedVE, shadowHost, {
      placement: 'right-start',
      offsetValue: 10,
      yAdjustment: 0,
      fallbackPlacements: [],
    });
    (shadowHost as any).__floatingCleanup = cleanup;
  }
}

function hideBuntyOverlay() {
  if (shadowHost) {
    shadowHost.style.display = 'none';

    // Cleanup autoUpdate if it exists
    if ((shadowHost as any).__floatingCleanup) {
      (shadowHost as any).__floatingCleanup();
      (shadowHost as any).__floatingCleanup = null;
    }
  }

  // Cleanup drag state if overlay is hidden while dragging
  if (isDragging) {
    handleDragEnd();
  }

  if (overlayInstance) {
    unmount(overlayInstance);
    overlayInstance = null;
  }

  // Reset manual drag state when overlay fully hidden
  isDraggedPosition = false;
  manualPosition = null;
}

// Debounce function to prevent rapid firing
function debounce(func: Function, wait: number) {
  let timeout: any;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Listen for chatContainerVisible store changes
chatContainerVisible.subscribe(visible => {
  console.log('visible', visible);
  if (shadowHost) {
    if (visible) {
      shadowHost.style.display = 'block';
    } else {
      // Don't hide shadowHost here if badge is still showing
      // Only hide when fully closing the overlay
    }
  }
});

// Listen for contextAddOverlayVisible store changes
contextAddOverlayVisible.subscribe(visible => {
  console.log('contextAddOverlayVisible', visible);
  if (contextAddShadowHost) {
    if (visible) {
      contextAddShadowHost.style.display = 'block';
    } else {
      contextAddShadowHost.style.display = 'none';
    }
  }
});

// Listen for text selection with debouncing
const handleMouseUp = debounce((event: MouseEvent) => {
  console.log('handleMouseUp', event);

  // Don't handle selections inside existing overlays
  if (shadowHost && shadowHost.contains(event.target as Node)) return;
  if (contextAddShadowHost && contextAddShadowHost.contains(event.target as Node)) return;

  try {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    if (text) {
      selectedText.set(text);

      // Show context add overlay for new text selection
      showContextAddOverlay();
      contextAddOverlayVisible.set(true);

      console.log('Text selected:', text);
    } else {
      // Hide context add overlay if no text is selected
      hideContextAddOverlay();
      contextAddOverlayVisible.set(false);
    }
  } catch (error) {
    console.error('Error handling text selection:', error);
  }
}, 100);

document.addEventListener('mouseup', handleMouseUp);

// Hide context add overlay when clicking elsewhere
document.addEventListener('mousedown', event => {
  if (contextAddShadowHost && !contextAddShadowHost.contains(event.target as Node)) {
    hideContextAddOverlay();
    contextAddOverlayVisible.set(false);
  }
});

// Listen for keyboard shortcut Cmd/Ctrl+B
document.addEventListener('keydown', (event: KeyboardEvent) => {
  // Check for Cmd+B (Mac) or Ctrl+B (Windows/Linux)
  if ((event.metaKey || event.ctrlKey) && (event.key === 'b' || event.key === 'B')) {
    event.preventDefault(); // Prevent default browser behavior

    // Hide context add overlay if it's open
    if (contextAddOverlayInstance) {
      hideContextAddOverlay();
      contextAddOverlayVisible.set(false);
    }

    if (overlayInstance) {
      hideBuntyOverlay();
    } else {
      showBuntyOverlay(document.body.clientWidth * 0.6, document.body.clientHeight * 0.1);
    }
    console.log('chatContainerVisible', chatContainerVisible);
    chatContainerVisible.update(visible => !visible);
    console.log('Keyboard shortcut triggered: Chat container visible');
  } else if (event.key === 'Escape') {
    if (contextAddOverlayInstance) {
      hideContextAddOverlay();
      contextAddOverlayVisible.set(false);
    }
    if (overlayInstance) {
      hideBuntyOverlay();
    }
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (overlayInstance) {
    unmount(overlayInstance);
    overlayInstance = null;
  }
  if (overlayContainer) {
    overlayContainer.remove();
  }

  if (contextAddOverlayInstance) {
    unmount(contextAddOverlayInstance);
    contextAddOverlayInstance = null;
  }
  if (contextAddOverlayContainer) {
    contextAddOverlayContainer.remove();
  }
});
