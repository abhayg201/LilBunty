import { count } from "../storage";

// Background service workers
// https://developer.chrome.com/docs/extensions/mv3/service_workers/

chrome.runtime.onInstalled.addListener(() => {
    count.subscribe(console.log);
});

// NOTE: If you want to toggle the side panel from the extension's action button,
// you can use the following code:
// chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
//    .catch((error) => console.error(error));
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background received message:", message);
    
    if (message.type === "QUERY_OPENAI") {
        // Handle the async operation and keep the port open
        handleOpenAIQuery(message.payload.text, sendResponse);
        return true; // This keeps the message channel open
    }
});

// Separate async function to handle the API call
async function handleOpenAIQuery(inputText: string, sendResponse: (response: any) => void) {
    try {
        console.log("Processing OpenAI query for text:", inputText);
        const result = await queryOpenAI(inputText);
        console.log("OpenAI result:", result);
        sendResponse(result);
    } catch (error) {
        console.error("Error in queryOpenAI:", error);
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
    }
}

async function queryOpenAI(inputText: string) {
    const OPENAI_KEY = "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";
    
    console.log("Making API call to OpenAI...");
    
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4",
                messages: [{ role: "user", content: inputText }],
                temperature: 0.7,
            }),
        });

        console.log("API response status:", response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("API error:", errorText);
            throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log("API response data:", data);
        
        return {
            answer: data.choices?.[0]?.message?.content || "No response.",
        };
    } catch (error) {
        console.error("Fetch error:", error);
        throw error;
    }
}