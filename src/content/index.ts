import { mount, unmount } from 'svelte';
import Overlay from '../components/Overlay.svelte';
import shadowStylesText from './shadow-styles.css?inline';
import appStylesText from '../app.css?inline';
import { selectedText, chatContainerVisible, overlayPosition } from '../lib/stores';
import {
  setupFloatingPosition,
  createPersistentVirtualElement,
  createScrollAwarePersistentVirtualElement,
  createFixedVirtualElement,
} from '../lib/utils/floating-position';

// https://developer.chrome.com/docs/extensions/mv3/content_scripts/

// Import global styles
import './styles.css';
let overlayInstance: any = null;
let shadowHost: HTMLElement;
let shadowRoot: ShadowRoot | null = null;
let overlayContainer: HTMLElement;

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
    const virtualElement = createScrollAwarePersistentVirtualElement({ x, y });

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
  }, 10);

  // Mount new instance
  overlayInstance = mount(Overlay, { target: container, props: { visible: true } });
}

function listenForChatOverlayMounted() {
  if (!shadowRoot) return;
  const badgeOverlay = shadowRoot.querySelector('.widget-opener');
  if (!badgeOverlay) return;
  console.log('badgeOverlay', badgeOverlay);
  badgeOverlay.addEventListener('chat-overlay-mounted', () => {
    setupDragListeners();
  });
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
  // Listen for drag end events from the component
  document.addEventListener('drag-end', () => {
    handleDragEnd();
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
  if (!isDragging) return;

  isDragging = false;

  document.removeEventListener('mousemove', handleDragMove as EventListener);
  document.removeEventListener('mouseup', handleDragEnd as EventListener);
  document.body.classList.remove('dragging-cursor');

  console.log('Drag ended');

  // After drag, keep element fixed relative to viewport on scroll by attaching floating position to fixed virtual element
  if (manualPosition && shadowHost) {
    // Ensure any previous cleanup stopped
    if ((shadowHost as any).__floatingCleanup) {
      (shadowHost as any).__floatingCleanup();
    }
    const fixedVE = createFixedVirtualElement(manualPosition);
    const cleanup = setupFloatingPosition(fixedVE, shadowHost, { placement: 'right-start', offsetValue: 10, yAdjustment: 0, fallbackPlacements: [] });
    (shadowHost as any).__floatingCleanup = cleanup;
  }
}

function hideAvatarOverlay() {
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
chatContainerVisible.subscribe((visible) => {
    console.log('visible', visible);
    if (shadowHost) {
        if (visible) {
            shadowHost.style.display = 'block';
        } else {
            // Don't hide shadowHost here if badge is still showing
            // Only hide when fully closing the overlay
        }
    }
  }
);

// Listen for text selection with debouncing
const handleMouseUp = debounce((event: MouseEvent) => {
  if (shadowHost && shadowHost.contains(event.target as Node)) return;
  try {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    if (text) {
      chatContainerVisible.set(false);
      selectedText.set(text);

      // Reset manual drag state for new selection
      isDraggedPosition = false;
      manualPosition = null;

      console.log(selection?.anchorNode);
      showBuntyOverlay(event.clientX, event.clientY - 60);
    } else {
      hideAvatarOverlay();
    }
  } catch (error) {
    console.error('Error handling text selection:', error);
  }
}, 100);

document.addEventListener('mouseup', handleMouseUp);

// Hide overlay when clicking elsewhere
document.addEventListener('mousedown', event => {
  if (shadowHost && !shadowHost.contains(event.target as Node)) {
    hideAvatarOverlay();
    chatContainerVisible.set(false);
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
});
