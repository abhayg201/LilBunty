<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Placeholder from '@tiptap/extension-placeholder';
	import { selectedText } from '../stores';
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import ContextMentions from './ContextMentions.svelte';

	export let content = '';
	export let placeholder = 'Ask anything';
	export let disabled = false;
	export let minHeight = '80px';

	let element: HTMLDivElement;
	let editor: Editor | null = null;
	let selectedModel = 'gpt-4';
	let modelSearchQuery = '';
	let isModelDropdownOpen = false;
	let isContextMentionsOpen = false;
	
	// Dynamic context items
	let contextItems: Array<{id: string, label: string, content: string}> = [];
	
	// Context mentions positioning
	let contextMentionsPosition: { top: number; left: number } | null = null;



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
		const id = `context-${Date.now()}`;
		contextItems = [...contextItems, { id, label, content }];
	}

	function removeContextItem(id: string) {
		contextItems = contextItems.filter(item => item.id !== id);
	}

	function triggerContextMentions() {
		if (element && !disabled && !isContextMentionsOpen) {
			const rect = element.getBoundingClientRect();
			contextMentionsPosition = {
				top: rect.bottom + 8,
				left: rect.left
			};
			isContextMentionsOpen = true;
		}
	}

	function handleContextMentionSelect(event: CustomEvent<{id: string, label: string, content: string}>) {
		const { label, content } = event.detail;
		addContextItem(label, content);
		isContextMentionsOpen = false;
	}

	function handleContextMentionClose() {
		isContextMentionsOpen = false;
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
			},
		});

		// Auto-focus the editor
		setTimeout(() => {
			if (editor) {
				editor.commands.focus();
			}
		}, 100);
	});



	onDestroy(() => {
		if (editor) {
			editor.destroy();
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
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<button class="editor-context-item add-context-btn" 
				 on:click={triggerContextMentions}
				 style="font-weight: 600 !important; cursor: pointer;">
				  @ Add Context
			</button>
			
			{#each contextItems as item (item.id)}
				<div class="editor-context-item context-item-dynamic">
					<span class="context-label">{item.label}</span>
					<!-- svelte-ignore a11y_consider_explicit_label -->
					<button 
						class="context-remove-btn" 
						on:click={() => removeContextItem(item.id)}
						title="Remove context"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M18 6L6 18M6 6l12 12"/>
						</svg>
					</button>
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
	
	<!-- Context Mentions Component -->
	<ContextMentions
		isOpen={isContextMentionsOpen}
		position={contextMentionsPosition}
		on:select={handleContextMentionSelect}
		on:close={handleContextMentionClose}
	/>
</div>

<style>
  /* Styles are now loaded via shadow-styles.css in the content script */
  /* This ensures proper styling in the Shadow DOM environment */
</style>
