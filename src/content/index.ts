import { mount, unmount } from "svelte";
import Overlay from "../components/Overlay.svelte";
import shadowStylesText from "./shadow-styles.css?inline";
import appStylesText from "../app.css?inline";
import { selectedText, chatContainerVisible } from "../lib/stores";
// Content scripts
// https://developer.chrome.com/docs/extensions/mv3/content_scripts/

// Import global styles
import "./styles.css";
let overlayInstance: any = null;
let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let overlayContainer: HTMLElement | null = null;

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

function showBuntyOverlay( x: number, y: number) {
    const container = createOverlayContainer();
    
    // Destroy existing instance if it exists
    if (overlayInstance) {
        unmount(overlayInstance);
        overlayInstance = null;
    }
    
    // Update position on shadow host
    if (shadowHost) {
        shadowHost.style.top = `${Math.max(10, y)}px`;
        shadowHost.style.left = `${Math.min(window.innerWidth - 300, Math.max(10, x))}px`;
        shadowHost.style.display = 'block';
    }

    // Wait for the next tick to ensure the Svelte component is rendered
    setTimeout(() => {
        listenForChatOverlayMounted();
    }, 10);
    
    console.log("container: ", container);
    console.log("selectedText: ", selectedText);
    
    // Mount new instance with current data
    overlayInstance = mount(Overlay, {
        target: container,
        props: {
            visible: true
        }
    })
  
}

function listenForChatOverlayMounted() {
    if (!shadowRoot) return;
    const badgeOverlay = shadowRoot.querySelector('.widget-opener');
    if (!badgeOverlay) return;
    console.log("badgeOverlay", badgeOverlay);
    badgeOverlay.addEventListener('chat-overlay-mounted', () => {
        setTimeout(() => {
            setupDragListeners();
        }, 10);
    });
}

// Drag state
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

function setupDragListeners() {
    console.log("setupDragListeners");
    if (!shadowRoot) return;
    console.log("shadowRoot", shadowRoot);
    // const chatOverlay = shadowRoot.querySelector('.chat-overlay');
    // if (!chatOverlay) return;
    // console.log("chatOverlay", chatOverlay);
    // Listen for drag start events from the component
    document.addEventListener('drag-start', (e) => {
        console.log("drag-start event", e);
        const { offset, initialPos } = (e as CustomEvent).detail;
        isDragging = true;
        dragOffset = offset;
        // Add global event listeners
        const root = document || window;
        root.addEventListener('mousemove', handleDragMove as EventListener);
        root.addEventListener('mouseup', handleDragEnd as EventListener);
        document.body.classList.add('dragging-cursor');
        
        console.log('Drag started', { offset, initialPos });
    });
    document.addEventListener('mouseup', handleDragEnd);
    // Listen for drag end events from the component
    document.addEventListener('drag-end', () => {
        handleDragEnd();
    });
}

function handleDragMove(event: Event) {
    console.log("handleDragMove event", event);
    const mouseEvent = event as MouseEvent;
    if (!isDragging || !shadowHost) return;
    
    const newPos = { 
        x: mouseEvent.clientX - dragOffset.x, 
        y: mouseEvent.clientY - dragOffset.y 
    };
    
    // Update shadow host position
    shadowHost.style.top = `${newPos.y}px`;
    shadowHost.style.left = `${newPos.x}px`;
    
    // Notify component of position change
    if (shadowRoot) {
        const chatOverlay = shadowRoot.querySelector('.chat-overlay');
        if (chatOverlay) {
            const positionUpdateEvent = new CustomEvent('position-update', { 
                detail: newPos 
            });
            chatOverlay.dispatchEvent(positionUpdateEvent);
        }
    }
}

function handleDragEnd() {
    if (!isDragging) return;
    
    isDragging = false;
    
    // Remove global event listeners
    const root = shadowRoot || window;
    root.removeEventListener('mousemove', handleDragMove as EventListener);
    root.removeEventListener('mouseup', handleDragEnd as EventListener);
    document.body.classList.remove('dragging-cursor');
    
    console.log('Drag ended');
}

function hideAvatarOverlay() {
    if (shadowHost) {
        shadowHost.style.display = 'none';
    }
    
    // Cleanup drag state if overlay is hidden while dragging
    if (isDragging) {
        handleDragEnd();
    }
    
    if (overlayInstance) {
        unmount(overlayInstance);
        overlayInstance = null;
    }
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

// Listen for text selection with debouncing
const handleMouseUp = debounce((event: MouseEvent) => {
    if (shadowHost && shadowHost.contains(event.target as Node)) return;
    try {
        const selection = window.getSelection();
        const text = selection?.toString().trim() || '';

        if (text) {
            chatContainerVisible.set(false);   
            selectedText.set(text);
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
document.addEventListener('mousedown', (event) => {
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
        overlayContainer = null;
    }
});

  

