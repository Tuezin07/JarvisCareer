import type { FraudRiskLevel, FraudSignal } from '@jarvis/shared';
import { normalize } from '../connectors/text.js';

const RULES: Array<{ code: string; level: FraudRiskLevel; re: RegExp; label: string }> = [
  {
    code: 'PAYMENT_REQUEST',
    level: 'CRITICAL',
    label: 'Pede pagamento do candidato',
    re: /\b(taxa de (inscricao|cadastro|treinamento|matricula)|pagamento antecipado|pague (uma|a) taxa|deposito (previo|antecipado)|pix (para|de) (inscricao|cadastro)|investimento inicial|compre (o|seu) kit)\b/,
  },
  {
    code: 'SENSITIVE_DATA_REQUEST',
    level: 'HIGH',
    label: 'Pede dados sensíveis antes do processo',
    re: /\b(envie|enviar|informe|mande)\b.{0,40}\b(cpf|rg|dados bancarios|numero do cartao|senha|foto do documento)\b/,
  },
  {
    code: 'UNREALISTIC_PROMISE',
    level: 'HIGH',
    label: 'Promessa de ganho irreal',
    re: /\b(renda extra garantida|ganhe (ate )?r\$ ?\d[\d.]* (por|ao) dia|ganhos? ilimitados?|fique rico|sem experiencia.{0,30}r\$ ?\d{2}\.\d{3})\b/,
  },
  {
    code: 'OFF_PLATFORM_CONTACT',
    level: 'MODERATE',
    label: 'Contato fora da plataforma oficial',
    re: /\b(chame no whats ?app|whats ?app:? ?\(?\d{2}|telegram @|\S+@(gmail|hotmail|outlook|yahoo)\.com)/,
  },
];

const ORDER: FraudRiskLevel[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

/**
 * Sinais determinísticos de fraude no texto da vaga. Aponta evidências, não acusa:
 * a decisão de bloquear candidatura crítica é do Action Router (Fase 5), com revisão do candidato.
 */
export function detectFraudSignals(title: string, description: string): { risk: FraudRiskLevel; signals: FraudSignal[] } {
  const text = normalize(`${title}\n${description}`);
  const signals: FraudSignal[] = [];
  for (const r of RULES) {
    const m = r.re.exec(text);
    if (m) {
      const start = Math.max(0, m.index - 30);
      signals.push({ code: r.code, level: r.level, evidence: `${r.label}: "…${text.slice(start, m.index + m[0].length + 30).trim()}…"` });
    }
  }
  const risk = signals.reduce<FraudRiskLevel>((acc, s) => (ORDER.indexOf(s.level) > ORDER.indexOf(acc) ? s.level : acc), 'LOW');
  return { risk, signals };
}
