import { Type, type Static } from '@sinclair/typebox'

export const runtimeDatasetKeys = [
  'translations', 'sop.dictionary', 'page.businessNodes', 'coreOperations.config',
  'crossFunctional.registry', 'masterData.catalog', 'lifecycle.journey',
  'lifecycleStepper.modules', 'erd.clusters', 'policy.registry'
] as const
export const datasetParamsSchema = Type.Object({ key: Type.Union(runtimeDatasetKeys.map(key => Type.Literal(key))) })
export const workflowParamsSchema = Type.Object({ workflowId: Type.String({ minLength: 1, maxLength: 100 }) })
export const documentParamsSchema = Type.Object({ documentId: Type.String({ minLength: 1, maxLength: 100 }) })
export const catalogQuerySchema = Type.Object({
  q: Type.Optional(Type.String({ maxLength: 200 })),
  moduleId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  type: Type.Optional(Type.Union(['procedure', 'policy', 'guide', 'glossary', 'form', 'catalog'].map(value => Type.Literal(value)))),
  page: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000000, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 }))
}, { additionalProperties: false })
export type CatalogQuery = Static<typeof catalogQuerySchema>
