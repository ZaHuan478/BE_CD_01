import { Type, type Static } from '@sinclair/typebox'

export const indexStatusItemSchema = Type.Object({
  entityId: Type.String(),
  entityType: Type.String(),
  versionId: Type.String(),
  title: Type.String(),
  moduleId: Type.String(),
  indexStatus: Type.Union([
    Type.Literal('pending'),
    Type.Literal('indexing'),
    Type.Literal('synced'),
    Type.Literal('failed'),
    Type.Literal('stale')
  ]),
  totalChunks: Type.Integer(),
  indexedChunks: Type.Integer(),
  errorMessage: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  triggerSource: Type.String(),
  lastIndexedAt: Type.Optional(Type.Union([Type.String(), Type.Null()]))
})

export const indexOverviewSchema = Type.Object({
  totalDocuments: Type.Integer(),
  syncedDocuments: Type.Integer(),
  pendingDocuments: Type.Integer(),
  failedDocuments: Type.Integer(),
  totalChunks: Type.Integer(),
  items: Type.Array(indexStatusItemSchema),
  latestJob: Type.Union([Type.Null(), Type.Object({
    jobId: Type.String(),
    scope: Type.Union([Type.Literal('all'), Type.Literal('module'), Type.Literal('sop')]),
    targetId: Type.Union([Type.String(), Type.Null()]),
    status: Type.Union([Type.Literal('pending'), Type.Literal('running'), Type.Literal('succeeded'), Type.Literal('failed')]),
    totalItems: Type.Integer(),
    succeededItems: Type.Integer(),
    failedItems: Type.Integer(),
    errorMessage: Type.Union([Type.String(), Type.Null()]),
    requestedBy: Type.String(),
    createdAt: Type.String(),
    startedAt: Type.Union([Type.String(), Type.Null()]),
    finishedAt: Type.Union([Type.String(), Type.Null()])
  })])
})

export type IndexOverview = Static<typeof indexOverviewSchema>

export const reindexRequestSchema = Type.Object({
  scope: Type.Union([Type.Literal('all'), Type.Literal('module'), Type.Literal('sop')]),
  targetId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 }))
}, { additionalProperties: false })

export type ReindexRequest = Static<typeof reindexRequestSchema>

export const citationSchema = Type.Object({
  index: Type.Integer(),
  sopId: Type.String(),
  sopCode: Type.String(),
  sopTitle: Type.String(),
  stepId: Type.Optional(Type.String()),
  stepCode: Type.Optional(Type.String()),
  stepTitle: Type.Optional(Type.String()),
  actor: Type.Optional(Type.String()),
  timing: Type.Optional(Type.String()),
  excerpt: Type.Optional(Type.String()),
  routeUrl: Type.String()
})

export type Citation = Static<typeof citationSchema>

export const chatCompletionRequestSchema = Type.Object({
  message: Type.String({ minLength: 1, maxLength: 2000 }),
  sessionId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  moduleId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  stream: Type.Optional(Type.Boolean())
}, { additionalProperties: false })

export type ChatCompletionRequest = Static<typeof chatCompletionRequestSchema>

export const chatCompletionResponseSchema = Type.Object({
  sessionId: Type.String(),
  message: Type.String(),
  citations: Type.Array(citationSchema)
})

export type ChatCompletionResponse = Static<typeof chatCompletionResponseSchema>

export const chatSessionSchema = Type.Object({
  sessionId: Type.String(),
  title: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String()
})

export type ChatSessionItem = Static<typeof chatSessionSchema>
