import { Inject, Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { ENV, type Env } from '../config/env.js';

/**
 * Armazenamento privado de arquivos por chave (ADR-0005).
 * Driver local em desenvolvimento; a interface é a mesma que o driver S3 terá.
 * As chaves são sempre geradas pelo backend — nunca vêm do nome enviado pelo usuário.
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(@Inject(ENV) env: Env) {
    this.root = resolve(env.STORAGE_LOCAL_DIR);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: 'wx' });
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  /** Remove tudo sob um prefixo, ex.: `users/<id>/` na exclusão da conta. */
  async deletePrefix(prefix: string): Promise<void> {
    if (!prefix.endsWith('/')) throw new Error('Prefixo precisa terminar com /');
    await rm(this.pathFor(prefix), { recursive: true, force: true });
  }

  private pathFor(key: string): string {
    if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..')) {
      throw new Error('Chave de armazenamento inválida');
    }
    const full = resolve(this.root, key);
    const rel = relative(this.root, full);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('Chave fora do diretório de armazenamento');
    }
    return full;
  }
}
