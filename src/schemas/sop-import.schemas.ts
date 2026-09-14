import { type Static } from '@sinclair/typebox'
import { Type } from '@sinclair/typebox'
import { createSopSchema, stepMediaRoleSchema } from './sop.schemas.js'

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

export const mediaParamsSchema = Type.Object({
  importId: Type.String({ minLength: 1, maxLength: 100 }),
  mediaId: Type.String({ minLength: 1, maxLength: 100 })
})

export const updateMediaBodySchema = Type.Object({
  targetStepStableKey: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()])),
  caption: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
  role: Type.Optional(stepMediaRoleSchema),
  sortOrder: Type.Optional(Type.Integer()),
  isIgnored: Type.Optional(Type.Boolean()),
  setAsCover: Type.Optional(Type.Boolean())
}, { additionalProperties: false })

export const cropMediaBodySchema = Type.Object({
  page: Type.Integer({ minimum: 1 }),
  boundingBox: Type.Object({
    x: Type.Number({ minimum: 0 }),
    y: Type.Number({ minimum: 0 }),
    width: Type.Number({ minimum: 1 }),
    height: Type.Number({ minimum: 1 })
  }, { additionalProperties: false }),
  targetStepStableKey: Type.String({ minLength: 1, maxLength: 100 }),
  caption: Type.Optional(Type.String({ maxLength: 1000 })),
  role: Type.Optional(stepMediaRoleSchema),
  imageDataUrl: Type.Optional(Type.String({ maxLength: 20_000_000 }))
}, { additionalProperties: false })

export type ReviewSopImportBody = Static<typeof reviewSopImportSchema>
export type UpdateSopImportBody = Static<typeof updateSopImportSchema>
export type CreateDocumentConversionBody = Static<typeof createDocumentConversionSchema>
export type UpdateMediaBody = Static<typeof updateMediaBodySchema>
export type CropMediaBody = Static<typeof cropMediaBodySchema>

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

