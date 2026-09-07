import { describe, expect, it } from 'vitest'
import { planCore8, snapshotHash, type Core8Snapshot } from '../src/database/core8-plan.js'

function source(): Core8Snapshot {
  return { format: 'core8-backup-v1', database: 'unit', tables: {
    Account: [{ AccountId: 'admin', SystemRole: 'ADMIN', IsActive: 1 }, { AccountId: 'reader', SystemRole: 'USER', IsActive: 1 }],
    HrModule: [{ ModuleId: 'pay' }], UserGroup: [{ GroupId: 'g', IsActive: 1 }],
    AccountGroup: [{ AccountId: 'reader', GroupId: 'g', ValidFrom: '2026-01-01T00:00:00.000Z', ValidTo: '2027-01-01T00:00:00.000Z' }],
    AccessGrant: [{ GroupId: 'g', PermissionCode: 'sop.read', ScopeType: 'module', ScopeId: 'pay' }]
  } }
}
describe('core8 additive migration plan', () => {
  it('preserves time-bounded module access without elevating the user', () => {
    const snapshot = source(), before = snapshotHash(snapshot)
    const plan = planCore8(snapshot)
    expect(plan.report.blockers).toEqual([])
    expect(plan.report.coreTables).toHaveLength(8)
    const reader = plan.accounts.find(row => row.id === 'reader')!
    expect(reader.role).toBe('USER')
    expect(reader.readAll).toBe(false)
    expect(reader.links[0]).toMatchObject({ ModuleId: 'pay', ValidTo: '2027-01-01T00:00:00.000Z' })
    expect(snapshotHash(snapshot)).toBe(before)
  })
  it('blocks SOP-only grants instead of widening them', () => {
    const snapshot = source()
    snapshot.tables.AccessGrant![0]!.ScopeType = 'sop'
    expect(planCore8(snapshot).report.blockers.join()).toContain('cannot widen')
  })
  it('requires review of lost editor permissions', () => {
    const snapshot = source()
    snapshot.tables.AccessGrant!.push({ GroupId: 'g', PermissionCode: 'sop.publish', ScopeType: 'module', ScopeId: 'pay' })
    expect(planCore8(snapshot).report.permissionChanges[0]?.removedPermissions).toEqual(['sop.publish:module:pay'])
  })
  it('blocks unscoped glossary entries', () => {
    const snapshot = source()
    snapshot.tables.GlossaryTerm = [{ GlossaryTermId: 't', Term: 'Test', Definition: 'Meaning', Status: 'published' }]
    expect(planCore8(snapshot).report.blockers.join()).toContain('needs a module assignment')
  })
  it('keeps reference content internal and refuses an already populated version table', () => {
    const snapshot = source()
    snapshot.tables.AppConfig = [{ ConfigKey: 'ui.dataset.translations', ScopeType: 'system', ScopeId: '*', IsActive: 1, ValueJson: '{"vi":{"test":"Thử"}}' }]
    const doc = planCore8(snapshot).documents.find(doc => doc.code === 'translations')!
    expect(doc.visibility).toBe('internal')
    expect(doc.versions[0]?.content).toEqual({ vi: { test: 'Thử' } })
    snapshot.tables.KnowledgeDocumentVersion = [{ VersionNumber: 1 }]
    expect(planCore8(snapshot).report.blockers.join()).toContain('already populated')
  })
})
