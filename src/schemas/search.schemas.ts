import { Type, type Static } from '@sinclair/typebox'

export const searchQuerySchema = Type.Object({
  q: Type.String({ minLength: 2, maxLength: 200 }),
  moduleId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  type: Type.Optional(Type.Union([
    Type.Literal('all'), Type.Literal('sop'), Type.Literal('document'),
    Type.Literal('guidance'), Type.Literal('term')
  ])),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))
}, { additionalProperties: false })

export type SearchQuery = Static<typeof searchQuerySchema>
