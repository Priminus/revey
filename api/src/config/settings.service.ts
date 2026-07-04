import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(clientId: string): Promise<{ autoSend: boolean }> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { autoSend: true },
    });
    if (!client) throw new NotFoundException('Client not found');
    return { autoSend: client.autoSend };
  }

  async updateSettings(
    clientId: string,
    patch: { autoSend?: unknown },
  ): Promise<{ autoSend: boolean }> {
    if (typeof patch?.autoSend !== 'boolean') {
      throw new BadRequestException('autoSend must be a boolean');
    }
    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: { autoSend: patch.autoSend },
      select: { autoSend: true },
    });
    return { autoSend: client.autoSend };
  }
}
