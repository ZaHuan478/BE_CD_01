import { describe, expect, it } from 'vitest'
import { SopExtractor } from '../src/services/rag/sop-extractor.js'
import { CitationParser } from '../src/services/chat/citation.parser.js'
import { PromptBuilder } from '../src/services/chat/prompt.builder.js'
import { splitSemanticChunks } from '../src/services/rag/semantic-chunker.js'

describe('RAG Extractor & Pipeline Tests', () => {
  const extractor = new SopExtractor()

  it('extracts structured chunks from knowledge document', () => {
    const chunks = extractor.extractFromKnowledgeDocument({
      documentId: 'doc-sop-01',
      code: 'SOP-DG-04',
      title: 'Quy trình Đánh giá Thử việc',
      type: 'procedure',
      summary: 'Quy trình đánh giá nhân viên thử việc',
      moduleId: 'emp',
      isCommon: false,
      versionNumber: 1,
      content: {
        steps: [
          {
            stepCode: 'DG04.01',
            title: 'Tự đánh giá',
            actor: 'Nhân viên',
            timing: 'Trước 10 ngày',
            description: 'Đối soát mục tiêu',
            fieldsChecklist: ['Bản tự chấm']
          },
          {
            stepCode: 'DG04.02',
            title: 'Quản lý nghiệm thu',
            actor: 'Trưởng bộ phận',
            timing: 'Trong 3 ngày',
            description: 'Chấm điểm và kết luận'
          }
        ]
      }
    })

    expect(chunks.length).toBe(3)
    expect(chunks[0]!.chunkType).toBe('sop_overview')
    expect(chunks[1]!.chunkType).toBe('sop_step')
    expect(chunks[1]!.sopStepId).toBe('DG04.01')
    expect(chunks[1]!.content).toContain('Trước 10 ngày')
    expect(chunks[1]!.content).toContain('Nhân viên')
    expect(chunks[2]!.sopStepId).toBe('DG04.02')
  })

  it('parses citations from AI response text and links to chunks', () => {
    const parser = new CitationParser()
    const rawAiResponse =
      'Nhân viên cần tự đánh giá trước 10 ngày [SOURCE_ID:c1], sau đó Quản lý phỏng vấn nghiệm thu [SOURCE_ID:c2].'

    const contextChunks = [
      {
        chunkId: 'c1',
        sopId: 'sop-01',
        sopStepId: 'DG04.01',
        moduleId: 'emp',
        title: 'Tự đánh giá',
        content: 'Nội dung bước 1',
        metadata: {
          sopId: 'sop-01',
          sopCode: 'SOP-DG-04',
          sopTitle: 'Quy trình Đánh giá Thử việc',
          stepCode: 'DG04.01',
          stepTitle: 'Tự đánh giá',
          actor: 'Nhân viên thử việc',
          timing: 'Trước 10 ngày'
        }
      },
      {
        chunkId: 'c2',
        sopId: 'sop-01',
        sopStepId: 'DG04.02',
        moduleId: 'emp',
        title: 'Nghiệm thu',
        content: 'Nội dung bước 2',
        metadata: {
          sopId: 'sop-01',
          sopCode: 'SOP-DG-04',
          sopTitle: 'Quy trình Đánh giá Thử việc',
          stepCode: 'DG04.02',
          stepTitle: 'Quản lý nghiệm thu',
          actor: 'Trưởng bộ phận',
          timing: 'Trong 3 ngày'
        }
      }
    ]

    const { cleanText, citations } = parser.parseCitations(rawAiResponse, contextChunks)

    expect(cleanText).toBe(
      'Nhân viên cần tự đánh giá trước 10 ngày [1], sau đó Quản lý phỏng vấn nghiệm thu [2].'
    )
    expect(citations.length).toBe(2)
    expect(citations[0]!.sopCode).toBe('SOP-DG-04')
    expect(citations[0]!.stepCode).toBe('DG04.01')
    expect(citations[0]!.actor).toBe('Nhân viên thử việc')
    expect(citations[0]!.routeUrl).toContain('step=DG04.01')
    expect(citations[0]!.routeUrl).toContain('/employee-lifecycle/knowledge-documents/sop-01')
    expect(citations[0]!.excerpt).toBe('Nội dung bước 1')
    const invented = parser.parseCitations('Sai [SOURCE_ID:not-available]', contextChunks)
    expect(invented.citations).toHaveLength(0)
  })

  it('builds grounded prompt with context chunks', () => {
    const builder = new PromptBuilder()
    const prompt = builder.buildSystemInstruction([
      {
        chunkId: 'c1',
        sopId: 'sop-01',
        sopStepId: 'DG04.01',
        moduleId: 'emp',
        title: 'Bước 1',
        content: 'Quy định chi tiết bước 1',
        metadata: { sopCode: 'SOP-DG-04', stepCode: 'DG04.01' }
      }
    ])

    expect(prompt).toContain('GROUNDING RULES')
    expect(prompt).toContain('[SOURCE_ID:c1]')
    expect(prompt).toContain('Quy định chi tiết bước 1')
  })

  it('splits oversized content without losing source identity', () => {
    const source = extractor.extractFromKnowledgeDocument({
      documentId: 'doc-long', code: 'SOP-LONG', title: 'Quy trình dài', type: 'procedure',
      summary: 'Tóm tắt', moduleId: 'emp', isCommon: false, versionNumber: 2,
      content: { sections: [{ title: 'Nội dung', content: 'Thực hiện thao tác. '.repeat(200) }] }
    })
    const chunks = splitSemanticChunks(source, 100)
    const parts = chunks.filter(chunk => chunk.chunkType === 'policy_section')
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every(chunk => chunk.sopId === 'doc-long' && chunk.sopVersionId === 'v2')).toBe(true)
    expect(new Set(parts.map(chunk => chunk.chunkId)).size).toBe(parts.length)
    expect(parts.every(chunk => chunk.content.length <= 400)).toBe(true)
  })
})
