import type { FastifyPluginAsync } from 'fastify'
import { SystemGlossaryController } from '../controllers/system-glossary.controller.js'
import type { SystemGlossaryRepository } from '../repositories/system-glossary.repository.js'
import {
  associateGuideTermsSchema,
  createGlossaryTermSchema,
  glossarySearchQuerySchema,
  systemGlossaryParamsSchema,
  updateGlossaryTermSchema,
  type AssociateGuideTermsBody,
  type CreateGlossaryTermBody,
  type GlossarySearchQuery,
  type UpdateGlossaryTermBody
} from '../schemas/system-glossary.schemas.js'
import type { AuthService } from '../services/auth.service.js'
import { SystemGlossaryService } from '../services/system-glossary.service.js'

interface SlugParams {
  slug: string
}

interface IdParams {
  id: string
}

export function systemGlossaryRoutes(
  auth: AuthService,
  repository: SystemGlossaryRepository
): FastifyPluginAsync {
  const controller = new SystemGlossaryController(auth, new SystemGlossaryService(repository))

  return async app => {
    // 1. Public API (yêu cầu đăng nhập, chỉ trả published)
    app.get<{ Querystring: GlossarySearchQuery }>(
      '/system-glossary',
      {
        schema: {
          tags: ['System glossary'],
          summary: 'List published glossary terms with search, filter and pagination',
          querystring: glossarySearchQuerySchema
        }
      },
      request => controller.list(request)
    )

    app.get<{ Params: SlugParams }>(
      '/system-glossary/:slug',
      {
        schema: {
          tags: ['System glossary'],
          summary: 'Get details of a published glossary term and its related terms'
        }
      },
      request => controller.detail(request)
    )

    app.get<{ Params: IdParams }>(
      '/system-glossary/by-guide/:id',
      {
        schema: {
          tags: ['System glossary'],
          summary: 'Get published glossary terms associated with a system guide'
        }
      },
      request => controller.byGuide(request)
    )

    // 2. Admin API (yêu cầu quyền quản trị)
    app.get<{ Querystring: { q?: string; category?: string; status?: string } }>(
      '/admin/system-glossary',
      {
        schema: {
          tags: ['Administration - System glossary'],
          summary: 'List all glossary terms including drafts and archived'
        }
      },
      request => controller.adminList(request)
    )

    app.get<{ Params: IdParams }>(
      '/admin/system-glossary/:id',
      {
        schema: {
          tags: ['Administration - System glossary'],
          summary: 'Get full glossary term details including draft and published versions',
          params: systemGlossaryParamsSchema
        }
      },
      request => controller.adminDetail(request)
    )

    app.post<{ Body: CreateGlossaryTermBody }>(
      '/admin/system-glossary',
      {
        schema: {
          tags: ['Administration - System glossary'],
          summary: 'Create a new draft glossary term',
          body: createGlossaryTermSchema
        }
      },
      (request, reply) => controller.create(request, reply)
    )

    app.patch<{ Params: IdParams; Body: UpdateGlossaryTermBody }>(
      '/admin/system-glossary/:id',
      {
        schema: {
          tags: ['Administration - System glossary'],
          summary: 'Update draft glossary term or create new draft version if published',
          params: systemGlossaryParamsSchema,
          body: updateGlossaryTermSchema
        }
      },
      request => controller.update(request)
    )

    app.post<{ Params: IdParams }>(
      '/admin/system-glossary/:id/publish',
      {
        schema: {
          tags: ['Administration - System glossary'],
          summary: 'Publish a draft glossary term',
          params: systemGlossaryParamsSchema
        }
      },
      request => controller.publish(request)
    )

    app.post<{ Params: IdParams }>(
      '/admin/system-glossary/:id/archive',
      {
        schema: {
          tags: ['Administration - System glossary'],
          summary: 'Archive a glossary term',
          params: systemGlossaryParamsSchema
        }
      },
      request => controller.archive(request)
    )

    app.put<{ Body: AssociateGuideTermsBody }>(
      '/admin/system-glossary/guide-association',
      {
        schema: {
          tags: ['Administration - System glossary'],
          summary: 'Associate glossary terms to a system guide version',
          body: associateGuideTermsSchema
        }
      },
      request => controller.associateGuide(request)
    )
  }
}
