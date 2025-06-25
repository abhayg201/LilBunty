import { count } from '../storage';
import { OpenAIService } from '../services/openai-service';
import { ThreadService } from '../services/thread-service';
import openai, { OpenAI } from 'openai';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses.mjs';
// TurndownService moved back to content script where DOM APIs are available

const SYSTEM_PROMPT =
  "You are a helpful assistant that works along a human while they are reading a webpage. You are given the context of the webpage and the user's selected text. You are to help the human understand the webpage and the selected text.";

// Background service workers
// https://developer.chrome.com/docs/extensions/mv3/service_workers/

// Use browser.runtime instead of chrome.runtime for cross-browser compatibility
chrome.runtime.onInstalled.addListener(() => {
  count.subscribe(console.log);
  getApiKey().then(apiKey => {
    OpenAIService.init(apiKey);
  });
});

// Helper function to get API key from storage
async function getApiKey(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['apiKey'], result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        const apiKey = result.apiKey;
        if (!apiKey) {
          reject(new Error('API key not found. Please configure it in the options page.'));
        } else {
          resolve(apiKey);
        }
      }
    });
  });
}

const threadService = ThreadService.getInstance();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  if (message.type === 'QUERY_OPENAI') {
    handleOpenAIQuery(message.payload, sendResponse);
    return true; // This keeps the message channel open
  } else if (message.type === 'THREAD_OPERATION') {
    handleThreadOperation(message.payload, sendResponse);
    return true;
  } else if (message.type === 'GET_TABS') {
    handleGetTabs(message.payload, sendResponse);
    return true;
  } else if (message.type === 'FETCH_AND_CONVERT_URL') {
    handleFetchAndConvertUrl(message.payload, sendResponse);
    return true;
  } else if (message.type === 'EXTRACT_CURRENT_PAGE_CONTENT') {
    handleExtractCurrentPageContent(message.payload, sendResponse);
    return true;
  }
});

// Handle tab fetching
async function handleGetTabs(payload: any, sendResponse: (response: any) => void) {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    console.log('Background fetched tabs:', tabs);
    sendResponse({ success: true, data: tabs });
  } catch (error) {
    console.error('Error fetching tabs:', error);
    sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
}

// Handle URL fetching and conversion to markdown
async function handleFetchAndConvertUrl(payload: { url: string, title?: string }, sendResponse: (response: any) => void) {
  try {
    const { url, title: pageTitle } = payload;
    
    if (!url || !url.startsWith('http')) {
      sendResponse({ 
        success: false, 
        error: 'Invalid URL provided. URL must start with http or https.' 
      });
      return;
    }

    console.log('Background fetching HTML from:', url);
    
    // Step 1: Find or create a tab with the target URL
    let targetTabId: number | null = null;
    
    // First, check if there's already a tab with this URL
    const tabs = await chrome.tabs.query({});
    const existingTab = tabs.find(tab => tab.url === url);
    
    if (existingTab && existingTab.id) {
      targetTabId = existingTab.id;
      console.log('Found existing tab with URL:', targetTabId);
    } else {
      // Create a new tab with the URL (in the background)
      const newTab = await chrome.tabs.create({ 
        url: url, 
        active: false // Don't switch to the tab
      });
      targetTabId = newTab.id!;
      console.log('Created new tab for URL:', targetTabId);
      
      // Wait for the tab to finish loading
      await new Promise<void>((resolve) => {
        const checkComplete = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
          if (tabId === targetTabId && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(checkComplete);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(checkComplete);
      });
    }

    // Step 2: Inject content script to extract DOM content
    console.log('Injecting content script into tab:', targetTabId);
    
    // Inject the content script that will extract the page content
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: extractPageContent,
    });

    if (!results || results.length === 0 || !results[0].result) {
      throw new Error('Failed to extract content from page');
    }

    const extractedData = results[0].result;
    console.log('=== EXTRACTED HTML (Content Script) ===');
    console.log('Title:', extractedData.title);
    console.log('URL:', extractedData.url);
    console.log('HTML length:', extractedData.html.length);
    console.log('=== END HTML ===');
    
    // Step 3: Close the tab if we created it (optional - you might want to keep it)
    if (!existingTab && targetTabId) {
      // Optional: Close the tab after a short delay to allow content extraction
      setTimeout(() => {
        chrome.tabs.remove(targetTabId!).catch(console.error);
      }, 1000);
    }

    // Send the extracted HTML back
    sendResponse({ 
      success: true, 
      data: {
        title: extractedData.title,
        url: extractedData.url,
        html: extractedData.html,
        length: extractedData.html.length
      }
    });
    
  } catch (error) {
    console.error('Background error fetching or processing URL:', payload.url, error);
    sendResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

// Content script function that runs in the target page context
function extractPageContent() {
  try {
    // Get the page title
    const title = document.title || 'No Title';
    const url = window.location.href;

    // Extract main content using various strategies
    let content = '';

    // Strategy 1: Try to find main content containers
    const contentSelectors = [
      'main',
      'article', 
      '[role="main"]',
      '.content',
      '#content',
      '.post',
      '.entry-content',
      '.article-content'
    ];

    let mainContent: Element | null = null;
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent && element.textContent.trim().length > 100) {
        mainContent = element;
        break;
      }
    }

    // Strategy 2: If no main content found, use body but filter out common non-content elements
    if (!mainContent) {
      // Clone the body to avoid modifying the original page
      const bodyClone = document.body.cloneNode(true) as Element;
      
      // Remove common non-content elements
      const removeSelectors = [
        'header', 'nav', 'footer', 'aside',
        '.header', '.navigation', '.nav', '.footer', '.sidebar', '.aside',
        '.advertisement', '.ads', '.ad', '.promo',
        'script', 'style', 'noscript',
        '.cookie-banner', '.cookie-notice',
        '.social-share', '.share-buttons'
      ];

      removeSelectors.forEach(selector => {
        const elements = bodyClone.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });

      mainContent = bodyClone;
    }

    if (mainContent) {
      // Get the HTML content
      content = mainContent.innerHTML;
      
      // Clean up the HTML
      content = content
        // Remove script and style content that might have been missed
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
        // Remove HTML comments
        .replace(/<!--[\s\S]*?-->/g, '')
        // Clean up excessive whitespace
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Fallback: if still no content, get visible text
    if (!content || content.length < 50) {
      // Get all visible text content
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            
            // Skip hidden elements
            const style = window.getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return NodeFilter.FILTER_REJECT;
            }
            
            // Skip script/style content
            if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.tagName === 'NOSCRIPT') {
              return NodeFilter.FILTER_REJECT;
            }
            
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      const textNodes: string[] = [];
      let node;
      while (node = walker.nextNode()) {
        const text = node.textContent?.trim();
        if (text && text.length > 3) {
          textNodes.push(text);
        }
      }
      
      content = textNodes.join(' ');
    }

    return {
      title,
      url,
      html: content,
      length: content.length
    };

  } catch (error) {
    console.error('Error extracting page content:', error);
    return {
      title: document.title || 'Error',
      url: window.location.href,
      html: `Error extracting content: ${error}`,
      length: 0
    };
  }
}

// Handle extracting content from the currently active tab
async function handleExtractCurrentPageContent(payload: any, sendResponse: (response: any) => void) {
  try {
    console.log('Background extracting content from current page');
    
    // Get the currently active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab || !activeTab.id) {
      throw new Error('No active tab found');
    }

    console.log('Injecting content script into current tab:', activeTab.id);
    
    // Reuse the same approach as handleFetchAndConvertUrl but for the current tab
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: extractPageContent,
    });

    if (!results || results.length === 0 || !results[0].result) {
      throw new Error('Failed to extract content from current page');
    }

    const extractedData = results[0].result;
    console.log('=== EXTRACTED HTML (Current Page) ===');
    console.log('Title:', extractedData.title);
    console.log('URL:', extractedData.url);
    console.log('HTML length:', extractedData.html.length);
    console.log('=== END HTML ===');
    
    sendResponse({ 
      success: true, 
      data: {
        title: extractedData.title,
        url: extractedData.url,
        html: extractedData.html,
        length: extractedData.html.length
      }
    });
    
  } catch (error) {
    console.error('Background error extracting current page content:', error);
    sendResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

// Handle thread operations
async function handleThreadOperation(payload: any, sendResponse: (response: any) => void) {
  try {
    switch (payload.operation) {
      case 'GET_THREAD_SUMMARIES':
        const summaries = await threadService.getThreadSummaries(
          payload.filters,
          payload.limit,
          payload.offset
        );
        sendResponse({ success: true, data: summaries });
        break;

      case 'GET_THREAD':
        const thread = await threadService.getThread(payload.threadId);
        sendResponse({ success: true, data: thread });
        break;

      case 'CREATE_THREAD':
        console.log('CREATED A NEW THREAD');
        const newThread = await threadService.createThread(payload.url);
        sendResponse({ success: true, data: newThread });
        break;

      case 'ADD_MESSAGE':
        const message = await threadService.addMessage(
          payload.threadId,
          payload.role,
          payload.content,
          payload.metadata,
          payload.context
        );
        sendResponse({ success: true, data: message });
        break;

      case 'TOGGLE_FAVORITE':
        await threadService.toggleFavorite(payload.threadId);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown thread operation' });
    }
  } catch (error) {
    console.error('Error in thread operation:', error);
    sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
}

// Separate async function to handle the API call
async function handleOpenAIQuery(
  payload: { threadId: string },
  onStream: (chunk: ResponseStreamEvent) => void
) {
  try {
    console.log('Processing OpenAI query for prompts:', payload);
    const { userPromptInput, previous_response_id } = await threadService.prepareThreadForQuery(
      payload.threadId
    );
    const apiKey = await getApiKey();
    const requestObj: any = {
      systemPrompt: SYSTEM_PROMPT,
      userPromptInput,
      apiKey,
      onStream,
    };
    if (previous_response_id) {
      requestObj['previous_response_id'] = previous_response_id;
    }
    const result = await OpenAIService.queryOpenAI(requestObj);
    console.log('OpenAI result:', result);
  } catch (error) {
    console.error('Error in queryOpenAI:', error);
  }
}

// //for setting up a port for streaming chunks of response
chrome.runtime.onConnect.addListener(port => {
  port.onMessage.addListener(async message => {
    console.log('Background received messagessssss:', message);

    const onStream = (chunk: ResponseStreamEvent) => {
      if (chunk.type === 'response.output_text.delta') {
        port.postMessage({ type: 'STREAM_CHUNK', chunk: chunk.delta });
      } else if (chunk.type === 'response.completed') {
        console.log('STREAM_DONE', chunk);
        port.postMessage({ type: 'STREAM_DONE', response_id: chunk.response.id });
      }
    };

    if (message.type === 'QUERY_OPENAI_STREAM') {
      try {
        handleOpenAIQuery(message.payload, onStream);
        // port.postMessage({ type: 'STREAM_DONE' });
      } catch (error) {
        console.log('Background sending error:', error);
        port.postMessage({
          type: 'STREAM_ERROR',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
});
