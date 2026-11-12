import { Module } from '@nestjs/common';
import { AnthropicProvider } from './anthropic.provider.js';
import { LLM_PROVIDER } from './llm-provider.js';
import { UsageService } from './usage.service.js';

/** Provedor de modelo e contabilidade de uso, compartilhados pela API e pelos workers. */
@Module({
  providers: [{ provide: LLM_PROVIDER, useClass: AnthropicProvider }, UsageService],
  exports: [LLM_PROVIDER, UsageService],
})
export class LlmModule {}
