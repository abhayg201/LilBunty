export class OpenAIService {
  
  static async queryOpenAI({
    systemPrompt,
    userPrompt,
    apiKey,
    model = "gpt-4",
    temperature = 0.7,
    stream = false,
    onStream
  }: {
    systemPrompt: string;
    userPrompt: string;
    apiKey: string;
    model?: string;
    temperature?: number;
    stream?: boolean;
    onStream?: (chunk: string) => void;
  }): Promise<string> {
    if (!apiKey) throw new Error("OpenAI API key not configured");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature,
        stream,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    if (!stream) {
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "No response.";
    } else {
      return await OpenAIService.streamOpenAIResponse(response, onStream);
    }
  }

  static async streamOpenAIResponse(
    response: Response,
    onStream?: (chunk: string) => void
  ): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No stream reader available");
    let result = '';
    const decoder = new TextDecoder();
    let done = false;
    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        // OpenAI streams data as lines starting with 'data: '
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));
        for (const line of lines) {
          const dataStr = line.replace('data: ', '').trim();
          if (dataStr === '[DONE]') continue;
          try {
            const data = JSON.parse(dataStr);
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              result += content;
              if (onStream) onStream(content);
            }
          } catch (e) {
            // Ignore JSON parse errors for incomplete chunks
            console.error(e);
          }
        }
      }
    }
    return result || "No response.";
  }
} 