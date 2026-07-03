import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TOKEN_VERIFIER } from '../src/auth/clerk.guard';

@Controller('test-protected')
class TestProtectedController {
  @Get()
  ping(): { ok: boolean } {
    return { ok: true };
  }
}

@Module({ controllers: [TestProtectedController] })
class TestProtectedModule {}

describe('tenant scope (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, TestProtectedModule],
    })
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({ verify: jest.fn().mockRejectedValue(new Error('no')) })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('health is public', () =>
    request(app.getHttpServer()).get('/api/health').expect(200));

  it('non-public routes require a bearer token', () =>
    request(app.getHttpServer()).get('/api/test-protected').expect(401));
});
