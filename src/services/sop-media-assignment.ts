import type { SourceMedia, StepInput, StepMedia, StepMediaRole, SourceStructure, SourceOutlineItem } from '../schemas/sop.schemas.js'
import { createId } from '../common/ids.js'

export interface MediaAssignmentResult {
  steps: StepInput[]
  media: SourceMedia[]
  assignedCount: number
  unassignedCount: number
}

function buildSubPath(outline: SourceOutlineItem[], targetItem: SourceOutlineItem, rootItem: SourceOutlineItem): string {
  const path: string[] = [rootItem.marker ? `Bước ${rootItem.marker}` : rootItem.title]
  const byId = new Map(outline.map(item => [item.id, item]))

  // Tìm chuỗi cha-con từ targetItem lên rootItem
  const chain: SourceOutlineItem[] = []
  let current: SourceOutlineItem | undefined = targetItem
  while (current && current.id !== rootItem.id) {
    chain.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  for (const item of chain) {
    const label = item.marker ? item.marker : item.title.slice(0, 30)
    path.push(label)
  }

  return path.join(' > ')
}

/**
 * Thuật toán deterministic gán hình ảnh vào từng bước SOP.
 * Bảo đảm tuân thủ đúng 10 quy tắc nghiệp vụ.
 */
export function assignMediaToSteps(
  structure: SourceStructure,
  steps: StepInput[],
  candidates: SourceMedia[],
  previousSteps?: StepInput[]
): MediaAssignmentResult {
  const outline = structure.outline
  const byId = new Map(outline.map(item => [item.id, item]))

  // Lập bản đồ previous assignments theo stableKey để giữ nguyên lựa chọn thủ công của người dùng
  const previousManualAssignments = new Map<string, StepMedia[]>()
  if (previousSteps?.length) {
    for (const pStep of previousSteps) {
      if (pStep.media?.length) {
        previousManualAssignments.set(pStep.stableKey, pStep.media)
      }
    }
  }

  // Khởi tạo danh sách media của từng step
  const stepMediaMap = new Map<string, StepMedia[]>()
  for (const step of steps) {
    const manual = previousManualAssignments.get(step.stableKey)
    stepMediaMap.set(step.id, manual ? [...manual] : [])
  }

  // Theo dõi candidate nào đã được gán để tránh gán trùng lặp
  const assignedCandidateIds = new Set<string>()
  // Đánh dấu các media đã có từ manual assignments
  for (const mediaList of stepMediaMap.values()) {
    for (const sm of mediaList) {
      if (sm.sourceMediaId) assignedCandidateIds.add(sm.sourceMediaId)
    }
  }

  const updatedCandidates: SourceMedia[] = candidates.map(candidate => {
    // 6. Ảnh lặp checksum trên nhiều trang bị coi là trang trí hoặc logo
    if (candidate.assignmentStatus === 'ignored') {
      return { ...candidate, confidence: Math.min(candidate.confidence, 0.2) }
    }

    // Nếu đã được gán thủ công từ trước
    if (assignedCandidateIds.has(candidate.id)) {
      return { ...candidate, assignmentStatus: 'assigned' }
    }

    // Thuật toán tính điểm cho từng step
    let bestStep: StepInput | null = null
    let highestScore = 0
    let bestSubPath: string | undefined = candidate.subPath

    for (let sIdx = 0; sIdx < steps.length; sIdx += 1) {
      const step = steps[sIdx]!
      const nextStep = steps[sIdx + 1]
      let score = 0

      // Tìm outline item gốc của step (qua stableKey "source:item-id")
      const rootItemId = step.stableKey.startsWith('source:') ? step.stableKey.slice(7) : null
      const rootItem = rootItemId ? byId.get(rootItemId) : undefined

      // Quy tắc 1 & 3: Ảnh có sourceOutlineItemId nằm trong cây con của main step
      if (candidate.sourceOutlineItemId && rootItem) {
        let curr = byId.get(candidate.sourceOutlineItemId)
        while (curr) {
          if (curr.id === rootItem.id) {
            score = 0.92
            bestSubPath = buildSubPath(outline, byId.get(candidate.sourceOutlineItemId)!, rootItem)
            break
          }
          curr = curr.parentId ? byId.get(curr.parentId) : undefined
        }
      }

      // Quy tắc 2: Xuất hiện sau dòng bắt đầu của step và trước step kế tiếp
      const stepLineStart = step.sourceRefs?.[0]?.lineStart ?? 0
      const stepLineEnd = step.sourceRefs?.[0]?.lineEnd ?? (stepLineStart + 30)
      const nextStepLineStart = nextStep?.sourceRefs?.[0]?.lineStart ?? (stepLineEnd + 20)
      if (candidate.paragraphIndex !== undefined) {
        if (candidate.paragraphIndex >= stepLineStart && candidate.paragraphIndex < nextStepLineStart) {
          score = Math.max(score, 0.88)
        }
      }

      // Quy tắc 4 & 5: Cùng trang với tiêu đề hoặc nội dung của step
      const stepPage = step.sourceRefs?.[0]?.page
      if (candidate.page && stepPage) {
        if (candidate.page === stepPage) {
          score = Math.max(score, 0.82)
        } else if (candidate.page > stepPage) {
          if (nextStep?.sourceRefs?.[0]?.page && candidate.page <= nextStep.sourceRefs[0].page) {
            score = Math.max(score, 0.78)
          } else if (!nextStep && candidate.page <= stepPage + 1) {
            score = Math.max(score, 0.78)
          }
        }
      }

      if (score > highestScore) {
        highestScore = score
        bestStep = step
      }
    }

    // Quy tắc 7 & 8: Ngưỡng tự động gán là >= 0.75
    if (highestScore >= 0.75 && bestStep) {
      const currentList = stepMediaMap.get(bestStep.id) ?? []
      const role: StepMediaRole = currentList.length === 0 ? 'cover' : 'illustration'

      currentList.push({
        id: createId('step-media'),
        sourceMediaId: candidate.id,
        storageKey: candidate.storageKey,
        url: candidate.previewUrl,
        caption: candidate.caption,
        role,
        sourcePage: candidate.page,
        sourceSubPath: bestSubPath,
        sortOrder: currentList.length + 1,
        confidence: Number(highestScore.toFixed(2))
      })
      stepMediaMap.set(bestStep.id, currentList)

      return {
        ...candidate,
        confidence: Number(highestScore.toFixed(2)),
        subPath: bestSubPath,
        assignmentStatus: 'assigned'
      }
    }

    return {
      ...candidate,
      confidence: Number(highestScore.toFixed(2)),
      assignmentStatus: 'unassigned'
    }
  })

  // Cập nhật media[] và imageUrl cho từng Step
  const finalSteps = steps.map(step => {
    const list = stepMediaMap.get(step.id)
    if (!list || list.length === 0) {
      return {
        ...step,
        media: step.media,
        imageUrl: step.imageUrl
      }
    }
    // Quy tắc đồng bộ: imageUrl ưu tiên ảnh cover
    const coverMedia = list.find(m => m.role === 'cover') || list[0]
    return {
      ...step,
      media: list,
      imageUrl: coverMedia?.url || step.imageUrl
    }
  })

  return {
    steps: finalSteps,
    media: updatedCandidates,
    assignedCount: updatedCandidates.filter(c => c.assignmentStatus === 'assigned').length,
    unassignedCount: updatedCandidates.filter(c => c.assignmentStatus === 'unassigned').length
  }
}
