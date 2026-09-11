import type { ExtractedChunk } from './sop-extractor.js'

function splitText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const paragraphs = text.split(/\n{2,}|(?<=\.)\s+(?=[A-ZÀ-Ỹ[])/u).filter(Boolean)
  const parts: string[] = []
  let current = ''
  for (const paragraph of paragraphs.length > 1 ? paragraphs : text.split('\n').filter(Boolean)) {
    if (paragraph.length > maxChars) {
      if (current) parts.push(current)
      current = ''
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        parts.push(paragraph.slice(offset, offset + maxChars))
      }
      continue
    }
    const candidate = current ? `${current}\n${paragraph}` : paragraph
    if (candidate.length > maxChars && current) {
      parts.push(current)
      current = paragraph
    } else current = candidate
  }
  if (current) parts.push(current)
  return parts
}

/**
 * The Gemini tokenizer is not required by the backend. Vietnamese business text
 * averages fewer than four UTF-16 characters per token, so this conservative
 * approximation keeps requests below the configured budget while preserving a
 * complete SOP step whenever it already fits.
 */
export function splitSemanticChunks(chunks: ExtractedChunk[], maxTokens: number): ExtractedChunk[] {
  const maxChars = Math.max(400, maxTokens * 3)
  let chunkIndex = 0
  return chunks.flatMap(chunk => {
    const parts = splitText(chunk.content, maxChars)
    return parts.map((content, partIndex) => ({
      ...chunk,
      chunkId: parts.length === 1 ? chunk.chunkId : `${chunk.chunkId}-p${partIndex + 1}`,
      chunkIndex: chunkIndex++,
      title: parts.length === 1 ? chunk.title : `${chunk.title} (${partIndex + 1}/${parts.length})`,
      content,
      metadata: parts.length === 1 ? chunk.metadata : {
        ...chunk.metadata,
        part: partIndex + 1,
        totalParts: parts.length
      }
    }))
  })
}
