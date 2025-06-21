<script lang="ts">
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { selectedText, overlayPosition } from '../stores';
	import { Card, Button, Dropdown, DropdownItem, DropdownDivider, DropdownHeader } from "flowbite-svelte";
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
		containerElement.style.top = `${ position.top+$overlayPosition.y}px`;
		containerElement.style.left = `${ position.left+$overlayPosition.x}px`;
		containerElement.style.zIndex = '99999';
		containerElement.style.border = '1.5px solid gray';
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
	<!-- Original Custom Dropdown -->
	<!-- <div 
		bind:this={containerElement}
		class="context-mentions-dropdown rounded-lg"
		style = "rounded-lg"
		role="listbox"
		aria-label="Context suggestions"
	>
		<Card class="w-80 shadow-lg "
		>
			<div class="p-4 pb-2">
				<h3 class="text-sm font-medium text-gray-700 dark:text-gray-200">Add Context</h3>
				<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
					Choose content to add as context
				</p>
			</div>
			<div class="p-0">
				{#if filteredCommands.length > 0}
					<div class="max-h-60 overflow-y-auto">
						{#each filteredCommands as command, index}
							<Button
								class="w-full justify-start p-3 h-auto rounded-xl border-0 text-left
								hover:bg-gray-100 dark:hover:bg-gray-700 
								transition-colors duration-200 
								{index === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/20' : ''}"
								onclick={() => selectCommand(index)}
							>
								<div class="flex items-center gap-3 w-full">
									<span class="text-lg flex-shrink-0">{command.icon}</span>
									<div class="flex-1 text-left">
										<div class="font-medium text-sm text-gray-900 dark:text-gray-100">{command.label}</div>
										<div class="text-xs text-gray-500 dark:text-gray-400">{command.description}</div>
									</div>
									{#if index === selectedIndex}
										<span class="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">Enter</span>
									{/if}
								</div>
							</Button>
						{/each}
					</div>
				{:else}
					<div class="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
						No commands found
					</div>
				{/if}
			</div>
		</Card>
	</div> -->

	<!-- New Flowbite Dropdown -->
	<Dropdown placement="top-start" class="w-80 shadow-lg">
		<DropdownHeader>
			<span class="text-sm font-medium text-gray-700 dark:text-gray-200">Add Context</span>
			<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
				Choose content to add as context
			</p>
		</DropdownHeader>
		<DropdownDivider />
		
		{#if filteredCommands.length > 0}
			{#each filteredCommands as command, index}
				<DropdownItem 
					class="flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-700 
					{index === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/20' : ''}"
					onclick={() => selectCommand(index)}
				>
					<span class="text-lg flex-shrink-0">{command.icon}</span>
					<div class="flex-1 text-left">
						<div class="font-medium text-sm text-gray-900 dark:text-gray-100">{command.label}</div>
						<div class="text-xs text-gray-500 dark:text-gray-400">{command.description}</div>
					</div>
					{#if index === selectedIndex}
						<span class="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">Enter</span>
					{/if}
				</DropdownItem>
			{/each}
		{:else}
			<DropdownItem disabled class="text-center text-sm text-gray-500 dark:text-gray-400">
				No commands found
			</DropdownItem>
		{/if}
	</Dropdown>
{/if}
