import { Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { LlmClient } from './llm.client';
import { LLM_CLIENT, ScoringService } from './scoring.service';

@Module({
  providers: [
    {
      provide: LLM_CLIENT,
      inject: [APP_CONFIG],
      // No LLM_BASE_URL configured -> null client -> keyword scoring only. The app still works offline.
      useFactory: (config: AppConfig) =>
        config.llm.baseUrl
          ? new LlmClient({
              baseUrl: config.llm.baseUrl,
              apiKey: config.llm.apiKey,
              model: config.llm.model,
              timeoutMs: config.llm.timeoutMs,
            })
          : null,
    },
    ScoringService,
  ],
  exports: [ScoringService],
})
export class ScoringModule {}
