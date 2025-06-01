<script lang="ts">
    export let selectedText: string = "";
    export let visible: boolean = false;
    
    function handleClick() {
        console.log('Avatar clicked with text:', selectedText);
    }
</script>

{#if visible && selectedText}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="simple-overlay" on:click={handleClick} role="button" tabindex="0">
        <div class="avatar">
            AI
        </div>
        
        <div class="tooltip">
            <p class="selected-text">
                "{selectedText}"
            </p>
            <p class="hint">
                Click to chat with Bunty
            </p>
        </div>
    </div>
{/if}

<style>
    .simple-overlay {
        display: flex;
        align-items: center;
        gap: 8px;
        background: white;
        border-radius: 12px;
        padding: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border: 1px solid #e5e7eb;
        cursor: pointer;
        transition: transform 0.2s ease;
        max-width: 300px;
        font-family: system-ui, -apple-system, sans-serif;
        animation: fadeIn 0.2s ease-out;
    }
    
    .simple-overlay:hover {
        transform: scale(1.05);
    }
    
    .avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #3b82f6;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 14px;
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .tooltip {
        max-width: 200px;
        min-width: 0;
    }
    
    .selected-text {
        font-size: 14px;
        color: #374151;
        margin: 0 0 4px 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    .hint {
        font-size: 12px;
        color: #6b7280;
        margin: 0;
    }
    
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
