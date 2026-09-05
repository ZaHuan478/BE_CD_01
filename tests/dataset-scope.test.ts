import { describe, expect, it } from 'vitest'
import { scopeRuntimeDatasets } from '../src/common/dataset-scope.js'

const fixture = {
  'coreOperations.config': {
    stageMap: {
      emp: { id: 'emp', stages: [{ sopCodes: ['SOP-EMP-01'] }] },
      pay: { id: 'pay', stages: [{ sopCodes: ['SOP-PAY-01'] }] },
      tax: { id: 'tax', stages: [{ sopCodes: ['SOP-TAX-01'] }] }
    },
    workflowBySopCode: {
      'SOP-EMP-01': 'LIFE-05',
      'SOP-PAY-01': 'MODULE-PAY',
      'SOP-TAX-01': 'MODULE-TAX'
    },
    knownWireframeIds: [],
    legalReferences: [
      { id: 'employee-law', affectedModules: ['emp'] },
      { id: 'tax-law', affectedModules: ['tax'] }
    ]
  },
  'workflow.sopDatabase': {
    'LIFE-05': [
      { sopCode: 'SOP PAY01', sopTitle: 'Payroll' },
      { sopCode: 'SOP-EMP-08', sopTitle: 'Employee income review' }
    ],
    'MODULE-TAX': [{ sopCode: 'SOP-TAX-01', sopTitle: 'Tax' }],
    'LIFE-02': [{ sopCode: 'SOP-EMP-04', sopTitle: 'Employee profile' }]
  },
  'sop.dictionary': {},
  'crossFunctional.registry': {},
  'page.businessNodes': {
    masterData: [], lifecycleProcesses: [], crossFunctionalProcesses: [], sharedServices: [], sops: [], relationships: []
  },
  'lifecycle.journey': { scenarios: [], stages: {}, stageOrder: [] },
  'lifecycleStepper.modules': { stepModuleMap: {}, moduleFilterOptions: [] },
  'matrix.subsystems': { subsystems: [], flows: [] },
  'crossModule.flows': {},
  'policy.registry': [],
  'legacy.data': { lifecycleMockNodes: [] },
  translations: { title: 'shared UI label' }
}

describe('frontend dataset authorization scope', () => {
  it('removes payroll and tax content from an HR-only bootstrap', () => {
    const scoped = scopeRuntimeDatasets(fixture, ['emp'])
    const core = scoped['coreOperations.config'] as typeof fixture['coreOperations.config']
    const workflows = scoped['workflow.sopDatabase'] as Record<string, Array<{ sopCode: string }>>

    expect(Object.keys(core.stageMap)).toEqual(['emp'])
    expect(core.legalReferences.map((item) => item.id)).toEqual(['employee-law'])
    expect(workflows['LIFE-05']?.map((item) => item.sopCode)).toEqual(['SOP-EMP-08'])
    expect(workflows['MODULE-TAX']).toBeUndefined()
  })

  it('returns payroll data but not employee-only rows to accounting', () => {
    const scoped = scopeRuntimeDatasets(fixture, ['pay', 'tax'])
    const core = scoped['coreOperations.config'] as typeof fixture['coreOperations.config']
    const workflows = scoped['workflow.sopDatabase'] as Record<string, Array<{ sopCode: string }>>

    expect(Object.keys(core.stageMap)).toEqual(['pay', 'tax'])
    expect(core.legalReferences.map((item) => item.id)).toEqual(['tax-law'])
    expect(workflows['LIFE-05']?.map((item) => item.sopCode)).toEqual(['SOP PAY01'])
    expect(workflows['MODULE-TAX']?.map((item) => item.sopCode)).toEqual(['SOP-TAX-01'])
  })

  it('keeps an authorized shared workflow frame without exposing restricted SOP details', () => {
    const scoped = scopeRuntimeDatasets(fixture, ['onb'])
    const workflows = scoped['workflow.sopDatabase'] as Record<string, Array<{ sopCode: string }>>

    expect(workflows['LIFE-02']).toEqual([])
    expect(workflows['LIFE-05']).toBeUndefined()
  })
})
