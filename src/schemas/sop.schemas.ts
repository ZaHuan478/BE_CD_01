import { Type, type Static } from '@sinclair/typebox'

const nullableText = Type.Optional(Type.Union([Type.String({ maxLength: 100000 }), Type.Null()]))

const artifactSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  name: Type.String({ minLength: 1, maxLength: 500 }),
  description: nullableText,
  required: Type.Optional(Type.Boolean()),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown()))
}, { additionalProperties: false })

const stepSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 100 }),
  stableKey: Type.String({ minLength: 1, maxLength: 100 }),
  code: Type.String({ minLength: 1, maxLength: 100 }),
  title: Type.String({ minLength: 1, maxLength: 500 }),
  objective: nullableText,
  description: nullableText,
  actor: Type.Optional(Type.Union([Type.String({ maxLength: 300 }), Type.Null()])),
  location: Type.Optional(Type.Union([Type.String({ maxLength: 300 }), Type.Null()])),
  timing: Type.Optional(Type.Union([Type.String({ maxLength: 300 }), Type.Null()])),
  nodeKind: Type.Union([
    Type.Literal('start'), Type.Literal('task'), Type.Literal('decision'),
    Type.Literal('parallel_fork'), Type.Literal('parallel_join'),
    Type.Literal('subprocess'), Type.Literal('end')
  ]),
  typeCode: Type.Optional(Type.Union([Type.String({ maxLength: 20 }), Type.Null()])),
  sortOrder: Type.Integer(),
  checklist: Type.Optional(Type.Array(Type.String({ maxLength: 2000 }), { maxItems: 200 })),
  inputs: Type.Optional(Type.Array(artifactSchema, { maxItems: 100 })),
  outputs: Type.Optional(Type.Array(artifactSchema, { maxItems: 100 }))
}, { additionalProperties: false })

const transitionSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  fromStepId: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  toStepId: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  kind: Type.Union([
    Type.Literal('normal'), Type.Literal('conditional'), Type.Literal('return'),
    Type.Literal('parallel_fork'), Type.Literal('parallel_join'), Type.Literal('subprocess')
  ]),
  condition: nullableText,
  branchLabel: Type.Optional(Type.Union([Type.String({ maxLength: 300 }), Type.Null()])),
  targetSopId: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  sortOrder: Type.Optional(Type.Integer())
}, { additionalProperties: false })

const sopContentProperties = {
  definition: nullableText,
  purpose: nullableText,
  scope: nullableText,
  changeLog: nullableText,
  steps: Type.Array(stepSchema, { maxItems: 1000 }),
  transitions: Type.Array(transitionSchema, { maxItems: 3000 })
}

export const sopContentSchema = Type.Object(sopContentProperties, { additionalProperties: false })

export const createSopSchema = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 100 }),
  title: Type.String({ minLength: 1, maxLength: 500 }),
  category: Type.Optional(Type.Union([Type.String({ maxLength: 200 }), Type.Null()])),
  moduleIds: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { minItems: 1, maxItems: 50 }),
  primaryModuleId: Type.String({ minLength: 1, maxLength: 100 }),
  ...sopContentProperties
}, { additionalProperties: false })

export const replaceSopVersionSchema = Type.Object({
  expectedRowVersion: Type.String({ pattern: '^[1-9][0-9]*$', maxLength: 20 }),
  ...sopContentProperties
}, { additionalProperties: false })

export const rejectVersionSchema = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 4000 })
}, { additionalProperties: false })

export const updateSopSchema = Type.Partial(Type.Object({
  title: Type.String({ minLength: 1, maxLength: 500 }),
  category: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
  moduleIds: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { minItems: 1, maxItems: 50 }),
  primaryModuleId: Type.String({ minLength: 1, maxLength: 100 })
}), { additionalProperties: false, minProperties: 1 })

export const sopParamsSchema = Type.Object({ sopId: Type.String({ minLength: 1, maxLength: 100 }) })
export const versionParamsSchema = Type.Object({ versionId: Type.String({ minLength: 1, maxLength: 100 }) })
export const sopDetailQuerySchema = Type.Object({
  versionId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 }))
})
export const sopListQuerySchema = Type.Object({
  moduleId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  search: Type.Optional(Type.String({ maxLength: 200 })),
  includeDrafts: Type.Optional(Type.Boolean())
})

export type ArtifactInput = Static<typeof artifactSchema>
export type StepInput = Static<typeof stepSchema>
export type TransitionInput = Static<typeof transitionSchema>
export type SopContentInput = Static<typeof sopContentSchema>
export type CreateSopBody = Static<typeof createSopSchema>
export type ReplaceSopVersionBody = Static<typeof replaceSopVersionSchema>
export type UpdateSopBody = Static<typeof updateSopSchema>
