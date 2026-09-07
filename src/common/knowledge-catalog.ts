import { createHash } from 'node:crypto'
import { allRuntimeModuleIds, scopeRuntimeDatasets } from './dataset-scope.js'

export type JsonObject = Record<string, unknown>
export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface KnowledgeDocument {
  id: string
  code: string
  title: string
  type: 'procedure' | 'policy'
  summary: string
  workflowId: string | null
  sourceKey: string
  moduleIds: string[]
  content: JsonObject
}

function idFor(key: string): string {
  return 'doc-' + createHash('sha256').update(key).digest('hex').slice(0, 32)
}

/** Preserve original content and workflow context; never deduplicate by code alone. */
export function buildKnowledgeCatalog(workflows: unknown, policies: unknown): KnowledgeDocument[] {
  const documents: KnowledgeDocument[] = []
  const visible = new Map(allRuntimeModuleIds.map(moduleId => [moduleId, scopeRuntimeDatasets({
    'workflow.sopDatabase': workflows, 'policy.registry': policies
  }, [moduleId])]))
  if (isObject(workflows)) {
    for (const [workflowId, processes] of Object.entries(workflows)) {
      if (!Array.isArray(processes)) throw new Error(`Invalid workflow: ${workflowId}`)
      const codes = new Set<string>()
      for (const process of processes) {
        if (!isObject(process) || typeof process.sopCode !== 'string' || typeof process.sopTitle !== 'string') {
          throw new Error(`Invalid SOP in workflow: ${workflowId}`)
        }
        if (codes.has(process.sopCode)) throw new Error(`Duplicate SOP code in workflow: ${workflowId}`)
        codes.add(process.sopCode)
        const sourceKey = JSON.stringify(['workflow.sopDatabase', workflowId, process.sopCode])
        const moduleIds = [...visible].filter(([, datasets]) => {
          const scoped = datasets['workflow.sopDatabase'] as Record<string, JsonObject[]>
          return scoped[workflowId]?.some(item => item.sopCode === process.sopCode)
        }).map(([moduleId]) => moduleId)
        documents.push({ id: idFor(sourceKey), code: process.sopCode, title: process.sopTitle,
          type: 'procedure', summary: String(process.description ?? ''), workflowId, sourceKey, moduleIds, content: process })
      }
    }
  } else throw new Error('workflow.sopDatabase must be an object')
  if (!Array.isArray(policies)) throw new Error('policy.registry must be an array')
  const policyIds = new Set<string>()
  for (const policy of policies) {
    if (!isObject(policy) || typeof policy.id !== 'string' || typeof policy.title !== 'string') throw new Error('Invalid policy')
    if (policyIds.has(policy.id)) throw new Error(`Duplicate policy: ${policy.id}`)
    policyIds.add(policy.id)
    const sourceKey = JSON.stringify(['policy.registry', policy.id])
    const moduleIds = [...visible].filter(([, datasets]) =>
      (datasets['policy.registry'] as JsonObject[]).some(item => item.id === policy.id)).map(([moduleId]) => moduleId)
    documents.push({ id: idFor(sourceKey), code: String(policy.code ?? policy.id), title: policy.title,
      type: 'policy', summary: String(policy.summary ?? policy.description ?? ''), workflowId: null,
      sourceKey, moduleIds, content: policy })
  }
  return documents.sort((a, b) => a.id.localeCompare(b.id))
}

export function summarizeDocument({ content: _content, sourceKey: _sourceKey, ...summary }: KnowledgeDocument) {
  return summary
}

/** Navigation metadata only. Details/checklists remain on the workflow detail endpoint. */
export function workflowIndex(value: unknown): Record<string, unknown[]> {
  if (!isObject(value)) throw new Error('Invalid workflow dataset')
  return Object.fromEntries(Object.entries(value).map(([id, processes]) => [id,
    (Array.isArray(processes) ? processes : []).filter(isObject).map(process => ({
      sopCode: process.sopCode, sopTitle: process.sopTitle, sopCategory: process.sopCategory,
      description: process.description,
      inputs: process.inputs, outputs: process.outputs, rules: process.rules,
      sourceNote: process.sourceNote, notes: process.notes,
      steps: (Array.isArray(process.steps) ? process.steps : []).filter(isObject).map(step => ({
        stepCode: step.stepCode, title: step.title, actor: step.actor, typeCode: step.typeCode,
        sourceTypeCode: step.sourceTypeCode, fieldsChecklist: step.fieldsChecklist
      }))
    }))
  ]))
}
