import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/config/env.js'
import { Database } from '../src/database/database.js'

const env = loadEnv()
env.logLevel = 'silent'
const database = new Database(env)
const app = await buildApp({ env, database })
try {
  const accounts = await database.query<{ AccountId: string }>('SELECT AccountId FROM Account WHERE IsActive = 1')
  for (const { AccountId } of accounts) {
    for (const url of ['/api/v1/me', '/api/v1/me/modules']) {
      const response = await app.inject({ method: 'GET', url, headers: { 'x-user-id': AccountId } })
      if (response.statusCode !== 200) throw new Error(`${AccountId} ${url}: ${response.statusCode} ${response.body}`)
    }
  }
  console.log(JSON.stringify({ accounts: accounts.length, successfulRequests: accounts.length * 2 }))
} finally {
  await app.close()
  await database.close()
}
