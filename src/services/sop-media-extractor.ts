import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { PDFParse } from 'pdf-parse'
import JSZip from 'jszip'
import type { SourceMediaKind, SourceOutlineItem, SourceMedia } from '../schemas/sop.schemas.js'
import type { DocumentStorage } from './document-storage.js'

export interface RawMediaCandidate {
  id: string
  kind: SourceMediaKind
  buffer: Buffer
  mimeType: string
  extension: string
  page?: number
  paragraphIndex?: number
  relationId?: string
  sourceOutlineItemId?: string
  subPath?: string
  width?: number
  height?: number
  checksum: string
  caption?: string
  sortOrder: number
  confidence: number
  isRepeatedLogo?: boolean
}

function mimeFromExt(extension: string): string {
  const ext = extension.toLowerCase().replace(/^\./, '')
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'svg') return 'image/svg+xml'
  return 'image/png'
}

/**
 * Trích xuất hình ảnh từ PDF bằng PDFParse.
 * - Lọc ảnh nhỏ / icon trang trí.
 * - Lọc logo lặp lại trên nhiều trang.
 * - Hạn chế số lượng ảnh và kích thước để tránh hết RAM.
 */
export async function extractMediaFromPdf(
  buffer: Buffer,
  options: { maxImages?: number; minDimension?: number } = {}
): Promise<RawMediaCandidate[]> {
  const maxImages = options.maxImages ?? 50
  const minDimension = options.minDimension ?? 50
  const parser = new PDFParse({ data: buffer })
  const candidates: RawMediaCandidate[] = []

  try {
    const imageResult = await parser.getImage({
      imageBuffer: true,
      imageThreshold: minDimension
    })

    let counter = 0
    const checksumCounts = new Map<string, { count: number; pages: Set<number> }>()
    const rawList: Array<{
      pageNumber: number
      width: number
      height: number
      data: Uint8Array
      name: string
      checksum: string
    }> = []

    for (const page of imageResult.pages) {
      for (const image of page.images) {
        if (!image.data || image.data.length === 0) continue
        if (image.width < minDimension || image.height < minDimension) continue
        if (image.width * image.height < 3600) continue
        // Bỏ qua ảnh vượt quá 15MB
        if (image.data.length > 15 * 1024 * 1024) continue

        const imageBuf = Buffer.from(image.data)
        const checksum = createHash('sha256').update(imageBuf).digest('hex')

        const stat = checksumCounts.get(checksum) ?? { count: 0, pages: new Set<number>() }
        stat.count += 1
        stat.pages.add(page.pageNumber)
        checksumCounts.set(checksum, stat)

        rawList.push({
          pageNumber: page.pageNumber,
          width: image.width,
          height: image.height,
          data: image.data,
          name: image.name,
          checksum
        })
      }
    }

    // Nhận diện logo lặp lại trên >= 2 trang với kích thước vừa/nhỏ
    const repeatedChecksums = new Set<string>()
    for (const [sum, stat] of checksumCounts.entries()) {
      if (stat.pages.size >= 2) {
        repeatedChecksums.add(sum)
      }
    }

    const seenOnPage = new Set<string>()
    for (const item of rawList) {
      if (candidates.length >= maxImages) break

      const pageKey = `${item.pageNumber}:${item.checksum}`
      if (seenOnPage.has(pageKey)) continue
      seenOnPage.add(pageKey)

      counter += 1
      const isRepeated = repeatedChecksums.has(item.checksum)
      const imageBuf = Buffer.from(item.data)

      candidates.push({
        id: `media-${String(counter).padStart(3, '0')}`,
        kind: 'embedded_image',
        buffer: imageBuf,
        mimeType: 'image/png',
        extension: 'png',
        page: item.pageNumber,
        width: item.width,
        height: item.height,
        checksum: item.checksum,
        caption: `Hình ảnh trang ${item.pageNumber} (${item.width}x${item.height})`,
        sortOrder: counter,
        confidence: isRepeated ? 0.1 : 0.85,
        isRepeatedLogo: isRepeated
      })
    }
  } finally {
    await parser.destroy()
  }

  return candidates
}

/**
 * Trích xuất hình ảnh từ DOCX bằng JSZip và phân tích quan hệ r:embed trong word/document.xml.
 */
export async function extractMediaFromDocx(
  buffer: Buffer,
  outline: SourceOutlineItem[] = [],
  options: { maxImages?: number } = {}
): Promise<RawMediaCandidate[]> {
  const maxImages = options.maxImages ?? 50
  const zip = await JSZip.loadAsync(buffer)
  const candidates: RawMediaCandidate[] = []

  // 1. Đọc word/_rels/document.xml.rels để lập bảng quan hệ rId -> media file path
  const relsXml = await zip.files['word/_rels/document.xml.rels']?.async('string')
  const rIdToTarget = new Map<string, string>()
  if (relsXml) {
    const relMatches = relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/gi)
    for (const match of relMatches) {
      const id = match[1]!
      const target = match[2]!
      if (target.includes('media/')) {
        const normalizedTarget = target.startsWith('word/') ? target : `word/${target.replace(/^\.?\//, '')}`
        rIdToTarget.set(id, normalizedTarget)
      }
    }
  }

  // 2. Đọc word/document.xml để xác định thứ tự paragraph và r:embed
  const docXml = await zip.files['word/document.xml']?.async('string')
  const rIdOrder: Array<{ rId: string; paragraphIndex: number; precedingText: string }> = []
  if (docXml) {
    const paragraphRegex = /<w:p\b[\s\S]*?<\/w:p>/gi
    let pIdx = 0
    let lastHeading = ''
    for (const match of docXml.matchAll(paragraphRegex)) {
      pIdx += 1
      const pXml = match[0]
      const textMatches = [...pXml.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/gi)].map(m => m[1]!).join('').trim()
      if (textMatches) lastHeading = textMatches

      const embedMatches = [...pXml.matchAll(/(?:r:embed|r:id)="([^"]+)"/gi)]
      for (const embedMatch of embedMatches) {
        const rId = embedMatch[1]!
        if (rIdToTarget.has(rId)) {
          rIdOrder.push({ rId, paragraphIndex: pIdx, precedingText: lastHeading })
        }
      }
    }
  }

  // 3. Đọc binary của các media file tương ứng
  let counter = 0
  const checksumCounts = new Map<string, number>()
  const processedRIds = new Set<string>()

  // Duyệt theo thứ tự xuất hiện trong document.xml
  for (const item of rIdOrder) {
    if (candidates.length >= maxImages) break
    if (processedRIds.has(item.rId)) continue
    processedRIds.add(item.rId)

    const targetPath = rIdToTarget.get(item.rId)
    if (!targetPath) continue
    const zipEntry = zip.files[targetPath]
    if (!zipEntry) continue

    const ext = extname(targetPath).toLowerCase()
    // Bỏ qua định dạng vector EMF/WMF không hiển thị trực tiếp trên trình duyệt
    if (ext === '.emf' || ext === '.wmf') continue

    const fileData = await zipEntry.async('uint8array')
    if (!fileData || fileData.length < 500) continue
    if (fileData.length > 15 * 1024 * 1024) continue

    const imageBuf = Buffer.from(fileData)
    const checksum = createHash('sha256').update(imageBuf).digest('hex')
    const prevCount = checksumCounts.get(checksum) ?? 0
    checksumCounts.set(checksum, prevCount + 1)

    // Liên kết với outline item gần nhất phía trước theo paragraph index hoặc dòng
    const closestOutline = outline.filter(o => o.lineStart <= item.paragraphIndex).at(-1)

    counter += 1
    candidates.push({
      id: `media-${String(counter).padStart(3, '0')}`,
      kind: 'embedded_image',
      buffer: imageBuf,
      mimeType: mimeFromExt(ext),
      extension: ext.replace(/^\./, '') || 'png',
      paragraphIndex: item.paragraphIndex,
      relationId: item.rId,
      sourceOutlineItemId: closestOutline?.id,
      subPath: closestOutline ? closestOutline.title : undefined,
      checksum,
      caption: item.precedingText ? `Minh họa cho: ${item.precedingText.slice(0, 100)}` : `Ảnh ${counter}`,
      sortOrder: counter,
      confidence: 0.9,
      isRepeatedLogo: prevCount >= 2
    })
  }

  // Xử lý các media entries còn lại trong word/media/ chưa có trong document.xml (nếu có)
  const remainingMedia = Object.keys(zip.files).filter(f => f.startsWith('word/media/') && !Object.values(rIdToTarget).includes(f))
  for (const mediaPath of remainingMedia) {
    if (candidates.length >= maxImages) break
    const ext = extname(mediaPath).toLowerCase()
    if (ext === '.emf' || ext === '.wmf') continue
    const zipEntry = zip.files[mediaPath]
    if (!zipEntry) continue

    const fileData = await zipEntry.async('uint8array')
    if (!fileData || fileData.length < 500) continue
    const imageBuf = Buffer.from(fileData)
    const checksum = createHash('sha256').update(imageBuf).digest('hex')

    counter += 1
    candidates.push({
      id: `media-${String(counter).padStart(3, '0')}`,
      kind: 'embedded_image',
      buffer: imageBuf,
      mimeType: mimeFromExt(ext),
      extension: ext.replace(/^\./, '') || 'png',
      checksum,
      caption: `Ảnh ${counter}`,
      sortOrder: counter,
      confidence: 0.7,
      isRepeatedLogo: false
    })
  }

  return candidates
}

export async function extractAndUploadMedia(
  buffer: Buffer,
  mediaType: string,
  importId: string,
  storage?: DocumentStorage,
  outline: SourceOutlineItem[] = []
): Promise<SourceMedia[]> {
  const isPdf = mediaType === 'application/pdf'
  const rawCandidates = isPdf
    ? await extractMediaFromPdf(buffer)
    : await extractMediaFromDocx(buffer, outline)

  if (storage) {
    const mediaList: SourceMedia[] = []
    for (const candidate of rawCandidates) {
      try {
        const uploaded = await storage.putMedia(
          importId,
          candidate.id,
          candidate.extension,
          candidate.buffer,
          candidate.mimeType
        )
        mediaList.push({
          id: candidate.id,
          kind: candidate.kind,
          page: candidate.page,
          paragraphIndex: candidate.paragraphIndex,
          relationId: candidate.relationId,
          sourceOutlineItemId: candidate.sourceOutlineItemId,
          subPath: candidate.subPath,
          storageKey: uploaded.storageKey,
          previewUrl: uploaded.previewUrl,
          mimeType: candidate.mimeType,
          checksum: candidate.checksum,
          width: candidate.width,
          height: candidate.height,
          caption: candidate.caption,
          sortOrder: candidate.sortOrder,
          confidence: candidate.confidence,
          assignmentStatus: candidate.isRepeatedLogo ? 'ignored' : 'unassigned'
        })
      } catch {
        // Continue if single media storage fails
      }
    }
    return mediaList
  }

  return rawCandidates.map(c => ({
    id: c.id,
    kind: c.kind,
    page: c.page,
    paragraphIndex: c.paragraphIndex,
    relationId: c.relationId,
    sourceOutlineItemId: c.sourceOutlineItemId,
    subPath: c.subPath,
    storageKey: `local:mock/${c.id}.${c.extension}`,
    previewUrl: `data:${c.mimeType};base64,${c.buffer.toString('base64')}`,
    mimeType: c.mimeType,
    checksum: c.checksum,
    width: c.width,
    height: c.height,
    caption: c.caption,
    sortOrder: c.sortOrder,
    confidence: c.confidence,
    assignmentStatus: c.isRepeatedLogo ? 'ignored' : 'unassigned'
  }))
}
