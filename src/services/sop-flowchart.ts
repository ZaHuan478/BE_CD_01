import type { SopContentInput } from '../schemas/sop.schemas.js'

export interface FlowValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  stepId?: string
  transitionId?: string
}

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\n', ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function wrapLabel(text: string, maxLen = 28): string {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (!current) current = word
    else if ((current + ' ' + word).length <= maxLen) current += ` ${word}`
    else { lines.push(current); current = word }
  }
  if (current) lines.push(current)
  return lines.join('<br/>')
}

function nodeMarkup(id: string, label: string, kind: SopContentInput['steps'][number]['nodeKind']): string {
  // The label pieces are escaped before they reach this function. Keep the
  // intentional <br/> markup while escaping quotes for Mermaid syntax.
  const safe = `"${label.replaceAll('"', '&quot;')}"`
  if (kind === 'start' || kind === 'end') return `${id}([${safe}])`
  if (kind === 'decision') return `${id}{${safe}}`
  if (kind === 'subprocess') return `${id}[[${safe}]]`
  if (kind === 'parallel_fork' || kind === 'parallel_join') return `${id}{{${safe}}}`
  return `${id}(${safe})`
}

export function inspectSopGraph(content: SopContentInput): { valid: boolean; issues: FlowValidationIssue[] } {
  const issues: FlowValidationIssue[] = []
  const stepIds = new Set<string>()
  const stableKeys = new Set<string>()
  const stepCodes = new Set<string>()
  const transitionIds = new Set<string>()
  const sortOrders = new Map<number, string>()

  if (!content.steps.length) {
    issues.push({ severity: 'error', code: 'EMPTY_FLOW', message: 'Quy trình phải có ít nhất một bước.' })
  }

  for (const step of content.steps) {
    if (stepIds.has(step.id)) issues.push({ severity: 'error', code: 'DUPLICATE_STEP_ID', message: `Trùng mã nội bộ bước ${step.id}.`, stepId: step.id })
    if (stableKeys.has(step.stableKey)) issues.push({ severity: 'error', code: 'DUPLICATE_STABLE_KEY', message: `Trùng khóa ổn định ${step.stableKey}.`, stepId: step.id })
    if (stepCodes.has(step.code)) issues.push({ severity: 'error', code: 'DUPLICATE_STEP_CODE', message: `Trùng mã bước ${step.code}.`, stepId: step.id })
    if (step.sortOrder < 1) issues.push({ severity: 'warning', code: 'INVALID_SORT_ORDER', message: `Bước ${step.code} có thứ tự không hợp lệ.`, stepId: step.id })
    const previousOrder = sortOrders.get(step.sortOrder)
    if (previousOrder) issues.push({ severity: 'warning', code: 'DUPLICATE_SORT_ORDER', message: `Bước ${step.code} trùng thứ tự hiển thị với ${previousOrder}.`, stepId: step.id })
    else sortOrders.set(step.sortOrder, step.code)
    stepIds.add(step.id)
    stableKeys.add(step.stableKey)
    stepCodes.add(step.code)
  }

  const incoming = new Map(content.steps.map(step => [step.id, 0]))
  const outgoing = new Map(content.steps.map(step => [step.id, 0]))
  const adjacency = new Map(content.steps.map(step => [step.id, [] as string[]]))
  const validTransitions: Array<{ id?: string; from: string; to: string; kind: string; label: string }> = []
  for (const transition of content.transitions) {
    const transitionId = transition.id ?? undefined
    if (transitionId && transitionIds.has(transitionId)) issues.push({ severity: 'error', code: 'DUPLICATE_TRANSITION_ID', message: `Trùng mã đường nối ${transitionId}.`, transitionId })
    if (transitionId) transitionIds.add(transitionId)
    const hasSource = Boolean(transition.fromStepId && stepIds.has(transition.fromStepId))
    const hasTarget = Boolean(transition.toStepId && stepIds.has(transition.toStepId))
    if (!hasSource) {
      issues.push({ severity: 'error', code: 'INVALID_TRANSITION_SOURCE', message: 'Đường nối có bước nguồn không tồn tại.', transitionId })
    } else {
      outgoing.set(transition.fromStepId!, (outgoing.get(transition.fromStepId!) ?? 0) + 1)
    }
    if (!hasTarget) {
      issues.push({ severity: 'error', code: 'INVALID_TRANSITION_TARGET', message: 'Đường nối có bước đích không tồn tại.', transitionId })
    } else {
      incoming.set(transition.toStepId!, (incoming.get(transition.toStepId!) ?? 0) + 1)
    }
    if (hasSource && hasTarget) {
      const from = transition.fromStepId!
      const to = transition.toStepId!
      adjacency.get(from)!.push(to)
      validTransitions.push({ id: transitionId, from, to, kind: transition.kind, label: transition.branchLabel?.trim() || transition.condition?.trim() || '' })
      if (from === to && transition.kind !== 'return') issues.push({ severity: 'warning', code: 'SELF_LOOP', message: 'Đường nối quay lại chính bước đó; hãy xác nhận đây là chủ ý.', transitionId })
    }
  }

  const starts = content.steps.filter(step => step.nodeKind === 'start')
  const ends = content.steps.filter(step => step.nodeKind === 'end')
  if (!starts.length) issues.push({ severity: 'warning', code: 'SYNTHETIC_START', message: 'Lưu đồ sẽ tự bổ sung nút Bắt đầu khi hiển thị.' })
  if (starts.length > 1) issues.push({ severity: 'warning', code: 'MULTIPLE_STARTS', message: 'Quy trình có nhiều nút Bắt đầu; hãy kiểm tra lại.' })
  if (!ends.length) issues.push({ severity: 'warning', code: 'SYNTHETIC_END', message: 'Lưu đồ sẽ tự bổ sung nút Kết thúc khi hiển thị.' })

  const roots = starts.length ? starts.map(step => step.id) : content.steps.filter(step => (incoming.get(step.id) ?? 0) === 0).map(step => step.id)
  if (content.steps.length > 1 && !roots.length) issues.push({ severity: 'warning', code: 'NO_ROOT_NODE', message: 'Lưu đồ không có bước bắt đầu hoặc bước gốc để đi vào.' })
  const reachable = new Set<string>()
  const pending = [...roots]
  while (pending.length) {
    const current = pending.pop()!
    if (reachable.has(current)) continue
    reachable.add(current)
    for (const next of adjacency.get(current) ?? []) pending.push(next)
  }
  for (const step of content.steps) {
    if (content.steps.length > 1 && !reachable.has(step.id)) {
      issues.push({ severity: 'warning', code: 'UNREACHABLE_STEP', message: `Bước ${step.code} không thể đi tới từ điểm bắt đầu.`, stepId: step.id })
    }
  }
  for (const step of content.steps) {
    if (step.nodeKind === 'decision' && (outgoing.get(step.id) ?? 0) < 2) {
      issues.push({ severity: 'warning', code: 'DECISION_BRANCH_REQUIRED', message: `Bước điều kiện ${step.code} cần ít nhất hai nhánh.`, stepId: step.id })
    }
    if (step.nodeKind === 'decision') {
      const branches = validTransitions.filter(transition => transition.from === step.id)
      const labels = branches.map(transition => transition.label).filter(Boolean)
      if (branches.length >= 2 && branches.some(transition => !transition.label)) {
        issues.push({ severity: 'warning', code: 'DECISION_BRANCH_LABEL_REQUIRED', message: `Các nhánh của bước ${step.code} nên có nhãn điều kiện.`, stepId: step.id })
      }
      if (new Set(labels).size !== labels.length) {
        issues.push({ severity: 'warning', code: 'DUPLICATE_BRANCH_LABEL', message: `Bước điều kiện ${step.code} có nhãn nhánh trùng nhau.`, stepId: step.id })
      }
    }
    if (content.steps.length > 1 && step.nodeKind !== 'start' && step.nodeKind !== 'end'
      && (incoming.get(step.id) ?? 0) === 0 && (outgoing.get(step.id) ?? 0) === 0) {
      issues.push({ severity: 'warning', code: 'ISOLATED_STEP', message: `Bước ${step.code} chưa được nối vào lưu đồ.`, stepId: step.id })
    }
  }

  return { valid: !issues.some(issue => issue.severity === 'error'), issues }
}

export function buildMermaidSource(content: SopContentInput): string {
  const sortedSteps = [...content.steps].sort((left, right) => left.sortOrder - right.sortOrder)
  if (!sortedSteps.length) return 'flowchart TD\n  empty("Chưa có bước nghiệp vụ")'

  const nodeIds = new Map(sortedSteps.map((step, index) => [step.id, `step${index + 1}`]))
  const lines = ['flowchart TD']
  for (const step of sortedSteps) {
    const safeCode = escapeText(step.code)
    const safeTitle = wrapLabel(escapeText(step.title), 26)
    const safeActor = step.actor?.trim() ? escapeText(step.actor) : ''
    const label = safeActor ? `${safeCode} · ${safeTitle}<br/><small>${safeActor}</small>` : `${safeCode} · ${safeTitle}`
    lines.push(`  ${nodeMarkup(nodeIds.get(step.id)!, label, step.nodeKind)}`)
  }

  const usableTransitions = [...content.transitions]
    .filter(transition => transition.fromStepId && transition.toStepId && nodeIds.has(transition.fromStepId) && nodeIds.has(transition.toStepId))
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
  const incoming = new Map(sortedSteps.map(step => [step.id, 0]))
  const outgoing = new Map(sortedSteps.map(step => [step.id, 0]))
  for (const transition of usableTransitions) {
    incoming.set(transition.toStepId!, (incoming.get(transition.toStepId!) ?? 0) + 1)
    outgoing.set(transition.fromStepId!, (outgoing.get(transition.fromStepId!) ?? 0) + 1)
    const from = nodeIds.get(transition.fromStepId!)!
    const to = nodeIds.get(transition.toStepId!)!
    const label = escapeText(transition.branchLabel?.trim() || transition.condition?.trim() || '')
    const arrow = transition.kind === 'return' ? '-.->' : transition.kind === 'parallel_fork' || transition.kind === 'parallel_join' ? '==>' : '-->'
    lines.push(label ? `  ${from} ${arrow}|${label}| ${to}` : `  ${from} ${arrow} ${to}`)
  }

  const explicitStarts = sortedSteps.filter(step => step.nodeKind === 'start')
  if (!explicitStarts.length) {
    lines.push('  generatedStart(["Bắt đầu"])')
    const roots = sortedSteps.filter(step => (incoming.get(step.id) ?? 0) === 0)
    for (const root of roots.length ? roots : [sortedSteps[0]!]) lines.push(`  generatedStart --> ${nodeIds.get(root.id)}`)
  }
  const explicitEnds = sortedSteps.filter(step => step.nodeKind === 'end')
  if (!explicitEnds.length) {
    lines.push('  generatedEnd(["Kết thúc"])')
    const leaves = sortedSteps.filter(step => (outgoing.get(step.id) ?? 0) === 0)
    for (const leaf of leaves.length ? leaves : [sortedSteps.at(-1)!]) lines.push(`  ${nodeIds.get(leaf.id)} --> generatedEnd`)
  }

  lines.push('  classDef startEnd fill:#ecfdf5,stroke:#10b981,color:#065f46,stroke-width:2px')
  lines.push('  classDef task fill:#f0f9ff,stroke:#0284c7,color:#0c4a6e,stroke-width:1.5px')
  lines.push('  classDef decision fill:#fffbeb,stroke:#f59e0b,color:#92400e,stroke-width:2px')
  lines.push('  classDef subprocess fill:#faf5ff,stroke:#8b5cf6,color:#581c87,stroke-width:2px')
  const startEndIds = sortedSteps.filter(step => step.nodeKind === 'start' || step.nodeKind === 'end').map(step => nodeIds.get(step.id)!)
  if (!explicitStarts.length) startEndIds.push('generatedStart')
  if (!explicitEnds.length) startEndIds.push('generatedEnd')
  if (startEndIds.length) lines.push(`  class ${startEndIds.join(',')} startEnd`)
  const taskIds = sortedSteps.filter(step => ['task', 'parallel_fork', 'parallel_join'].includes(step.nodeKind)).map(step => nodeIds.get(step.id)!)
  const decisionIds = sortedSteps.filter(step => step.nodeKind === 'decision').map(step => nodeIds.get(step.id)!)
  const subprocessIds = sortedSteps.filter(step => step.nodeKind === 'subprocess').map(step => nodeIds.get(step.id)!)
  if (taskIds.length) lines.push(`  class ${taskIds.join(',')} task`)
  if (decisionIds.length) lines.push(`  class ${decisionIds.join(',')} decision`)
  if (subprocessIds.length) lines.push(`  class ${subprocessIds.join(',')} subprocess`)
  return lines.join('\n')
}
