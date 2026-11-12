/**
 * Gera um PDF válido de uma página com texto selecionável (Helvetica, ASCII),
 * calculando os offsets da tabela xref. Usado nos testes para não versionar binários.
 */
export function makePdf(lines: string[]): Buffer {
  const escape = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = [
    'BT',
    '/F1 12 Tf',
    '50 790 Td',
    ...lines.map((l, i) => `${i === 0 ? '' : '0 -16 Td '}(${escape(l)}) Tj`),
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body, 'latin1');
}

export const SAMPLE_RESUME_LINES = [
  'Ana Souza - Desenvolvedora Junior',
  'Curitiba - PR | ana.souza@example.com',
  'Resumo: estudante de Analise e Desenvolvimento de Sistemas com projetos em TypeScript.',
  'Experiencia: Estagio em suporte tecnico - Empresa Exemplo (2025-03 a 2025-12).',
  'Atendimento a usuarios, configuracao de estacoes Windows e documentacao de chamados.',
  'Formacao: Tecnologo em ADS - Instituicao Exemplo (em andamento).',
  'Competencias: TypeScript, React, Node.js, SQL, Git, comunicacao, trabalho em equipe.',
  'Idiomas: Ingles intermediario.',
];
