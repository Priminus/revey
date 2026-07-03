import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ClientId } from '../tenancy/client-id.decorator';
import { TemplateService, TemplateScope } from './template.service';
import { FlowService, FlowScope, StepView } from './flow.service';

function parseScope(raw: unknown): FlowScope {
  const value = raw ?? 'client';
  if (value !== 'global' && value !== 'client') {
    throw new BadRequestException("scope must be 'global' or 'client'");
  }
  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

@Controller('config')
export class ConfigController {
  constructor(
    private readonly templates: TemplateService,
    private readonly flow: FlowService,
  ) {}

  @Get('templates')
  listTemplates(@ClientId() clientId: string) {
    return this.templates.list(clientId);
  }

  @Post('templates')
  createTemplate(
    @ClientId() clientId: string,
    @Body() dto: { scope: TemplateScope; name: string; subject: string; body: string },
  ) {
    const scope = parseScope(dto?.scope);
    if (!isNonEmptyString(dto?.name) || !isNonEmptyString(dto?.subject) || !isNonEmptyString(dto?.body)) {
      throw new BadRequestException('name/subject/body required');
    }
    return this.templates.create(clientId, scope, {
      name: dto.name,
      subject: dto.subject,
      body: dto.body,
    });
  }

  @Patch('templates/:id')
  updateTemplate(
    @ClientId() clientId: string,
    @Param('id') id: string,
    @Body() dto: { name?: string; subject?: string; body?: string },
  ) {
    return this.templates.update(clientId, id, dto);
  }

  @Delete('templates/:id')
  removeTemplate(@ClientId() clientId: string, @Param('id') id: string): Promise<void> {
    return this.templates.remove(clientId, id);
  }

  @Get('flow')
  getFlow(
    @ClientId() clientId: string,
    @Query('scope') scope: string | undefined,
  ): Promise<{ flowId: string | null; isOverride: boolean; steps: StepView[] }> {
    return this.flow.getEffective(clientId, parseScope(scope));
  }

  @Put('flow/steps')
  replaceSteps(
    @ClientId() clientId: string,
    @Query('scope') scope: string | undefined,
    @Body() dto: { steps: { offsetDays: number; templateId: string; order: number }[] },
  ): Promise<void> {
    return this.flow.replaceSteps(clientId, parseScope(scope), dto.steps);
  }

  @Post('flow/customize')
  customize(@ClientId() clientId: string): Promise<void> {
    return this.flow.customize(clientId);
  }

  @Delete('flow')
  reset(@ClientId() clientId: string): Promise<void> {
    return this.flow.reset(clientId);
  }
}
