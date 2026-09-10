import { type Static } from '@sinclair/typebox'
import { Type } from '@sinclair/typebox'
import { createSopSchema } from './sop.schemas.js'

export const sopImportParamsSchema = Type.Object({
  importId: Type.String({ minLength: 1, maxLength: 100 })
})

export const updateSopImportSchema = createSopSchema
export const reviewSopImportSchema = Type.Object({ note: Type.Optional(Type.String({ maxLength: 1000 })) }, { additionalProperties: false })
export const createDocumentConversionSchema = Type.Object({
  documentId: Type.String({ minLength: 1, maxLength: 100 }),
  code: Type.String({ minLength: 1, maxLength: 100 }),
  title: Type.String({ minLength: 1, maxLength: 500 }),
  category: Type.Optional(Type.String({ maxLength: 200 })),
  primaryModuleId: Type.String({ minLength: 1, maxLength: 100 }),
  audienceMode: Type.Optional(Type.Union([
    Type.Literal('personal'),
    Type.Literal('department'),
    Type.Literal('job_title'),
    Type.Literal('department_job_title'),
    Type.Literal('module')
  ]))
}, { additionalProperties: false })

export type ReviewSopImportBody = Static<typeof reviewSopImportSchema>
export type UpdateSopImportBody = Static<typeof updateSopImportSchema>
export type CreateDocumentConversionBody = Static<typeof createDocumentConversionSchema>

export interface SopImportUpload {
  fileName: string
  mediaType: string
  buffer: Buffer
  code: string
  title: string
  category?: string
  primaryModuleId: string
  audienceMode?: 'personal' | 'department' | 'job_title' | 'department_job_title' | 'module'
}

