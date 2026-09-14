import type { SourceOutlineItem, SourceStructure, StepInput } from '../schemas/sop.schemas.js'

export interface SourcePage {
  page: number
  text: string
}

export type SourceAdapter = SourceStructure['adapter']

interface SourceLine {
  page: number
  line: number
  text: string
  indent: number
}

interface MarkerMatch {
  marker: string | null
  markerKind: SourceOutlineItem['markerKind']
  title: string
  confidence: number
}

const actionVerbs = [
  'chọn', 'nhập', 'kiểm tra', 'vào', 'truy cập', 'mở', 'tạo', 'lưu', 'xuất', 'in',
  'gửi', 'liên hệ', 'xác nhận', 'đối chiếu', 'phê duyệt', 'duyệt', 'cập nhật',
  'thực hiện', 'tiếp nhận', 'bàn giao', 'đăng nhập', 'tải', 'đính kèm', 'ký',
  'chuyển', 'ghi nhận', 'rà soát', 'theo dõi', 'thông báo'
]

const knownHeadings = new Set([
  'mục đích', 'purpose', 'phạm vi', 'scope', 'định nghĩa', 'definitions', 'definition',
  'trách nhiệm', 'responsibilities', 'nội dung', 'quy trình', 'procedure',
  'tài liệu tham chiếu', 'references', 'biểu mẫu', 'forms', 'phụ lục', 'appendix'
])

function visibleText(value: string): string {
  return value.split('\u0000').join('').replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').trim()
}

function normalize(value: string): string {
  return visibleText(value).toLocaleLowerCase('vi')
}

function startsWithAction(value: string): boolean {
  const text = normalize(value).replace(/^["“”'‘’]+/, '')
  return actionVerbs.some(verb => text === verb || text.startsWith(`${verb} `))
}

function looksLikeHeading(value: string): boolean {
  const text = visibleText(value).replace(/[:：]$/, '')
  const lowered = normalize(text.replace(/^\d+(?:\.\d+)*[.)]?\s*/, ''))
  if (knownHeadings.has(lowered)) return true
  if (text.length > 120 || /[.!?]$/.test(text)) return false
  const letters = [...text].filter(character => /[A-Za-zÀ-ỹĐđ]/u.test(character))
  return letters.length >= 4 && letters.every(character => character === character.toLocaleUpperCase('vi'))
}

function markerFor(line: SourceLine): MarkerMatch | null {
  const text = visibleText(line.text).replace(/^[-•▪◦]\.\s*(?=(?:bước|step)\s*\d)/iu, '')
  if (!text) return null
  let match = text.match(/^(?:bước|step)\s*(\d{1,3}(?:\.\d+)*)\s*[:.)-]?\s*(.*)$/iu)
  if (match) return {
    marker: match[1]!, markerKind: 'named_step', title: visibleText(match[2]!) || `Bước ${match[1]}`,
    confidence: 0.88
  }
  match = text.match(/^((?:[A-ZĐ]{2,10}[-.]?\d{1,3})(?:\.\d{1,3})?)\s*(?:[-:–—]\s*)?(.{3,})$/u)
  if (match && !match[1]!.toUpperCase().startsWith('SOP')) return {
    marker: match[1]!.toUpperCase(), markerKind: 'code', title: visibleText(match[2]!), confidence: 0.96
  }
  match = text.match(/^(\d{1,3}(?:\.\d{1,3})+)[.)]?\s+(.{2,})$/u)
  if (match) return { marker: match[1]!, markerKind: 'number', title: visibleText(match[2]!), confidence: 0.9 }
  match = text.match(/^(\d{1,3})[.)]\s*(.{2,})$/u)
  if (match) return { marker: match[1]!, markerKind: 'number', title: visibleText(match[2]!), confidence: 0.86 }
  match = text.match(/^([IVXLCDM]{2,})[.)]\s*(.{2,})$/u)
  if (match) return { marker: match[1]!, markerKind: 'roman', title: visibleText(match[2]!), confidence: 0.82 }
  match = text.match(/^([A-ZĐa-zđ])[.)]\s*(.{2,})$/u)
  if (match) return { marker: match[1]!, markerKind: 'letter', title: visibleText(match[2]!), confidence: 0.84 }
  match = text.match(/^([-+•▪◦])(?:\.)?\s*(.{2,})$/u)
  if (match) return { marker: match[1]!, markerKind: 'bullet', title: visibleText(match[2]!), confidence: 0.8 }
  if (looksLikeHeading(text)) return { marker: null, markerKind: 'heading', title: text.replace(/[:：]$/, ''), confidence: 0.74 }
  if (/^(?:nếu|trường hợp|đối với|trừ khi|lưu ý|chú ý)\b/iu.test(text) || startsWithAction(text)) {
    return { marker: null, markerKind: 'paragraph', title: text, confidence: 0.62 }
  }
  return null
}

function markerLevel(match: MarkerMatch, current: SourceOutlineItem | undefined, hasMainStep: boolean): number {
  if (match.markerKind === 'named_step' || match.markerKind === 'code') return 0
  if (match.markerKind === 'heading') return hasMainStep ? 1 : 0
  if (match.markerKind === 'number') {
    const segments = match.marker?.split('.').length ?? 1
    if (segments > 1) return hasMainStep ? Math.min(segments, 5) : Math.max(0, segments - 1)
    if (current?.markerKind === 'letter') return current.level + 1
    if (current?.markerKind === 'number') return current.level
    if (current?.markerKind === 'bullet') {
      const nestedBulletDepth = current.marker === '+' ? 2 : 1
      return Math.max(hasMainStep ? 1 : 0, current.level - nestedBulletDepth)
    }
    return hasMainStep ? 1 : 0
  }
  if (match.markerKind === 'letter' || match.markerKind === 'roman') {
    const lowerCaseLetter = match.markerKind === 'letter'
      && match.marker === match.marker?.toLocaleLowerCase('vi')
    if (lowerCaseLetter && current && ['number', 'bullet'].includes(current.markerKind)) return current.level + 1
    return hasMainStep ? 1 : 0
  }
  if (match.markerKind === 'bullet') {
    if (!current) return 0
    if (current.markerKind === 'bullet') {
      if (match.marker === '+' && current.marker !== '+') return current.level + 1
      if (match.marker !== '+' && current.marker === '+') return Math.max(hasMainStep ? 1 : 0, current.level - 1)
      return current.level
    }
    return current.level + 1
  }
  if (match.markerKind === 'paragraph') {
    if (!current) return 0
    return current.markerKind === 'heading' ? current.level + 1
      : current.markerKind === 'paragraph' ? current.level : current.level + 1
  }
  return 0
}

function semanticKind(
  match: MarkerMatch,
  parent: SourceOutlineItem | undefined
): SourceOutlineItem['semanticKind'] {
  const text = normalize(match.title)
  if (match.markerKind === 'named_step') return 'main_step'
  if (/(?:^|\s)(phụ lục|quy trình con)(?:\s|$)/u.test(text) && startsWithAction(text)) return 'subprocess'
  if (/^(?:lưu ý|chú ý)(?:\s|:|$)/u.test(text)) return 'note'
  if (/(?:^|\s)(nếu|trường hợp|đối với|trừ khi|tùy theo)(?:\s|:|$)/u.test(text)) {
    return ['bullet', 'paragraph'].includes(match.markerKind) ? 'rule' : 'decision'
  }
  const parentText = normalize(`${parent?.title ?? ''} ${parent?.content ?? ''}`)
  if (match.markerKind === 'number' && /\b(dữ liệu|thông tin|trường|nội dung)\b/u.test(parentText)) return 'input_field'
  if (match.markerKind === 'heading') return 'section'
  if ((match.markerKind === 'letter' || match.markerKind === 'roman')
    && /\b(dữ liệu|thông tin|các trường|nội dung)\s+(?:sau|sau đây)\b/u.test(text)) return 'section'
  if ((match.markerKind === 'letter' || match.markerKind === 'roman') && !startsWithAction(text)) return 'section'
  if (match.markerKind === 'bullet') return /\b(phải|không được|chỉ|bắt buộc|tối đa|tối thiểu)\b/u.test(text) ? 'rule' : 'checklist'
  if (startsWithAction(text)) return 'action'
  if (match.markerKind === 'code') return 'action'
  return match.markerKind === 'paragraph' ? 'checklist' : 'section'
}

function linesFromPages(pages: SourcePage[]): SourceLine[] {
  let lineNumber = 0
  const lines: SourceLine[] = []
  for (const page of pages) {
    for (const raw of page.text.split(/\r?\n/)) {
      lineNumber += 1
      const normalized = raw.split('\u0000').join('').replace(/\u00a0/g, ' ')
      const indent = normalized.match(/^[\t ]*/)?.[0].replace(/\t/g, '    ').length ?? 0
      if (visibleText(normalized)) lines.push({ page: Math.max(1, page.page), line: lineNumber, text: normalized, indent })
    }
  }
  return lines
}

export function buildSourceStructure(pages: SourcePage[], adapter: SourceAdapter = 'plain-text'): SourceStructure {
  const lines = linesFromPages(pages)
  const outline: SourceOutlineItem[] = []
  const stack: Array<SourceOutlineItem | undefined> = []
  let current: SourceOutlineItem | undefined
  let hasMainStep = false

  for (const line of lines) {
    const match = markerFor(line) ?? (['docx-html', 'docx-ocr'].includes(adapter) ? {
      marker: null,
      markerKind: 'paragraph' as const,
      title: visibleText(line.text),
      confidence: 0.55
    } : null)
    if (!match) {
      if (current) {
        current.content = [current.content, visibleText(line.text)].filter(Boolean).join('\n').slice(0, 20_000)
        current.lineEnd = line.line
      }
      continue
    }

    let level = markerLevel(match, current, hasMainStep)
    if (current) level = Math.min(level, current.level + 1)
    level = Math.max(0, Math.min(12, level))
    const parent = level > 0 ? stack[level - 1] : undefined
    const item: SourceOutlineItem = {
      id: `source-item-${String(outline.length + 1).padStart(4, '0')}`,
      parentId: parent?.id ?? null,
      level,
      marker: match.marker,
      markerKind: match.markerKind,
      semanticKind: semanticKind(match, parent),
      title: match.title.slice(0, 1000),
      content: null,
      page: line.page,
      lineStart: line.line,
      lineEnd: line.line,
      sortOrder: outline.length + 1,
      confidence: Math.max(0.35, match.confidence - Math.min(0.12, line.indent > 24 ? 0.05 : 0))
    }
    outline.push(item)
    stack[level] = item
    stack.length = level + 1
    current = item
    if (item.semanticKind === 'main_step') hasMainStep = true
  }

  if (!outline.length && lines.length) {
    const first = lines[0]!
    outline.push({
      id: 'source-item-0001', parentId: null, level: 0, marker: null,
      markerKind: 'paragraph', semanticKind: startsWithAction(first.text) ? 'action' : 'section',
      title: visibleText(first.text).slice(0, 1000),
      content: lines.slice(1).map(line => visibleText(line.text)).join('\n').slice(0, 20_000) || null,
      page: first.page, lineStart: first.line, lineEnd: lines.at(-1)?.line ?? first.line,
      sortOrder: 1, confidence: 0.35
    })
  }

  const operationalStepCount = outline.filter(item => ['main_step', 'action', 'decision', 'subprocess'].includes(item.semanticKind)).length
  return {
    schemaVersion: 1,
    adapter,
    outline,
    stats: {
      pageCount: Math.max(1, pages.length),
      itemCount: outline.length,
      lowConfidenceCount: outline.filter(item => item.confidence < 0.7).length,
      operationalStepCount
    }
  }
}

function suggestedNodeKind(item: SourceOutlineItem): StepInput['nodeKind'] {
  if (item.semanticKind === 'decision') return 'decision'
  if (item.semanticKind === 'subprocess') return 'subprocess'
  return 'task'
}

function suggestedTypeCode(item: SourceOutlineItem, details: string): string {
  const value = normalize(`${item.title}\n${details}`)
  if (/\b(tự động|tự sinh|hệ thống tự)\b/u.test(value)) return 'A'
  if (/\b(kiểm tra|đối chiếu|xác nhận)\b/u.test(value)) return 'C'
  if (/\b(phê duyệt|duyệt)\b/u.test(value)) return 'M'
  return 'N'
}

const operationalKinds = new Set<SourceOutlineItem['semanticKind']>([
  'main_step', 'action', 'decision', 'subprocess'
])

function descendantsOf(outline: SourceOutlineItem[], index: number): SourceOutlineItem[] {
  const root = outline[index]
  if (!root) return []
  const descendants: SourceOutlineItem[] = []
  for (const candidate of outline.slice(index + 1)) {
    if (candidate.level <= root.level) break
    descendants.push(candidate)
  }
  return descendants
}

/**
 * Build the overview flow from the highest meaningful procedure level.
 *
 * A source such as "Bước 1 > A/B > 1/2/3" describes one major procedure
 * step with nested instructions. Turning every nested action into a peer node
 * loses that hierarchy and produces a misleading Mermaid flow. Explicit
 * "Bước N" markers therefore win. For documents without them, only
 * operational items that do not have another operational ancestor become
 * overview nodes.
 */
function flowItems(structure: SourceStructure): SourceOutlineItem[] {
  const mainSteps = structure.outline.filter(item => item.semanticKind === 'main_step')
  if (mainSteps.length) return mainSteps

  const byId = new Map(structure.outline.map(item => [item.id, item]))
  return structure.outline.filter(item => {
    if (!operationalKinds.has(item.semanticKind)) return false
    let parent = item.parentId ? byId.get(item.parentId) : undefined
    while (parent) {
      if (operationalKinds.has(parent.semanticKind)) return false
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }
    return true
  })
}

function outlineLabel(item: SourceOutlineItem, rootLevel: number): string {
  const marker = item.marker
    ? item.markerKind === 'named_step' ? `Bước ${item.marker}: ` : `${item.marker}. `
    : ''
  const indentation = '  '.repeat(Math.max(0, item.level - rootLevel - 1))
  return `${indentation}${marker}${item.title}${item.content ? `\n${item.content}` : ''}`
}

export function buildStepsFromStructure(structure: SourceStructure, fallbackText = ''): { steps: StepInput[]; warnings: string[] } {
  const operational = flowItems(structure)
  const warnings: string[] = []
  if (!operational.length) {
    warnings.push('Không nhận diện được mã bước hoặc bước thao tác; hệ thống tạo một bước nháp để người dùng cấu trúc lại nội dung.')
    return {
      steps: [{
        id: 'import-step-1', stableKey: 'source:fallback', code: 'STEP-01',
        title: 'Rà soát nội dung được trích xuất', description: fallbackText.slice(0, 20_000),
        actor: null, location: null, timing: null, nodeKind: 'task', sortOrder: 1,
        confidence: 0.25,
        sourceRefs: fallbackText.trim() ? [{ lineStart: 1, lineEnd: Math.max(1, fallbackText.split(/\r?\n/).length), text: fallbackText.slice(0, 20_000) }] : [],
        checklist: [], inputs: [], outputs: []
      }],
      warnings
    }
  }

  const steps = operational.slice(0, 300).map((item, index): StepInput => {
    const outlineIndex = structure.outline.findIndex(candidate => candidate.id === item.id)
    const supporting = descendantsOf(structure.outline, outlineIndex)
    const details = [item.content, ...supporting.map(child => outlineLabel(child, item.level))]
      .filter(Boolean).join('\n').slice(0, 20_000)
    const markerLabel = item.marker
      ? item.markerKind === 'named_step' ? `Bước ${item.marker}: `
        : item.markerKind === 'code' ? `${item.marker} ` : `${item.marker}. `
      : ''
    const sourceText = `${markerLabel}${item.title}${item.content ? `\n${item.content}` : ''}`.slice(0, 20_000)
    return {
      id: `import-step-${index + 1}`,
      stableKey: `source:${item.id}`,
      code: item.markerKind === 'code' && item.marker ? item.marker : `STEP-${String(index + 1).padStart(2, '0')}`,
      title: item.title.slice(0, 500),
      description: details || null,
      actor: null,
      location: null,
      timing: null,
      nodeKind: suggestedNodeKind(item),
      typeCode: suggestedTypeCode(item, details),
      sortOrder: index + 1,
      confidence: item.confidence,
      sourceRefs: [{
        lineStart: item.lineStart,
        lineEnd: supporting.at(-1)?.lineEnd ?? item.lineEnd,
        page: item.page,
        text: sourceText || item.title
      }],
      checklist: supporting.map(child => child.title).slice(0, 200),
      inputs: [], outputs: []
    }
  })
  if (operational.length > 300) warnings.push('Tài liệu có hơn 300 thao tác; bản xem trước chỉ giữ 300 thao tác đầu tiên.')
  if (structure.outline.some(item => item.semanticKind === 'main_step')
    && structure.outline.some(item => item.level > 0 && operationalKinds.has(item.semanticKind))) {
    warnings.push('Các thao tác nhỏ nằm trong “Bước N” được giữ trong nội dung chi tiết của bước cha và không tạo thành node ngang hàng trên lưu đồ tổng quan.')
  }
  if (structure.stats.lowConfidenceCount) warnings.push(`${structure.stats.lowConfidenceCount} mục có độ tin cậy thấp và cần được kiểm tra trong tab “Cấu trúc nguồn”.`)

  const namedNumbers = structure.outline
    .filter(item => item.markerKind === 'named_step' && /^\d+$/.test(item.marker ?? ''))
    .map(item => Number(item.marker))
  for (let index = 1; index < namedNumbers.length; index += 1) {
    if (namedNumbers[index]! > namedNumbers[index - 1]! + 1) {
      warnings.push(`Tài liệu nhảy từ Bước ${namedNumbers[index - 1]} sang Bước ${namedNumbers[index]}; cần xác nhận tài liệu có thiếu bước hay không.`)
      break
    }
  }
  warnings.push('Cần kiểm tra cây phân cấp, người thực hiện, input/output và các nhánh quyết định trước khi gửi duyệt.')
  return { steps, warnings }
}
