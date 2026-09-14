import { Type, type Static } from '@sinclair/typebox'

export const glossarySearchQuerySchema = Type.Object({
  q: Type.Optional(Type.String({ maxLength: 200 })),
  category: Type.Optional(Type.String({ maxLength: 100 })),
  letter: Type.Optional(Type.String({ maxLength: 10 })),
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 }))
}, { additionalProperties: false })

export const createGlossaryTermSchema = Type.Object({
  slug: Type.String({ minLength: 2, maxLength: 160, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
  term: Type.String({ minLength: 1, maxLength: 240 }),
  vietnameseName: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 240 }), Type.Null()])),
  category: Type.String({ minLength: 1, maxLength: 100 }),
  routePath: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
  sortOrder: Type.Optional(Type.Integer({ minimum: 0, maximum: 100000, default: 0 })),
  shortDefinition: Type.String({ minLength: 1, maxLength: 1000 }),
  detailedDefinition: Type.String({ minLength: 1, maxLength: 30000 }),
  aliases: Type.Array(Type.String({ minLength: 1, maxLength: 240 }), { maxItems: 30, default: [] }),
  examples: Type.Array(Type.String({ minLength: 1, maxLength: 1000 }), { maxItems: 30, default: [] }),
  relatedTermSlugs: Type.Array(Type.String({ minLength: 1, maxLength: 160 }), { maxItems: 30, default: [] })
}, { additionalProperties: false })

export const updateGlossaryTermSchema = Type.Partial(createGlossaryTermSchema, { additionalProperties: false })

export const systemGlossaryParamsSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 160 })
}, { additionalProperties: false })

export const associateGuideTermsSchema = Type.Object({
  guideId: Type.String({ minLength: 1, maxLength: 100 }),
  guideVersionNumber: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  termIds: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 100, uniqueItems: true })
}, { additionalProperties: false })

export type GlossarySearchQuery = Static<typeof glossarySearchQuerySchema>
export type CreateGlossaryTermBody = Static<typeof createGlossaryTermSchema>
export type UpdateGlossaryTermBody = Static<typeof updateGlossaryTermSchema>
export type SystemGlossaryParams = Static<typeof systemGlossaryParamsSchema>
export type AssociateGuideTermsBody = Static<typeof associateGuideTermsSchema>
