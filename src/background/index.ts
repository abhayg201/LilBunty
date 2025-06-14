import { count } from '../storage';
import { OpenAIService } from '../services/openai-service';
import { ThreadService } from '../services/thread-service';
import openai, { OpenAI } from 'openai';

// Background service workers
// https://developer.chrome.com/docs/extensions/mv3/service_workers/

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

// NOTE: If you want to toggle the side panel from the extension's action button,
// you can use the following code:
// chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
//    .catch((error) => console.error(error));

//for normal query and thread operations
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  if (message.type === 'QUERY_OPENAI') {
    handleOpenAIQuery(message.payload, sendResponse);
    return true; // This keeps the message channel open
  } else if (message.type === 'THREAD_OPERATION') {
    handleThreadOperation(message.payload, sendResponse);
    return true;
  }
});

// Handle thread operations
async function handleThreadOperation(payload: any, sendResponse: (response: any) => void) {
  try {
    const threadService = ThreadService.getInstance();

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
        const newThread = await threadService.createThread(payload.selectedText, payload.url);
        sendResponse({ success: true, data: newThread });
        break;

      case 'ADD_MESSAGE':
        const message = await threadService.addMessage(
          payload.threadId,
          payload.role,
          payload.content,
          payload.metadata
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
  payload: { systemPrompt: string; userPrompt: string },
  sendResponse: (response: any) => void
) {
  try {
    console.log('Processing OpenAI query for prompts:', payload);
    const apiKey = await getApiKey();
    const result = await OpenAIService.queryOpenAI({
      systemPrompt: payload.systemPrompt,
      userPrompt: payload.userPrompt,
      apiKey,
    });
    console.log('OpenAI result:', result);
    sendResponse({ answer: result });
  } catch (error) {
    console.error('Error in queryOpenAI:', error);
    sendResponse({ error: error instanceof Error ? error.message : String(error) });
  }
}

//for setting up a port for streaming chunks of response
chrome.runtime.onConnect.addListener(port => {
  port.onMessage.addListener(async message => {
    console.log('Background received messagessssss:', message);

    if (message.type === 'QUERY_OPENAI_STREAM') {
      try {
        const { systemPrompt, userPrompt } = message.payload;
        const apiKey = await getApiKey();
        let fullResponse = '';
        console.log('Background received asdfasdf messagessssss:', message, apiKey);
        await OpenAIService.queryOpenAI({
          systemPrompt: 'You are a helpful assistant.',
          userPrompt: 'Please help me understand this text: ' + userPrompt + systemPrompt,
          apiKey,
          stream: true,
          onStream: chunk => {
            fullResponse += chunk;
            console.log('Background sending chunk:', chunk);
            port.postMessage({ type: 'STREAM_CHUNK', chunk });
          },
        });
        port.postMessage({ type: 'STREAM_DONE' });
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
