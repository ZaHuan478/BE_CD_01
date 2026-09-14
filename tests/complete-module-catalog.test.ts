import { describe, expect, it } from 'vitest'
import { COMPLETE_MODULE_CATALOG, DERIVED_MODULE_BINDINGS } from '../src/database/complete-module-catalog.js'

describe('complete module catalog', () => {
  it('defines 29 unique modules in the four business clusters', () => {
    expect(COMPLETE_MODULE_CATALOG).toHaveLength(29)
    expect(new Set(COMPLETE_MODULE_CATALOG.map(module => module.id)).size).toBe(29)
    expect(new Set(COMPLETE_MODULE_CATALOG.map(module => module.code)).size).toBe(29)
    expect(Object.fromEntries(['core', 'people', 'organization', 'platform'].map(cluster => [
      cluster,
      COMPLETE_MODULE_CATALOG.filter(module => module.businessCluster === cluster).length
    ]))).toEqual({ core: 9, people: 6, organization: 5, platform: 9 })
  })

  it('assigns every derived module to a persisted workflow', () => {
    const coreIds = new Set(['ats', 'onb', 'emp', 'att', 'leave', 'pay', 'ins', 'tax', 'ess'])
    const derivedIds = COMPLETE_MODULE_CATALOG.map(module => module.id).filter(id => !coreIds.has(id))
    expect(new Set(DERIVED_MODULE_BINDINGS.map(binding => binding.moduleId))).toEqual(new Set(derivedIds))
  })
})
