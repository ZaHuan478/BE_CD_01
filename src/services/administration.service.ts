import { requirePermission } from '../auth/guards.js'
import type { AuthPrincipal } from '../auth/types.js'
import { forbidden } from '../common/errors.js'
import type { AdministrationRepository } from '../repositories/administration.repository.js'
import type { AuditQuery, CreateProfileBody, ReplaceSopRolesBody, SystemSettings, UpdateProfileBody } from '../schemas/administration.schemas.js'

export class AdministrationService {
  private requireSuperAdmin(principal: AuthPrincipal) {
    if (principal.systemRole !== 'SUPER_ADMIN') throw forbidden('Chỉ Super Admin được quản lý nhóm quyền và cấu hình hệ thống')
  }
  constructor(private readonly repository: AdministrationRepository) {}

  listAudit(principal: AuthPrincipal, query: AuditQuery) {
    requirePermission(principal, 'audit.read')
    return this.repository.listAudit(query)
  }

  getSettings(principal: AuthPrincipal) {
    this.requireSuperAdmin(principal)
    requirePermission(principal, 'settings.manage')
    return this.repository.getSettings()
  }

  updateSettings(principal: AuthPrincipal, settings: SystemSettings) {
    this.requireSuperAdmin(principal)
    requirePermission(principal, 'settings.manage')
    return this.repository.updateSettings(settings, principal.accountId)
  }

  listProfiles(principal: AuthPrincipal) {
    this.requireSuperAdmin(principal)
    requirePermission(principal, 'permission.manage')
    return this.repository.listProfiles()
  }

  createProfile(principal: AuthPrincipal, body: CreateProfileBody) {
    this.requireSuperAdmin(principal)
    requirePermission(principal, 'permission.manage')
    return this.repository.createProfile(body, principal.accountId)
  }

  updateProfile(principal: AuthPrincipal, id: string, body: UpdateProfileBody) {
    this.requireSuperAdmin(principal)
    requirePermission(principal, 'permission.manage')
    return this.repository.updateProfile(id, body, principal.accountId)
  }

  getUserProfiles(principal: AuthPrincipal, accountId: string) {
    this.requireSuperAdmin(principal)
    requirePermission(principal, 'permission.manage')
    return this.repository.getUserProfiles(accountId)
  }

  replaceUserProfiles(principal: AuthPrincipal, accountId: string, profileIds: string[]) {
    this.requireSuperAdmin(principal)
    requirePermission(principal, 'permission.manage')
    return this.repository.replaceUserProfiles(accountId, profileIds, principal.accountId)
  }

  bootstrapSuperAdmin(principal: AuthPrincipal, accountId: string) {
    if (principal.systemRole !== 'ADMIN') throw forbidden('Chỉ Admin hiện tại được khởi tạo Super Admin đầu tiên')
    return this.repository.bootstrapSuperAdmin(accountId, principal.accountId)
  }
  listSopResources(principal: AuthPrincipal) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(principal.systemRole)) throw forbidden('Admin role is required to assign SOP responsibilities')
    return this.repository.listSopResources()
  }

  listSopRoles(principal: AuthPrincipal, sopId: string) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(principal.systemRole)) throw forbidden('Admin role is required to assign SOP responsibilities')
    return this.repository.listSopRoles(sopId)
  }

  replaceSopRoles(principal: AuthPrincipal, sopId: string, body: ReplaceSopRolesBody) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(principal.systemRole)) throw forbidden('Admin role is required to assign SOP responsibilities')
    return this.repository.replaceSopRoles(sopId, body, principal.accountId)
  }
}


