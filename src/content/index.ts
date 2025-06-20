import { mount, unmount } from "svelte";
import Overlay from "../components/Overlay.svelte";
import shadowStylesText from "./shadow-styles.css?inline";
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
    
    // Add styles to shadow DOM from external CSS file
    const style = document.createElement('style');
    style.textContent = shadowStylesText;
    shadowRoot.appendChild(style);
    
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

function showAvatarOverlay( x: number, y: number) {
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
    
    console.log("container: ", container);
    console.log("selectedText: ", selectedText);
    
    // Mount new instance with current data
    overlayInstance = mount(Overlay, {
        target: container,
        props: {
            visible: true
        }
    });
}

function hideAvatarOverlay() {
    if (shadowHost) {
        shadowHost.style.display = 'none';
    }
    
    if (overlayInstance) {
        unmount(overlayInstance);
        overlayInstance = null;
    }
}

// Debounce function to prevent rapid firing
function debounce(func: Function, wait: number) {
    let timeout: number;
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
            chatContainerVisible.set(false);     // hide previous chat
            selectedText.set(text);
            showAvatarOverlay(event.clientX, event.clientY - 60);
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



