import { Type, type Static } from '@sinclair/typebox'

const guideStepSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 240 }),
  description: Type.String({ minLength: 1, maxLength: 2000 })
}, { additionalProperties: false })

export const systemGuideContentSchema = Type.Object({
  purpose: Type.String({ minLength: 1, maxLength: 3000 }),
  audience: Type.String({ minLength: 1, maxLength: 1000 }),
  accessPath: Type.String({ minLength: 1, maxLength: 1000 }),
  prerequisites: Type.Array(Type.String({ maxLength: 1000 }), { maxItems: 30 }),
  steps: Type.Array(guideStepSchema, { minItems: 1, maxItems: 50 }),
  result: Type.String({ minLength: 1, maxLength: 2000 }),
  permissions: Type.Array(Type.String({ maxLength: 500 }), { maxItems: 30 }),
  commonErrors: Type.Array(Type.String({ maxLength: 1000 }), { maxItems: 30 }),
  relatedRoutes: Type.Array(Type.String({ maxLength: 500 }), { maxItems: 30 }),
  support: Type.String({ maxLength: 2000 })
}, { additionalProperties: false })

const audienceSchema = Type.Union([Type.Literal('ALL'), Type.Literal('AUTHORIZED'), Type.Literal('ADMIN')])
const tourStepInputSchema = Type.Object({
  anchor: Type.String({ minLength: 1, maxLength: 120, pattern: '^[a-zA-Z0-9_-]+$' }),
  title: Type.String({ minLength: 1, maxLength: 240 }),
  description: Type.String({ minLength: 1, maxLength: 1000 }),
  routePath: Type.String({ minLength: 1, maxLength: 500 }),
  sortOrder: Type.Integer({ minimum: 0, maximum: 100000 })
}, { additionalProperties: false })

export const createSystemGuideSchema = Type.Object({
  slug: Type.String({ minLength: 2, maxLength: 160, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
  title: Type.String({ minLength: 2, maxLength: 240 }),
  summary: Type.String({ minLength: 2, maxLength: 1000 }),
  category: Type.String({ minLength: 2, maxLength: 100 }),
  routePath: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
  requiredPermission: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  audienceMode: audienceSchema,
  sortOrder: Type.Integer({ minimum: 0, maximum: 100000 }),
  content: systemGuideContentSchema,
  tour: Type.Optional(Type.Array(tourStepInputSchema, { maxItems: 30 }))
}, { additionalProperties: false })

export const updateSystemGuideSchema = Type.Partial(createSystemGuideSchema, { additionalProperties: false })
export const systemGuideParamsSchema = Type.Object({ id: Type.String({ minLength: 1, maxLength: 160 }) })
export const systemGuideProgressSchema = Type.Object({
  completedSteps: Type.Array(Type.Integer({ minimum: 0, maximum: 1000 }), { maxItems: 100, uniqueItems: true }),
  tourCompleted: Type.Boolean(),
  dismissed: Type.Boolean()
}, { additionalProperties: false })

export type SystemGuideContent = Static<typeof systemGuideContentSchema>
export type CreateSystemGuideBody = Static<typeof createSystemGuideSchema>
export type UpdateSystemGuideBody = Static<typeof updateSystemGuideSchema>
export type SystemGuideProgressBody = Static<typeof systemGuideProgressSchema>
