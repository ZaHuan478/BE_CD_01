import { Type, type Static } from '@sinclair/typebox'

export const moduleParamsSchema = Type.Object({
  moduleId: Type.String({ minLength: 1, maxLength: 100 })
})

export const createModuleSchema = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 100 }),
  title: Type.String({ minLength: 1, maxLength: 250 }),
  description: Type.Optional(Type.Union([Type.String({ maxLength: 10000 }), Type.Null()])),
  moduleType: Type.String({ minLength: 1, maxLength: 100 }),
  status: Type.Optional(Type.Union([
    Type.Literal('draft'), Type.Literal('published'), Type.Literal('archived')
  ])),
  sortOrder: Type.Optional(Type.Integer())
}, { additionalProperties: false })

export const updateModuleSchema = Type.Partial(createModuleSchema, {
  additionalProperties: false,
  minProperties: 1
})

export type CreateModuleBody = Static<typeof createModuleSchema>
export type UpdateModuleBody = Static<typeof updateModuleSchema>
