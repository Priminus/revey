import { Controller, Get } from '@nestjs/common';
import { Public } from './health.public.decorator';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
