import type { QueryRunner } from '../database/database.js'

export class HealthRepository {
  constructor(private readonly database: QueryRunner) {}
  async databaseName(): Promise<string | undefined> {
    const [row] = await this.database.query<{ databaseName: string }>('SELECT DATABASE() AS databaseName')
    return row?.databaseName
  }
}
