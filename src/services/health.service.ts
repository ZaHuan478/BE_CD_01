import type { HealthRepository } from '../repositories/health.repository.js'

export class HealthService {
  constructor(private readonly repository: HealthRepository) {}
  live() { return { status: 'ok' } }
  async ready() { return { status: 'ready', database: await this.repository.databaseName() } }
}
