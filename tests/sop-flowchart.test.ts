import { describe, expect, it } from 'vitest'
import type { CreateSopBody } from '../src/schemas/sop.schemas.js'
import { buildMermaidSource, inspectSopGraph } from '../src/services/sop-flowchart.js'

function preview(): CreateSopBody {
  return {
    code: 'SOP-TEST-01',
    title: 'Kiểm tra lưu đồ',
    category: null,
    moduleIds: ['EMP'],
    primaryModuleId: 'EMP',
    steps: [
      {
        id: 'step-a', stableKey: 'step-a', code: 'A.01', title: 'Tiếp nhận hồ sơ',
        actor: 'Nhân sự', nodeKind: 'task', typeCode: 'N', sortOrder: 1
      },
      {
        id: 'step-b', stableKey: 'step-b', code: 'A.02', title: 'Hồ sơ hợp lệ?',
        actor: 'Người kiểm soát', nodeKind: 'decision', typeCode: 'C', sortOrder: 2
      },
      {
        id: 'step-c', stableKey: 'step-c', code: 'A.03', title: 'Phê duyệt',
        actor: 'Trưởng phòng', nodeKind: 'task', typeCode: 'M', sortOrder: 3
      }
    ],
    transitions: [
      { id: 'edge-a', fromStepId: 'step-a', toStepId: 'step-b', kind: 'normal', sortOrder: 1 },
      { id: 'edge-b', fromStepId: 'step-b', toStepId: 'step-c', kind: 'conditional', branchLabel: 'Có', sortOrder: 2 },
      { id: 'edge-c', fromStepId: 'step-b', toStepId: 'step-a', kind: 'return', branchLabel: 'Không', sortOrder: 3 }
    ]
  }
}

describe('SOP Mermaid flowchart', () => {
  it('builds Mermaid for existing previews and supplies visual start/end nodes', () => {
    const source = buildMermaidSource(preview())
    expect(source).toContain('flowchart TD')
    expect(source).toContain('generatedStart(["Bắt đầu"])')
    expect(source).toContain('generatedEnd(["Kết thúc"])')
    expect(source).toContain('step1("A.01 · Tiếp nhận hồ sơ<br/>')
    expect(source).not.toContain('step1(""')
    expect(source).toContain('-->|Có|')
    expect(source).toContain('-.->|Không|')
  })

  it('reports incomplete decisions as warnings without rejecting a structurally valid flow', () => {
    const content = preview()
    content.transitions = content.transitions.slice(0, 2)
    const result = inspectSopGraph(content)
    expect(result.valid).toBe(true)
    expect(result.issues.map(issue => issue.code)).toContain('DECISION_BRANCH_REQUIRED')
  })

  it('rejects dangling transitions and escapes labels before rendering', () => {
    const content = preview()
    content.steps[0]!.title = 'Nhập <script>alert("x")</script>'
    content.transitions.push({ id: 'broken', fromStepId: 'missing', toStepId: 'step-a', kind: 'normal' })
    expect(inspectSopGraph(content).valid).toBe(false)
    const source = buildMermaidSource(content)
    expect(source).not.toContain('<script>')
    expect(source).toContain('&lt;script&gt;')
  })

  it('reports disconnected steps and unlabeled decision branches', () => {
    const content = preview()
    content.steps.push({
      id: 'step-orphan', stableKey: 'step-orphan', code: 'A.99', title: 'Bước rời',
      actor: null, nodeKind: 'task', typeCode: 'N', sortOrder: 4
    })
    content.steps.push({
      id: 'step-isolated', stableKey: 'step-isolated', code: 'A.98', title: 'Bước chưa nối',
      actor: null, nodeKind: 'task', typeCode: 'N', sortOrder: 5
    })
    content.steps.push({
      id: 'step-unreachable', stableKey: 'step-unreachable', code: 'A.97', title: 'Bước ngoài luồng',
      actor: null, nodeKind: 'task', typeCode: 'N', sortOrder: 6
    })
    content.transitions = content.transitions.filter(transition => transition.id !== 'edge-c')
    content.transitions.push({ id: 'edge-unlabeled', fromStepId: 'step-b', toStepId: 'step-orphan', kind: 'conditional', sortOrder: 3 })
    content.transitions.push({ id: 'edge-unreachable', fromStepId: 'step-unreachable', toStepId: 'step-unreachable', kind: 'return', sortOrder: 4 })
    const result = inspectSopGraph(content)
    expect(result.valid).toBe(true)
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'UNREACHABLE_STEP', 'DECISION_BRANCH_LABEL_REQUIRED'
    ]))
  })
})
