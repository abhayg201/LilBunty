<script lang="ts">
    import { Avatar, AvatarFallback, AvatarImage } from "$lib/components/ui/avatar";
    import { chatContainerVisible, selectedText } from "../lib/stores";
    import ChatContainer from "./ChatContainer.svelte";


    
    export let visible = false;
    
    const avatarSrc = chrome.runtime.getURL("assets/icon/icon-128.png");
    
    function handleClick() {
        chatContainerVisible.set(true);
        // TODO: Implement chat container functionality
    }
</script>

{#if visible && !$chatContainerVisible && $selectedText}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <button on:click={handleClick} tabindex="0">
        <Avatar class="avatar-size">
            <AvatarImage  alt="Bunty AI" />
            <AvatarFallback class="avatar-fallback">AI</AvatarFallback>
        </Avatar>
    </button>
{/if}

{#if $chatContainerVisible}
    <ChatContainer />
{/if}
