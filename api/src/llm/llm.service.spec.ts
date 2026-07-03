import { LlmService } from './llm.service';

describe('LlmService', () => {
  const svc = new LlmService('sk-test', 'gpt-4o');

  afterEach(() => jest.restoreAllMocks());

  it('returns message content from a completion', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello' } }] }),
    });
    global.fetch = fetchMock as never;
    const out = await svc.complete({ system: 's', user: 'u' });
    expect(out).toBe('hello');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('gpt-4o');
    expect(body.messages[0]).toEqual({ role: 'system', content: 's' });
  });

  it('parses JSON responses and sets json response_format', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"score":80}' } }] }),
    });
    global.fetch = fetchMock as never;
    const out = await svc.completeJson<{ score: number }>({
      system: 's',
      user: 'u',
      schemaHint: '{score:number}',
    });
    expect(out).toEqual({ score: 80 });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('throws on a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 429, text: async () => 'rate limited',
    }) as never;
    await expect(svc.complete({ system: 's', user: 'u' })).rejects.toThrow(/openai/i);
  });
});
