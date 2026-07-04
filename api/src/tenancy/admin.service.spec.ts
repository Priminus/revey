import { AdminService } from './admin.service';

describe('AdminService', () => {
  const service = new AdminService();
  const originalEnv = process.env.REVEY_ADMIN_USER_IDS;

  afterEach(() => {
    process.env.REVEY_ADMIN_USER_IDS = originalEnv;
  });

  it('returns true for a user id listed in REVEY_ADMIN_USER_IDS', () => {
    process.env.REVEY_ADMIN_USER_IDS = 'user_admin_1, user_admin_2';
    expect(service.isAdmin('user_admin_1')).toBe(true);
    expect(service.isAdmin('user_admin_2')).toBe(true);
  });

  it('returns false for a user id not listed', () => {
    process.env.REVEY_ADMIN_USER_IDS = 'user_admin_1';
    expect(service.isAdmin('user_other')).toBe(false);
  });

  it('returns false when the env var is unset', () => {
    delete process.env.REVEY_ADMIN_USER_IDS;
    expect(service.isAdmin('anyone')).toBe(false);
  });
});
