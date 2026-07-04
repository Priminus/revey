import { PrismaService } from '../prisma/prisma.service';

interface SampleClient {
  name: string;
  clerkUserId: string;
}

const SAMPLE_CLIENTS: SampleClient[] = [
  { name: 'Northwind Trading', clerkUserId: 'sample_northwind' },
  { name: 'Acme Freight Co', clerkUserId: 'sample_acme' },
];

export async function ensureSampleClients(prisma: PrismaService): Promise<void> {
  for (const sample of SAMPLE_CLIENTS) {
    await prisma.client.upsert({
      where: { clerkUserId: sample.clerkUserId },
      update: {},
      create: {
        name: sample.name,
        clerkUserId: sample.clerkUserId,
      },
    });
  }
}
