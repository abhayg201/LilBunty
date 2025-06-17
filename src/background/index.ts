import { count } from '../storage';
import { OpenAIService } from '../services/openai-service';
import { ThreadService } from '../services/thread-service';
import openai, { OpenAI } from 'openai';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses.mjs';

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
  }
});

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
