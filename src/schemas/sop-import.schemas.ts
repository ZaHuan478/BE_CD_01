import { type Static } from '@sinclair/typebox'
import { Type } from '@sinclair/typebox'
import { createSopSchema } from './sop.schemas.js'

export const sopImportParamsSchema = Type.Object({
  importId: Type.String({ minLength: 1, maxLength: 100 })
})

export const updateSopImportSchema = createSopSchema

export type UpdateSopImportBody = Static<typeof updateSopImportSchema>

export interface SopImportUpload {
  fileName: string
  mediaType: string
  buffer: Buffer
  code: string
  title: string
  category?: string
  primaryModuleId: string
}
