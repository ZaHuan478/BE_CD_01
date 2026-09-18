import { describe, expect, it } from 'vitest'
import { isMasterDataCatalogEntry, isMasterDataCode, isProcedureDefinition } from '../src/common/procedure-classification.js'
import { buildKnowledgeCatalog } from '../src/common/knowledge-catalog.js'

describe('Master Data is not a procedure', () => {
  it('classifies MD-CAT entries as catalogs and excludes all MD codes from SOPs', () => {
    expect(isMasterDataCatalogEntry('MD-CAT-01', 'MODULE-MD')).toBe(true)
    expect(isMasterDataCatalogEntry('MD-09', 'MODULE-MD-FUNCTIONS')).toBe(true)
    expect(isMasterDataCatalogEntry('MD-10', 'MODULE-MD-FUNCTIONS')).toBe(true)
    expect(isMasterDataCatalogEntry('MD-01', 'MODULE-PLT-MD')).toBe(false)
    expect(isMasterDataCatalogEntry('SOP-ATT-01', 'MODULE-ATT')).toBe(false)
    expect(isMasterDataCode(' md-cat-27 ')).toBe(true)
    expect(isMasterDataCode('MD-01')).toBe(true)
    expect(isMasterDataCode('SOP-ATT-01')).toBe(false)
  })

  it('excludes catalog definitions from a procedure-only library', () => {
    const workflows = {
      'MODULE-MD': [{ sopCode: 'MD-CAT-01', sopTitle: 'Tỉnh/Thành phố', steps: [{ title: 'Tỉnh/Thành phố' }] }],
      'MODULE-PLT-MD': [{ sopCode: 'MD-01', sopTitle: 'Thêm mới giá trị danh mục', steps: [{ title: 'Đề xuất' }, { title: 'Phê duyệt' }] }]
    }
    const documents = buildKnowledgeCatalog(workflows, [])
    expect(documents.find(item => item.code === 'MD-CAT-01')?.type).toBe('catalog')
    expect(documents.find(item => item.code === 'MD-01')?.type).toBe('guide')
    expect(documents.filter(item => item.type === 'procedure').map(item => item.code)).toEqual([])
  })

  it('requires an actual sequence of distinct steps before publication as a procedure', () => {
    expect(isProcedureDefinition({ steps: [{ title: 'Tỉnh/Thành phố' }] })).toBe(false)
    expect(isProcedureDefinition({ steps: [{ title: 'Xử lý' }, { title: 'Xử lý' }] })).toBe(false)
    expect(isProcedureDefinition({ steps: [{ title: 'Tiếp nhận' }, { title: 'Phê duyệt' }] })).toBe(true)
  })
})
