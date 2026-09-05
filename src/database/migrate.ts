import { loadEnv } from '../config/env.js'
import { initializeDatabase } from './initialize.js'

// Schema only. Use db:setup for snapshot import or explicit demo seeding.
await initializeDatabase(loadEnv(), true)
