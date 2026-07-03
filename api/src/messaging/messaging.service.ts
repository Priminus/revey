import { Injectable } from '@nestjs/common';

const POSTMARK_URL = 'https://api.postmarkapp.com/email';

@Injectable()
export class MessagingService {
  constructor(
    private readonly token: string = process.env.POSTMARK_TOKEN ?? '',
    private readonly from: string = process.env.OUTREACH_FROM_EMAIL ?? '',
    private readonly redirect: string = process.env.OUTREACH_REDIRECT_EMAIL ?? '',
  ) {}

  get redirectEmail(): string {
    return this.redirect;
  }

  async sendEmail(opts: {
    toIntended: string | null;
    subject: string;
    body: string;
  }): Promise<{ messageId: string; toActual: string; redirected: boolean }> {
    const redirected = this.redirect.length > 0;
    const toActual = redirected ? this.redirect : (opts.toIntended ?? '');
    if (!toActual) {
      throw new Error('No recipient address for outreach email');
    }
    const textBody =
      redirected || toActual !== opts.toIntended
        ? `[TEST — this message was intended for ${opts.toIntended ?? 'unknown'}]\n\n${opts.body}`
        : opts.body;

    const res = await fetch(POSTMARK_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': this.token,
      },
      body: JSON.stringify({
        From: this.from,
        To: toActual,
        Subject: opts.subject,
        TextBody: textBody,
        MessageStream: 'outbound',
      }),
    });
    if (!res.ok) {
      throw new Error(`Postmark send failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { MessageID: string };
    return { messageId: json.MessageID, toActual, redirected };
  }
}
