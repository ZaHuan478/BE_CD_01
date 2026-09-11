import { describe, expect, it } from 'vitest'
import type { AuthPrincipal } from '../src/auth/types.js'
import type { DatabaseParameters, QueryRunner } from '../src/database/database.js'
import { ModuleRepository } from '../src/repositories/module.repository.js'
import { GeminiClient } from '../src/services/rag/gemini.client.js'
import { RetrievalService } from '../src/services/rag/retrieval.service.js'

class SecurityTestDatabase implements QueryRunner {
  async query<T extends object>(statement: string, parameters: DatabaseParameters = {}): Promise<T[]> {
    if (statement.includes('FROM HrModule')) return [
      { ModuleId: 'emp', ModuleCode: 'EMP', Title: 'Nhân sự', Description: null, ModuleType: 'business', Status: 'published', IsCommon: false, SortOrder: 1, BusinessCluster: 'core', IconKey: 'users', CreatedAt: new Date(), UpdatedAt: new Date() },
      { ModuleId: 'pay', ModuleCode: 'PAY', Title: 'Lương', Description: null, ModuleType: 'business', Status: 'published', IsCommon: false, SortOrder: 2, BusinessCluster: 'core', IconKey: 'wallet', CreatedAt: new Date(), UpdatedAt: new Date() }
    ] as T[]
    if (statement.includes('FROM RagChunk')) return [
      { RagChunkId: 'emp-1', SopId: 'doc-emp', SopVersionId: 'v1', SopStepId: 'E1', ModuleId: 'emp', IsCommon: false, ChunkType: 'sop_step', ChunkIndex: 1, Title: 'Hồ sơ', Content: 'Cập nhật hồ sơ nhân sự', ContentHash: 'a', MetadataJson: '{}' },
      // Deliberately returned by the fake search engine to prove that the
      // canonical document authorization check removes it before prompting.
      { RagChunkId: 'pay-1', SopId: 'doc-pay', SopVersionId: 'v1', SopStepId: 'P1', ModuleId: 'pay', IsCommon: false, ChunkType: 'sop_step', ChunkIndex: 1, Title: 'Lương', Content: 'Dữ liệu lương bí mật', ContentHash: 'b', MetadataJson: '{}' }
    ] as T[]
    if (statement.includes('FROM KnowledgeDocument d') && parameters.id === 'doc-emp') return [{
      DocumentId: 'doc-emp', Code: 'SOP-EMP', Title: 'Hồ sơ', DocumentType: 'procedure', Summary: '', WorkflowId: null,
      CurrentVersionNumber: 1, ContentJson: JSON.stringify({ steps: [] })
    }] as T[]
    if (statement.includes('FROM KnowledgeDocument d') && parameters.id === 'doc-pay') return [] as T[]
    if (statement.includes('FROM KnowledgeDocumentModule')) return [{ DocumentId: 'doc-emp', ModuleId: 'emp' }] as T[]
    return []
  }
}

const employee: AuthPrincipal = {
  accountId: 'employee', username: 'employee', fullName: 'Nhân viên', email: null, systemRole: 'USER',
  organization: { employeeCode: 'E1', company: 'LTA', division: null, department: 'Nhân sự', team: null, jobTitle: 'Chuyên viên', managerAccountId: null },
  groupIds: [], grants: [{ permissionCode: 'sop.read', scopeType: 'module', scopeId: 'emp' }]
}

describe('RAG document authorization', () => {
  it('removes a chunk that fails the canonical current-document permission check', async () => {
    const database = new SecurityTestDatabase()
    const retrieval = new RetrievalService(database, new ModuleRepository(database, true), new GeminiClient({}), 5, 0.65)
    const chunks = await retrieval.retrieveRelevantChunks(employee, 'hướng dẫn')
    expect(chunks.map(chunk => chunk.sopId)).toEqual(['doc-emp'])
    expect(chunks.some(chunk => chunk.content.includes('lương bí mật'))).toBe(false)
  })

  it('rejects an explicit module filter outside the user scope', async () => {
    const database = new SecurityTestDatabase()
    const retrieval = new RetrievalService(database, new ModuleRepository(database, true), new GeminiClient({}), 5, 0.65)
    await expect(retrieval.retrieveRelevantChunks(employee, 'bảng lương', 'pay')).rejects.toMatchObject({ statusCode: 403 })
  })
})
