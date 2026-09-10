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
    expect(result.steps[0]?.confidence).toBeGreaterThan(0.9)
    expect(result.steps[0]?.sourceRefs?.[0]?.text).toContain('EMP01.01 Tiếp nhận hồ sơ')
  })

  it('creates an editable fallback step when no step code is recognized', () => {
    const result = extractStepsFromText('Nội dung mô tả tự do chưa có mã bước.')
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]).toMatchObject({ code: 'STEP-01', nodeKind: 'task' })
    expect(result.warnings[0]).toContain('Không nhận diện được mã bước')
  })

  it('recognizes Vietnamese named steps and numbered actions without heading styles', () => {
    const result = extractStepsFromText(`
      HƯỚNG DẪN LÀM HỢP ĐỒNG LAO ĐỘNG
      Bước 1: Vào HRUX/Nhân sự/Hợp đồng/DS Hợp đồng
      1. Chọn nhân viên cần làm hợp đồng
      2. Kiểm tra ngày bắt đầu và ngày kết thúc
      Đối với nhân viên bình thường: thử việc 60 ngày
      Bước 6: In hợp đồng và phụ lục
      1. Chọn hợp đồng muốn in
      2. Xuất file để in ký và đóng dấu
    `)

    expect(result.steps.map(step => step.title)).toEqual([
      'Vào HRUX/Nhân sự/Hợp đồng/DS Hợp đồng',
      'Chọn nhân viên cần làm hợp đồng',
      'Kiểm tra ngày bắt đầu và ngày kết thúc',
      'In hợp đồng và phụ lục',
      'Chọn hợp đồng muốn in',
      'Xuất file để in ký và đóng dấu'
    ])
    expect(result.steps[2]).toMatchObject({ typeCode: 'C' })
    expect(result.steps[0]?.sourceRefs?.[0]?.lineStart).toBeGreaterThan(0)
    expect(result.steps[0]?.confidence).toBeLessThan(0.9)
  })

  it('marks conditional and automated content as rule-based suggestions', () => {
    const result = extractStepsFromText(`
      1. Kiểm tra dữ liệu hợp đồng
      2. Xác nhận trường hợp đặc biệt cần phê duyệt
      3. Chọn lưu để hệ thống tự động sinh số hợp đồng
    `)

    expect(result.steps[1]).toMatchObject({ nodeKind: 'decision', typeCode: 'C' })
    expect(result.steps[2]).toMatchObject({ typeCode: 'A' })
  })
})
