import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import type { CreateSopBody } from '../schemas/sop.schemas.js'
import { buildSourceStructure, buildStepsFromStructure, type SourceAdapter, type SourcePage } from './document-structure.js'

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

export function extractStepsFromText(text: string) {
  const structure = buildSourceStructure([{ page: 1, text }], 'plain-text')
  return buildStepsFromStructure(structure, text)
}

function decodeHtml(value: string): string {
  const entities: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '
  }
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_match, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
    return entities[entity.toLocaleLowerCase()] ?? `&${entity};`
  })
}

/** Keep Word headings and nested list markers instead of flattening everything to raw text. */
function structuredTextFromHtml(html: string): string {
  const output: string[] = []
  const lists: Array<{ kind: 'ol' | 'ul'; count: number }> = []
  let current = ''
  const flush = () => {
    const value = visibleHtmlText(current)
    if (value) output.push(value)
    current = ''
  }
  for (const token of html.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (!token.startsWith('<')) {
      current += decodeHtml(token)
      continue
    }
    const tag = token.toLocaleLowerCase()
    if (/^<ol\b/.test(tag)) { flush(); lists.push({ kind: 'ol', count: 0 }); continue }
    if (/^<ul\b/.test(tag)) { flush(); lists.push({ kind: 'ul', count: 0 }); continue }
    if (/^<\/(?:ol|ul)>/.test(tag)) { flush(); lists.pop(); continue }
    if (/^<li\b/.test(tag)) {
      flush()
      const list = lists.at(-1)
      if (list?.kind === 'ol') list.count += 1
      const orderedPath = lists.filter(value => value.kind === 'ol').map(value => value.count).filter(Boolean)
      const marker = list?.kind === 'ol' ? `${orderedPath.join('.')}. ` : '• '
      current = `${'  '.repeat(Math.max(0, lists.length - 1))}${marker}`
      continue
    }
    if (/^<\/(?:li|p|h[1-6]|tr)>/.test(tag)) { flush(); continue }
    if (/^<(?:p|h[1-6]|tr)\b/.test(tag)) { flush(); continue }
    if (/^<br\s*\/?/.test(tag)) { flush(); continue }
    if (/^<td\b/.test(tag) && current) current += ' | '
  }
  flush()
  return output.join('\n')
}

function visibleHtmlText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

interface ExtractedText {
  text: string
  pages: SourcePage[]
  adapter: SourceAdapter
  parserWarnings: string[]
}

async function extractText(buffer: Buffer, mediaType: string, fileName: string): Promise<ExtractedText> {
  if (mediaType === 'application/pdf' || fileName.toLocaleLowerCase().endsWith('.pdf')) {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      if (result.text.replace(/\s/g, '').length >= 40) return {
        text: result.text,
        pages: result.pages.map(page => ({ page: page.num, text: page.text })),
        adapter: 'pdf-layout',
        parserWarnings: []
      }
      try {
        const screenshots = await parser.getScreenshot({ scale: 1.7, first: 30, imageDataUrl: false, imageBuffer: true })
        const { createWorker } = await import('tesseract.js')
        const worker = await createWorker(['vie', 'eng'])
        try {
          const pages: SourcePage[] = []
          for (const page of screenshots.pages) {
            const recognized = await worker.recognize(page.data)
            pages.push({ page: page.pageNumber, text: recognized.data.text })
          }
          const truncatedWarning = screenshots.pages.length >= 30
            ? ['PDF scan chỉ OCR 30 trang đầu; hãy tách tài liệu nếu cần xử lý thêm.']
            : []
          return {
            text: pages.map(page => `Trang ${page.page}\n${page.text}`).join('\n\n'),
            pages,
            adapter: 'pdf-ocr',
            parserWarnings: ['Tài liệu không có lớp chữ; hệ thống đã dùng OCR tiếng Việt và tiếng Anh.', ...truncatedWarning]
          }
        } finally {
          await worker.terminate()
        }
      } catch {
        return {
          text: result.text,
          pages: result.pages.length ? result.pages.map(page => ({ page: page.num, text: page.text })) : [{ page: 1, text: result.text }],
          adapter: 'pdf-layout',
          parserWarnings: ['PDF không có lớp chữ và OCR chưa xử lý được. Hãy nhập các bước thủ công hoặc thử lại khi dịch vụ OCR sẵn sàng.']
        }
      }
    } finally {
      await parser.destroy()
    }
  }
  const result = await mammoth.convertToHtml({ buffer })
  const text = structuredTextFromHtml(result.value)
  if (text.replace(/\s/g, '').length < 40) {
    try {
      const { default: JSZip } = await import('jszip')
      const archive = await JSZip.loadAsync(buffer)
      const mediaEntries = Object.values(archive.files)
        .filter(entry => !entry.dir && /^word\/media\/.*\.(?:png|jpe?g|webp|bmp|tiff?)$/i.test(entry.name))
        .slice(0, 30)
      if (mediaEntries.length) {
        const { createWorker } = await import('tesseract.js')
        const worker = await createWorker(['vie', 'eng'])
        try {
          const pages: SourcePage[] = []
          for (let index = 0; index < mediaEntries.length; index += 1) {
            const image = Buffer.from(await mediaEntries[index]!.async('uint8array'))
            const recognized = await worker.recognize(image)
            pages.push({ page: index + 1, text: recognized.data.text })
          }
          const ocrText = pages.map((page, index) => `Ảnh ${index + 1}\n${page.text}`).join('\n\n')
          return {
            text: ocrText,
            pages,
            adapter: 'docx-ocr',
            parserWarnings: [
              ...result.messages.map(message => message.message),
              'File Word không có lớp chữ; hệ thống đã OCR các ảnh nhúng để tạo cấu trúc.',
              ...(mediaEntries.length >= 30 ? ['File Word chỉ OCR 30 ảnh đầu tiên.'] : [])
            ]
          }
        } finally {
          await worker.terminate()
        }
      }
    } catch {
      // Keep the empty/short HTML result and let the review UI explain the limitation.
    }
  }
  return {
    text,
    pages: [{ page: 1, text }],
    adapter: 'docx-html',
    parserWarnings: result.messages.map(message => message.message)
  }
}

import type { DocumentStorage } from './document-storage.js'
import { extractAndUploadMedia } from './sop-media-extractor.js'
import { assignMediaToSteps } from './sop-media-assignment.js'
import type { SourceMedia, StepInput } from '../schemas/sop.schemas.js'

export async function extractSopPreview(input: {
  buffer: Buffer; mediaType: string; fileName: string; code: string; title: string
  category?: string; primaryModuleId: string
  importId?: string
  storage?: DocumentStorage
  previousSteps?: StepInput[]
}): Promise<{ preview: CreateSopBody; extractedText: string; warnings: string[] }> {
  const extracted = await extractText(input.buffer, input.mediaType, input.fileName)
  const text = extracted.text.split('\u0000').join('').trim().slice(0, 500_000)
  const sourceStructure = buildSourceStructure(extracted.pages, extracted.adapter)
  const { steps: rawSteps, warnings } = buildStepsFromStructure(sourceStructure, text)

  let steps = rawSteps
  let mediaList: SourceMedia[] = []

  // Trích xuất hình ảnh nếu có
  try {
    const isPdf = input.mediaType === 'application/pdf' || input.fileName.toLowerCase().endsWith('.pdf')
    mediaList = await extractAndUploadMedia(
      input.buffer,
      isPdf ? 'application/pdf' : 'application/docx',
      input.importId || 'preview',
      input.storage,
      sourceStructure.outline
    )

    if (mediaList.length) {
      const assigned = assignMediaToSteps(sourceStructure, rawSteps, mediaList, input.previousSteps)
      steps = assigned.steps
      mediaList = assigned.media
      sourceStructure.media = mediaList
    }
  } catch (error) {
    warnings.push(`Cảnh báo trích xuất hình ảnh: ${error instanceof Error ? error.message : 'Không xác định'}`)
  }

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
    sourceStructure,
    steps,
    transitions
  }
  if (!text) warnings.unshift('Không trích xuất được văn bản. File có thể là PDF scan và cần OCR.')
  return { preview, extractedText: text, warnings: [...extracted.parserWarnings, ...warnings] }
}

export { extractSopPreview as extractDocument }
