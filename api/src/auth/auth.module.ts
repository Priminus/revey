import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyToken } from '@clerk/backend';
import { ClerkGuard, TOKEN_VERIFIER, TokenVerifier } from './clerk.guard';

const clerkVerifier: TokenVerifier = {
  verify: (token) =>
    verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY }),
};

@Module({
  providers: [
    { provide: TOKEN_VERIFIER, useValue: clerkVerifier },
    {
      provide: ClerkGuard,
      useFactory: (v: TokenVerifier, reflector: Reflector) =>
        new ClerkGuard(v, reflector),
      inject: [TOKEN_VERIFIER, Reflector],
    },
  ],
  exports: [ClerkGuard],
})
export class AuthModule {}
