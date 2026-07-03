import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface StepView {
  id: string;
  offsetDays: number;
  order: number;
  templateId: string;
  templateName: string;
}
export type FlowScope = 'global' | 'client';

export function selectStepFor(
  oldestDaysOverdue: number,
  steps: { offsetDays: number }[],
): number {
  if (steps.length === 0) return -1;
  let chosen = -1;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].offsetDays <= oldestDaysOverdue) chosen = i;
  }
  return chosen === -1 ? 0 : chosen;
}

@Injectable()
export class FlowService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureGlobal(): Promise<string> {
    const existing = await this.prisma.reminderFlow.findFirst({ where: { clientId: null } });
    if (existing) return existing.id;
    const created = await this.prisma.reminderFlow.create({ data: { clientId: null } });
    return created.id;
  }

  private async flowFor(clientId: string, scope: FlowScope) {
    if (scope === 'global') {
      return this.prisma.reminderFlow.findFirst({ where: { clientId: null } });
    }
    return this.prisma.reminderFlow.findUnique({ where: { clientId } });
  }

  private toStepViews(steps: { id: string; offsetDays: number; order: number; template: { id: string; name: string } }[]): StepView[] {
    return steps
      .map((s) => ({ id: s.id, offsetDays: s.offsetDays, order: s.order, templateId: s.template.id, templateName: s.template.name }))
      .sort((a, b) => a.offsetDays - b.offsetDays);
  }

  async getEffective(clientId: string, scope: FlowScope): Promise<{ flowId: string | null; isOverride: boolean; steps: StepView[] }> {
    if (scope === 'global') {
      const flow = await this.prisma.reminderFlow.findFirst({
        where: { clientId: null },
        include: { steps: { include: { template: true } } },
      });
      return { flowId: flow?.id ?? null, isOverride: false, steps: flow ? this.toStepViews(flow.steps) : [] };
    }
    const clientFlow = await this.prisma.reminderFlow.findUnique({
      where: { clientId },
      include: { steps: { include: { template: true } } },
    });
    if (clientFlow) return { flowId: clientFlow.id, isOverride: true, steps: this.toStepViews(clientFlow.steps) };
    const globalFlow = await this.prisma.reminderFlow.findFirst({
      where: { clientId: null },
      include: { steps: { include: { template: true } } },
    });
    return { flowId: globalFlow?.id ?? null, isOverride: false, steps: globalFlow ? this.toStepViews(globalFlow.steps) : [] };
  }

  async resolveForClient(clientId: string): Promise<{ steps: StepView[] }> {
    const eff = await this.getEffective(clientId, 'client');
    return { steps: eff.steps };
  }

  async customize(clientId: string): Promise<void> {
    const existing = await this.prisma.reminderFlow.findUnique({ where: { clientId } });
    if (existing) return;
    const global = await this.prisma.reminderFlow.findFirst({
      where: { clientId: null },
      include: { steps: true },
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        const flow = await tx.reminderFlow.create({ data: { clientId } });
        if (global && global.steps.length > 0) {
          await tx.reminderStep.createMany({
            data: global.steps.map((s) => ({
              flowId: flow.id,
              offsetDays: s.offsetDays,
              templateId: s.templateId,
              order: s.order,
            })),
          });
        }
      });
    } catch (err: unknown) {
      // A concurrent customize() call may have already created the client flow
      // (unique constraint on clientId). Treat that as a benign race, not an error.
      if ((err as { code?: string })?.code === 'P2002') return;
      throw err;
    }
  }

  async reset(clientId: string): Promise<void> {
    const flow = await this.prisma.reminderFlow.findUnique({ where: { clientId } });
    if (flow) await this.prisma.reminderFlow.delete({ where: { id: flow.id } });
  }

  async replaceSteps(
    clientId: string,
    scope: FlowScope,
    steps: { offsetDays: number; templateId: string; order: number }[],
  ): Promise<void> {
    for (const s of steps) {
      if (!Number.isInteger(s.offsetDays)) {
        throw new BadRequestException('Each step offsetDays must be an integer');
      }
      if (typeof s.templateId !== 'string' || s.templateId.trim().length === 0) {
        throw new BadRequestException('Each step templateId must be a non-empty string');
      }
      if (typeof s.order !== 'number' || Number.isNaN(s.order)) {
        throw new BadRequestException('Each step order must be a number');
      }
    }

    const templateIds = [...new Set(steps.map((s) => s.templateId))];
    if (templateIds.length > 0) {
      const found = await this.prisma.emailTemplate.findMany({
        where: { id: { in: templateIds }, OR: [{ clientId: null }, { clientId }] },
        select: { id: true },
      });
      if (found.length !== templateIds.length) {
        throw new BadRequestException('One or more templates are not available in this scope');
      }
    }

    const flow = await this.flowFor(clientId, scope);
    let flowId: string;
    if (flow) {
      flowId = flow.id;
    } else if (scope === 'global') {
      flowId = await this.ensureGlobal();
    } else {
      throw new ConflictException('Customize the client flow before editing its steps');
    }
    await this.prisma.$transaction([
      this.prisma.reminderStep.deleteMany({ where: { flowId } }),
      this.prisma.reminderStep.createMany({
        data: steps.map((s) => ({
          flowId,
          offsetDays: s.offsetDays,
          templateId: s.templateId,
          order: s.order,
        })),
      }),
    ]);
  }
}
