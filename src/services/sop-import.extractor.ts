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

const actionVerbs = [
  'chọn', 'nhập', 'kiểm tra', 'vào', 'truy cập', 'mở', 'tạo', 'lưu', 'xuất', 'in',
  'gửi', 'liên hệ', 'xác nhận', 'đối chiếu', 'phê duyệt', 'duyệt', 'cập nhật', 'thực hiện',
  'tiếp nhận', 'bàn giao', 'đăng nhập', 'tải', 'đính kèm'
]

function startsWithAction(value: string): boolean {
  const normalized = value.toLocaleLowerCase('vi').replace(/^["“”'‘’]+/, '')
  return actionVerbs.some((verb) => normalized === verb || normalized.startsWith(`${verb} `))
}

function suggestedKind(title: string, description: string): StepInput['nodeKind'] {
  const value = `${title}\n${description}`.toLocaleLowerCase('vi')
  if (/\b(nếu|trường hợp|đối với|tùy theo)\b/u.test(value)) return 'decision'
  if (/\b(phụ lục|quy trình con)\b/u.test(value)) return 'subprocess'
  return 'task'
}

function suggestedTypeCode(title: string, description: string): string {
  const value = `${title}\n${description}`.toLocaleLowerCase('vi')
  if (/\b(tự động|tự sinh|hệ thống tự)\b/u.test(value)) return 'A'
  if (/\b(kiểm tra|đối chiếu|xác nhận)\b/u.test(value)) return 'C'
  if (/\b(phê duyệt|duyệt)\b/u.test(value)) return 'M'
  return 'N'
}

export function extractStepsFromText(text: string): { steps: StepInput[]; warnings: string[] } {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean)
  const candidates: Array<{ code?: string; title: string; sourceIndex: number; confidence: number }> = []
  const seen = new Set<string>()
  const codePattern = /^((?:[A-ZĐ]{2,10}[-.]?\d{1,3})(?:\.\d{1,3})?)\s*(?:[-:–—]\s*)?(.{3,})$/u
  const hierarchicalNumberPattern = /^(\d{1,3}(?:\.\d{1,3})+)[.)]?\s+(.{3,})$/
  const namedStepPattern = /^(?:bước|step)\s*(\d{1,3})\s*[:.)-]?\s+(.{3,})$/iu
  const numberedActionPattern = /^(\d{1,3})[.)]\s+(.{3,})$/u
  const letteredActionPattern = /^([A-ZĐ])[.)]\s+(.{3,})$/u

  lines.forEach((line, sourceIndex) => {
    const coded = line.match(codePattern) ?? line.match(hierarchicalNumberPattern)
    const named = line.match(namedStepPattern)
    const numbered = line.match(numberedActionPattern)
    const lettered = line.match(letteredActionPattern)
    const match = coded ?? named ?? numbered ?? lettered
    if (!match) return
    const title = cleanLine(match[2]!)
    const normalizedTitle = title.replace(/[:：]$/, '').toLocaleLowerCase('vi')
    if (headingTokens.has(normalizedTitle)) return
    if ((numbered || lettered) && !startsWithAction(title)) return
    if (coded) {
      const code = match[1]!.toUpperCase()
      if (code.startsWith('SOP') || seen.has(code)) return
      seen.add(code)
      candidates.push({ code, title, sourceIndex, confidence: 0.92 })
      return
    }
    candidates.push({ title, sourceIndex, confidence: named ? 0.84 : numbered ? 0.72 : 0.68 })
  })

  const warnings: string[] = []
  if (!candidates.length) {
    warnings.push('Không nhận diện được mã bước; hệ thống tạo một bước nháp để người dùng cấu trúc lại nội dung.')
    return {
      steps: [{
        id: 'import-step-1', stableKey: 'import-step-1', code: 'STEP-01',
        title: 'Rà soát nội dung được trích xuất', description: text.slice(0, 20_000),
        actor: null, location: null, timing: null, nodeKind: 'task', sortOrder: 1,
        confidence: 0.25,
        sourceRefs: text.trim() ? [{ lineStart: 1, lineEnd: Math.max(1, lines.length), text: text.slice(0, 20_000) }] : [],
        checklist: [], inputs: [], outputs: []
      }],
      warnings
    }
  }

  const steps = candidates.slice(0, 200).map((candidate, index): StepInput => {
    const nextIndex = candidates[index + 1]?.sourceIndex ?? lines.length
    const description = lines.slice(candidate.sourceIndex + 1, nextIndex).join('\n').slice(0, 20_000)
    const code = candidate.code ?? `STEP-${String(index + 1).padStart(2, '0')}`
    const sourceText = lines.slice(candidate.sourceIndex, nextIndex).join('\n').slice(0, 20_000)
    return {
      id: `import-step-${index + 1}`,
      stableKey: `import-step-${index + 1}`,
      code,
      title: candidate.title,
      description: description || null,
      actor: null,
      location: null,
      timing: null,
      nodeKind: suggestedKind(candidate.title, description),
      typeCode: suggestedTypeCode(candidate.title, description),
      sortOrder: index + 1,
      confidence: candidate.confidence,
      sourceRefs: [{
        lineStart: candidate.sourceIndex + 1,
        lineEnd: Math.max(candidate.sourceIndex + 1, nextIndex),
        text: sourceText || candidate.title
      }],
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
      if (result.text.replace(/\s/g, '').length >= 40) return { text: result.text, parserWarnings: [] }
      try {
        const screenshots = await parser.getScreenshot({ scale: 1.7, first: 30, imageDataUrl: false, imageBuffer: true })
        const { createWorker } = await import('tesseract.js')
        const worker = await createWorker(['vie', 'eng'])
        try {
          const pages: string[] = []
          for (const page of screenshots.pages) {
            const recognized = await worker.recognize(page.data)
            pages.push(`Trang ${page.pageNumber}\n${recognized.data.text}`)
          }
          const truncatedWarning = screenshots.pages.length >= 30
            ? ['PDF scan chỉ OCR 30 trang đầu; hãy tách tài liệu nếu cần xử lý thêm.']
            : []
          return {
            text: pages.join('\n\n'),
            parserWarnings: ['Tài liệu không có lớp chữ; hệ thống đã dùng OCR tiếng Việt và tiếng Anh.', ...truncatedWarning]
          }
        } finally {
          await worker.terminate()
        }
      } catch {
        return {
          text: result.text,
          parserWarnings: ['PDF không có lớp chữ và OCR chưa xử lý được. Hãy nhập các bước thủ công hoặc thử lại khi dịch vụ OCR sẵn sàng.']
        }
      }
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
