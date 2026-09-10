import { Type, type Static } from '@sinclair/typebox'

export const auditQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 5, maximum: 100, default: 20 })),
  search: Type.Optional(Type.String({ maxLength: 200 })),
  entityType: Type.Optional(Type.String({ maxLength: 100 })),
  action: Type.Optional(Type.String({ maxLength: 100 }))
}, { additionalProperties: false })

export const settingsSchema = Type.Object({
  portalName: Type.String({ minLength: 2, maxLength: 120 }),
  defaultPageSize: Type.Integer({ minimum: 10, maximum: 100 }),
  reviewDueDays: Type.Integer({ minimum: 1, maximum: 90 }),
  requireReviewBeforePublish: Type.Boolean(),
  allowOwnerSelfApproval: Type.Boolean()
}, { additionalProperties: false })

export const createProfileSchema = Type.Object({
  code: Type.String({ minLength: 2, maxLength: 100, pattern: '^[A-Z][A-Z0-9_]*$' }),
  name: Type.String({ minLength: 2, maxLength: 200 }),
  description: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
  capabilities: Type.Array(Type.String({ minLength: 2, maxLength: 100 }), { maxItems: 50, uniqueItems: true })
}, { additionalProperties: false })

export const updateProfileSchema = Type.Object({
  name: Type.String({ minLength: 2, maxLength: 200 }),
  description: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
  active: Type.Boolean(),
  capabilities: Type.Array(Type.String({ minLength: 2, maxLength: 100 }), { maxItems: 50, uniqueItems: true })
}, { additionalProperties: false })

export const replaceUserProfilesSchema = Type.Object({
  profileIds: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 50, uniqueItems: true })
}, { additionalProperties: false })

export const sopRoleAssignmentSchema = Type.Object({
  accountId: Type.String({ minLength: 1, maxLength: 100 }),
  roleCode: Type.Union([Type.Literal('VIEWER'), Type.Literal('OWNER'), Type.Literal('EDITOR'), Type.Literal('REVIEWER'), Type.Literal('APPROVER')])
}, { additionalProperties: false })

export const replaceSopRolesSchema = Type.Object({
  assignments: Type.Array(sopRoleAssignmentSchema, { maxItems: 200 })
}, { additionalProperties: false })

export const bootstrapSuperAdminSchema = Type.Object({ accountId: Type.String({ minLength: 1, maxLength: 100 }) }, { additionalProperties: false })

export const resourceParamsSchema = Type.Object({ id: Type.String({ minLength: 1, maxLength: 100 }) })

export type BootstrapSuperAdminBody = Static<typeof bootstrapSuperAdminSchema>
export type AuditQuery = Static<typeof auditQuerySchema>
export type SystemSettings = Static<typeof settingsSchema>
export type CreateProfileBody = Static<typeof createProfileSchema>
export type UpdateProfileBody = Static<typeof updateProfileSchema>
export type ReplaceUserProfilesBody = Static<typeof replaceUserProfilesSchema>
export type ReplaceSopRolesBody = Static<typeof replaceSopRolesSchema>

