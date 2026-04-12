import { Injectable } from '@nestjs/common';
import type { AuthorizationCodeRecord, ConsentRecord, RefreshTokenRecord } from '@forge-core/core/auth/oauth.types';

@Injectable()
export class AuthPersistenceStore {
  private readonly authorizationCodes = new Map<string, AuthorizationCodeRecord>();
  private readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  private readonly consents = new Map<string, ConsentRecord>();

  saveAuthorizationCode(record: AuthorizationCodeRecord): void {
    this.authorizationCodes.set(record.code, record);
  }

  consumeAuthorizationCode(code: string): AuthorizationCodeRecord | null {
    this.cleanupExpiredRecords();
    const record = this.authorizationCodes.get(code);
    if (!record) return null;
    this.authorizationCodes.delete(code);
    return record;
  }

  saveRefreshToken(record: RefreshTokenRecord): void {
    this.refreshTokens.set(record.tokenId, record);
  }

  getRefreshToken(tokenId: string): RefreshTokenRecord | null {
    this.cleanupExpiredRecords();
    return this.refreshTokens.get(tokenId) ?? null;
  }

  revokeRefreshToken(tokenId: string): void {
    const record = this.refreshTokens.get(tokenId);
    if (!record) return;
    this.refreshTokens.set(tokenId, { ...record, revokedAt: new Date().toISOString() });
  }

  grantConsent(clientId: string, subject: string, scope: string[]): ConsentRecord {
    const key = this.getConsentKey(clientId, subject);
    const existing = this.consents.get(key);
    const grantedScope = Array.from(new Set([...(existing?.scope ?? []), ...scope])).sort();
    const record: ConsentRecord = {
      clientId,
      subject,
      scope: grantedScope,
      grantedAt: new Date().toISOString(),
    };
    this.consents.set(key, record);
    return record;
  }

  hasConsent(clientId: string, subject: string, scope: string[]): boolean {
    const existing = this.consents.get(this.getConsentKey(clientId, subject));
    if (!existing) return false;
    return scope.every(item => existing.scope.includes(item));
  }

  private cleanupExpiredRecords(): void {
    const now = Date.now();

    for (const [code, record] of this.authorizationCodes.entries()) {
      if (new Date(record.expiresAt).getTime() <= now) {
        this.authorizationCodes.delete(code);
      }
    }

    for (const [tokenId, record] of this.refreshTokens.entries()) {
      if (record.revokedAt || new Date(record.expiresAt).getTime() <= now) {
        this.refreshTokens.delete(tokenId);
      }
    }
  }

  private getConsentKey(clientId: string, subject: string): string {
    return `${clientId}:${subject}`;
  }
}
