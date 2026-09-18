import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { loadEnv } from '../src/config/env.js'
import { Database } from '../src/database/database.js'
import { AdministrationRepository } from '../src/repositories/administration.repository.js'

describe('UAT-115: Bootstrap Super Admin an toàn & cô lập', () => {
  let db: Database

  beforeAll(async () => {
    const env = loadEnv()
    db = new Database(env)
    await db.connect()
  })

  afterAll(async () => {
    if (db) await db.close()
  })

  it('Cô lập bằng transaction: lần đầu thành công, các lần sau bị chặn 409, có audit, và rollback an toàn 100%', async () => {
    // 1. Kiểm tra trạng thái ban đầu của DB
    const initialAdmins = await db.query<{ AccountId: string; SystemRole: string }>(
      "SELECT AccountId, SystemRole FROM Account WHERE SystemRole IN ('ADMIN', 'SUPER_ADMIN')"
    )
    console.log('Initial admins state:', initialAdmins)

    // 2. Chạy kịch bản kiểm thử trong 1 transaction cô lập (chắc chắn sẽ ROLLBACK)
    let firstCallResult: any
    let secondCallError: any
    let auditRecords: any[] = []

    try {
      await db.transaction(async (runner) => {
        // Tạo instance repository sử dụng runner của transaction này
        const isolatedRepo = new AdministrationRepository(runner, true)

        // Thiết lập tiền điều kiện UAT: Mô phỏng môi trường vừa triển khai (chưa có Super Admin)
        await runner.query("UPDATE Account SET SystemRole = 'ADMIN' WHERE SystemRole = 'SUPER_ADMIN'")

        // Đảm bảo có ít nhất 1 tài khoản ADMIN đang hoạt động để bootstrap
        const [candidate] = await runner.query<{ AccountId: string }>(
          "SELECT AccountId FROM Account WHERE SystemRole = 'ADMIN' AND IsActive = 1"
        )
        expect(candidate).toBeDefined()
        const targetAccountId = candidate!.AccountId

        // Bước 1: Gọi bootstrap lần đầu tiên
        firstCallResult = await isolatedRepo.bootstrapSuperAdmin(targetAccountId, targetAccountId)
        expect(firstCallResult.accountId).toBe(targetAccountId)
        expect(firstCallResult.systemRole).toBe('SUPER_ADMIN')

        // Kiểm tra audit log đã được ghi trong transaction
        auditRecords = await runner.query<any>(
          "SELECT * FROM AuditLog WHERE EntityType = 'account' AND EntityId = :accountId AND Action = 'bootstrap-super-admin'",
          { accountId: targetAccountId }
        )
        expect(auditRecords.length).toBeGreaterThan(0)
        expect(JSON.parse(auditRecords[0].BeforeJson)).toEqual({ systemRole: 'ADMIN' })
        expect(JSON.parse(auditRecords[0].AfterJson)).toEqual({ systemRole: 'SUPER_ADMIN' })

        // Bước 2: Gọi bootstrap lần thứ hai (thử lại) -> BẮT BUỘC PHẢI BỊ CHẶN (409 SUPER_ADMIN_EXISTS)
        try {
          await isolatedRepo.bootstrapSuperAdmin(targetAccountId, targetAccountId)
        } catch (err: any) {
          secondCallError = err
        }
        expect(secondCallError).toBeDefined()
        expect(secondCallError.statusCode).toBe(409)
        expect(secondCallError.code).toBe('SUPER_ADMIN_EXISTS')

        // Bước 3: Cố tình throw error để buộc transaction ROLLBACK hoàn toàn
        throw new Error('ROLLBACK_TEST_TRANSACTION_FOR_SAFETY')
      })
    } catch (err: any) {
      if (err.message !== 'ROLLBACK_TEST_TRANSACTION_FOR_SAFETY') {
        throw err
      }
    }

    // 3. Xác nhận rằng kết quả kiểm thử đạt yêu cầu
    expect(firstCallResult).toBeDefined()
    expect(secondCallError).toBeDefined()
    expect(auditRecords.length).toBeGreaterThan(0)

    // 4. XÁC MINH TUYỆT ĐỐI: Dữ liệu môi trường UAT thật không bị thay đổi sau khi rollback
    const afterAdmins = await db.query<{ AccountId: string; SystemRole: string }>(
      "SELECT AccountId, SystemRole FROM Account WHERE SystemRole IN ('ADMIN', 'SUPER_ADMIN')"
    )
    expect(afterAdmins).toEqual(initialAdmins)
    console.log('Verified: UAT database admin data is 100% preserved and untouched.')
  })
})
