import { PrismaService } from '../prisma/prisma.service';

interface DefaultTemplate {
  name: string;
  subject: string;
  body: string;
  offsetDays: number;
}

const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: 'Pre-due nudge',
    offsetDays: -7,
    subject: 'Invoice reminder for {{debtor_name}}',
    body:
      'Hi {{debtor_name}},\n\n' +
      'Just a friendly heads up that the following invoices are coming due soon:\n\n' +
      '{{invoice_list}}\n\n' +
      'Total outstanding: {{outstanding_amount}}.\n\n' +
      'Thanks!',
  },
  {
    name: 'Due reminder',
    offsetDays: 1,
    subject: 'Invoice now due for {{debtor_name}}',
    body:
      'Hi {{debtor_name}},\n\n' +
      'This is a reminder that the following invoices are now due:\n\n' +
      '{{invoice_list}}\n\n' +
      'Total outstanding: {{outstanding_amount}}.\n\n' +
      'Please arrange payment at your earliest convenience.',
  },
  {
    name: 'Firm follow-up',
    offsetDays: 14,
    subject: 'Overdue invoice for {{debtor_name}}',
    body:
      'Hi {{debtor_name}},\n\n' +
      'The following invoices are now overdue and require your attention:\n\n' +
      '{{invoice_list}}\n\n' +
      'Total outstanding: {{outstanding_amount}}.\n\n' +
      'Please settle this balance as soon as possible.',
  },
  {
    name: 'Final notice',
    offsetDays: 30,
    subject: 'Final notice: overdue balance for {{debtor_name}}',
    body:
      'Hi {{debtor_name}},\n\n' +
      'This is a final notice regarding the significantly overdue balance below:\n\n' +
      '{{invoice_list}}\n\n' +
      'Total outstanding: {{outstanding_amount}}.\n\n' +
      'Please contact us immediately to resolve this.',
  },
];

export async function ensureDefaults(prisma: PrismaService): Promise<void> {
  const globalFlow = await prisma.reminderFlow.findFirst({ where: { clientId: null } });
  if (globalFlow) {
    const existingStepCount = await prisma.reminderStep.count({ where: { flowId: globalFlow.id } });
    if (existingStepCount > 0) return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const flow = globalFlow ?? (await tx.reminderFlow.create({ data: { clientId: null } }));

      const sortedTemplates = [...DEFAULT_TEMPLATES].sort((a, b) => a.offsetDays - b.offsetDays);

      for (let i = 0; i < sortedTemplates.length; i++) {
        const def = sortedTemplates[i];
        const template = await tx.emailTemplate.create({
          data: {
            clientId: null,
            name: def.name,
            subject: def.subject,
            body: def.body,
          },
        });
        await tx.reminderStep.create({
          data: {
            flowId: flow.id,
            offsetDays: def.offsetDays,
            templateId: template.id,
            order: i,
          },
        });
      }
    });
  } catch (err: unknown) {
    // A concurrent boot may have created the global flow first (unique-violation
    // on the partial index); treat that as "already seeded" and return cleanly.
    if ((err as { code?: string })?.code === 'P2002') return;
    throw err;
  }
}
