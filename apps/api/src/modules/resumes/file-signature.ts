import type { ResumeKind } from '@jarvis/shared';

export type SignatureResult =
  | { ok: true; kind: ResumeKind; mimeType: string }
  | { ok: false; reason: string };

const PDF = Buffer.from('%PDF-');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/**
 * Identifica o tipo real do arquivo pelo conteúdo. A extensão e o Content-Type
 * enviados pelo navegador são ignorados: ambos podem ser forjados.
 */
export function detectResumeKind(buf: Buffer): SignatureResult {
  if (buf.length === 0) return { ok: false, reason: 'Arquivo vazio' };

  if (buf.subarray(0, PDF.length).equals(PDF)) {
    return { ok: true, kind: 'pdf', mimeType: 'application/pdf' };
  }

  if (buf.subarray(0, ZIP.length).equals(ZIP)) {
    // DOCX é um ZIP; os nomes das entradas ficam sem compressão no diretório central.
    if (buf.includes('word/document.xml')) {
      return {
        ok: true,
        kind: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }
    return { ok: false, reason: 'Arquivo compactado não é um documento Word (.docx)' };
  }

  if (buf.subarray(0, OLE.length).equals(OLE)) {
    return {
      ok: false,
      reason: 'Formato .doc antigo ainda não é suportado. Salve como PDF ou DOCX e envie novamente.',
    };
  }

  const head = buf.subarray(0, 8192);
  if (!head.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buf);
      return { ok: true, kind: 'txt', mimeType: 'text/plain; charset=utf-8' };
    } catch {
      return { ok: false, reason: 'Texto precisa estar em UTF-8' };
    }
  }

  return { ok: false, reason: 'Formato não suportado. Envie PDF, DOCX ou TXT.' };
}

/** Nome exibido ao candidato: sem caminho, sem caracteres de controle, tamanho limitado. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'curriculo';
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim();
  return (clean || 'curriculo').slice(0, 120);
}
