import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { redact } from './audit.service.js';
import { StorageService } from './storage.service.js';

describe('redact', () => {
  it('remove campos sensíveis da auditoria', () => {
    expect(redact({ password: 'x', refreshToken: 'y', extractedText: 'z', resumeId: '1' })).toEqual({
      password: '[redacted]',
      refreshToken: '[redacted]',
      extractedText: '[redacted]',
      resumeId: '1',
    });
  });
});

describe('StorageService', () => {
  let dir: string;
  let storage: StorageService;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jarvis-storage-'));
    storage = new StorageService({ STORAGE_LOCAL_DIR: dir } as Env);
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('grava, lê e apaga por chave', async () => {
    await storage.put('users/u1/resumes/a.pdf', Buffer.from('abc'));
    expect((await storage.get('users/u1/resumes/a.pdf')).toString()).toBe('abc');
    await storage.deletePrefix('users/u1/');
    await expect(storage.get('users/u1/resumes/a.pdf')).rejects.toThrow();
  });

  it('não sobrescreve arquivo existente', async () => {
    await storage.put('users/u2/x.txt', Buffer.from('1'));
    await expect(storage.put('users/u2/x.txt', Buffer.from('2'))).rejects.toThrow();
  });

  it('bloqueia path traversal', async () => {
    await expect(storage.get('../segredo.txt')).rejects.toThrow('inválida');
    await expect(storage.get('users/../../x')).rejects.toThrow('inválida');
    await expect(storage.get('C:/Windows/win.ini')).rejects.toThrow('inválida');
  });
});
