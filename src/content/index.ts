import { mount, unmount } from "svelte";
import Overlay from "../components/Overlay.svelte";

// Content scripts
// https://developer.chrome.com/docs/extensions/mv3/content_scripts/

// Import global styles
import "./styles.css";

let overlayInstance: any = null;
let overlayContainer: HTMLElement | null = null;

function createOverlayContainer() {
    if (overlayContainer) {
        return overlayContainer;
    }
    
    overlayContainer = document.createElement('div');
    overlayContainer.id = 'text-selection-overlay';
    overlayContainer.style.position = 'fixed';
    overlayContainer.style.zIndex = '2147483647';
    overlayContainer.style.pointerEvents = 'auto';
    overlayContainer.style.display = 'none';
    
    document.body.appendChild(overlayContainer);
    
    return overlayContainer;
}

function showAvatarOverlay(selectedText: string, x: number, y: number) {
    const container = createOverlayContainer();
    
    // Destroy existing instance if it exists
    if (overlayInstance) {
        unmount(overlayInstance);
        overlayInstance = null;
    }
    
    // Update position
    container.style.top = `${Math.max(10, y)}px`;
    container.style.left = `${Math.min(window.innerWidth - 300, Math.max(10, x))}px`;
    container.style.display = 'block';
    
    console.log("container: ", container);
    console.log("selectedText: ", selectedText);
    
    // Mount new instance with current data
    overlayInstance = mount(Overlay, {
        target: container,
        props: {
            selectedText: selectedText,
            visible: true
        }
    });
}

function hideAvatarOverlay() {
    if (overlayContainer) {
        overlayContainer.style.display = 'none';
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
    try {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();
        
        if (selectedText && selectedText.length > 0) {
            const x = event.clientX;
            const y = event.clientY - 60;
            
            showAvatarOverlay(selectedText, x, y);
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
    if (overlayContainer && !overlayContainer.contains(event.target as Node)) {
        hideAvatarOverlay();
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (overlayInstance) {
        unmount(overlayInstance);
        overlayInstance = null;
    }
    if (overlayContainer) {
        unmount(overlayContainer);
        overlayContainer = null;
    }
});



