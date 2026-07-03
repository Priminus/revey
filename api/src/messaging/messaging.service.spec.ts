import { MessagingService } from './messaging.service';

describe('MessagingService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('redirects to the override address and banners the intended recipient', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true, json: async () => ({ MessageID: 'pm-1' }),
    });
    global.fetch = fetchMock as never;
    const svc = new MessagingService('pm-token', 'from@revey.test', 'redirect@me.test');
    const res = await svc.sendEmail({ toIntended: 'debtor@acme.example', subject: 'Hi', body: 'Pay please' });
    expect(res).toEqual({ messageId: 'pm-1', toActual: 'redirect@me.test', redirected: true });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.To).toBe('redirect@me.test');
    expect(body.From).toBe('from@revey.test');
    expect(body.TextBody).toContain('intended for debtor@acme.example');
    expect(body.TextBody).toContain('Pay please');
  });

  it('sends to the real recipient when no override is set', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ MessageID: 'pm-2' }) });
    global.fetch = fetchMock as never;
    const svc = new MessagingService('pm-token', 'from@revey.test', '');
    const res = await svc.sendEmail({ toIntended: 'debtor@acme.example', subject: 'Hi', body: 'x' });
    expect(res.toActual).toBe('debtor@acme.example');
    expect(res.redirected).toBe(false);
  });

  it('throws on a Postmark error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 422, text: async () => 'Sender signature not confirmed',
    }) as never;
    const svc = new MessagingService('pm-token', 'from@revey.test', 'redirect@me.test');
    await expect(
      svc.sendEmail({ toIntended: 'x@y.z', subject: 's', body: 'b' }),
    ).rejects.toThrow(/postmark|sender signature/i);
  });
});
