# Shadow DOM Styles Organization

This directory contains modularized CSS files for better maintainability. The main `shadow-styles.css` file imports all these modules.

## File Structure

### Core Files
- **`base.css`** - CSS variables, reset styles, and :host configurations
- **`animations.css`** - Animation keyframes and utility classes

### Component-Specific Styles
- **`widget-opener.css`** - Initial widget opener button styles  
- **`chat-overlay.css`** - Chat card overlay container and drag handle styles
- **`chat-container.css`** - Basic chat container and header styles
- **`tiptap-editor.css`** - Complete Tiptap editor styling (largest module)
- **`model-selector.css`** - Model selection dropdown and trigger styles
- **`suggestions.css`** - Enhanced suggestion dropdown styling
- **`context-items.css`** - Context items and control button styles
- **`avatar.css`** - Avatar, tooltips, and text display components
- **`thread.css`** - Thread containers, scrollbars, and message text formatting

### Compatibility
- **`legacy.css`** - Backward compatibility styles (may be deprecated)

## Usage

The main entry point is `../shadow-styles.css` which imports all these modules using `@import` statements. This maintains backward compatibility while improving organization.

## Benefits

1. **Maintainability** - Each file focuses on a specific component or feature
2. **Readability** - Easier to find and modify specific styles
3. **Modularity** - Can disable/modify individual components without affecting others
4. **Size Management** - Each file is reasonably sized (largest is ~8KB)
5. **Developer Experience** - Clear separation of concerns

## File Sizes

- `model-selector.css` - 7.7KB (largest - complex dropdown component)
- `tiptap-editor.css` - 4.9KB (editor and input styling)
- `thread.css` - 2.6KB (message formatting and scrollbars)
- `chat-overlay.css` - 2.2KB (overlay containers)
- Other files range from 600B to 1.9KB

Total: ~27KB (same as original monolithic file) 