jest.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: async () => 'tok' }),
}));

import { formatCents } from './ar';

describe('formatCents', () => {
  it('formats integer cents as whole-dollar currency', () => {
    expect(formatCents(4500000)).toBe('$45,000');
    expect(formatCents(120050)).toBe('$1,201');
    expect(formatCents(0)).toBe('$0');
  });
});
