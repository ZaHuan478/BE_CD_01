import type { QueryRunner } from './database.js'
import { tableExists } from './core8-schema.js'

export type BusinessCluster = 'core' | 'people' | 'organization' | 'platform'

export interface CompleteModuleDefinition {
  id: string
  code: string
  title: string
  description: string
  moduleType: string
  businessCluster: BusinessCluster
  iconKey: 'layers' | 'users' | 'briefcase' | 'clipboard' | 'clock' | 'calendar' | 'wallet' | 'shield' | 'book'
  sortOrder: number
}

/** Canonical navigation and authorization catalog. Existing rows are never overwritten. */
export const COMPLETE_MODULE_CATALOG: readonly CompleteModuleDefinition[] = [
  { id: 'ats', code: 'REC', title: 'Tuyển dụng', description: 'Nhu cầu tuyển dụng, ứng viên, phỏng vấn và tuyển chọn.', moduleType: 'core', businessCluster: 'core', iconKey: 'users', sortOrder: 10 },
  { id: 'onb', code: 'ONB', title: 'Onboarding', description: 'Tiếp nhận và hội nhập nhân viên mới.', moduleType: 'core', businessCluster: 'core', iconKey: 'clipboard', sortOrder: 20 },
  { id: 'emp', code: 'EMP', title: 'Nhân sự', description: 'Hồ sơ, hợp đồng và vòng đời nhân viên.', moduleType: 'core', businessCluster: 'core', iconKey: 'users', sortOrder: 30 },
  { id: 'att', code: 'ATT', title: 'Chấm công', description: 'Ca làm, vào ra, công tác ngoài và dữ liệu công.', moduleType: 'operations', businessCluster: 'core', iconKey: 'clock', sortOrder: 40 },
  { id: 'leave', code: 'LEV', title: 'Nghỉ phép', description: 'Đăng ký, phê duyệt và quản lý nghỉ phép.', moduleType: 'operations', businessCluster: 'core', iconKey: 'calendar', sortOrder: 50 },
  { id: 'pay', code: 'PAY', title: 'Tiền lương', description: 'Tính, kiểm tra và chi trả lương.', moduleType: 'operations', businessCluster: 'core', iconKey: 'wallet', sortOrder: 60 },
  { id: 'ins', code: 'INS', title: 'Bảo hiểm', description: 'Quy trình bảo hiểm và chế độ liên quan.', moduleType: 'operations', businessCluster: 'core', iconKey: 'shield', sortOrder: 70 },
  { id: 'tax', code: 'TAX', title: 'Thuế', description: 'Thuế thu nhập cá nhân, đăng ký và quyết toán.', moduleType: 'operations', businessCluster: 'core', iconKey: 'book', sortOrder: 80 },
  { id: 'ess', code: 'ESS', title: 'ESS/MSS', description: 'Nhân viên tự phục vụ và quản lý phê duyệt yêu cầu.', moduleType: 'support', businessCluster: 'core', iconKey: 'layers', sortOrder: 90 },

  { id: 'kpi', code: 'KPI', title: 'KPI', description: 'Thiết lập, giao và theo dõi chỉ tiêu.', moduleType: 'people', businessCluster: 'people', iconKey: 'clipboard', sortOrder: 10 },
  { id: 'review', code: 'DG', title: 'Đánh giá', description: 'Đánh giá thử việc, hiệu suất và đánh giá định kỳ.', moduleType: 'people', businessCluster: 'people', iconKey: 'clipboard', sortOrder: 20 },
  { id: 'cmp', code: 'CMP', title: 'Năng lực', description: 'Khung năng lực và đánh giá năng lực.', moduleType: 'people', businessCluster: 'people', iconKey: 'users', sortOrder: 30 },
  { id: 'lnd', code: 'LND', title: 'Đào tạo', description: 'Kế hoạch, khóa học và kết quả đào tạo.', moduleType: 'people', businessCluster: 'people', iconKey: 'book', sortOrder: 40 },
  { id: 'tal', code: 'TAL', title: 'Kế nhiệm', description: 'Nhân sự kế nhiệm và vị trí trọng yếu.', moduleType: 'people', businessCluster: 'people', iconKey: 'users', sortOrder: 50 },
  { id: 'eng', code: 'ENG', title: 'Ghi nhận & Phúc lợi', description: 'Ghi nhận thành tích, khen thưởng và phúc lợi.', moduleType: 'people', businessCluster: 'people', iconKey: 'shield', sortOrder: 60 },

  { id: 'org-hc', code: 'HC', title: 'Định biên', description: 'Lập, duyệt và điều chỉnh định biên nhân sự.', moduleType: 'organization', businessCluster: 'organization', iconKey: 'users', sortOrder: 10 },
  { id: 'org-st', code: 'OST', title: 'Cơ cấu tổ chức', description: 'Công ty, khối, phòng ban và quan hệ tổ chức.', moduleType: 'organization', businessCluster: 'organization', iconKey: 'layers', sortOrder: 20 },
  { id: 'org-job', code: 'JOB', title: 'Chức danh', description: 'Danh mục chức danh và yêu cầu công việc.', moduleType: 'organization', businessCluster: 'organization', iconKey: 'briefcase', sortOrder: 30 },
  { id: 'org-pos', code: 'POS', title: 'Vị trí', description: 'Quản lý vị trí làm việc trong cơ cấu.', moduleType: 'organization', businessCluster: 'organization', iconKey: 'briefcase', sortOrder: 40 },
  { id: 'org-rpt', code: 'RPT', title: 'Báo cáo nhân sự', description: 'Tổng hợp biến động và các chỉ số nhân sự.', moduleType: 'organization', businessCluster: 'organization', iconKey: 'clipboard', sortOrder: 50 },

  { id: 'plt-md', code: 'MD', title: 'Danh mục chung', description: 'Master Data dùng chung toàn hệ thống.', moduleType: 'platform', businessCluster: 'platform', iconKey: 'layers', sortOrder: 10 },
  { id: 'plt-cfg', code: 'CFG', title: 'Cấu hình HRM', description: 'Tham số và quy tắc vận hành HRMS.', moduleType: 'platform', businessCluster: 'platform', iconKey: 'layers', sortOrder: 20 },
  { id: 'plt-wfl', code: 'WFL', title: 'Workflow phê duyệt', description: 'Tuyến duyệt và điều kiện chuyển bước.', moduleType: 'platform', businessCluster: 'platform', iconKey: 'clipboard', sortOrder: 30 },
  { id: 'plt-doc', code: 'DOC', title: 'Tài liệu', description: 'Kho tài liệu và tài liệu đính kèm.', moduleType: 'platform', businessCluster: 'platform', iconKey: 'book', sortOrder: 40 },
  { id: 'plt-sig', code: 'SIG', title: 'Ký số', description: 'Chữ ký điện tử và trạng thái ký.', moduleType: 'platform', businessCluster: 'platform', iconKey: 'clipboard', sortOrder: 50 },
  { id: 'plt-ntf', code: 'NTF', title: 'Thông báo', description: 'Email, thông báo hệ thống và nhắc việc.', moduleType: 'platform', businessCluster: 'platform', iconKey: 'clock', sortOrder: 60 },
  { id: 'plt-int', code: 'INT', title: 'Tích hợp', description: 'Kết nối HRMS với các hệ thống bên ngoài.', moduleType: 'platform', businessCluster: 'platform', iconKey: 'layers', sortOrder: 70 },
  { id: 'plt-sec', code: 'SEC', title: 'Phân quyền', description: 'Người dùng, vai trò, nhóm quyền và phạm vi truy cập.', moduleType: 'platform', businessCluster: 'platform', iconKey: 'shield', sortOrder: 80 },
  { id: 'plt-aud', code: 'AUD', title: 'Audit Log', description: 'Lịch sử thao tác và thay đổi dữ liệu.', moduleType: 'platform', businessCluster: 'platform', iconKey: 'book', sortOrder: 90 }
] as const

interface WorkflowBinding {
  moduleId: string
  workflowId: string
  legacyModuleIds: string[]
  codes?: string[]
}

export const DERIVED_MODULE_BINDINGS: readonly WorkflowBinding[] = [
  { moduleId: 'kpi', workflowId: 'MODULE-PFM', legacyModuleIds: ['emp'], codes: ['PFM-02', 'PFM-03'] },
  { moduleId: 'review', workflowId: 'MODULE-PFM', legacyModuleIds: ['emp'], codes: ['PFM-01', 'PFM-04', 'PFM-05', 'PFM-06'] },
  { moduleId: 'cmp', workflowId: 'MODULE-CMP', legacyModuleIds: ['emp'] },
  { moduleId: 'lnd', workflowId: 'MODULE-LND', legacyModuleIds: ['emp'] },
  { moduleId: 'tal', workflowId: 'MODULE-TAL', legacyModuleIds: ['emp'] },
  { moduleId: 'eng', workflowId: 'MODULE-ENG', legacyModuleIds: ['emp'] },
  { moduleId: 'org-hc', workflowId: 'MODULE-ORG-HC', legacyModuleIds: ['emp'] },
  { moduleId: 'org-st', workflowId: 'MODULE-ORG-ST', legacyModuleIds: ['emp'] },
  { moduleId: 'org-job', workflowId: 'MODULE-ORG-JOB', legacyModuleIds: ['emp'] },
  { moduleId: 'org-pos', workflowId: 'MODULE-ORG-POS', legacyModuleIds: ['emp'] },
  { moduleId: 'org-rpt', workflowId: 'MODULE-ORG-RPT', legacyModuleIds: ['emp'] },
  { moduleId: 'plt-md', workflowId: 'MODULE-PLT-MD', legacyModuleIds: ['ess'] },
  { moduleId: 'plt-cfg', workflowId: 'MODULE-PLT-CFG', legacyModuleIds: ['emp', 'ess'] },
  { moduleId: 'plt-wfl', workflowId: 'MODULE-PLT-WFL', legacyModuleIds: ['ess'] },
  { moduleId: 'plt-doc', workflowId: 'MODULE-PLT-DOC', legacyModuleIds: ['emp', 'ess'] },
  { moduleId: 'plt-sig', workflowId: 'MODULE-PLT-SIG', legacyModuleIds: ['ess'] },
  { moduleId: 'plt-ntf', workflowId: 'MODULE-PLT-NTF', legacyModuleIds: ['ess'] },
  { moduleId: 'plt-int', workflowId: 'MODULE-PLT-INT', legacyModuleIds: ['ess'] },
  { moduleId: 'plt-sec', workflowId: 'MODULE-PLT-SEC', legacyModuleIds: ['ess'] },
  { moduleId: 'plt-aud', workflowId: 'MODULE-PLT-AUD', legacyModuleIds: ['ess'] }
] as const

const catalogMigrationId = 'feature:complete-module-catalog:v1'
const ragMigrationId = 'feature:complete-module-catalog-rag:v1'

function codePredicate(binding: WorkflowBinding, alias: string) {
  if (!binding.codes?.length) return { sql: '', parameters: {} }
  const parameters = Object.fromEntries(binding.codes.map((code, index) => [`code${index}`, code]))
  return { sql: ` AND ${alias}.Code IN (${binding.codes.map((_, index) => `:code${index}`).join(', ')})`, parameters }
}

async function seedCatalog(database: QueryRunner) {
  for (const module of COMPLETE_MODULE_CATALOG) {
    await database.query(`INSERT IGNORE INTO HrModule (
      ModuleId, ModuleCode, Title, Description, ModuleType, Status, IsCommon,
      SortOrder, BusinessCluster, IconKey
    ) VALUES (
      :id, :code, :title, :description, :moduleType, 'published', 0,
      :sortOrder, :businessCluster, :iconKey
    )`, {
      id: module.id,
      code: module.code,
      title: module.title,
      description: module.description,
      moduleType: module.moduleType,
      sortOrder: module.sortOrder,
      businessCluster: module.businessCluster,
      iconKey: module.iconKey
    })
  }
}

async function inheritExistingAccess(database: QueryRunner) {
  for (const binding of DERIVED_MODULE_BINDINGS) {
    const parentId = binding.legacyModuleIds.at(-1)!
    await database.query(`INSERT INTO AccountModuleAccess (
      AccountModuleAccessId, AccountId, ModuleId, GrantSource, ValidFrom, ValidTo, GrantedBy
    ) SELECT
      CONCAT('ama-', LEFT(SHA2(CONCAT(
        CONVERT(parent.AccountId USING utf8mb4), ':', CONVERT(:moduleId USING utf8mb4)
      ), 256), 64)),
      parent.AccountId, :moduleId, 'system', parent.ValidFrom, parent.ValidTo, parent.GrantedBy
    FROM AccountModuleAccess parent
    WHERE parent.ModuleId = :parentId
      AND NOT EXISTS (
        SELECT 1 FROM AccountModuleAccess existing
        WHERE existing.AccountId = parent.AccountId AND existing.ModuleId = :moduleId
      )`, { moduleId: binding.moduleId, parentId })
  }
}

async function migrateDocumentLinks(database: QueryRunner) {
  if (!(await tableExists(database, 'KnowledgeDocumentModule'))) return
  for (const binding of DERIVED_MODULE_BINDINGS) {
    const predicate = codePredicate(binding, 'document')
    await database.query(`INSERT IGNORE INTO KnowledgeDocumentModule (DocumentId, ModuleId)
      SELECT document.DocumentId, :moduleId
      FROM KnowledgeDocument document
      WHERE document.WorkflowId = :workflowId${predicate.sql}`, {
      moduleId: binding.moduleId, workflowId: binding.workflowId, ...predicate.parameters
    })
    for (const legacyModuleId of binding.legacyModuleIds) {
      await database.query(`DELETE link FROM KnowledgeDocumentModule link
        JOIN KnowledgeDocument document ON document.DocumentId = link.DocumentId
        WHERE document.WorkflowId = :workflowId AND link.ModuleId = :legacyModuleId${predicate.sql}`, {
        workflowId: binding.workflowId, legacyModuleId, ...predicate.parameters
      })
    }
  }
}

async function linkLegacyMenus(database: QueryRunner) {
  if (!(await tableExists(database, 'MenuModule'))) return
  await database.query(`INSERT IGNORE INTO MenuModule (MenuItemId, ModuleId)
    SELECT menu.MenuItemId, module.ModuleId
    FROM MenuItem menu CROSS JOIN HrModule module
    WHERE menu.MenuCode IN ('employee-lifecycle', 'process-library')`)
}

/** Adds the complete 29-module catalog and performs the one-time split from broad EMP/ESS scopes. */
export async function ensureCompleteModuleCatalog(database: QueryRunner): Promise<void> {
  await seedCatalog(database)
  const applied = await database.query('SELECT MigrationId FROM SchemaMigration WHERE MigrationId = :id', { id: catalogMigrationId })
  if (applied.length) return
  await inheritExistingAccess(database)
  await migrateDocumentLinks(database)
  await linkLegacyMenus(database)
  await database.query('INSERT IGNORE INTO SchemaMigration (MigrationId) VALUES (:id)', { id: catalogMigrationId })
}

/** Reassigns existing embeddings without recomputing them; content itself is unchanged. */
export async function ensureCompleteModuleRagScopes(database: QueryRunner): Promise<void> {
  if (!(await tableExists(database, 'RagChunk'))) return
  const applied = await database.query('SELECT MigrationId FROM SchemaMigration WHERE MigrationId = :id', { id: ragMigrationId })
  if (applied.length) return
  for (const binding of DERIVED_MODULE_BINDINGS) {
    const predicate = codePredicate(binding, 'document')
    await database.query(`UPDATE RagChunk chunk
      JOIN KnowledgeDocument document ON document.DocumentId = chunk.SopId
      SET chunk.ModuleId = :moduleId, chunk.ModuleIdsJson = JSON_ARRAY(:moduleId)
      WHERE document.WorkflowId = :workflowId${predicate.sql}`, {
      moduleId: binding.moduleId, workflowId: binding.workflowId, ...predicate.parameters
    })
    if (await tableExists(database, 'IndexDocumentState')) {
      await database.query(`UPDATE IndexDocumentState state
        JOIN KnowledgeDocument document ON document.DocumentId = state.EntityId
        SET state.ModuleId = :moduleId
        WHERE document.WorkflowId = :workflowId${predicate.sql}`, {
        moduleId: binding.moduleId, workflowId: binding.workflowId, ...predicate.parameters
      })
    }
  }
  await database.query('INSERT IGNORE INTO SchemaMigration (MigrationId) VALUES (:id)', { id: ragMigrationId })
}
