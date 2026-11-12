import Anthropic from '@anthropic-ai/sdk';
import { HttpException } from '@nestjs/common';
import { LlmNotConfiguredError, LlmRefusalError } from './llm-provider.js';

/** Mensagem segura para o candidato: erros de domínio passam, detalhes do provedor não. */
export function publicLlmErrorMessage(err: unknown): string {
  if (err instanceof HttpException || err instanceof LlmNotConfiguredError) return err.message;
  if (err instanceof LlmRefusalError) return 'O modelo recusou esta solicitação.';
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
    return 'O serviço de IA está sobrecarregado agora. Tente novamente em alguns instantes.';
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return 'A credencial do serviço de IA foi recusada. Verifique a ANTHROPIC_API_KEY.';
  }
  if (err instanceof Anthropic.APIConnectionError) return 'Não foi possível falar com o serviço de IA. Verifique a conexão.';
  // Inclui conta sem créditos, que a API devolve como 400 invalid_request_error.
  if (err instanceof Anthropic.BadRequestError) {
    return 'O serviço de IA recusou a requisição. Verifique se a conta Anthropic tem créditos e se a configuração está correta.';
  }
  return 'Erro inesperado ao usar a IA. A operação foi registrada.';
}

/** Só falhas transitórias merecem nova tentativa; o resto falharia igual. */
export function isTransientLlmError(err: unknown): boolean {
  return (
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.InternalServerError ||
    err instanceof Anthropic.APIConnectionError ||
    !(err instanceof Anthropic.APIError || err instanceof HttpException || err instanceof LlmRefusalError || err instanceof LlmNotConfiguredError)
  );
}
