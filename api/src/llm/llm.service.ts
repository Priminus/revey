import { Injectable } from '@nestjs/common';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

@Injectable()
export class LlmService {
  constructor(
    private readonly apiKey: string = process.env.OPENAI_API_KEY ?? '',
    private readonly model: string = process.env.OPENAI_MODEL ?? 'gpt-4o',
  ) {}

  private async call(body: Record<string, unknown>): Promise<string> {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    return json.choices[0]?.message?.content ?? '';
  }

  complete(opts: {
    system: string;
    user: string;
    temperature?: number;
  }): Promise<string> {
    return this.call({
      model: this.model,
      temperature: opts.temperature ?? 0.3,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
    });
  }

  async completeJson<T>(opts: {
    system: string;
    user: string;
    schemaHint: string;
    temperature?: number;
  }): Promise<T> {
    const content = await this.call({
      model: this.model,
      temperature: opts.temperature ?? 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${opts.system}\nRespond with ONLY valid JSON matching: ${opts.schemaHint}`,
        },
        { role: 'user', content: opts.user },
      ],
    });
    try {
      return JSON.parse(content) as T;
    } catch {
      throw new Error(`LLM did not return valid JSON: ${content.slice(0, 200)}`);
    }
  }
}
