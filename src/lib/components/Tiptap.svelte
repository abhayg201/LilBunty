<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Placeholder from '@tiptap/extension-placeholder';
	import Mention from '@tiptap/extension-mention';
	import { selectedText } from '../stores';
	import { get } from 'svelte/store';
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";

	export let content = '';
	export let placeholder = 'Ask anything';
	export let disabled = false;
	export let minHeight = '80px';

	let element: HTMLDivElement;
	let editor: Editor | null = null;
	let suggestionContainer: HTMLDivElement;
	let selectedModel = 'gpt-4';
	let modelSearchQuery = '';
	let isModelDropdownOpen = false;
	
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

	// @ Commands configuration
	const commands = [
		{
			id: 'selected-text',
			label: 'Selected Text',
			description: 'Add the selected text as context',
			action: () => {
				const text = get(selectedText);
				return `**Selected Text:**\n"${text}"\n\n`;
			}
		},
		// Future commands can be added here
	];

	let suggestionElement: HTMLDivElement | null = null;

	onMount(() => {
		editor = new Editor({
			element: element,
			extensions: [
				StarterKit,
				Placeholder.configure({
					placeholder: placeholder,
				}),
				Mention.configure({
					HTMLAttributes: {
						class: 'mention',
					},
					suggestion: {
						items: ({ query }) => {
							return commands
								.filter(item => item.label.toLowerCase().startsWith(query.toLowerCase()))
								.slice(0, 5);
						},
						render: () => {
							let component: any;

							return {
								onStart: (props: any) => {
									component = createSuggestionList(props);
								},

								onUpdate(props: any) {
									component?.updateProps(props);
								},

								onKeyDown(props: any) {
									if (props.event.key === 'Escape') {
										component?.destroy();
										return true;
									}

									return component?.onKeyDown(props);
								},

								onExit() {
									component?.destroy();
								},
							};
						},
					},
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
			},
		});

		// Auto-focus the editor
		setTimeout(() => {
			if (editor) {
				editor.commands.focus();
			}
		}, 100);
	});

	function createSuggestionList(props: any) {
		let selectedIndex = 0;
		let commandItems = props.items;

		const selectItem = (index: number) => {
			const item = commandItems[index];
			if (item && item.action) {
				const contextText = item.action();
				// Insert the command result
				props.command({ id: item.id, label: contextText });
			}
		};

		const updateListItem = (index: number) => {
			selectedIndex = index;
			renderList();
		};

		const renderList = () => {
			if (!suggestionElement) {
				suggestionElement = document.createElement('div');
				suggestionElement.className = 'suggestion-list';

				// Try to append to suggestion container first, fallback to shadow root or document body
				const targetContainer = suggestionContainer || element?.getRootNode() || document.body;

				targetContainer.appendChild(suggestionElement);
			}

			suggestionElement.innerHTML = commandItems
				.map(
					(item: any, index: number) => `
					<div class="suggestion-item ${index === selectedIndex ? 'selected' : ''}" 
						 data-index="${index}">
						<div class="suggestion-label">${item.label}</div>
						<div class="suggestion-description">${item.description}</div>
					</div>
				`
				)
				.join('');

			// Add click handlers
			suggestionElement.querySelectorAll('.suggestion-item').forEach((el, index) => {
				el.addEventListener('click', () => selectItem(index));
			});

			// Position the list
			if (props.clientRect) {
				const rect = props.clientRect();
				const editorRect = element.getBoundingClientRect();

				suggestionElement.style.position = 'fixed';
				suggestionElement.style.top = `${rect.bottom + 5}px`;
				suggestionElement.style.left = `${rect.left}px`;
				suggestionElement.style.display = 'block';
				suggestionElement.style.zIndex = '2147483647';
			}
		};

		renderList();

		return {
			onKeyDown: ({ event }: { event: KeyboardEvent }) => {
				if (event.key === 'ArrowUp') {
					updateListItem((selectedIndex + commandItems.length - 1) % commandItems.length);
					return true;
				}

				if (event.key === 'ArrowDown') {
					updateListItem((selectedIndex + 1) % commandItems.length);
					return true;
				}

				if (event.key === 'Enter') {
					selectItem(selectedIndex);
					return true;
				}

				return false;
			},

			updateProps: (newProps: any) => {
				props = newProps;
				commandItems = props.items;
				selectedIndex = 0;
				renderList();
			},

			destroy: () => {
				if (suggestionElement) {
					suggestionElement.remove();
					suggestionElement = null;
				}
			},
		};
	}

	onDestroy(() => {
		if (editor) {
			editor.destroy();
		}
		if (suggestionElement) {
			suggestionElement.remove();
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
			editor.commands.setContent(newContent);
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
		if (event.key === 'Enter' && !(event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			handleSend();
		}
	}

	// Update editor when disabled prop changes
	$: if (editor) {
		editor.setEditable(!disabled);
	}

	function selectModel(modelValue: string) {
		selectedModel = modelValue;
		isModelDropdownOpen = false;
		modelSearchQuery = '';
	}

	function handleModelSearch(event: Event) {
		const target = event.target as HTMLInputElement;
		modelSearchQuery = target.value;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor-container" on:keydown={handleKeydown}>
	<div class="editor-wrapper">
		
		<div class="editor-context-wrapper">
			<div class="editor-context-item"
			style="font-weight: 700 !important;">
				@
			</div>
			<div class="editor-context-item">
				justify-content
			</div>
			<div class="editor-context-item">
				justify-content
			</div>
			<div class="editor-context-item">
				justify-content
			</div>
			<div class="editor-context-item">
				justify-content
			</div>
			<div class="editor-context-item">
				justify-content
			</div>
			<div class="editor-context-item">
				justify-content
			</div>
		</div>

		<!-- svelte-ignore element_invalid_self_closing_tag -->
		<div 
			bind:this={element} 
			class="editor-content"
			style="min-height: {minHeight};"
		/>
		
		<div class="editor-controls">
			<!-- Model Selector Dropdown -->
			<DropdownMenu.Root bind:open={isModelDropdownOpen}>
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
			</DropdownMenu.Root>

			<!-- Send Button -->
			<!-- svelte-ignore a11y_consider_explicit_label -->
			<button 
				type="button"
				class="send-button" 
				on:click={handleSend}
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
	
	<!-- Container for suggestions dropdown -->
	<div bind:this={suggestionContainer} class="suggestion-container"></div>
</div>

<style>
  /* Styles are now loaded via shadow-styles.css in the content script */
  /* This ensures proper styling in the Shadow DOM environment */
</style>
