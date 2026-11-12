import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { ResumeKind } from '@jarvis/shared';

export interface Extraction {
  text: string;
  pageCount: number | null;
}

const MAX_CHARS = 100_000;

export function normalizeText(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    // Marcador de página que o pdf-parse v2 insere ("-- 1 of 2 --").
    .replace(/^-- \d+ of \d+ --$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS);
}

/** Extração determinística de texto, sem LLM. A interpretação vem na Fase 2. */
export async function extractText(buf: Buffer, kind: ResumeKind): Promise<Extraction> {
  switch (kind) {
    case 'pdf': {
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      try {
        const result = await parser.getText();
        return { text: normalizeText(result.text), pageCount: result.total };
      } finally {
        await parser.destroy();
      }
    }
    case 'docx': {
      const result = await mammoth.extractRawText({ buffer: buf });
      return { text: normalizeText(result.value), pageCount: null };
    }
    case 'txt':
      return { text: normalizeText(buf.toString('utf8')), pageCount: null };
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} excedeu ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
