import type { HealthService } from '../services/health.service.js'

export class HealthController {
  constructor(private readonly service: HealthService) {}
  live() { return this.service.live() }
  ready() { return this.service.ready() }
}
