<script lang="ts">
    import { Avatar, AvatarFallback, AvatarImage } from "$lib/components/ui/avatar";
    
    export let selectedText: string = "";
    export let visible: boolean = false;
    
    const avatarSrc = chrome.runtime.getURL("assets/icon/icon-128.png");
    
    function handleClick() {
        console.log('Avatar clicked with text:', selectedText);
    }
</script>

{#if visible && selectedText}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="simple-overlay" on:click={handleClick} role="button" tabindex="0">
        <Avatar class="avatar-size">
            <AvatarImage src={avatarSrc} alt="Bunty AI" />
            <AvatarFallback class="avatar-fallback">AI</AvatarFallback>
        </Avatar>
        
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
