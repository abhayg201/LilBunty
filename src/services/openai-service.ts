import OpenAI from 'openai';
import type {
  ResponseInputItem,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses.mjs';
import type { Stream } from 'openai/streaming';

export class OpenAIService {
  private static openai: OpenAI | null = null;

  static async init(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  static async queryOpenAI({
    systemPrompt,
    userPromptInput,
    previous_response_id,
    model = 'gpt-4',
    temperature = 0.7,
    onStream,
  }: {
    systemPrompt: string;
    userPromptInput: ResponseInputItem[];
    previous_response_id: string;
    apiKey: string;
    model?: string;
    temperature?: number;
    onStream?: (chunk: ResponseStreamEvent) => void;
  }): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized');
    }
    const stream_response = (await this.openai.responses.create({
      model,
      instructions: systemPrompt,
      input: userPromptInput,
      previous_response_id,
      temperature,
      stream: true,
    })) as Stream<ResponseStreamEvent>;

    for await (const chunk of stream_response) {
      console.log('chunk', chunk);
      if (onStream) onStream(chunk);
    }
    return '';
  }
}
