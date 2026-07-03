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

describe('tenant interceptor DI (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, TestProtectedModule],
    })
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({
        verify: jest.fn().mockResolvedValue({ sub: 'user_does_not_exist' }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('interceptor injects TenantService and resolves (403 for unknown user, NOT 500)', () =>
    request(app.getHttpServer())
      .get('/api/test-protected')
      .set('Authorization', 'Bearer valid-token')
      .expect(403));
});
