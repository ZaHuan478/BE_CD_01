import { describe, expect, it } from 'vitest'
import { extractStepsFromText } from '../src/services/sop-import.extractor.js'
import { buildSourceStructure, buildStepsFromStructure } from '../src/services/document-structure.js'

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
      'In hợp đồng và phụ lục'
    ])
    expect(result.steps[0]?.description).toContain('1. Chọn nhân viên cần làm hợp đồng')
    expect(result.steps[0]?.description).toContain('2. Kiểm tra ngày bắt đầu và ngày kết thúc')
    expect(result.steps[1]?.description).toContain('2. Xuất file để in ký và đóng dấu')
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

  it('keeps Bước > chữ cái > số > gạch đầu dòng as a reviewable hierarchy', () => {
    const structure = buildSourceStructure([{ page: 1, text: `
      Bước 1: Tạo hợp đồng lao động
      A. Chọn Tạo mới
      B. Nhập các dữ liệu sau
      1. Loại hợp đồng
      - Chọn đúng loại theo hồ sơ nhân viên
      + Nếu là hợp đồng xác định thời hạn, nhập ngày kết thúc
      2. Ngày bắt đầu
      Bước 2: Lưu và in hợp đồng
    ` }])

    const byTitle = new Map(structure.outline.map(item => [item.title, item]))
    expect(byTitle.get('Tạo hợp đồng lao động')).toMatchObject({ level: 0, semanticKind: 'main_step' })
    expect(byTitle.get('Nhập các dữ liệu sau')).toMatchObject({ level: 1, semanticKind: 'section' })
    expect(byTitle.get('Loại hợp đồng')).toMatchObject({ level: 2, semanticKind: 'input_field' })
    expect(byTitle.get('Chọn đúng loại theo hồ sơ nhân viên')).toMatchObject({ level: 3, semanticKind: 'checklist' })
    expect(byTitle.get('Nếu là hợp đồng xác định thời hạn, nhập ngày kết thúc')).toMatchObject({ level: 4, semanticKind: 'rule' })

    const converted = buildStepsFromStructure(structure)
    expect(converted.steps.map(step => step.title)).toEqual([
      'Tạo hợp đồng lao động',
      'Lưu và in hợp đồng'
    ])
    expect(converted.steps[0]?.description).toContain('A. Chọn Tạo mới')
    expect(converted.steps[0]?.checklist).toContain('Loại hợp đồng')
    expect(converted.warnings).toContain('Các thao tác nhỏ nằm trong “Bước N” được giữ trong nội dung chi tiết của bước cha và không tạo thành node ngang hàng trên lưu đồ tổng quan.')
  })

  it('preserves hierarchy across PDF page boundaries', () => {
    const structure = buildSourceStructure([
      { page: 1, text: 'Bước 1: Kiểm tra hồ sơ\nA. Nhập thông tin\n1. Họ và tên' },
      { page: 2, text: '2. Ngày bắt đầu\n- Phải khớp quyết định tuyển dụng\nBước 2: Trình ký' }
    ], 'pdf-layout')
    const date = structure.outline.find(item => item.title === 'Ngày bắt đầu')
    const rule = structure.outline.find(item => item.title === 'Phải khớp quyết định tuyển dụng')
    expect(date).toMatchObject({ page: 2, level: 2, semanticKind: 'input_field' })
    expect(rule).toMatchObject({ page: 2, level: 3, parentId: date?.id })
  })

  it('accepts list decorations commonly produced by PDF and Word exports', () => {
    const structure = buildSourceStructure([{ page: 1, text: `
      3.3.1 Tạo hồ sơ
      -. Bước 1: Nhấn nút Tạo mới
      -. Bước 2: Nhập các trường bắt buộc
      o Nhân viên
    ` }], 'pdf-layout')
    expect(structure.outline.map(item => item.title)).toContain('Nhấn nút Tạo mới')
    expect(structure.outline.map(item => item.title)).not.toContain('. Bước 1: Nhấn nút Tạo mới')
  })
})
