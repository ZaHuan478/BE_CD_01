import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const routeNames = readdirSync(join(root, 'routes')).filter((file) => file.endsWith('.routes.ts')).sort()
const routeFiles = routeNames.map((file) => join(root, 'routes', file))
describe('HTTP layer boundaries', () => {
  it('groups API areas into matching route, controller, service and repository folders', () => {
    expect(routeNames.map((file) => file.replace('.routes.ts', ''))).toEqual([
      'access', 'auth', 'bootstrap', 'core8', 'health', 'knowledge', 'me', 'module', 'runtime', 'search', 'sop-import', 'sop'
    ])
    for (const route of routeNames) {
      for (const [folder, suffix] of [['controllers', 'controller'], ['services', 'service'], ['repositories', 'repository']]) {
        expect(existsSync(join(root, folder!, route.replace('.routes.ts', `.${suffix}.ts`)))).toBe(true)
      }
    }
    expect(existsSync(join(root, 'modules'))).toBe(false)
  })
  for (const file of routeFiles) {
    it(file.split('src')[1] + ' delegates to controllers without database calls', () => {
      const source = readFileSync(file, 'utf8')
      expect(source).toContain('.controller.js')
      expect(source).not.toMatch(/\.query\s*\(|\.transaction\s*\(|\.authenticate\s*\(/)
    })
  }
})
