import { describe, expect, it } from 'vitest';
import { makePdf } from '../../../test/fixtures/make-pdf.js';
import { detectResumeKind, sanitizeFileName } from './file-signature.js';

describe('detectResumeKind', () => {
  it('reconhece PDF pelo conteúdo', () => {
    expect(detectResumeKind(makePdf(['ola']))).toMatchObject({ ok: true, kind: 'pdf' });
  });

  it('reconhece DOCX (zip com word/document.xml)', () => {
    const fakeDocx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....word/document.xml....')]);
    expect(detectResumeKind(fakeDocx)).toMatchObject({ ok: true, kind: 'docx' });
  });

  it('recusa zip que não é DOCX', () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('payload.exe')]);
    expect(detectResumeKind(zip).ok).toBe(false);
  });

  it('recusa .doc antigo com mensagem orientando o formato', () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    const r = detectResumeKind(ole);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/PDF ou DOCX/);
  });

  it('recusa executável mesmo com nome .pdf', () => {
    expect(detectResumeKind(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03])).ok).toBe(false);
  });

  it('aceita texto UTF-8 e recusa binário', () => {
    expect(detectResumeKind(Buffer.from('Currículo de João', 'utf8'))).toMatchObject({ ok: true, kind: 'txt' });
    expect(detectResumeKind(Buffer.from([0x41, 0x00, 0x42])).ok).toBe(false);
    expect(detectResumeKind(Buffer.from([0xff, 0xfe, 0x41])).ok).toBe(false);
  });

  it('recusa arquivo vazio', () => {
    expect(detectResumeKind(Buffer.alloc(0)).ok).toBe(false);
  });
});

describe('sanitizeFileName', () => {
  it('remove caminho e caracteres perigosos', () => {
    expect(sanitizeFileName('..\\..\\windows\\system32\\cv<script>.pdf')).toBe('cvscript.pdf');
    expect(sanitizeFileName('/etc/passwd')).toBe('passwd');
  });

  it('usa nome padrão quando nada sobra', () => {
    expect(sanitizeFileName('<>:"|?*')).toBe('curriculo');
  });
});
