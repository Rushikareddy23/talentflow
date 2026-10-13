import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { Database } from '../db/db.module';
import { registry } from './metrics';

@Controller()
export class HealthController {
  constructor(private readonly db: Database) {}

  /** Readiness probe: 200 only when the database answers. */
  @Get('health')
  async health() {
    const started = Date.now();
    try {
      await this.db.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
    return { status: 'ok', database: 'up', dbLatencyMs: Date.now() - started };
  }

  @Get('metrics')
  @Header('Content-Type', registry.contentType)
  metrics(): Promise<string> {
    return registry.metrics();
  }
}
