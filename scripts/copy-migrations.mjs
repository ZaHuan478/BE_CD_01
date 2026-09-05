import { copyFile, cp, mkdir, readdir } from 'node:fs/promises'

await mkdir(new URL('../dist/database/migrations/', import.meta.url), { recursive: true })
const migrationSource = new URL('../src/database/migrations/', import.meta.url)
const migrationTarget = new URL('../dist/database/migrations/', import.meta.url)
const migrationFiles = (await readdir(migrationSource)).filter((file) => file.endsWith('.mysql.sql'))
await Promise.all(migrationFiles.map((file) =>
  copyFile(new URL(file, migrationSource), new URL(file, migrationTarget))))

await mkdir(new URL('../dist/database/seeds/', import.meta.url), { recursive: true })
await cp(
  new URL('../src/database/seeds/', import.meta.url),
  new URL('../dist/database/seeds/', import.meta.url),
  { recursive: true }
)
