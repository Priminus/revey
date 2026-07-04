import { Injectable } from '@nestjs/common';

// Revey admins can access all clients. Membership is env-driven via a
// comma-separated list of Clerk user ids (REVEY_ADMIN_USER_IDS).
@Injectable()
export class AdminService {
  isAdmin(userId: string): boolean {
    return (process.env.REVEY_ADMIN_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .includes(userId);
  }
}
