import { computePosition, flip, shift, offset, autoUpdate,hide, type Placement } from '@floating-ui/dom';

export interface PositionConfig {
  placement?: Placement;
  offsetValue?: number;
  yAdjustment?: number;
  fallbackPlacements?: Placement[];
  padding?: number;
}

export interface VirtualElement {
  getBoundingClientRect(): DOMRect;
  contextElement?: HTMLElement;
}

export function getSelectedElementHTMLElement(): HTMLElement {
  const selection = window.getSelection();
  
  if (!selection || selection.rangeCount === 0) {
    return document.body;
  }
  
  const range = selection.getRangeAt(0);
  let node = range.commonAncestorContainer;
  
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode as HTMLElement;
  }
  
  let element = node as HTMLElement;
  
  // For figure tags, try to find a better positioning reference
  if (element.tagName === 'CODE' || element.tagName === 'PRE') {
    const figure = element.closest('figure');
    if (figure) {
      element = figure as HTMLElement;
    }
  }
  
  if (!element || !element.getBoundingClientRect) {
    return document.body;
  }
  
  return element;
}

export function createVirtualElement(fallbackPos?: { x: number; y: number }): VirtualElement {
  return {
    getBoundingClientRect() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        // Use fallback position if provided, otherwise use origin
        const pos = fallbackPos || { x: 0, y: 0 };
        return {
          width: 0,
          height: 0,
          top: pos.y,
          left: pos.x,
          right: pos.x,
          bottom: pos.y,
          x: pos.x,
          y: pos.y
        } as DOMRect;
      }
      
      const range = selection.getRangeAt(0);
      return range.getBoundingClientRect();
    },
    contextElement: getSelectedElementHTMLElement()
  };
}

export function createPersistentVirtualElement(initialPos?: { x: number; y: number }): VirtualElement {
  // Capture the current selection bounds immediately
  let persistentBounds: DOMRect | null = null;
  let persistentContextElement: HTMLElement | null = null;
  
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    persistentBounds = range.getBoundingClientRect();
    persistentContextElement = getSelectedElementHTMLElement();
    console.log('Captured persistent bounds:', persistentBounds);
  } else {
    console.log('No selection found, using fallback position:', initialPos);
  }
  
  return {
    getBoundingClientRect() {
      // Always return the captured bounds, don't rely on current selection
      if (persistentBounds) {
        // Make sure bounds are still valid (not collapsed/empty)
        if (persistentBounds.width === 0 && persistentBounds.height === 0) {
          console.warn('Persistent bounds are empty, using fallback');
          const pos = initialPos || { x: 0, y: 0 };
          return {
            width: 0,
            height: 0,
            top: pos.y,
            left: pos.x,
            right: pos.x,
            bottom: pos.y,
            x: pos.x,
            y: pos.y
          } as DOMRect;
        }
        return persistentBounds;
      }
      
      // Fallback to provided position or origin
      const pos = initialPos || { x: 0, y: 0 };
      console.log('Using fallback position:', pos);
      return {
        width: 0,
        height: 0,
        top: pos.y,
        left: pos.x,
        right: pos.x,
        bottom: pos.y,
        x: pos.x,
        y: pos.y
      } as DOMRect;
    },
    contextElement: persistentContextElement || document.body
  };
}

export function createScrollAwarePersistentVirtualElement(initialPos?: { x: number; y: number }): VirtualElement {
  // Capture the current selection bounds and scroll position immediately
  let persistentBounds: DOMRect | null = null;
  let persistentContextElement: HTMLElement | null = null;
  let initialScrollX = 0;
  let initialScrollY = 0;
  let documentBounds: { top: number; left: number; width: number; height: number } | null = null;
  
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const viewportBounds = range.getBoundingClientRect();
    
    // Store initial scroll position
    initialScrollX = window.scrollX || window.pageXOffset;
    initialScrollY = window.scrollY || window.pageYOffset;
    
    // Convert viewport coordinates to document coordinates
    documentBounds = {
      top: viewportBounds.top + initialScrollY,
      left: viewportBounds.left + initialScrollX,
      width: viewportBounds.width,
      height: viewportBounds.height
    };
    
    persistentContextElement = getSelectedElementHTMLElement();
    console.log('Captured document bounds:', documentBounds, 'Initial scroll:', { x: initialScrollX, y: initialScrollY });
  } else {
    console.log('No selection found, using fallback position:', initialPos);
  }
  
  return {
    getBoundingClientRect() {
      if (documentBounds) {
        // Get current scroll position
        const currentScrollX = window.scrollX || window.pageXOffset;
        const currentScrollY = window.scrollY || window.pageYOffset;
        
        // Convert document coordinates back to viewport coordinates
        const viewport = {
          top: documentBounds.top - currentScrollY,
          left: documentBounds.left - currentScrollX,
          width: documentBounds.width,
          height: documentBounds.height,
          right: (documentBounds.left - currentScrollX) + documentBounds.width,
          bottom: (documentBounds.top - currentScrollY) + documentBounds.height,
          x: documentBounds.left - currentScrollX,
          y: documentBounds.top - currentScrollY
        } as DOMRect;
        
        console.log('Returning scroll-adjusted bounds:', viewport, 'Current scroll:', { x: currentScrollX, y: currentScrollY });
        return viewport;
      }
      
      // Fallback to provided position or origin
      const pos = initialPos || { x: 0, y: 0 };
      console.log('Using fallback position:', pos);
      return {
        width: 0,
        height: 0,
        top: pos.y,
        left: pos.x,
        right: pos.x,
        bottom: pos.y,
        x: pos.x,
        y: pos.y
      } as DOMRect;
    },
    contextElement: persistentContextElement || document.body
  };
}

export function createFixedVirtualElement(pos: { x: number; y: number }): VirtualElement {
  return {
    getBoundingClientRect() {
      return {
        width: 0,
        height: 0,
        top: pos.y,
        left: pos.x,
        right: pos.x,
        bottom: pos.y,
        x: pos.x,
        y: pos.y,
      } as DOMRect;
    },
    contextElement: document.body,
  };
}

export function setupFloatingPosition(
  referenceElement: VirtualElement,
  floatingElement: HTMLElement,
  config: PositionConfig = {},
  onUpdate?: (x: number|undefined, y: number|undefined) => void
): () => void {
  const {
    placement = 'right-start',
    offsetValue = 10,
    yAdjustment = 25,
    fallbackPlacements = ['top-end', 'bottom-start', 'left-start'],
    padding = 8
  } = config;

  let isDestroyed = false;

  const updatePosition = () => {
    if (isDestroyed) return;
    
    try {
      computePosition(referenceElement, floatingElement, {
        strategy: 'fixed', 
        placement,
        middleware: [
          offset(offsetValue),
          flip({ fallbackPlacements }),
          // hide(),
          shift({ padding }),
        ]
      }).then(({x, y}) => {
        if (isDestroyed) return;
        
        const finalY = y + yAdjustment;
        
        // Validate the computed position
        if (isNaN(x) || isNaN(finalY) || x < -10000 || y < -10000) {
          console.warn('Invalid position computed, skipping update:', { x, y: finalY });
          return;
        }
        
        Object.assign(floatingElement.style, {
          top: `${finalY}px`,
          left: `${x}px`,
          display: 'block',
        });
        
        if (onUpdate) {
          onUpdate(x, finalY);
        }
        
        console.log('Positioned element at:', { x, y: finalY });
      }).catch(error => {
        if (isDestroyed) return;
        
        console.error('Positioning failed:', error);
        
        // Don't reset to fallback position during scroll, keep current position
        console.log('Keeping current position due to positioning error');
      });
    } catch (error) {
      console.error('Critical positioning error:', error);
    }
  };

  // Initial positioning
  updatePosition();

  // Set up autoUpdate with proper cleanup
  const cleanup = autoUpdate(referenceElement, floatingElement, updatePosition,{
    layoutShift: false,
    ancestorScroll: false,
    // ancestorResize: false,
    // animationFrame: true,
  });

  return () => {
    isDestroyed = true;
    cleanup();
  };
}

// export function setupFloatingPositionForSvelte(
//   referenceElement: VirtualElement,
//   floatingElement: HTMLElement,
//   config: PositionConfig = {},
//   onUpdate?: (x: number, y: number) => void
// ): () => void {
//   const {
//     placement = 'right-start',
//     offsetValue = 10,
//     yAdjustment = 25,
//     fallbackPlacements = ['top-start', 'bottom-start', 'left-start'],
//     padding = 8
//   } = config;

//   return autoUpdate(referenceElement, floatingElement, () => {
//     computePosition(referenceElement, floatingElement, {
//       strategy: 'fixed',
//       placement,
//       middleware: [
//         offset(offsetValue),
//         flip({ fallbackPlacements }),
//         shift({ padding })
//       ]
//     }).then(({x, y}) => {
//       const finalY = y + yAdjustment;
      
//       // For Svelte components, we don't directly manipulate styles
//       // Instead, we call the update callback
//       if (onUpdate) {
//         onUpdate(x, finalY);
//       }
      
//       console.log('Positioned Svelte element at:', { x, y: finalY });
//     }).catch(error => {
//       console.error('Svelte positioning failed:', error);
      
//       // Fallback positioning via callback
//       if (onUpdate) {
//         onUpdate(50, 50);
//       }
//     });
//   });
// }

// export function setupStaticFloatingPosition(
//   referenceElement: VirtualElement,
//   floatingElement: HTMLElement,
//   config: PositionConfig = {},
//   onUpdate?: (x: number, y: number) => void
// ): () => void {
//   const {
//     placement = 'right-start',
//     offsetValue = 10,
//     yAdjustment = 25,
//     fallbackPlacements = ['top-start', 'bottom-start', 'left-start'],
//     padding = 8
//   } = config;

//   let isDestroyed = false;

//   const positionOnce = () => {
//     if (isDestroyed) return;
    
//     try {
//       computePosition(referenceElement, floatingElement, {
//         strategy: 'fixed',
//         placement,
//         middleware: [
//           offset(offsetValue),
//           flip({ fallbackPlacements }),
//           shift({ padding })
//         ]
//       }).then(({x, y}) => {
//         if (isDestroyed) return;
        
//         const finalY = y + yAdjustment;
        
//         // Validate the computed position
//         if (isNaN(x) || isNaN(finalY) || x < -10000 || y < -10000) {
//           console.warn('Invalid position computed, using fallback');
//           x = 100;
//           y = 100;
//         }
        
//         Object.assign(floatingElement.style, {
//           top: `${finalY}px`,
//           left: `${x}px`,
//           display: 'block',
//         });
        
//         if (onUpdate) {
//           onUpdate(x, finalY);
//         }
        
//         console.log('Static positioned element at:', { x, y: finalY });
//       }).catch(error => {
//         console.error('Static positioning failed:', error);
        
//         // Fallback positioning
//         floatingElement.style.top = '100px';
//         floatingElement.style.left = '100px';
//         floatingElement.style.display = 'block';
//       });
//     } catch (error) {
//       console.error('Critical static positioning error:', error);
//     }
//   };

//   // Position once only - no autoUpdate
//   positionOnce();

//   return () => {
//     isDestroyed = true;
//   };
// } 