import { type Static, Type } from '@sinclair/typebox'

export const userDocumentParamsSchema = Type.Object({
  documentId: Type.String({ minLength: 1, maxLength: 100 })
})

export const renameUserDocumentSchema = Type.Object({
  displayName: Type.String({ minLength: 1, maxLength: 500 })
}, { additionalProperties: false })

export const listUserDocumentsQuerySchema = Type.Object({
  search: Type.Optional(Type.String()),
  format: Type.Optional(Type.Union([Type.Literal('all'), Type.Literal('docx'), Type.Literal('pdf')])),
  tab: Type.Optional(Type.Union([Type.Literal('active'), Type.Literal('trash')])),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))
}, { additionalProperties: true })

export const listAdminDocumentsQuerySchema = Type.Object({
  search: Type.Optional(Type.String()),
  format: Type.Optional(Type.Union([Type.Literal('all'), Type.Literal('docx'), Type.Literal('pdf')])),
  tab: Type.Optional(Type.Union([Type.Literal('active'), Type.Literal('trash'), Type.Literal('all')])),
  uploaderId: Type.Optional(Type.String()),
  sortBy: Type.Optional(Type.Union([Type.Literal('createdAt'), Type.Literal('fileSize'), Type.Literal('displayName'), Type.Literal('uploader')])),
  sortOrder: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))
}, { additionalProperties: true })

export const batchActionDocumentsSchema = Type.Object({
  action: Type.Union([Type.Literal('trash'), Type.Literal('restore'), Type.Literal('permanentDelete')]),
  documentIds: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { minItems: 1, maxItems: 100 })
}, { additionalProperties: false })

export type UserDocumentParams = Static<typeof userDocumentParamsSchema>
export type RenameUserDocumentBody = Static<typeof renameUserDocumentSchema>
export type ListUserDocumentsQuery = Static<typeof listUserDocumentsQuerySchema>
export type ListAdminDocumentsQuery = Static<typeof listAdminDocumentsQuerySchema>
export type BatchActionDocumentsBody = Static<typeof batchActionDocumentsSchema>
