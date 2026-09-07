import { describe, expect, it } from 'vitest'
import { extractStepsFromText } from '../src/services/sop-import.extractor.js'

describe('SOP import extraction', () => {
  it('recognizes coded steps and keeps their following descriptions', () => {
    const result = extractStepsFromText(`
      Mục đích
      Chuẩn hóa tiếp nhận nhân viên.
      EMP01.01 Tiếp nhận hồ sơ
      HR kiểm tra hồ sơ bắt buộc.
      EMP01.02 Tạo tài khoản
      IT tạo tài khoản và gửi thông tin đăng nhập.
    `)

    expect(result.steps).toHaveLength(2)
    expect(result.steps[0]).toMatchObject({ code: 'EMP01.01', title: 'Tiếp nhận hồ sơ' })
    expect(result.steps[0]?.description).toContain('HR kiểm tra hồ sơ')
    expect(result.steps[1]?.description).toContain('IT tạo tài khoản')
  })

  it('creates an editable fallback step when no step code is recognized', () => {
    const result = extractStepsFromText('Nội dung mô tả tự do chưa có mã bước.')
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]).toMatchObject({ code: 'STEP-01', nodeKind: 'task' })
    expect(result.warnings[0]).toContain('Không nhận diện được mã bước')
  })
})
