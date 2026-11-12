import { describe, expect, it } from 'vitest';
import { makePdf, SAMPLE_RESUME_LINES } from '../../../test/fixtures/make-pdf.js';
import { extractText, normalizeText, withTimeout } from './text-extractor.js';

describe('normalizeText', () => {
  it('normaliza quebras e remove NUL', () => {
    expect(normalizeText('a\r\nb  \n\n\n\nc\u0000')).toBe('a\nb\n\nc');
  });
});

describe('extractText', () => {
  it('extrai texto real de um PDF', async () => {
    const { text, pageCount } = await extractText(makePdf(SAMPLE_RESUME_LINES), 'pdf');
    expect(pageCount).toBe(1);
    expect(text).toContain('Ana Souza');
    expect(text).toContain('TypeScript');
    expect(text).not.toMatch(/-- \d+ of \d+ --/);
  });

  it('extrai TXT', async () => {
    const { text, pageCount } = await extractText(Buffer.from('Linha 1\r\nLinha 2'), 'txt');
    expect(text).toBe('Linha 1\nLinha 2');
    expect(pageCount).toBeNull();
  });

  it('falha em PDF corrompido', async () => {
    await expect(extractText(Buffer.from('%PDF-1.4 lixo'), 'pdf')).rejects.toThrow();
  });
});

describe('withTimeout', () => {
  it('rejeita quando excede o limite', async () => {
    const never = new Promise<never>(() => {});
    await expect(withTimeout(never, 20, 'Teste')).rejects.toThrow('Teste excedeu');
  });
});
