<script lang="ts">
    import { chatContainerVisible, selectedText } from "../lib/stores";
    console.log("selectedText: ", $selectedText);
    console.log("chatContainerVisible: ", $chatContainerVisible);
    function handleClose() {
        chatContainerVisible.set(false);
    }
</script>

{#if $chatContainerVisible}
    <div class="chat-container">
        <div class="chat-header">
            <span>Chat about: "{$selectedText}"</span>
            <button on:click={handleClose}>×</button>
        </div>
        <div class="chat-content">
            <p>Selected: {$selectedText}</p>
        </div>
    </div>
{/if}

