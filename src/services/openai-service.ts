import OpenAI from 'openai';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses.mjs';
import type { Stream } from 'openai/streaming';

export class OpenAIService {
  private static openai: OpenAI | null = null;

  static async init(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  static async queryOpenAI({
    systemPrompt,
    userPrompt,
    model = 'gpt-4',
    temperature = 0.7,
    stream = false,
    onStream,
  }: {
    systemPrompt: string;
    userPrompt: string;
    apiKey: string;
    model?: string;
    temperature?: number;
    stream?: boolean;
    onStream?: (chunk: string) => void;
  }): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized');
    }
    const stream_response = (await this.openai.responses.create({
      model,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      stream,
    })) as Stream<ResponseStreamEvent>;

    for await (const chunk of stream_response) {
      console.log('chunk', chunk);
      if (onStream) this.streamOpenAIResponse(chunk, onStream);
    }
    return '';
  }

  static streamOpenAIResponse(chunk: ResponseStreamEvent, onStream?: (chunk: string) => void) {
    if (chunk.type === 'response.output_text.delta') {
      if (onStream) onStream(chunk.delta);
    }
  }
}
