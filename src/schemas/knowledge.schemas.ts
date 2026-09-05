import { Type, type Static } from '@sinclair/typebox'

const statusSchema = Type.Union([Type.Literal('draft'), Type.Literal('published'), Type.Literal('archived')])

export const knowledgeQuerySchema = Type.Object({
  moduleId: Type.Optional(Type.String({ maxLength: 100 })),
  sopId: Type.Optional(Type.String({ maxLength: 100 })),
  search: Type.Optional(Type.String({ maxLength: 200 })),
  includeDrafts: Type.Optional(Type.Boolean())
})

const documentLinkSchema = Type.Object({
  sopId: Type.String({ minLength: 1, maxLength: 100 }),
  versionId: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  stepId: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  kind: Type.Optional(Type.Union([
    Type.Literal('reference'), Type.Literal('template'), Type.Literal('form'),
    Type.Literal('evidence'), Type.Literal('policy')
  ])),
  sortOrder: Type.Optional(Type.Integer())
}, { additionalProperties: false })

export const createDocumentSchema = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 100 }),
  title: Type.String({ minLength: 1, maxLength: 500 }),
  assetUrl: Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  mediaType: Type.Optional(Type.Union([Type.String({ maxLength: 200 }), Type.Null()])),
  checksum: Type.Optional(Type.Union([Type.String({ maxLength: 128 }), Type.Null()])),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  links: Type.Array(documentLinkSchema, { minItems: 1, maxItems: 100 })
}, { additionalProperties: false })

export const createTermSchema = Type.Object({
  term: Type.String({ minLength: 1, maxLength: 300 }),
  definition: Type.String({ minLength: 1, maxLength: 100000 }),
  aliases: Type.Optional(Type.Array(Type.String({ maxLength: 300 }), { maxItems: 100 })),
  moduleId: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  status: Type.Optional(statusSchema)
}, { additionalProperties: false })

export const createGuidanceSchema = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 100 }),
  title: Type.String({ minLength: 1, maxLength: 500 }),
  content: Type.String({ minLength: 1, maxLength: 200000 }),
  moduleId: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  sopId: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  status: Type.Optional(statusSchema),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown()))
}, { additionalProperties: false })

export type KnowledgeQuery = Static<typeof knowledgeQuerySchema>
export type CreateDocumentBody = Static<typeof createDocumentSchema>
export type CreateTermBody = Static<typeof createTermSchema>
export type CreateGuidanceBody = Static<typeof createGuidanceSchema>
