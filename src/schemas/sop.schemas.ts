import { Type, type Static } from '@sinclair/typebox'

const nullableText = Type.Optional(Type.Union([Type.String({ maxLength: 100000 }), Type.Null()]))

const artifactSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  name: Type.String({ minLength: 1, maxLength: 500 }),
  description: nullableText,
  required: Type.Optional(Type.Boolean()),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown()))
}, { additionalProperties: false })

/** Evidence retained from the source document so a reviewer can verify each suggested step. */
const sourceRefSchema = Type.Object({
  lineStart: Type.Optional(Type.Integer({ minimum: 1 })),
  lineEnd: Type.Optional(Type.Integer({ minimum: 1 })),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  text: Type.String({ minLength: 1, maxLength: 20000 })
}, { additionalProperties: false })

const sourceOutlineItemSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 100 }),
  parentId: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()])),
  level: Type.Integer({ minimum: 0, maximum: 12 }),
  marker: Type.Optional(Type.Union([Type.String({ maxLength: 50 }), Type.Null()])),
  markerKind: Type.Union([
    Type.Literal('named_step'), Type.Literal('code'), Type.Literal('number'),
    Type.Literal('letter'), Type.Literal('roman'), Type.Literal('bullet'),
    Type.Literal('heading'), Type.Literal('paragraph')
  ]),
  semanticKind: Type.Union([
    Type.Literal('main_step'), Type.Literal('action'), Type.Literal('decision'),
    Type.Literal('subprocess'), Type.Literal('section'), Type.Literal('input_field'),
    Type.Literal('checklist'), Type.Literal('rule'), Type.Literal('note')
  ]),
  title: Type.String({ minLength: 1, maxLength: 1000 }),
  content: Type.Optional(Type.Union([Type.String({ maxLength: 20000 }), Type.Null()])),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  lineStart: Type.Integer({ minimum: 1 }),
  lineEnd: Type.Integer({ minimum: 1 }),
  sortOrder: Type.Integer({ minimum: 1 }),
  confidence: Type.Number({ minimum: 0, maximum: 1 })
}, { additionalProperties: false })

export const sourceMediaKindSchema = Type.Union([
  Type.Literal('embedded_image'),
  Type.Literal('page_screenshot'),
  Type.Literal('page_crop'),
  Type.Literal('diagram'),
  Type.Literal('unknown')
])

export const sourceMediaSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 100 }),
  kind: sourceMediaKindSchema,
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  paragraphIndex: Type.Optional(Type.Integer({ minimum: 0 })),
  relationId: Type.Optional(Type.String({ maxLength: 100 })),
  sourceOutlineItemId: Type.Optional(Type.String({ maxLength: 100 })),
  subPath: Type.Optional(Type.String({ maxLength: 500 })),
  boundingBox: Type.Optional(Type.Object({
    x: Type.Number(),
    y: Type.Number(),
    width: Type.Number(),
    height: Type.Number()
  }, { additionalProperties: false })),
  storageKey: Type.String({ minLength: 1, maxLength: 500 }),
  previewUrl: Type.Optional(Type.String({ maxLength: 2000 })),
  mimeType: Type.String({ minLength: 1, maxLength: 100 }),
  checksum: Type.String({ minLength: 1, maxLength: 64 }),
  width: Type.Optional(Type.Integer({ minimum: 1 })),
  height: Type.Optional(Type.Integer({ minimum: 1 })),
  caption: Type.Optional(Type.String({ maxLength: 1000 })),
  sortOrder: Type.Integer(),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  assignmentStatus: Type.Union([
    Type.Literal('assigned'),
    Type.Literal('unassigned'),
    Type.Literal('ignored')
  ])
}, { additionalProperties: false })

export const stepMediaRoleSchema = Type.Union([
  Type.Literal('cover'),
  Type.Literal('illustration'),
  Type.Literal('screenshot'),
  Type.Literal('form'),
  Type.Literal('diagram')
])

export const stepMediaSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 100 }),
  sourceMediaId: Type.Optional(Type.String({ maxLength: 100 })),
  storageKey: Type.String({ minLength: 1, maxLength: 500 }),
  url: Type.Optional(Type.String({ maxLength: 2000 })),
  caption: Type.Optional(Type.String({ maxLength: 1000 })),
  role: stepMediaRoleSchema,
  sourcePage: Type.Optional(Type.Integer({ minimum: 1 })),
  sourceSubPath: Type.Optional(Type.String({ maxLength: 500 })),
  sortOrder: Type.Integer(),
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 }))
}, { additionalProperties: false })

const sourceStructureSchema = Type.Object({
  schemaVersion: Type.Union([Type.Literal(1), Type.Literal(2)]),
  adapter: Type.Union([
    Type.Literal('pdf-layout'), Type.Literal('pdf-ocr'),
    Type.Literal('docx-html'), Type.Literal('docx-ocr'), Type.Literal('plain-text')
  ]),
  outline: Type.Array(sourceOutlineItemSchema, { maxItems: 5000 }),
  media: Type.Optional(Type.Array(sourceMediaSchema, { maxItems: 1000 })),
  stats: Type.Object({
    pageCount: Type.Integer({ minimum: 1 }),
    itemCount: Type.Integer({ minimum: 0 }),
    lowConfidenceCount: Type.Integer({ minimum: 0 }),
    operationalStepCount: Type.Integer({ minimum: 0 })
  }, { additionalProperties: false })
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
  positionX: Type.Optional(Type.Number({ minimum: -100000, maximum: 100000 })),
  positionY: Type.Optional(Type.Number({ minimum: -100000, maximum: 100000 })),
  sortOrder: Type.Integer(),
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  sourceRefs: Type.Optional(Type.Array(sourceRefSchema, { maxItems: 20 })),
  checklist: Type.Optional(Type.Array(Type.String({ maxLength: 2000 }), { maxItems: 200 })),
  media: Type.Optional(Type.Array(stepMediaSchema, { maxItems: 100 })),
  imageUrl: Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  illustrationPreset: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
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
  sourceStructure: Type.Optional(sourceStructureSchema),
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
export type SourceOutlineItem = Static<typeof sourceOutlineItemSchema>
export type SourceMediaKind = Static<typeof sourceMediaKindSchema>
export type SourceMedia = Static<typeof sourceMediaSchema>
export type StepMediaRole = Static<typeof stepMediaRoleSchema>
export type StepMedia = Static<typeof stepMediaSchema>
export type SourceStructure = Static<typeof sourceStructureSchema>
export type StepInput = Static<typeof stepSchema>
export type TransitionInput = Static<typeof transitionSchema>
export type SopContentInput = Static<typeof sopContentSchema>
export type CreateSopBody = Static<typeof createSopSchema>
export type ReplaceSopVersionBody = Static<typeof replaceSopVersionSchema>
export type UpdateSopBody = Static<typeof updateSopSchema>
