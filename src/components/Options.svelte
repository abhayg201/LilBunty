<script lang="ts">
    import { onMount } from 'svelte';
    import { writable } from 'svelte/store';
    
    // Flowbite components
    import { Card, Button, Label, Input, Select, Toast, Sidebar, SidebarGroup, SidebarItem, SidebarWrapper } from "flowbite-svelte";
    import { CogSolid, EyeSolid, PaletteSolid, AdjustmentsHorizontalSolid } from "flowbite-svelte-icons";
  
    // --- state
    const models = [
      { value: 'gpt-4o', name: 'GPT-4o (Recommended)' },
      { value: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)' },
      { value: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { value: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Budget)' }
    ];
    const selectedModel = writable<string>('gpt-4-turbo');
    const apiKey = writable<string>('');
    const showToast = writable<boolean>(false);
    const activeSection = writable<string>('api');
  
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
        showToast.set(true);
        setTimeout(() => showToast.set(false), 3000);
      });
    }
  </script>
  
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 min-w-[700px]">
    <div class="flex">
      <!-- Enhanced Sidebar -->
      <div class="w-64 bg-white dark:bg-gray-800 shadow-lg border-r border-gray-200 dark:border-gray-700">
        <div class="p-6 border-b border-gray-200 dark:border-gray-700">
          <h1 class="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CogSolid class="w-6 h-6 text-blue-600" />
            Lil Bunty Settings
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure your AI assistant</p>
        </div>
        
        <nav class="p-4 space-y-2">
          <button
            class="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 {$activeSection === 'api' 
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
            on:click={() => activeSection.set('api')}
          >
            <EyeSolid class="w-5 h-5" />
            <div>
              <div class="font-medium">API Configuration</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Model & API key settings</div>
            </div>
          </button>
          
          <button
            class="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 {$activeSection === 'presets' 
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
            on:click={() => activeSection.set('presets')}
          >
            <AdjustmentsHorizontalSolid class="w-5 h-5" />
            <div>
              <div class="font-medium">Prompt Presets</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Custom prompt templates</div>
            </div>
          </button>
          
          <button
            class="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 {$activeSection === 'appearance' 
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
            on:click={() => activeSection.set('appearance')}
          >
            <PaletteSolid class="w-5 h-5" />
            <div>
              <div class="font-medium">Appearance</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Theme & display options</div>
            </div>
          </button>
        </nav>
      </div>
  
      <!-- Main Content Area -->
      <div class="flex-1 p-8">
        {#if $activeSection === 'api'}
          <div class="max-w-2xl">
            <div class="mb-8">
              <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">API Configuration</h2>
              <p class="text-gray-600 dark:text-gray-400">Configure your OpenAI API settings to power your AI assistant.</p>
            </div>
            
            <Card class="shadow-lg border-0 bg-white dark:bg-gray-800">
              <div class="p-8 space-y-8">
                <!-- Model Selection -->
                <div class="space-y-3">
                  <Label class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <CogSolid class="w-4 h-4" />
                    AI Model
                  </Label>
                  <Select 
                    bind:value={$selectedModel}
                    items={models}
                    class="text-base"
                    placeholder="Choose your AI model"
                  />
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    GPT-4o is recommended for best results. GPT-4o Mini is faster and more cost-effective.
                  </p>
                </div>
        
                <!-- API Key Input -->
                <div class="space-y-3">
                  <Label class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <EyeSolid class="w-4 h-4" />
                    OpenAI API Key
                  </Label>
                  <Input
                    type="password"
                    placeholder="sk-..."
                    bind:value={$apiKey}
                    class="text-base py-3"
                    autocomplete="off"
                  />
                  <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p class="text-sm text-blue-800 dark:text-blue-200">
                      <strong>Need an API key?</strong> Get one from 
                      <a href="https://platform.openai.com/api-keys" target="_blank" class="underline hover:no-underline">
                        OpenAI Platform
                      </a>
                    </p>
                  </div>
                </div>
        
                <!-- Save Button -->
                <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button 
                    on:click={save} 
                    class="w-full py-3 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
                  >
                    Save Configuration
                  </button>
                </div>
              </div>
            </Card>
          </div>
        {:else if $activeSection === 'presets'}
          <div class="max-w-2xl">
            <div class="mb-8">
              <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Prompt Presets</h2>
              <p class="text-gray-600 dark:text-gray-400">Create and manage custom prompt templates for quick access.</p>
            </div>
            
            <Card class="shadow-lg border-0 bg-white dark:bg-gray-800">
              <div class="p-8">
                <div class="text-center py-12">
                  <AdjustmentsHorizontalSolid class="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Coming Soon</h3>
                  <p class="text-gray-500 dark:text-gray-400">Custom prompt presets will be available in a future update.</p>
                </div>
              </div>
            </Card>
          </div>
        {:else if $activeSection === 'appearance'}
          <div class="max-w-2xl">
            <div class="mb-8">
              <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Appearance</h2>
              <p class="text-gray-600 dark:text-gray-400">Customize the look and feel of your AI assistant.</p>
            </div>
            
            <Card class="shadow-lg border-0 bg-white dark:bg-gray-800">
              <div class="p-8">
                <div class="text-center py-12">
                  <PaletteSolid class="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Coming Soon</h3>
                  <p class="text-gray-500 dark:text-gray-400">Theme and appearance options will be available in a future update.</p>
                </div>
              </div>
            </Card>
          </div>
        {/if}
      </div>
    </div>
  </div>
  
  <!-- Toast notification -->
  {#if $showToast}
    <div class="fixed top-4 right-4 z-50">
      <div class="bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span class="font-medium">Configuration saved successfully!</span>
      </div>
    </div>
  {/if}
  