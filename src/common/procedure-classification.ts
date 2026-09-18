/** Master-data definitions are catalog entries, not executable SOPs. */
export function isMasterDataCatalogEntry(code: string, workflowId?: string | null): boolean {
  const normalized = code.trim().toUpperCase()
  return /^MD-CAT-\d+$/.test(normalized)
    || ((normalized === 'MD-09' || normalized === 'MD-10') && workflowId === 'MODULE-MD-FUNCTIONS')
}

/** No document with an MD code belongs in the SOP process library. */
export function isMasterDataCode(code: string): boolean {
  return /^MD-/i.test(code.trim())
}

/** Structural gate; business reviewers still decide whether the steps form a real process. */
export function isProcedureDefinition(content: Record<string, unknown>): boolean {
  if (!Array.isArray(content.steps)) return false
  const titles = content.steps.map(step => {
    if (!step || typeof step !== 'object') return ''
    const title = (step as Record<string, unknown>).title
    return typeof title === 'string' ? title.trim().toLocaleLowerCase('vi') : ''
  })
  return titles.length >= 2 && titles.every(Boolean) && new Set(titles).size >= 2
}
