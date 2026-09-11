import type { RetrievedChunk } from '../rag/retrieval.service.js'
import type { Citation } from '../../schemas/rag.schemas.js'

export class CitationParser {
  parseCitations(rawText: string, contextChunks: RetrievedChunk[]): { cleanText: string; citations: Citation[] } {
    const citations: Citation[] = []
    const available = new Map(contextChunks.map(chunk => [chunk.chunkId, chunk]))
    const assigned = new Map<string, number>()
    const cleanText = rawText.replace(/\[SOURCE_ID:([^\]]+)\]/gi, (_tag, rawId: string) => {
      const id = rawId.trim()
      const chunk = available.get(id)
      if (!chunk) return ''
      let index = assigned.get(id)
      if (!index) {
        index = citations.length + 1
        assigned.set(id, index)
        const stepCode = String(chunk.metadata.stepCode || chunk.sopStepId || '') || undefined
        citations.push({
          index,
          sopId: chunk.sopId,
          sopCode: String(chunk.metadata.sopCode || chunk.sopId),
          sopTitle: String(chunk.metadata.sopTitle || chunk.title),
          stepId: chunk.sopStepId || undefined,
          stepCode,
          stepTitle: String(chunk.metadata.stepTitle || '') || undefined,
          actor: String(chunk.metadata.actor || '') || undefined,
          timing: String(chunk.metadata.timing || '') || undefined,
          excerpt: chunk.content.slice(0, 320),
          routeUrl: `/employee-lifecycle/knowledge-documents/${encodeURIComponent(chunk.sopId)}${stepCode ? `?step=${encodeURIComponent(stepCode)}` : ''}`
        })
      }
      return `[${index}]`
    })
    return { cleanText: cleanText.replace(/[ \t]+\n/g, '\n').trim(), citations }
  }
}
