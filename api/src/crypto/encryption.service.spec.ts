import { randomBytes } from 'crypto';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  const key = randomBytes(32).toString('base64');
  const service = new EncryptionService(key);

  it('round-trips a secret', () => {
    const secret = 'refresh-token-value-123';
    const enc = service.encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(service.decrypt(enc)).toBe(secret);
  });

  it('produces different ciphertext each call (random IV)', () => {
    expect(service.encrypt('x')).not.toBe(service.encrypt('x'));
  });
});
