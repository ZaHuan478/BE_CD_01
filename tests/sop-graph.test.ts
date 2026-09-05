import { describe, expect, it } from 'vitest'
import { AppError } from '../src/common/errors.js'
import { validateGraph } from '../src/routes/sop.routes.js'
import type { SopContentInput } from '../src/schemas/sop.schemas.js'

const baseStep = {
  id: 'step-1',
  stableKey: 'stable-step-1',
  code: 'S1',
  title: 'Start',
  nodeKind: 'start' as const,
  sortOrder: 1
}

describe('SOP graph validation', () => {
  it('accepts backward and conditional transitions when references exist', () => {
    const content: SopContentInput = {
      steps: [baseStep, { ...baseStep, id: 'step-2', stableKey: 'stable-step-2', code: 'S2' }],
      transitions: [
        { fromStepId: 'step-1', toStepId: 'step-2', kind: 'conditional', condition: 'approved' },
        { fromStepId: 'step-2', toStepId: 'step-1', kind: 'return', condition: 'needs changes' }
      ]
    }
    expect(() => validateGraph(content)).not.toThrow()
  })

  it('rejects orphan transition references before SQL is called', () => {
    const content: SopContentInput = {
      steps: [baseStep],
      transitions: [{ fromStepId: 'step-1', toStepId: 'missing', kind: 'normal' }]
    }
    expect(() => validateGraph(content)).toThrowError(AppError)
    expect(() => validateGraph(content)).toThrowError(/Unknown toStepId/)
  })
})
