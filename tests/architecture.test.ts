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
      'access', 'administration', 'auth', 'bootstrap', 'chat', 'core8', 'health', 'knowledge', 'me', 'module', 'rag', 'runtime', 'search', 'sop-import', 'sop-workspace', 'sop', 'system-glossary', 'system-guide', 'user-document'
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

describe('runtime schema readiness', () => {
  it('ensures additive SOP schemas before accepting requests', () => {
    const server = readFileSync(join(root, 'server.ts'), 'utf8')
    const listenPosition = server.indexOf('await app.listen')

    expect(server).toContain('await ensureSopImportSchema(database)')
    expect(server).toContain('await ensureAdministrationSchema(database)')
    expect(server).toContain('await ensureUserDocumentSchema(database)')
    expect(server).toContain('await ensureModuleNavigationSchema(database)')
    expect(server).toContain('await ensureRagSchema(database)')
    expect(server).toContain('await ensureSystemGuideSchema(database)')
    expect(server).toContain('await ensureSystemGlossarySchema(database)')
    expect(server.indexOf('await ensureAdministrationSchema(database)')).toBeLessThan(listenPosition)
  })
})

