import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import type { Response } from 'express';

export interface CookieOptions {
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
}

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function encode(value: Buffer | string): string {
  return Buffer.isBuffer(value)
    ? value.toString('base64url')
    : Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

export function sealCookieValue(payload: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${encode(iv)}.${encode(tag)}.${encode(ciphertext)}`;
}

export function unsealCookieValue<T>(value: string | undefined, secret: string): T | null {
  if (!value) return null;

  const parts = value.split('.');
  if (parts.length !== 3) return null;

  try {
    const [iv, tag, ciphertext] = parts.map(decode);
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};

  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const [name, ...rest] = part.trim().split('=');
    if (!name) return acc;
    acc[name] = rest.join('=');
    return acc;
  }, {});
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const segments = [`${name}=${value}`];

  if (options.maxAge !== undefined)
    segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  segments.push(`Path=${options.path ?? '/auth'}`);
  if (options.httpOnly !== false) segments.push('HttpOnly');
  if (options.sameSite) segments.push(`SameSite=${options.sameSite}`);
  if (options.secure) segments.push('Secure');

  return segments.join('; ');
}

export function appendSetCookie(response: Response, cookie: string): void {
  const current = response.getHeader('Set-Cookie');
  if (!current) {
    response.setHeader('Set-Cookie', cookie);
    return;
  }

  const next = Array.isArray(current) ? [...current, cookie] : [String(current), cookie];
  response.setHeader('Set-Cookie', next);
}

export function clearCookie(name: string, options: CookieOptions = {}): string {
  return serializeCookie(name, '', { ...options, maxAge: 0 });
}
