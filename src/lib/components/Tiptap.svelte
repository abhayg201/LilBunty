<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Placeholder from '@tiptap/extension-placeholder';
	import DOMPurify from 'isomorphic-dompurify';
	import {  selectedText } from '../stores';
	import { Dropdown, Popover  } from "flowbite-svelte";
	import { get } from 'svelte/store';
	import { TabMessaging } from '../../services/browser-messaging';
	
	export let content: string = '';
	export let placeholder: string = 'Ask anything';
	export let disabled: boolean = false;
	export let minHeight: string = '80px';

	let element: HTMLDivElement
	let addContextButton: HTMLDivElement;
	let editor: Editor | null = null;
	let selectedModel = 'gpt-4';
	let modelSearchQuery = '';
	let isContextMentionsOpen = false;
	let isOpen = false;
	// Dynamic context items
	let contextItems: Array<{id: string, label: string, content: string}> = [];
	
	// Context mentions positioning
	let contextMentionsPosition: { top: number; left: number} | null = null;
	let selectedIndex = 0;
	let searchQuery = '';
	let searchInput: HTMLInputElement;
	let availableTabs: chrome.tabs.Tab[] = [];
	let currentView: 'commands' | 'tabs' = 'commands';
	let tabsContainer: HTMLDivElement | undefined;
	let commandsContainer: HTMLDivElement | undefined;

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
					addContextItem('Selected Text', text);
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
						addContextItem('Clipboard', text);
						return true;
					}
				} catch (err) {
					console.warn('Could not read clipboard:', err);
				}
				return false;
			}
		},
		{
			id: 'tabs',
			label: 'Tabs',
			description: 'Browse and select specific tabs',
			icon: '🗂️',
			hasSubmenu: true, 
			action: async () => {
				try {
					// Use TabMessaging to fetch tabs from background service worker
					const response = await TabMessaging.getTabs();
					console.log('Tabs response:', response);
					
					if (response.success && response.data) {
						availableTabs = response.data;
						currentView = 'tabs';
						searchQuery = ''; // Reset search when switching views
						return false; // Don't close main dropdown yet
					} else {
						console.warn('Failed to fetch tabs:', response.error);
						addContextItem('Tabs', 'Error fetching tabs information');
						return true;
					}
				} catch (err) {
					console.warn('Could not fetch tabs:', err);
					addContextItem('Tabs', 'Error fetching tabs information');
					return true;
				}
			}
		}
	];

	// Filter commands based on search query
	$: filteredCommands = commands.filter(cmd => 
		cmd.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
		cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
	);



	const dispatch = createEventDispatcher<{
		update: { content: string };
		send: { content: string; model: string };
	}>();

	const models = [
		{ value: 'gpt-4', label: 'GPT-4' },
		{ value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
		{ value: 'claude-3', label: 'Claude 3' },
		{ value: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
		{ value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
		{ value: 'gemini-pro', label: 'Gemini Pro' },
	];

	// Filter models based on search query
	$: filteredModels = models.filter(model => {
		return model.label.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
			model.value.toLowerCase().includes(modelSearchQuery.toLowerCase());
	});

	// Get selected model label for display
	$: selectedModelLabel = models.find(m => m.value === selectedModel)?.label || selectedModel;

	function addContextItem(label: string, content: string) {
		console.log(label, content);
		const id = `context-${Date.now()}`;
		contextItems = [...contextItems, { id, label, content }];
	}

	function removeContextItem(id: string) {
		contextItems = contextItems.filter(item => item.id !== id);
	}

	async function selectCommand(index: number) {
		const command = filteredCommands[index];
		console.log(command);
		if (command && command.action) {
			const shouldClose = await command.action();
			if (shouldClose) {
				// Remove the @ character that triggered the dropdown
				removeAtSymbol();
				isContextMentionsOpen = false;
				isOpen = false;
				searchQuery = '';
				selectedIndex = 0;
			}
		}
	}

	function selectTab(tab: chrome.tabs.Tab) {
		const tabContent = `Tab: ${tab.title || 'Untitled'}\nURL: ${tab.url || 'No URL'}`;
		addContextItem(`Tab: ${tab.title || 'Untitled'}`, tabContent);
		
		// Remove the @ character that triggered the dropdown
		removeAtSymbol();
		
		// Close dropdown and reset state
		currentView = 'commands';
		isContextMentionsOpen = false;
		isOpen = false;
		searchQuery = '';
		selectedIndex = 0;
		availableTabs = [];
	}

	function goBackToCommands() {
		currentView = 'commands';
		searchQuery = '';
		selectedIndex = 0;
		availableTabs = [];
		// Focus search input after switching back
		setTimeout(() => {
			if (searchInput) {
				searchInput.focus();
			}
		}, 100);
	}



	function triggerContextMentions() {
		if(isOpen){
			isOpen = false;
			searchQuery = '';
			selectedIndex = 0;
			currentView = 'commands';
		}
		else{
			isOpen = true;
			currentView = 'commands';
			// Focus search input after dropdown opens
			setTimeout(() => {
				if (searchInput) {
					searchInput.focus();
				}
			}, 100);
		}
	}

	function triggerMentionsFromEditor() {
		// Open the dropdown when @ is typed in the editor
		isOpen = true;
		currentView = 'commands';
		searchQuery = '';
		selectedIndex = 0;
		
		// Focus search input after dropdown opens
		setTimeout(() => {
			if (searchInput) {
				searchInput.focus();
			}
		}, 100);
	}

	function checkForAtTrigger(editor: Editor) {
		// Get the current editor state
		const { state } = editor;
		const { selection } = state;
		const { from } = selection;
		
		// Get text around cursor
		const textBefore = state.doc.textBetween(Math.max(0, from - 2), from);
		
		// Check if @ was just typed at the beginning or after a space
		if (textBefore.endsWith('@') && (textBefore.length === 1 || textBefore.charAt(textBefore.length - 2) === ' ')) {
			// Trigger the dropdown
			setTimeout(() => {
				triggerMentionsFromEditor();
			}, 0);
		}
	}

	function removeAtSymbol() {
		if (!editor) return;
		
		// Get the current editor state
		const { state } = editor;
		const { selection } = state;
		const { from } = selection;
		
		// Look for @ symbol before cursor
		const textBefore = state.doc.textBetween(Math.max(0, from - 10), from);
		const lastAtIndex = textBefore.lastIndexOf('@');
		
		if (lastAtIndex !== -1) {
			const actualFrom = from - (textBefore.length - lastAtIndex);
			// Delete the @ character
			editor.commands.deleteRange({ from: actualFrom, to: actualFrom + 1 });
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (!isOpen) return;

		if (currentView === 'commands') {
			switch (event.key) {
				case 'ArrowUp':
					event.preventDefault();
					selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredCommands.length - 1;
					setTimeout(() => scrollSelectedIntoView(), 10);
					break;
				case 'ArrowDown':
					event.preventDefault();
					selectedIndex = selectedIndex < filteredCommands.length - 1 ? selectedIndex + 1 : 0;
					setTimeout(() => scrollSelectedIntoView(), 10);
					break;
				case 'Enter':
					event.preventDefault();
					if (filteredCommands[selectedIndex]) {
						selectCommand(selectedIndex);
					}
					break;
				case 'Escape':
					event.preventDefault();
					isOpen = false;
					searchQuery = '';
					selectedIndex = 0;
					currentView = 'commands';
					break;
			}
		} else if (currentView === 'tabs') {
			switch (event.key) {
				case 'ArrowUp':
					event.preventDefault();
					selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : availableTabs.length - 1;
					setTimeout(() => scrollSelectedIntoView(), 10);
					break;
				case 'ArrowDown':
					event.preventDefault();
					selectedIndex = selectedIndex < availableTabs.length - 1 ? selectedIndex + 1 : 0;
					setTimeout(() => scrollSelectedIntoView(), 10);
					break;
				case 'Enter':
					event.preventDefault();
					if (availableTabs[selectedIndex]) {
						selectTab(availableTabs[selectedIndex]);
					}
					break;
				case 'ArrowLeft':
				case 'Backspace':
					event.preventDefault();
					goBackToCommands();
					break;
				case 'Escape':
					event.preventDefault();
					isOpen = false;
					searchQuery = '';
					selectedIndex = 0;
					currentView = 'commands';
					availableTabs = [];
					break;
			}
		}
	}

	// Reset selected index when search query changes
	$: if (searchQuery !== undefined) {
		selectedIndex = 0;
	}

	// Function to scroll selected item into view
	function scrollSelectedIntoView() {
		const container = currentView === 'tabs' ? tabsContainer : commandsContainer;
		if (!container) return;
		
		const selectedItem = container.querySelector('.tab-item.selected, .command-item.selected') as HTMLElement;
		if (selectedItem) {
			selectedItem.scrollIntoView({
				block: 'nearest',
				inline: 'nearest',
				behavior: 'smooth'
			});
		}
	}



	onMount(() => {
		editor = new Editor({
			element: element,
			extensions: [
				StarterKit,
				Placeholder.configure({
					placeholder: placeholder,
				}),
			],
			content: content,
			editable: !disabled,
			onTransaction: () => {
				// force re-render so `editor.isActive` works as expected
				if (editor) {
					editor = editor;
				}
			},
			onUpdate: ({ editor }) => {
				content = editor.getHTML();
				dispatch('update', { content });
				
				// Check for @ trigger
				checkForAtTrigger(editor);
			},
		});

		// Auto-focus the editor
		setTimeout(() => {
			if (editor) {
				editor.commands.focus();
			}
		}, 100);

		// Add keyboard event listener
		if (typeof window !== 'undefined') {
			window.addEventListener('keydown', handleKeyDown);
		}
	});



	onDestroy(() => {
		if (editor) {
			editor.destroy();
		}
		// Remove keyboard event listener
		if (typeof window !== 'undefined') {
			window.removeEventListener('keydown', handleKeyDown);
		}
	});

	// Export functions for parent component
	export function getContent(): string {
		return editor ? editor.getHTML() : '';
	}

	export function getText(): string {
		return editor ? editor.getText() : '';
	}


export function setContent(newContent: string): void {
  if (editor) {
    const sanitized = DOMPurify.sanitize(newContent);
    editor.commands.setContent(sanitized);
  }
}

	export function clear(): void {
		if (editor) {
			editor.commands.clearContent();
		}
	}

	export function focus(): void {
		if (editor) {
			editor.commands.focus();
		}
	}

	function handleSend() {
		const text = getText().trim();
		if (text) {
			dispatch('send', { content: text, model: selectedModel });
		}
	}
	
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			handleSend();
		}
	}

	// Update editor when disabled prop changes
	$: if (editor) {
		editor.setEditable(!disabled);
	}

	// function selectModel(modelValue: string) {
	// 	selectedModel = modelValue;
	// 	isModelDropdownOpen = false;
	// 	modelSearchQuery = '';
	// }

	function handleModelSearch(event: Event) {
		const target = event.target as HTMLInputElement;
		modelSearchQuery = target.value;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor-container" onkeydown={handleKeydown}>
	<div class="editor-wrapper">
		
		<div class="editor-context-wrapper" bind:this={addContextButton}> 
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<button id="add-context-btn" class="editor-context-item add-context-btn" 
				
				onclick={triggerContextMentions}
				style="font-weight: 600 !important; cursor: pointer;">
				@ Add Context
			</button>
			<!-- Searchable Context Mentions Dropdown -->
			<Dropdown bind:isOpen simple placement="right-start" 
				class="context-mentions-dropdown">
				
				{#if currentView === 'commands'}
					<!-- Commands View -->
					<!-- Search Input -->
					<div class="dropdown-header">
						<div class="relative">
							<input
								bind:this={searchInput}
								bind:value={searchQuery}
								type="text"
								placeholder=" Search context..."
								class="search-input"
							/>
						</div>
					</div>
					
					<!-- Commands List -->
					<div class="max-h-48 overflow-y-auto" bind:this={commandsContainer}>
						{#if filteredCommands.length > 0}
							{#each filteredCommands as command, index}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div 
									class="command-item {index === selectedIndex ? 'selected' : ''}"
									onclick={() => selectCommand(index)}
									role="option"
									aria-selected={index === selectedIndex}
									tabindex="0"
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											selectCommand(index);
										}
									}}
								>
									<span class="text-base flex-shrink-0">{command.icon}</span>
									<div class="flex-1 min-w-0">
										<div class="command-label truncate">
											{command.label}
										</div>
										<div class="command-description truncate">
											{command.description}
										</div>
									</div>
									
									<!-- Show submenu arrow for tabs command -->
									{#if command.hasSubmenu}
										<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
										</svg>
									{/if}
								</div>
							{/each}
						{:else}
							<div class="no-results">
								<svg class="no-results-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
										d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
								</svg>
								<p class="no-results-text">No context found</p>
								{#if searchQuery}
									<p class="no-results-subtext">
										No Available Context
									</p>
								{/if}
							</div>
						{/if}
					</div>
				{:else if currentView === 'tabs'}
					<!-- Tabs View -->
					<!-- Header with Back Button -->
					<div class="dropdown-header">
						<div class="flex items-center gap-2">
							<!-- svelte-ignore a11y_consider_explicit_label -->
							<button 
								class="back-button"
								onclick={goBackToCommands}
								title="Back to commands (← or Backspace)"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
								</svg>
							</button>
							<span class="text-sm font-medium text-gray-700 dark:text-gray-200">
								Current Window Tabs
							</span>
						</div>
					</div>
					
					
					<!-- Tabs List -->
					<div class="max-h-60 overflow-y-auto" bind:this={tabsContainer}>
						{#if availableTabs.length > 0}
							{#each availableTabs as tab, index}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div 
									class="tab-item {index === selectedIndex ? 'selected' : ''}"
									onclick={() => selectTab(tab)}
									role="option"
									aria-selected={index === selectedIndex}
									tabindex="0"
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											selectTab(tab);
										}
									}}
								>
									<!-- Favicon -->
									<div class="tab-favicon">
										{#if tab.favIconUrl}
											<img src={tab.favIconUrl} alt="" class="tab-favicon" />
										{:else}
											<div class="tab-favicon-placeholder"></div>
										{/if}
									</div>
									
									<!-- Tab Info -->
									<div class="flex-1 min-w-0">
										<div class="tab-title">
											{tab.title || 'Untitled'}
										</div>
										<div class="tab-url">
											{tab.url || 'No URL'}
										</div>
									</div>
									
									<!-- Active indicator -->
									{#if tab.active}
										<div class="tab-active-indicator"></div>
									{/if}
								</div>
							{/each}
						{:else}
							<div class="no-results">
								<p class="no-results-text">No tabs found</p>
							</div>
						{/if}
					</div>
				{/if}
				
				
			</Dropdown>

			
			{#each contextItems as item (item.id)}
				<div class="editor-context-item add-context-btn">
					<!-- svelte-ignore a11y_consider_explicit_label -->
					<button 
						class="context-remove-btn" 
						onclick={() => removeContextItem(item.id)}
						title="Remove context"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M18 6L6 18M6 6l12 12"/>
						</svg>
					</button>
					<span class="context-label">{item.label}</span>
					<Popover  class="w-64 text-sm font-dark ">
						{item.content}
					</Popover >
				</div>
			{/each}
		</div>

		<!-- svelte-ignore element_invalid_self_closing_tag -->
		<div 
			bind:this={element} 
			class="editor-content"
			style="min-height: {minHeight};"
		/>
		
		<div class="editor-controls">
			<!-- Model Selector Dropdown -->
			<!-- <DropdownMenu.Root bind:open={isModelDropdownOpen}>
				<DropdownMenu.Trigger asChild let:builder>
					<button 
						class="model-selector-trigger" 
						type="button"
						use:builder.action
						{...builder}
					>
						<span class="model-label">{selectedModelLabel}</span>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chevron-icon">
							<path d="M6 9l6 6 6-6"/>
						</svg>
					</button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content class="model-dropdown-content" align="end">
					<div class="model-search-container">
						<input
							type="text"
							placeholder="Search models..."
							class="model-search-input"
							bind:value={modelSearchQuery}
							on:input={handleModelSearch}
						/>
					</div>
					<DropdownMenu.Separator />
					{#each filteredModels as model}
						<DropdownMenu.Item 
							class="model-item {selectedModel === model.value ? 'selected' : ''}"
						>
							<button 
								type="button"
								class="model-item-button"
								on:click={() => selectModel(model.value)}
							>
								<span class="model-name">{model.label}</span>
								{#if selectedModel === model.value}
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="check-icon">
										<path d="M20 6L9 17l-5-5"/>
									</svg>
								{/if}
							</button>
						</DropdownMenu.Item>
					{/each}
					{#if filteredModels.length === 0}
						<div class="no-models-found">
							No models found
						</div>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root> -->

			<!-- Send Button -->
			<!-- svelte-ignore a11y_consider_explicit_label -->
			<button 
				type="button"
				class="send-button" 
				onclick={handleSend}
				{disabled}
				title="Send (Cmd/Ctrl + Enter)"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M22 2L11 13"/>
					<path d="M22 2L15 22L11 13L2 9L22 2Z"/>
				</svg>
			</button>
		</div>
	</div>
	
	
</div>

<style>
  /* Styles are now loaded via shadow-styles.css in the content script */
  /* This ensures proper styling in the Shadow DOM environment */
</style>
