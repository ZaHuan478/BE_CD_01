import type { FastifyPluginAsync } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import { AccessController } from '../controllers/access.controller.js'
import { AccessRepository } from '../repositories/access.repository.js'
import { AccessService } from '../services/access.service.js'
import {
  createAccountSchema,
  createGroupSchema,
  idParamsSchema,
  replaceAccountGroupsSchema,
  replaceGroupGrantsSchema,
  replaceUserModulesSchema,
  userListQuerySchema,
  type CreateAccountBody,
  type CreateGroupBody,
  type ReplaceAccountGroupsBody,
  type ReplaceGroupGrantsBody
} from '../schemas/access.schemas.js'

interface IdParams { id: string }

export function accessRoutes(authService: AuthService, repository: AccessRepository): FastifyPluginAsync {
  const controller = new AccessController(authService, new AccessService(repository))
  return async (app) => {
    app.get('/permissions', {
      schema: { tags: ['Access'], summary: 'List permission definitions' }
    }, (request) => controller.listPermissions(request))

    app.get('/accounts', {
      schema: { tags: ['Access'], summary: 'List accounts and group memberships' }
    }, (request) => controller.listAccounts(request))

    app.post<{ Body: CreateAccountBody }>('/accounts', {
      schema: { tags: ['Access'], summary: 'Provision an account', body: createAccountSchema }
    }, (request, reply) => controller.createAccount(request, reply))

    app.put<{ Params: IdParams; Body: ReplaceAccountGroupsBody }>('/accounts/:id/groups', {
      schema: {
        tags: ['Access'],
        summary: 'Replace group memberships for an account',
        params: idParamsSchema,
        body: replaceAccountGroupsSchema
      }
    }, (request, reply) => controller.replaceAccountGroups(request, reply))

    app.get('/groups', {
      schema: { tags: ['Access'], summary: 'List groups and grants' }
    }, (request) => controller.listGroups(request))

    app.post<{ Body: CreateGroupBody }>('/groups', {
      schema: { tags: ['Access'], summary: 'Create a user group', body: createGroupSchema }
    }, (request, reply) => controller.createGroup(request, reply))

    app.put<{ Params: IdParams; Body: ReplaceGroupGrantsBody }>('/groups/:id/grants', {
      schema: {
        tags: ['Access'],
        summary: 'Replace scoped grants for a group',
        params: idParamsSchema,
        body: replaceGroupGrantsSchema
      }
    }, (request, reply) => controller.replaceGroupGrants(request, reply))

    app.get<{ Querystring: { search?: string } }>('/admin/users', {
      schema: {
        tags: ['Access'],
        summary: 'List users for module-access administration',
        querystring: userListQuerySchema
      }
    }, (request) => controller.listUsers(request))

    app.get<{ Params: IdParams }>('/admin/users/:id/module-access', {
      schema: {
        tags: ['Access'],
        summary: 'Get direct and effective module access for one user',
        params: idParamsSchema
      }
    }, (request) => controller.getUserModuleAccess(request))

    app.put<{ Params: IdParams; Body: import('../schemas/access.schemas.js').ReplaceUserModulesBody }>(
      '/admin/users/:id/module-access',
      {
        schema: {
          tags: ['Access'],
          summary: 'Replace manually assigned modules for one user',
          params: idParamsSchema,
          body: replaceUserModulesSchema
        }
      },
      (request) => controller.replaceUserModules(request)
    )
  }
}
