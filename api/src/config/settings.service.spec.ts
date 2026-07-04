import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  const prisma = {
    client: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const svc = new SettingsService(prisma as never);

  afterEach(() => jest.clearAllMocks());

  describe('getSettings', () => {
    it('returns the autoSend value for the client', async () => {
      prisma.client.findUnique.mockResolvedValue({ autoSend: true });
      const result = await svc.getSettings('c1');
      expect(result).toEqual({ autoSend: true });
      expect(prisma.client.findUnique).toHaveBeenCalledWith({
        where: { id: 'c1' },
        select: { autoSend: true },
      });
    });

    it('throws NotFoundException when the client does not exist', async () => {
      prisma.client.findUnique.mockResolvedValue(null);
      await expect(svc.getSettings('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSettings', () => {
    it('throws BadRequestException when autoSend is not a boolean', async () => {
      await expect(svc.updateSettings('c1', { autoSend: 'yes' as never })).rejects.toThrow(
        BadRequestException,
      );
      await expect(svc.updateSettings('c1', {})).rejects.toThrow(BadRequestException);
      expect(prisma.client.update).not.toHaveBeenCalled();
    });

    it('updates and returns the new autoSend value', async () => {
      prisma.client.update.mockResolvedValue({ autoSend: true });
      const result = await svc.updateSettings('c1', { autoSend: true });
      expect(result).toEqual({ autoSend: true });
      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { autoSend: true },
        select: { autoSend: true },
      });
    });
  });
});
