<script lang="ts">
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { selectedText } from '../stores';
	import * as Card from "$lib/components/ui/card/index.js";
	import { Button } from "$lib/components/ui/button/index.js";

	export let isOpen = false;
	export let position: { top: number; left: number } | null = null;
	export let query = '';

	const dispatch = createEventDispatcher<{
		select: { id: string; label: string; content: string };
		close: void;
	}>();

	let selectedIndex = 0;
	let containerElement: HTMLDivElement;

	// @ Commands configuration
	const commands = [
		{
			id: 'selected-text',
			label: 'Selected Text',
			description: 'Add the selected text as context',
			icon: '📝',
			action: async () => {
				const text = get(selectedText);
				if (text && text.trim()) {
					dispatch('select', { 
						id: 'selected-text', 
						label: 'Selected Text', 
						content: text 
					});
					return true;
				}
				return false;
			}
		},
		{
			id: 'clipboard',
			label: 'Clipboard',
			description: 'Add clipboard content as context',
			icon: '📋',
			action: async () => {
				try {
					const text = await navigator.clipboard.readText();
					if (text && text.trim()) {
						dispatch('select', { 
							id: 'clipboard', 
							label: 'Clipboard', 
							content: text 
						});
						return true;
					}
				} catch (err) {
					console.warn('Could not read clipboard:', err);
				}
				return false;
			}
		}
	];

	// Filter commands based on query
	$: filteredCommands = commands.filter(cmd => 
		cmd.label.toLowerCase().includes(query.toLowerCase()) ||
		cmd.description.toLowerCase().includes(query.toLowerCase())
	);

	function handleKeyDown(event: KeyboardEvent) {
		if (!isOpen) return;

		switch (event.key) {
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
				break;
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = (selectedIndex + 1) % filteredCommands.length;
				break;
			case 'Enter':
				event.preventDefault();
				if (filteredCommands[selectedIndex]) {
					selectCommand(selectedIndex);
				}
				break;
			case 'Escape':
				event.preventDefault();
				dispatch('close');
				break;
		}
	}

	async function selectCommand(index: number) {
		const command = filteredCommands[index];
		if (command && command.action) {
			await command.action();
		}
		dispatch('close');
	}

	// Reset selected index when query changes
	$: if (query !== undefined) {
		selectedIndex = 0;
	}

	// Position the dropdown
	$: if (containerElement && position && isOpen) {
		containerElement.style.position = 'fixed';
		containerElement.style.top = `${position.top}px`;
		containerElement.style.left = `${position.left}px`;
		containerElement.style.zIndex = '214748364712';
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			window.addEventListener('keydown', handleKeyDown);
		}
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('keydown', handleKeyDown);
		}
	});
</script>

{#if isOpen}
	<div 
		bind:this={containerElement}
		class="context-mentions-dropdown"
		role="listbox"
		aria-label="Context suggestions"
	>
		<Card.Root class="w-80 shadow-lg border-2">
			<Card.Header class="pb-2">
				<Card.Title class="text-sm font-medium text-gray-700">Add Context</Card.Title>
				<Card.Description class="text-xs text-gray-500">
					Choose content to add as context
				</Card.Description>
			</Card.Header>
			<Card.Content class="p-0">
				{#if filteredCommands.length > 0}
					<div class="max-h-60 overflow-y-auto">
						{#each filteredCommands as command, index}
							<Button
								variant={index === selectedIndex ? "secondary" : "ghost"}
								class="w-full justify-start p-3 h-auto rounded-none border-0 {index === selectedIndex ? 'bg-accent' : ''}"
								on:click={() => selectCommand(index)}
							>
								<div class="flex items-center gap-3 w-full">
									<span class="text-lg flex-shrink-0">{command.icon}</span>
									<div class="flex-1 text-left">
										<div class="font-medium text-sm">{command.label}</div>
										<div class="text-xs text-muted-foreground">{command.description}</div>
									</div>
									{#if index === selectedIndex}
										<span class="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Enter</span>
									{/if}
								</div>
							</Button>
						{/each}
					</div>
				{:else}
					<div class="p-4 text-center text-sm text-muted-foreground">
						No commands found
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
{/if}

<style>
	.context-mentions-dropdown {
		position: fixed;
		z-index: 214748364712;
	}
</style> 