import { count } from "../storage";
import { config } from '../config';
import { OpenAIService } from '../services/openai-service';

// Background service workers
// https://developer.chrome.com/docs/extensions/mv3/service_workers/

chrome.runtime.onInstalled.addListener(() => {
    count.subscribe(console.log);
});

// NOTE: If you want to toggle the side panel from the extension's action button,
// you can use the following code:
// chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
//    .catch((error) => console.error(error));

//for normal query
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background received message:", message);
    
    if (message.type === "QUERY_OPENAI") {
        handleOpenAIQuery(message.payload, sendResponse);
        return true; // This keeps the message channel open
    }
});

// Separate async function to handle the API call
async function handleOpenAIQuery(payload: { systemPrompt: string, userPrompt: string }, sendResponse: (response: any) => void) {
    try {
        console.log("Processing OpenAI query for prompts:", payload);
        const result = await OpenAIService.queryOpenAI({
            systemPrompt: payload.systemPrompt,
            userPrompt: payload.userPrompt,
            apiKey: config.OPENAI_API_KEY,
        });
        console.log("OpenAI result:", result);
        sendResponse({ answer: result });
    } catch (error) {
        console.error("Error in queryOpenAI:", error);
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
    }
}


//for setting up a port for streaming chunks of response
chrome.runtime.onConnect.addListener((port) => {
    port.onMessage.addListener(async (message) => {
      if (message.type === "QUERY_OPENAI_STREAM") {
        try {
          const { systemPrompt, userPrompt } = message.payload;
          let fullResponse = "";
          await OpenAIService.queryOpenAI({
            systemPrompt,
            userPrompt,
            apiKey: config.OPENAI_API_KEY,
            stream: true,
            onStream: (chunk) => {
              fullResponse += chunk;
              port.postMessage({ type: "STREAM_CHUNK", chunk });
            }
          });
          port.postMessage({ type: "STREAM_DONE" });
        } catch (error) {
          port.postMessage({
            type: "STREAM_ERROR",
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    });
  });