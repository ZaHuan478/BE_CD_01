import { createHash } from 'node:crypto'

export interface ExtractedChunk {
  chunkId: string
  sopId: string
  sopVersionId: string
  sopStepId: string | null
  moduleId: string
  isCommon: boolean
  chunkType: 'sop_overview' | 'sop_step' | 'policy_section' | 'general'
  chunkIndex: number
  title: string
  content: string
  metadata: Record<string, unknown>
}

export function hashString(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export class SopExtractor {
  /**
   * Trích xuất các khối ngữ nghĩa từ một KnowledgeDocument (dành cho core8 / normalized model)
   */
  extractFromKnowledgeDocument(doc: {
    documentId: string
    code: string
    title: string
    type: string
    summary: string
    moduleId: string
    isCommon: boolean
    versionNumber: number
    content: Record<string, unknown>
  }): ExtractedChunk[] {
    const chunks: ExtractedChunk[] = []
    const versionId = `v${doc.versionNumber}`
    let chunkIndex = 0

    // 1. Chunk Tổng quan (Overview)
    const overviewContent = [
      `[TÀI LIỆU]: ${doc.code} - ${doc.title}`,
      `[LOẠI]: ${doc.type === 'procedure' ? 'Quy trình vận hành chuẩn (SOP)' : 'Chính sách / Quy định'}`,
      `[PHÂN HỆ]: ${doc.moduleId}`,
      doc.summary ? `[TÓM TẮT]: ${doc.summary}` : '',
      doc.content.purpose ? `[MỤC ĐÍCH]: ${String(doc.content.purpose)}` : '',
      doc.content.scope ? `[PHẠM VI]: ${String(doc.content.scope)}` : '',
      doc.content.definition ? `[ĐỊNH NGHĨA]: ${String(doc.content.definition)}` : ''
    ].filter(Boolean).join('\n')

    chunks.push({
      chunkId: `${doc.documentId}-overview`,
      sopId: doc.documentId,
      sopVersionId: versionId,
      sopStepId: null,
      moduleId: doc.moduleId,
      isCommon: doc.isCommon,
      chunkType: 'sop_overview',
      chunkIndex: chunkIndex++,
      title: `${doc.code} - ${doc.title} (Tổng quan)`,
      content: overviewContent,
      metadata: {
        sopId: doc.documentId,
        sopCode: doc.code,
        sopTitle: doc.title,
        moduleId: doc.moduleId
      }
    })

    // 2. Nếu là Quy trình có các bước (Steps)
    const rawSteps = doc.content?.steps
    if (Array.isArray(rawSteps)) {
      for (const step of rawSteps) {
        if (!step || typeof step !== 'object') continue
        const s = step as Record<string, unknown>
        const stepCode = String(s.stepCode || s.code || `Step-${chunkIndex}`)
        const stepTitle = String(s.title || '')
        const actor = String(s.actor || s.role || 'Không quy định')
        const timing = String(s.timing || 'Theo quy định')
        const location = String(s.location || '')
        const description = String(s.description || '')

        let checklistText = ''
        const checklist = Array.isArray(s.checklist) ? s.checklist : s.fieldsChecklist
        if (Array.isArray(checklist) && checklist.length > 0) {
          checklistText = `\n[HỒ SƠ / CHECKLIST]:\n- ` + checklist.join('\n- ')
        }

        const stepContent = [
          `[QUY TRÌNH]: ${doc.code} - ${doc.title}`,
          `[BƯỚC ${stepCode}]: ${stepTitle}`,
          `- Người thực hiện (Actor): ${actor}`,
          `- Thời điểm / Hạn hoàn thành: ${timing}`,
          location ? `- Nơi thực hiện / Kênh: ${location}` : '',
          description ? `- Chi tiết thực hiện: ${description}` : '',
          checklistText
        ].filter(Boolean).join('\n')

        chunks.push({
          chunkId: `${doc.documentId}-${stepCode}`,
          sopId: doc.documentId,
          sopVersionId: versionId,
          sopStepId: stepCode,
          moduleId: doc.moduleId,
          isCommon: doc.isCommon,
          chunkType: 'sop_step',
          chunkIndex: chunkIndex++,
          title: `${doc.code} [Bước ${stepCode}]: ${stepTitle}`,
          content: stepContent,
          metadata: {
            sopId: doc.documentId,
            sopCode: doc.code,
            sopTitle: doc.title,
            stepCode,
            stepTitle,
            actor,
            timing,
            moduleId: doc.moduleId
          }
        })
      }
    }

    const rawTransitions = doc.content?.transitions
    if (Array.isArray(rawTransitions)) {
      for (const transition of rawTransitions) {
        if (!transition || typeof transition !== 'object') continue
        const value = transition as Record<string, unknown>
        const condition = String(value.condition || value.branchLabel || '').trim()
        if (!condition) continue
        const from = String(value.fromStepId || '')
        const to = String(value.toStepId || '')
        chunks.push({
          chunkId: `${doc.documentId}-transition-${chunkIndex}`,
          sopId: doc.documentId,
          sopVersionId: versionId,
          sopStepId: from || null,
          moduleId: doc.moduleId,
          isCommon: doc.isCommon,
          chunkType: 'general',
          chunkIndex: chunkIndex++,
          title: `${doc.code} - Điều kiện chuyển bước`,
          content: `[QUY TRÌNH]: ${doc.code} - ${doc.title}\n[LUỒNG]: ${from} → ${to}\n[ĐIỀU KIỆN]: ${condition}`,
          metadata: { sopId: doc.documentId, sopCode: doc.code, sopTitle: doc.title, fromStepId: from, toStepId: to }
        })
      }
    }

    // 3. Nếu là Quy định / Chính sách có các điều khoản (Sections)
    const rawSections = doc.content?.sections
    if (Array.isArray(rawSections)) {
      for (const sec of rawSections) {
        if (!sec || typeof sec !== 'object') continue
        const s = sec as Record<string, unknown>
        const secTitle = String(s.title || s.heading || `Điều ${chunkIndex}`)
        const secContent = String(s.content || s.text || '')

        const fullContent = [
          `[QUY ĐỊNH / CHÍNH SÁCH]: ${doc.code} - ${doc.title}`,
          `[MỤC]: ${secTitle}`,
          secContent
        ].filter(Boolean).join('\n')

        chunks.push({
          chunkId: `${doc.documentId}-sec-${chunkIndex}`,
          sopId: doc.documentId,
          sopVersionId: versionId,
          sopStepId: null,
          moduleId: doc.moduleId,
          isCommon: doc.isCommon,
          chunkType: 'policy_section',
          chunkIndex: chunkIndex++,
          title: `${doc.code} - ${secTitle}`,
          content: fullContent,
          metadata: {
            sopId: doc.documentId,
            sopCode: doc.code,
            sopTitle: doc.title,
            sectionTitle: secTitle,
            moduleId: doc.moduleId
          }
        })
      }
    }

    return chunks
  }

  /**
   * Trích xuất từ bảng Sop + SopVersion + SopStep truyền thống
   */
  extractFromLegacySop(sop: {
    sopId: string
    sopCode: string
    title: string
    category?: string
    versionId: string
    purpose?: string
    scope?: string
    definition?: string
    moduleId: string
    isCommon: boolean
    steps: Array<{
      stepId: string
      stepCode: string
      title: string
      actor?: string
      timing?: string
      location?: string
      description?: string
      checklistJson?: string | null
    }>
  }): ExtractedChunk[] {
    const chunks: ExtractedChunk[] = []
    let chunkIndex = 0

    // Overview
    const overview = [
      `[QUY TRÌNH]: ${sop.sopCode} - ${sop.title}`,
      sop.category ? `[DANH MỤC]: ${sop.category}` : '',
      sop.purpose ? `[MỤC ĐÍCH]: ${sop.purpose}` : '',
      sop.scope ? `[PHẠM VI]: ${sop.scope}` : '',
      sop.definition ? `[ĐỊNH NGHĨA]: ${sop.definition}` : ''
    ].filter(Boolean).join('\n')

    chunks.push({
      chunkId: `${sop.sopId}-overview`,
      sopId: sop.sopId,
      sopVersionId: sop.versionId,
      sopStepId: null,
      moduleId: sop.moduleId,
      isCommon: sop.isCommon,
      chunkType: 'sop_overview',
      chunkIndex: chunkIndex++,
      title: `${sop.sopCode} - ${sop.title} (Tổng quan)`,
      content: overview,
      metadata: {
        sopId: sop.sopId,
        sopCode: sop.sopCode,
        sopTitle: sop.title,
        moduleId: sop.moduleId
      }
    })

    // Steps
    for (const step of sop.steps) {
      let checklist = ''
      if (step.checklistJson) {
        try {
          const parsed = JSON.parse(step.checklistJson)
          if (Array.isArray(parsed)) {
            checklist = `\n[CHECKLIST]:\n- ` + parsed.join('\n- ')
          }
        } catch {
          // ignore
        }
      }

      const content = [
        `[QUY TRÌNH]: ${sop.sopCode} - ${sop.title}`,
        `[BƯỚC ${step.stepCode}]: ${step.title}`,
        `- Người thực hiện: ${step.actor || 'Không rõ'}`,
        step.timing ? `- Thời hạn: ${step.timing}` : '',
        step.location ? `- Địa điểm: ${step.location}` : '',
        step.description ? `- Chi tiết: ${step.description}` : '',
        checklist
      ].filter(Boolean).join('\n')

      chunks.push({
        chunkId: `${sop.sopId}-${step.stepId}`,
        sopId: sop.sopId,
        sopVersionId: sop.versionId,
        sopStepId: step.stepId,
        moduleId: sop.moduleId,
        isCommon: sop.isCommon,
        chunkType: 'sop_step',
        chunkIndex: chunkIndex++,
        title: `${sop.sopCode} [Bước ${step.stepCode}]: ${step.title}`,
        content,
        metadata: {
          sopId: sop.sopId,
          sopCode: sop.sopCode,
          sopTitle: sop.title,
          stepId: step.stepId,
          stepCode: step.stepCode,
          stepTitle: step.title,
          actor: step.actor,
          timing: step.timing,
          moduleId: sop.moduleId
        }
      })
    }

    return chunks
  }
}
