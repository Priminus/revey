import { ConflictException, Injectable } from '@nestjs/common';
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
    const flow = await this.prisma.reminderFlow.create({ data: { clientId } });
    if (global) {
      for (const s of global.steps) {
        await this.prisma.reminderStep.create({
          data: { flowId: flow.id, offsetDays: s.offsetDays, templateId: s.templateId, order: s.order },
        });
      }
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
    let flow = await this.flowFor(clientId, scope);
    if (!flow) {
      if (scope === 'global') {
        flow = await this.prisma.reminderFlow.create({ data: { clientId: null } });
      } else {
        throw new ConflictException('Customize the client flow before editing its steps');
      }
    }
    await this.prisma.reminderStep.deleteMany({ where: { flowId: flow.id } });
    for (const s of steps) {
      await this.prisma.reminderStep.create({
        data: { flowId: flow.id, offsetDays: s.offsetDays, templateId: s.templateId, order: s.order },
      });
    }
  }
}
