import { loadEnv } from '../src/config/env.js'
import { Database, type QueryRunner } from '../src/database/database.js'

type SystemRole = 'USER' | 'CONTENT_EDITOR' | 'ADMIN' | 'SUPER_ADMIN'
type SopRole = 'VIEWER' | 'OWNER' | 'EDITOR' | 'REVIEWER' | 'APPROVER'

interface DemoAccount {
  id: string
  code: string
  name: string
  email: string | null
  systemRole: SystemRole
  company: string
  division: string
  department: string
  team: string | null
  jobTitle: string
  managerId: string | null
  modules: string[]
  profiles: string[]
}

const profiles = [
  ['SYSTEM_ADMINISTRATOR', 'Quản trị hệ thống', 'Quản lý tài khoản, cấu hình, phân hệ và toàn bộ cơ chế phân quyền.'],
  ['SOP_ADMINISTRATOR', 'Quản trị nội dung SOP', 'Theo dõi tài liệu, rà soát nội dung và quản lý vòng đời SOP.'],
  ['EXECUTIVE', 'Ban điều hành', 'Phê duyệt nội dung theo thẩm quyền và xem các phân hệ được giao.'],
  ['HR_OPERATIONS', 'Vận hành nhân sự', 'Onboarding, hồ sơ nhân sự, hợp đồng, điều chuyển và nghỉ việc.'],
  ['RECRUITER', 'Tuyển dụng', 'Quy trình tuyển dụng, ứng viên và bàn giao nhân sự trúng tuyển.'],
  ['TIME_ATTENDANCE', 'Chấm công và nghỉ phép', 'Ca, công, phép, bù công, tăng ca và đối soát dữ liệu công.'],
  ['PAYROLL_CB', 'Tiền lương và C&B', 'Dữ liệu lương, phụ cấp, bảo hiểm, thuế và các kỳ tính lương được giao.'],
  ['INSURANCE_TAX', 'Bảo hiểm và thuế', 'Nghiệp vụ bảo hiểm, thuế và dữ liệu thuộc phạm vi phụ trách.'],
  ['LINE_MANAGER', 'Quản lý trực tiếp', 'SOP quản lý và dữ liệu của nhân viên trực thuộc trong phạm vi xử lý.'],
  ['EMPLOYEE_SELF_SERVICE', 'Nhân viên tự phục vụ', 'SOP dành cho nhân viên và dữ liệu cá nhân của chính mình.'],
  ['CLERICAL_ADMIN', 'Hành chính và văn thư', 'Giấy giới thiệu, quyết định, ký, đóng dấu và lưu văn bản.'],
  ['HRIS_SUPPORT', 'HRIS và IT hỗ trợ', 'Cấu hình HRIS, cấp quyền và hỗ trợ kỹ thuật theo nhiệm vụ.'],
  ['LEGAL', 'Pháp chế', 'Rà soát nội dung pháp lý của hợp đồng, quyết định và chính sách.'],
  ['AUDITOR', 'Kiểm toán nội bộ', 'Chỉ đọc tài liệu và nhật ký trong phạm vi được phê duyệt.']
] as const

const accounts: DemoAccount[] = [
  { id: 'demo-admin', code: 'ADM-001', name: 'Lê Quản Trị', email: 'admin.demo@hrm.local', systemRole: 'SUPER_ADMIN', company: 'LTA', division: 'Khối CNTT và Chuyển đổi số', department: 'Phòng Hệ thống', team: null, jobTitle: 'Siêu quản trị hệ thống', managerId: null, modules: [], profiles: ['SYSTEM_ADMINISTRATOR', 'SOP_APPROVER'] },
  { id: 'admin', code: 'SOP-001', name: 'Administrator', email: 'sop.admin@hrm.local', systemRole: 'ADMIN', company: 'LTA', division: 'Khối Nhân sự', department: 'Phòng Quản trị SOP', team: null, jobTitle: 'Quản trị nội dung SOP', managerId: 'demo-admin', modules: [], profiles: ['SOP_ADMINISTRATOR', 'SOP_REVIEWER'] },
  { id: 'demo-bom', code: 'BOM-001', name: 'Trần Tổng Giám Đốc', email: 'ceo.demo@hrm.local', systemRole: 'USER', company: 'LTA', division: 'Ban Điều hành', department: 'Ban Tổng Giám đốc', team: null, jobTitle: 'Tổng Giám đốc', managerId: null, modules: ['ats', 'emp', 'onb', 'att', 'leave', 'pay', 'ins', 'tax', 'ess'], profiles: ['EXECUTIVE'] },
  { id: 'demo-hr-admin', code: 'HR-001', name: 'Nguyễn Thị Hồng Nhân Sự', email: 'hr.admin@hrm.local', systemRole: 'CONTENT_EDITOR', company: 'LTA', division: 'Khối Nhân sự', department: 'Phòng Nhân sự', team: 'HR Operations', jobTitle: 'Trưởng phòng Nhân sự', managerId: 'demo-bom', modules: ['ats', 'emp', 'onb', 'att', 'leave', 'ess'], profiles: ['HR_OPERATIONS'] },
  { id: 'demo-hr', code: 'HR-002', name: 'Nguyễn Hồng Nhân sự', email: 'hr.demo@example.local', systemRole: 'CONTENT_EDITOR', company: 'LTA', division: 'Khối Nhân sự', department: 'Phòng Nhân sự', team: 'HR Operations', jobTitle: 'Chuyên viên HR Operations', managerId: 'demo-hr-admin', modules: ['ats', 'emp', 'onb', 'att', 'leave', 'ess'], profiles: ['HR_OPERATIONS'] },
  { id: 'demo-recruiter', code: 'REC-001', name: 'Phạm Tuyển Dụng', email: 'recruiter@hrm.local', systemRole: 'CONTENT_EDITOR', company: 'LTA', division: 'Khối Nhân sự', department: 'Phòng Tuyển dụng', team: null, jobTitle: 'Chuyên viên Tuyển dụng', managerId: 'demo-hr-admin', modules: ['ats', 'onb'], profiles: ['RECRUITER'] },
  { id: 'demo-attendance', code: 'ATT-001', name: 'Đỗ Minh Chấm Công', email: 'timekeeper@hrm.local', systemRole: 'CONTENT_EDITOR', company: 'LTA', division: 'Khối Nhân sự', department: 'Phòng Nhân sự', team: 'Chấm công', jobTitle: 'Chuyên viên Chấm công', managerId: 'demo-hr-admin', modules: ['att', 'leave', 'ess'], profiles: ['TIME_ATTENDANCE'] },
  { id: 'demo-cb', code: 'CB-001', name: 'Vũ Thị C&B Tiền Lương', email: 'payroll@hrm.local', systemRole: 'CONTENT_EDITOR', company: 'LTA', division: 'Khối Nhân sự', department: 'Phòng C&B', team: 'Payroll', jobTitle: 'Chuyên viên C&B', managerId: 'demo-payroll-manager', modules: ['pay', 'ins', 'tax', 'ess'], profiles: ['PAYROLL_CB'] },
  { id: 'demo-accounting', code: 'CB-002', name: 'Trần Minh Kế toán', email: 'accounting.demo@example.local', systemRole: 'CONTENT_EDITOR', company: 'LTA', division: 'Khối Nhân sự', department: 'Phòng C&B', team: 'Payroll', jobTitle: 'Chuyên viên dữ liệu lương', managerId: 'demo-payroll-manager', modules: ['pay', 'ess'], profiles: ['PAYROLL_CB'] },
  { id: 'demo-payroll-manager', code: 'CB-003', name: 'Lâm Trưởng phòng C&B', email: 'payroll.manager@hrm.local', systemRole: 'USER', company: 'LTA', division: 'Khối Nhân sự', department: 'Phòng C&B', team: 'Payroll', jobTitle: 'Trưởng phòng C&B', managerId: 'demo-hr-admin', modules: ['pay', 'ins', 'tax', 'ess'], profiles: ['PAYROLL_CB'] },
  { id: 'demo-insurance', code: 'INS-001', name: 'Hoàng Bảo Hiểm', email: 'insurance@hrm.local', systemRole: 'CONTENT_EDITOR', company: 'LTA', division: 'Khối Nhân sự', department: 'Phòng C&B', team: 'Bảo hiểm và Thuế', jobTitle: 'Chuyên viên Bảo hiểm và Thuế', managerId: 'demo-payroll-manager', modules: ['ins', 'tax', 'ess'], profiles: ['INSURANCE_TAX'] },
  { id: 'demo-manager', code: 'MGR-001', name: 'Đặng Trưởng Phòng Kinh Doanh', email: 'manager@hrm.local', systemRole: 'USER', company: 'LTA', division: 'Khối Kinh doanh', department: 'Phòng Kinh doanh', team: null, jobTitle: 'Trưởng phòng Kinh doanh', managerId: 'demo-bom', modules: ['ats', 'emp', 'onb', 'att', 'leave', 'ess'], profiles: ['LINE_MANAGER'] },
  { id: 'demo-employee', code: 'EMP-001', name: 'Ngô Văn Nhân Viên', email: 'employee@hrm.local', systemRole: 'USER', company: 'LTA', division: 'Khối Kinh doanh', department: 'Phòng Kinh doanh', team: null, jobTitle: 'Nhân viên Kinh doanh', managerId: 'demo-manager', modules: ['emp', 'att', 'leave', 'ess'], profiles: ['EMPLOYEE_SELF_SERVICE'] },
  { id: 'demo-clerical', code: 'ADM-002', name: 'Bùi Hành Chính Văn Thư', email: 'clerical@hrm.local', systemRole: 'CONTENT_EDITOR', company: 'LTA', division: 'Khối Vận hành', department: 'Phòng Hành chính', team: 'Văn thư', jobTitle: 'Chuyên viên Hành chính Văn thư', managerId: 'demo-bom', modules: ['emp', 'ess'], profiles: ['CLERICAL_ADMIN'] },
  { id: 'demo-it', code: 'IT-001', name: 'Đinh Hỗ Trợ HRIS', email: 'hris.support@hrm.local', systemRole: 'CONTENT_EDITOR', company: 'LTA', division: 'Khối CNTT và Chuyển đổi số', department: 'Phòng Hệ thống', team: 'Ứng dụng HRIS', jobTitle: 'Chuyên viên HRIS và IT Support', managerId: 'demo-admin', modules: ['emp', 'onb', 'ess'], profiles: ['HRIS_SUPPORT'] },
  { id: 'demo-legal', code: 'LEG-001', name: 'Phan Pháp Chế', email: 'legal@hrm.local', systemRole: 'USER', company: 'LTA', division: 'Khối Pháp chế', department: 'Phòng Pháp chế', team: null, jobTitle: 'Chuyên viên Pháp chế', managerId: 'demo-bom', modules: ['emp', 'ess'], profiles: ['LEGAL'] },
  { id: 'demo-auditor', code: 'AUD-001', name: 'Võ Kiểm Toán Nội Bộ', email: 'auditor@hrm.local', systemRole: 'USER', company: 'LTA', division: 'Ban Kiểm soát', department: 'Kiểm toán nội bộ', team: null, jobTitle: 'Kiểm toán viên nội bộ', managerId: 'demo-bom', modules: ['ats', 'emp', 'onb', 'att', 'leave', 'pay', 'ins', 'tax', 'ess'], profiles: ['AUDITOR'] }
]

const ownerByModule: Record<string, string> = {
  ats: 'demo-recruiter', emp: 'demo-hr', onb: 'demo-hr', att: 'demo-attendance',
  leave: 'demo-attendance', pay: 'demo-cb', ins: 'demo-insurance', tax: 'demo-insurance',
  ess: 'demo-it', common: 'demo-hr'
}
const editorByModule: Record<string, string> = {
  ats: 'demo-hr-admin', emp: 'demo-hr-admin', onb: 'demo-recruiter', att: 'demo-hr',
  leave: 'demo-hr', pay: 'demo-accounting', ins: 'demo-cb', tax: 'demo-cb',
  ess: 'demo-hr-admin', common: 'demo-it'
}

async function upsertProfile(runner: QueryRunner, code: string, name: string, description: string) {
  await runner.query(`INSERT INTO PermissionProfile
    (PermissionProfileId, ProfileCode, ProfileName, Description, IsSystem, IsActive)
    VALUES (:id, :code, :name, :description, TRUE, TRUE)
    ON DUPLICATE KEY UPDATE ProfileName = :name, Description = :description, IsActive = TRUE`, {
    id: `profile-${code.toLocaleLowerCase()}`, code, name, description
  })
}

const env = loadEnv()
if (env.nodeEnv === 'production') throw new Error('Demo governance data is forbidden in production')
const database = new Database(env)

try {
  const report = await database.transaction(async runner => {
    for (const [code, name, description] of profiles) await upsertProfile(runner, code, name, description)

    for (const account of accounts) {
      await runner.query(`INSERT INTO Account
        (AccountId, ExternalSubject, EmployeeCode, Username, FullName, Email, SystemRole,
         CompanyName, DivisionName, DepartmentName, TeamName, JobTitle, ManagerAccountId,
         ReadAllModules, IsActive)
        VALUES (:id, :id, :code, :id, :name, :email, :systemRole, :company, :division,
          :department, :team, :jobTitle, NULL, :readAll, TRUE)
        ON DUPLICATE KEY UPDATE EmployeeCode = :code, FullName = :name, Email = :email,
          SystemRole = :systemRole, CompanyName = :company, DivisionName = :division,
          DepartmentName = :department, TeamName = :team, JobTitle = :jobTitle,
          ManagerAccountId = NULL, ReadAllModules = :readAll, IsActive = TRUE`, {
        ...account, readAll: account.systemRole === 'SUPER_ADMIN'
      })
    }

    for (const account of accounts) {
      await runner.query('UPDATE Account SET ManagerAccountId = :managerId WHERE AccountId = :id', {
        id: account.id, managerId: account.managerId
      })
    }

    for (const account of accounts) {
      await runner.query('DELETE FROM AccountPermissionProfile WHERE AccountId = :id', { id: account.id })
      for (const code of account.profiles) {
        await runner.query(`INSERT INTO AccountPermissionProfile
          (AccountId, PermissionProfileId, AssignedBy)
          SELECT :accountId, PermissionProfileId, 'demo-admin' FROM PermissionProfile
          WHERE ProfileCode = :code`, { accountId: account.id, code })
      }
      await runner.query("DELETE FROM AccountModuleAccess WHERE AccountId = :id AND GrantSource = 'manual'", { id: account.id })
      for (const moduleId of account.modules) {
        await runner.query(`INSERT INTO AccountModuleAccess
          (AccountModuleAccessId, AccountId, ModuleId, GrantSource, GrantedBy)
          VALUES (:accessId, :accountId, :moduleId, 'manual', 'demo-admin')`, {
          accessId: `demo-access-${account.id}-${moduleId}`, accountId: account.id, moduleId
        })
      }
    }

    const documents = await runner.query<{ DocumentId: string; Code: string; Modules: string | null; ImportedOwner: string | null }>(`
      SELECT document.DocumentId, document.Code,
        GROUP_CONCAT(DISTINCT documentModule.ModuleId ORDER BY documentModule.ModuleId) AS Modules,
        MAX(importJob.CreatedBy) AS ImportedOwner
      FROM KnowledgeDocument document
      LEFT JOIN KnowledgeDocumentModule documentModule ON documentModule.DocumentId = document.DocumentId
      LEFT JOIN SopImportJob importJob ON importJob.TargetSopId = document.DocumentId
      WHERE document.DocumentType IN ('procedure', 'policy')
      GROUP BY document.DocumentId, document.Code
    `)
    const documentIds = new Set(documents.map(document => document.DocumentId))
    for (const document of documents) {
      await runner.query('DELETE FROM SopRoleAssignment WHERE SopResourceId = :id', { id: document.DocumentId })
      const moduleId = document.Modules?.split(',')[0] ?? 'ess'
      const owner = document.ImportedOwner ?? ownerByModule[moduleId] ?? 'demo-it'
      let editor = editorByModule[moduleId] ?? 'demo-hr-admin'
      if (editor === owner) editor = ownerByModule[moduleId] === owner ? 'demo-hr-admin' : ownerByModule[moduleId]
      const assignments = new Map<string, { accountId: string; roleCode: SopRole }>()
      const add = (accountId: string, roleCode: SopRole) => assignments.set(`${accountId}:${roleCode}`, { accountId, roleCode })
      add(owner, 'OWNER')
      add(editor, 'EDITOR')
      add('admin', 'REVIEWER')
      add('demo-admin', 'APPROVER')
      add('demo-auditor', 'VIEWER')
      if (moduleId === 'ats') add('demo-manager', 'REVIEWER')
      if (['emp', 'onb', 'att', 'leave'].includes(moduleId)) add('demo-hr-admin', 'REVIEWER')
      if (['pay', 'ins', 'tax'].includes(moduleId)) add('demo-payroll-manager', 'APPROVER')
      if (/^(SOP-EMP-0[5-7]|POL-EMP)/.test(document.Code)) add('demo-legal', 'REVIEWER')
      if (/ADM|SOP-EMP-16/.test(document.Code)) add('demo-clerical', 'EDITOR')
      for (const assignment of assignments.values()) {
        await runner.query(`INSERT INTO SopRoleAssignment
          (SopResourceId, AccountId, RoleCode, AssignedBy)
          VALUES (:documentId, :accountId, :roleCode, 'demo-admin')`, {
          documentId: document.DocumentId, ...assignment
        })
      }
    }

    // File sources can contain screenshots or sensitive examples. Remove broad Auditor access
    // from onboarding; grant source viewing only to specialists involved in each imported SOP.
    const sourceViewers: Record<string, string[]> = {
      'SOP-ONB-01': ['demo-recruiter', 'demo-it'],
      'CFG-09': ['demo-it'],
      'SOP-PAY-05': ['demo-payroll-manager', 'demo-it'],
      'SOP-ADM-01': ['demo-clerical'],
      'SOP-EMP-06': ['demo-legal'],
      'SOP-EMP-16': ['demo-clerical', 'demo-payroll-manager']
    }
    for (const document of documents.filter(item => sourceViewers[item.Code])) {
      await runner.query(`DELETE FROM SopRoleAssignment
        WHERE SopResourceId = :documentId AND AccountId = 'demo-auditor' AND RoleCode = 'VIEWER'`, {
        documentId: document.DocumentId
      })
      for (const accountId of sourceViewers[document.Code] ?? []) {
        await runner.query(`INSERT IGNORE INTO SopRoleAssignment
          (SopResourceId, AccountId, RoleCode, AssignedBy)
          VALUES (:documentId, :accountId, 'VIEWER', 'demo-admin')`, {
          documentId: document.DocumentId, accountId
        })
      }
    }

    await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
      VALUES ('demo-governance', 'role-and-document-matrix', 'seed-governance-data', 'demo-admin', :afterJson)`, {
      afterJson: JSON.stringify({ accounts: accounts.length, profiles: profiles.length, documents: documents.length })
    })

    const [roleCount] = await runner.query<{ Total: number }>(`SELECT COUNT(*) AS Total FROM SopRoleAssignment
      WHERE SopResourceId IN (${documents.map((_, index) => `:document${index}`).join(', ')})`,
    Object.fromEntries(documents.map((document, index) => [`document${index}`, document.DocumentId])))
    return { accounts: accounts.length, profiles: profiles.length + 4, documents: documentIds.size, roleAssignments: Number(roleCount?.Total ?? 0) }
  })

  const accountReport = await database.query<{
    AccountId: string; FullName: string; JobTitle: string; DepartmentName: string
    Profiles: string | null; Modules: string | null; DocumentRoles: number
  }>(`SELECT account.AccountId, account.FullName, account.JobTitle, account.DepartmentName,
      GROUP_CONCAT(DISTINCT profile.ProfileCode ORDER BY profile.ProfileCode) AS Profiles,
      GROUP_CONCAT(DISTINCT moduleAccess.ModuleId ORDER BY moduleAccess.ModuleId) AS Modules,
      COUNT(DISTINCT CONCAT(roleRow.SopResourceId, ':', roleRow.RoleCode)) AS DocumentRoles
    FROM Account account
    LEFT JOIN AccountPermissionProfile membership ON membership.AccountId = account.AccountId
    LEFT JOIN PermissionProfile profile ON profile.PermissionProfileId = membership.PermissionProfileId
    LEFT JOIN AccountModuleAccess moduleAccess ON moduleAccess.AccountId = account.AccountId
    LEFT JOIN SopRoleAssignment roleRow ON roleRow.AccountId = account.AccountId
    WHERE account.AccountId IN (${accounts.map((_, index) => `:account${index}`).join(', ')})
    GROUP BY account.AccountId, account.FullName, account.JobTitle, account.DepartmentName
    ORDER BY account.FullName`, Object.fromEntries(accounts.map((account, index) => [`account${index}`, account.id])))
  console.log(JSON.stringify({ ...report, users: accountReport }, null, 2))
} finally {
  await database.close()
}
