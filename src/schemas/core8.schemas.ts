import { Type, type Static } from '@sinclair/typebox'
export const coreDocumentBody = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 200 }), title: Type.String({ minLength: 1, maxLength: 1000 }),
  type: Type.Union(['procedure', 'policy', 'guide', 'glossary', 'form', 'catalog'].map(value => Type.Literal(value))),
  summary: Type.String({ maxLength: 10000 }),
  moduleIds: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { minItems: 1, maxItems: 100, uniqueItems: true }),
  content: Type.Record(Type.String(), Type.Unknown()),
  effectiveFrom: Type.Optional(Type.String({ format: 'date-time' })), effectiveTo: Type.Optional(Type.String({ format: 'date-time' }))
}, { additionalProperties: false })
export type CoreDocumentBody = Static<typeof coreDocumentBody>
export const coreVersionBody = Type.Object({
  expectedVersion: Type.Integer({ minimum: 1 }), content: Type.Record(Type.String(), Type.Unknown()),
  effectiveFrom: Type.Optional(Type.String({ format: 'date-time' })), effectiveTo: Type.Optional(Type.String({ format: 'date-time' }))
}, { additionalProperties: false })
export type CoreVersionBody = Static<typeof coreVersionBody>
export const coreIdParams = Type.Object({ id: Type.String({ minLength: 1, maxLength: 100 }) })
