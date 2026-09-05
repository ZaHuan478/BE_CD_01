import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = fileURLToPath(new URL('../dist', import.meta.url))
if (resolve(output) !== resolve(backend, 'dist')) throw new Error('Invalid build output directory')
// Only generated output; never source files, uploads, or database snapshots.
await rm(output, { recursive: true, force: true })
