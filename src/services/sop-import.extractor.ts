import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import type { CreateSopBody, StepInput } from '../schemas/sop.schemas.js'

const headingTokens = new Set([
  'mục đích', 'purpose', 'phạm vi', 'scope', 'định nghĩa', 'definitions', 'definition',
  'trách nhiệm', 'responsibilities', 'nội dung', 'quy trình', 'procedure', 'tài liệu tham chiếu',
  'references', 'biểu mẫu', 'forms', 'phụ lục', 'appendix'
])

function cleanLine(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').trim()
}

function section(text: string, names: string[]): string | null {
  const lines = text.split(/\r?\n/).map(cleanLine)
  const lowerNames = names.map((name) => name.toLocaleLowerCase('vi'))
  const start = lines.findIndex((line) => {
    const normalized = line.replace(/^\d+(?:\.\d+)*[.)]?\s*/, '').replace(/[:：]$/, '').toLocaleLowerCase('vi')
    return lowerNames.includes(normalized)
  })
  if (start < 0) return null
  const content: string[] = []
  for (const line of lines.slice(start + 1)) {
    const normalized = line.replace(/^\d+(?:\.\d+)*[.)]?\s*/, '').replace(/[:：]$/, '').toLocaleLowerCase('vi')
    if (content.length && headingTokens.has(normalized)) break
    if (line) content.push(line)
    if (content.join(' ').length > 4000) break
  }
  return content.join('\n').trim() || null
}

function titleFromFile(fileName: string): string {
  return fileName.replace(/\.(docx|pdf)$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function extractStepsFromText(text: string): { steps: StepInput[]; warnings: string[] } {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean)
  const candidates: Array<{ code: string; title: string; sourceIndex: number }> = []
  const seen = new Set<string>()
  const codePattern = /^((?:[A-ZĐ]{2,10}[-.]?\d{1,3})(?:\.\d{1,3})?)\s*(?:[-:–—]\s*)?(.{3,})$/u
  const numberPattern = /^(\d{1,3}(?:\.\d{1,3})+)[.)]?\s+(.{3,})$/

  lines.forEach((line, sourceIndex) => {
    const match = line.match(codePattern) ?? line.match(numberPattern)
    if (!match) return
    const code = match[1]!.toUpperCase()
    const title = cleanLine(match[2]!)
    const normalizedTitle = title.replace(/[:：]$/, '').toLocaleLowerCase('vi')
    if (code.startsWith('SOP') || headingTokens.has(normalizedTitle) || seen.has(code)) return
    seen.add(code)
    candidates.push({ code, title, sourceIndex })
  })

  const warnings: string[] = []
  if (!candidates.length) {
    warnings.push('Không nhận diện được mã bước; hệ thống tạo một bước nháp để người dùng cấu trúc lại nội dung.')
    return {
      steps: [{
        id: 'import-step-1', stableKey: 'import-step-1', code: 'STEP-01',
        title: 'Rà soát nội dung được trích xuất', description: text.slice(0, 20_000),
        actor: null, location: null, timing: null, nodeKind: 'task', sortOrder: 1,
        checklist: [], inputs: [], outputs: []
      }],
      warnings
    }
  }

  const steps = candidates.slice(0, 200).map((candidate, index): StepInput => {
    const nextIndex = candidates[index + 1]?.sourceIndex ?? lines.length
    const description = lines.slice(candidate.sourceIndex + 1, nextIndex).join('\n').slice(0, 20_000)
    return {
      id: `import-step-${index + 1}`,
      stableKey: `import-step-${index + 1}`,
      code: candidate.code,
      title: candidate.title,
      description: description || null,
      actor: null,
      location: null,
      timing: null,
      nodeKind: 'task',
      sortOrder: index + 1,
      checklist: [], inputs: [], outputs: []
    }
  })
  if (candidates.length > 200) warnings.push('Tài liệu có hơn 200 bước; bản xem trước chỉ giữ 200 bước đầu tiên.')
  warnings.push('Cần kiểm tra người thực hiện, input/output và các nhánh quyết định trước khi gửi duyệt.')
  return { steps, warnings }
}

async function extractText(buffer: Buffer, mediaType: string, fileName: string): Promise<{ text: string; parserWarnings: string[] }> {
  if (mediaType === 'application/pdf' || fileName.toLocaleLowerCase().endsWith('.pdf')) {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return { text: result.text, parserWarnings: [] }
    } finally {
      await parser.destroy()
    }
  }
  const result = await mammoth.extractRawText({ buffer })
  return { text: result.value, parserWarnings: result.messages.map((message) => message.message) }
}

export async function extractSopPreview(input: {
  buffer: Buffer; mediaType: string; fileName: string; code: string; title: string
  category?: string; primaryModuleId: string
}): Promise<{ preview: CreateSopBody; extractedText: string; warnings: string[] }> {
  const extracted = await extractText(input.buffer, input.mediaType, input.fileName)
  const text = extracted.text.split('\u0000').join('').trim().slice(0, 500_000)
  const { steps, warnings } = extractStepsFromText(text)
  const transitions = steps.slice(0, -1).map((step, index) => ({
    id: `import-transition-${index + 1}`,
    fromStepId: step.id,
    toStepId: steps[index + 1]!.id,
    kind: 'normal' as const,
    sortOrder: index + 1
  }))
  const preview: CreateSopBody = {
    code: input.code.trim(),
    title: input.title.trim() || titleFromFile(input.fileName),
    category: input.category?.trim() || null,
    moduleIds: [input.primaryModuleId],
    primaryModuleId: input.primaryModuleId,
    definition: section(text, ['Định nghĩa', 'Definition', 'Definitions']),
    purpose: section(text, ['Mục đích', 'Purpose']),
    scope: section(text, ['Phạm vi', 'Scope']),
    changeLog: 'Khởi tạo từ tài liệu tải lên; cần được rà soát trước khi gửi duyệt.',
    steps,
    transitions
  }
  if (!text) warnings.unshift('Không trích xuất được văn bản. File có thể là PDF scan và cần OCR.')
  return { preview, extractedText: text, warnings: [...extracted.parserWarnings, ...warnings] }
}
