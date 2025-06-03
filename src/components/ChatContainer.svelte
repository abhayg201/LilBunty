<script lang="ts">
    import { chatContainerVisible, selectedText } from "../lib/stores";
    
    let response = '';
    let loading = false;
    
    function handleClose() {
        chatContainerVisible.set(false);
    }
    
    async function sendToGPT() {
        if (!$selectedText) return;
        
        loading = true;
        response = '';
        
        try {
            // Send message to background script
            const result = await chrome.runtime.sendMessage({
                type: "QUERY_OPENAI",
                payload: { text: $selectedText }
            });
            
            response = result.answer || 'No response received';
        } catch (error) {
            console.error('Error sending message:', error);
            response = 'Error getting response';
        } finally {
            loading = false;
        }
    }
    
    // Auto-send when component mounts and selectedText is available
    $: if ($chatContainerVisible && $selectedText && !response && !loading) {
        sendToGPT();
    }
</script>

{#if $chatContainerVisible}
    <div class="chat-container">
        <div class="chat-header">
            <span><strong>Chat about:</strong>"{$selectedText}"</span>
            <button on:click={handleClose}>×</button>
        </div>
        <div class="chat-content">
            <!-- <p><strong>Selected:</strong> {$selectedText}</p> -->
            
            {#if loading}
                <p>Getting response...</p>
            {:else if response}
                <div class="response">
                    <strong>GPT Response:</strong>
                    <p>{response}</p>
                </div>
            {/if}
            
            <!-- {#if !loading}
                <button on:click={sendToGPT}>Ask GPT</button>
            {/if} -->
        </div>
    </div>
{/if}

