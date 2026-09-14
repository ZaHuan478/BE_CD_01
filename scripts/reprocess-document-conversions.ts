import { Database } from '../src/database/database.js'
import { loadEnv } from '../src/config/env.js'
import { SopImportRepository } from '../src/repositories/sop-import.repository.js'
import { DocumentStorage } from '../src/services/document-storage.js'
import { extractSopPreview } from '../src/services/sop-import.extractor.js'
import type { StepInput } from '../src/schemas/sop.schemas.js'

function mergeStepEnrichment(previous: StepInput[], extracted: StepInput[]): StepInput[] {
  const byStableKey = new Map(previous.map(step => [step.stableKey, step]))
  const byTitle = new Map(previous.map(step => [step.title.trim().toLocaleLowerCase('vi'), step]))
  return extracted.map(step => {
    const old = byStableKey.get(step.stableKey) ?? byTitle.get(step.title.trim().toLocaleLowerCase('vi'))
    if (!old) return step
    return {
      ...step,
      actor: old.actor || step.actor,
      location: old.location || step.location,
      timing: old.timing || step.timing,
      imageUrl: old.imageUrl || step.imageUrl,
      illustrationPreset: old.illustrationPreset || step.illustrationPreset,
      inputs: old.inputs?.length ? old.inputs : step.inputs,
      outputs: old.outputs?.length ? old.outputs : step.outputs,
      positionX: old.positionX,
      positionY: old.positionY
    }
  })
}

const env = loadEnv()
const database = new Database(env)
const repository = new SopImportRepository(database)
const storage = new DocumentStorage(env)
let updated = 0
let failed = 0

try {
  await database.connect()
  const drafts = await repository.listReprocessableDrafts()
  const legacy = await repository.listWithoutSourceStructure()
  const jobs = [...new Map([...drafts, ...legacy].map(item => [item.id, item])).values()]
  for (const draft of jobs) {
    try {
      const buffer = await storage.read(draft.storageKey)
      const extracted = await extractSopPreview({
        buffer,
        mediaType: draft.file.mediaType,
        fileName: draft.file.name,
        code: draft.preview.code,
        title: draft.preview.title,
        category: draft.preview.category ?? undefined,
        primaryModuleId: draft.preview.primaryModuleId
      })
      const refreshedPreview = {
          ...extracted.preview,
          moduleIds: draft.preview.moduleIds,
          primaryModuleId: draft.preview.primaryModuleId,
          steps: mergeStepEnrichment(draft.preview.steps, extracted.preview.steps)
      }
      if (draft.status === 'needs_review') {
        await repository.replaceDraftExtraction(draft.id, {
          accountId: draft.createdBy,
          extractedText: extracted.extractedText,
          warnings: extracted.warnings,
          preview: refreshedPreview
        })
      } else if (!draft.preview.sourceStructure?.outline.length
        || (draft.preview.sourceStructure.adapter === 'docx-ocr' && draft.preview.sourceStructure.outline.length <= 1)) {
        const retainedWarnings = draft.warnings.filter(warning =>
          !warning.startsWith('Không trích xuất được văn bản')
          && !warning.startsWith('Không nhận diện được mã bước')
          && warning !== 'Đã bổ sung cây cấu trúc nguồn; các bước SOP đã duyệt được giữ nguyên.'
        )
        await repository.attachSourceStructureSnapshot(draft.id, {
          extractedText: extracted.extractedText,
          warnings: [...new Set([...retainedWarnings, ...extracted.warnings, 'Đã bổ sung cây cấu trúc nguồn; các bước SOP đã duyệt được giữ nguyên.'])],
          preview: { ...draft.preview, sourceStructure: extracted.preview.sourceStructure }
        })
      }
      updated += 1
      console.log(`Updated ${draft.id}: ${draft.file.name}`)
    } catch (error) {
      failed += 1
      console.error(`Failed ${draft.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  console.log(JSON.stringify({ scanned: jobs.length, updated, failed }))
  if (failed) process.exitCode = 1
} finally {
  await database.close()
}
