export class OpenAIService {
  static async queryOpenAI({
    systemPrompt,
    userPrompt,
    apiKey,
    model = "gpt-4",
    temperature = 0.7
  }: {
    systemPrompt: string;
    userPrompt: string;
    apiKey: string;
    model?: string;
    temperature?: number;
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
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "No response.";
  }
} 