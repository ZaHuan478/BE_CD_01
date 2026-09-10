import { Type, type Static } from '@sinclair/typebox'

export const idParamsSchema = Type.Object({ id: Type.String({ minLength: 1, maxLength: 100 }) })

export const createAccountSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  externalSubject: Type.Optional(Type.Union([Type.String({ maxLength: 200 }), Type.Null()])),
  username: Type.String({ minLength: 1, maxLength: 100 }),
  fullName: Type.String({ minLength: 1, maxLength: 200 }),
  email: Type.Optional(Type.Union([Type.String({ format: 'email', maxLength: 320 }), Type.Null()])),
  active: Type.Optional(Type.Boolean())
}, { additionalProperties: false })

export const createGroupSchema = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 100 }),
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()]))
}, { additionalProperties: false })

export const replaceAccountGroupsSchema = Type.Object({
  groupIds: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 100 })
}, { additionalProperties: false })

const grantSchema = Type.Object({
  permissionCode: Type.String({ minLength: 1, maxLength: 100 }),
  scopeType: Type.Union([Type.Literal('system'), Type.Literal('module'), Type.Literal('sop')]),
  scopeId: Type.String({ minLength: 1, maxLength: 100 })
}, { additionalProperties: false })

export const replaceGroupGrantsSchema = Type.Object({
  grants: Type.Array(grantSchema, { maxItems: 1000 })
}, { additionalProperties: false })

export type CreateAccountBody = Static<typeof createAccountSchema>
export type CreateGroupBody = Static<typeof createGroupSchema>
export type ReplaceAccountGroupsBody = Static<typeof replaceAccountGroupsSchema>
export type ReplaceGroupGrantsBody = Static<typeof replaceGroupGrantsSchema>

export const userListQuerySchema = Type.Object({
  search: Type.Optional(Type.String({ minLength: 1, maxLength: 200 }))
}, { additionalProperties: false })

export const replaceUserModulesSchema = Type.Object({
  moduleIds: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
    maxItems: 500,
    uniqueItems: true
  })
}, { additionalProperties: false })

export type ReplaceUserModulesBody = Static<typeof replaceUserModulesSchema>

export const updateUserSchema = Type.Partial(Type.Object({
  active: Type.Boolean(),
  systemRole: Type.Union([Type.Literal('USER'), Type.Literal('CONTENT_EDITOR'), Type.Literal('ADMIN'), Type.Literal('SUPER_ADMIN')]),
  department: Type.Union([Type.String({ maxLength: 255 }), Type.Null()]),
  jobTitle: Type.Union([Type.String({ maxLength: 255 }), Type.Null()])
}), { additionalProperties: false, minProperties: 1 })

export type UpdateUserBody = Static<typeof updateUserSchema>

