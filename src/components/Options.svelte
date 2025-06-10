<script lang="ts">
    import { onMount } from 'svelte';
    import { writable } from 'svelte/store';
  
    // shadcn-svelte components
    import { Card, CardHeader, CardContent } from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';
    import { Label } from '$lib/components/ui/label';
    import {
      Select,
      SelectTrigger,
      SelectValue,
      SelectContent,
      SelectItem
    } from '$lib/components/ui/select';
    import { Input } from '$lib/components/ui/input';
  
    // --- state
    const models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    const selectedModel = writable<string>('gpt-4-turbo');
    const apiKey = writable<string>('');
  
    // --- load saved settings
    onMount(() => {
      chrome.storage.local.get(['model', 'apiKey'], (result) => {
        if (result.model) selectedModel.set(result.model);
        if (result.apiKey) apiKey.set(result.apiKey);
      });
    });
  
    // --- save handler
    function save() {
      chrome.storage.local.set({
        model: $selectedModel,
        apiKey: $apiKey
      }, () => {
        // TODO: replace alert with a shadcn toast once available in svelte-shadcn
        alert('API configuration saved!');
      });
    }
  </script>
  
  <style>
    /* Optional: custom scrollbar for the sidebar */
    aside::-webkit-scrollbar {
      width: 6px;
    }
    aside::-webkit-scrollbar-thumb {
      background: theme('colors.gray.400');
      border-radius: 3px;
    }
  </style>
  
  <div class="flex h-full min-w-[450px]">
    <!-- Sidebar -->
    <aside class="w-[9rem] shrink-0 border-r p-4 space-y-2 bg-muted/40">
      <button
        class="w-full text-left font-medium p-2 rounded-lg bg-muted hover:bg-muted/70 transition"
      >
        API Key
      </button>
      <!-- Future menu items -->
      <button class="w-full text-left p-2 rounded-lg hover:bg-muted/50">Prompt Presets</button>
      <button class="w-full text-left p-2 rounded-lg hover:bg-muted/50">Appearance</button>
      <button class="w-full text-left p-2 rounded-lg hover:bg-muted/50">Advanced</button>
    </aside>
  
    <!-- Main content -->
    <main class="flex-1 p-6 overflow-auto">
      <Card class="max-w-md">
        <CardHeader>
          <h2 class="text-xl font-semibold">API Configuration</h2>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- Model selection -->
          <div class="space-y-1 w-full">
            <Label for="model">Model</Label>

            <Select 
            selected={{ value: $selectedModel, label: $selectedModel }} 
            onSelectedChange={(selected) => selected && selectedModel.set(selected.value)}>

              <SelectTrigger class="w-full">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {#each models as m}
                  <SelectItem value={m}>{m}</SelectItem>
                {/each}
              </SelectContent>
            </Select>
          </div>
  
          <!-- API key input -->
          <div class="space-y-1">
            <Label for="key">API Key</Label>
            <Input
              id="key"
              type="password"
              placeholder="sk-..."
              bind:value={$apiKey}
              class="w-full"
              autocomplete="off"
            />
          </div>
  
          <!-- Save button -->
          <Button on:click={save} class="w-full">Save</Button>
        </CardContent>
      </Card>
    </main>
  </div>
  