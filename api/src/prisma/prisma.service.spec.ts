import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('exposes the client delegate', () => {
    const service = new PrismaService();
    expect(service.client).toBeDefined();
  });
});
