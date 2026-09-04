import type { FastifyPluginAsync } from 'fastify'
import type { AuthService } from '../../auth/auth.service.js'
import { requirePermission } from '../../auth/guards.js'
import { AccessRepository } from './access.repository.js'
import {
  createAccountSchema,
  createGroupSchema,
  idParamsSchema,
  replaceAccountGroupsSchema,
  replaceGroupGrantsSchema,
  type CreateAccountBody,
  type CreateGroupBody,
  type ReplaceAccountGroupsBody,
  type ReplaceGroupGrantsBody
} from './access.schemas.js'

interface IdParams { id: string }

export function accessRoutes(authService: AuthService, repository: AccessRepository): FastifyPluginAsync {
  return async (app) => {
    app.get('/permissions', {
      schema: { tags: ['Access'], summary: 'List permission definitions' }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      requirePermission(principal, 'permission.manage')
      return { items: await repository.listPermissions() }
    })

    app.get('/accounts', {
      schema: { tags: ['Access'], summary: 'List accounts and group memberships' }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      requirePermission(principal, 'permission.manage')
      return { items: await repository.listAccounts() }
    })

    app.post<{ Body: CreateAccountBody }>('/accounts', {
      schema: { tags: ['Access'], summary: 'Provision an account', body: createAccountSchema }
    }, async (request, reply) => {
      const principal = await authService.authenticate(request)
      requirePermission(principal, 'permission.manage')
      const account = await repository.createAccount(request.body)
      return reply.code(201).send(account)
    })

    app.put<{ Params: IdParams; Body: ReplaceAccountGroupsBody }>('/accounts/:id/groups', {
      schema: {
        tags: ['Access'],
        summary: 'Replace group memberships for an account',
        params: idParamsSchema,
        body: replaceAccountGroupsSchema
      }
    }, async (request, reply) => {
      const principal = await authService.authenticate(request)
      requirePermission(principal, 'permission.manage')
      await repository.replaceAccountGroups(request.params.id, request.body.groupIds, principal.accountId)
      return reply.code(204).send()
    })

    app.get('/groups', {
      schema: { tags: ['Access'], summary: 'List groups and grants' }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      requirePermission(principal, 'permission.manage')
      return { items: await repository.listGroups() }
    })

    app.post<{ Body: CreateGroupBody }>('/groups', {
      schema: { tags: ['Access'], summary: 'Create a user group', body: createGroupSchema }
    }, async (request, reply) => {
      const principal = await authService.authenticate(request)
      requirePermission(principal, 'permission.manage')
      const group = await repository.createGroup(request.body)
      return reply.code(201).send(group)
    })

    app.put<{ Params: IdParams; Body: ReplaceGroupGrantsBody }>('/groups/:id/grants', {
      schema: {
        tags: ['Access'],
        summary: 'Replace scoped grants for a group',
        params: idParamsSchema,
        body: replaceGroupGrantsSchema
      }
    }, async (request, reply) => {
      const principal = await authService.authenticate(request)
      requirePermission(principal, 'permission.manage')
      await repository.replaceGroupGrants(request.params.id, request.body, principal.accountId)
      return reply.code(204).send()
    })
  }
}
