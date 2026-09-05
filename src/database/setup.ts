import { loadEnv } from '../config/env.js'
import { initializeDatabase } from './initialize.js'

try {
  await initializeDatabase(loadEnv())
} catch (error) {
  // Avoid printing SQL parameters (which may contain personal data).
  console.error('Database setup failed:', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
}
