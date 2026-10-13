import { DynamicModule, Global, Module } from '@nestjs/common';
import { CandidatesModule } from './candidates/candidates.module';
import { APP_CONFIG, AppConfig, loadConfig } from './config';
import { DbModule } from './db/db.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthController } from './observability/health.controller';

@Global()
@Module({})
class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}

@Module({})
export class AppModule {
  /** Config is injected rather than read globally, so tests can boot the app against a test database. */
  static forRoot(config: AppConfig = loadConfig()): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), DbModule, JobsModule, CandidatesModule],
      controllers: [HealthController],
    };
  }
}
