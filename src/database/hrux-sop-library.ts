import { createHash } from 'node:crypto'
import type { QueryRunner } from './database.js'

type SopSeed = {
  id: string
  code: string
  title: string
  summary: string
  workflowId: string
  moduleIds: string[]
  sourceOrder: number
  content: Record<string, unknown>
}

const governance = (
  classification: 'internal' | 'restricted' | 'confidential',
  sopViewers: string[],
  recordViewers: string[],
  excluded: string[],
  owner: string,
  reviewers: string[],
  approver: string,
  approvalFlow: Array<{ order: number; actor: string; decision: string; condition?: string; outcome: string }>
) => ({
  access: { classification, sopViewers, recordViewers, excluded },
  documentControl: {
    owner,
    reviewers,
    approver,
    reviewCycle: '12 tháng hoặc ngay khi quy trình/phần mềm thay đổi'
  },
  approvalFlow
})

const documents: SopSeed[] = [
  {
    id: 'doc-hrux-att-16', code: 'SOP-ATT-16', workflowId: 'MODULE-ATT', moduleIds: ['att', 'leave'], sourceOrder: 160,
    title: 'Quy trình chấm công vào/ra hằng ngày',
    summary: 'Nhân viên ghi nhận giờ vào, giờ ra; hệ thống xác thực thời gian, vị trí và thiết bị rồi phản hồi kết quả.',
    content: {
      sopCode: 'SOP-ATT-16', sopTitle: 'Quy trình chấm công vào/ra hằng ngày',
      sopCategory: 'Chấm công · Tự phục vụ nhân viên',
      description: 'Hướng dẫn nhân viên chấm vào và chấm ra đúng ca, kiểm tra kết quả và xử lý khi thiết bị hoặc vị trí không hợp lệ.',
      inputs: ['Tài khoản nhân viên đang hoạt động', 'Lịch/ca làm việc đã phân', 'Thiết bị và quyền vị trí hợp lệ'],
      outputs: ['Bản ghi vào/ra có thời gian và nguồn ghi nhận', 'Trạng thái hợp lệ hoặc cảnh báo cần xử lý'],
      rules: ['Không chấm công hộ', 'Không sửa trực tiếp bản ghi đã tạo', 'Sai hoặc thiếu dữ liệu phải chuyển sang SOP-ATT-17'],
      ...governance('internal',
        ['Toàn bộ nhân viên', 'Quản lý trực tiếp', 'HR Chấm công', 'IT Support được phân công'],
        ['Nhân viên: bản ghi của chính mình', 'Quản lý trực tiếp: nhân viên thuộc quyền', 'HR Chấm công: dữ liệu trong phạm vi phụ trách'],
        ['Đồng nghiệp không liên quan', 'Quản lý ngoài tuyến báo cáo', 'Người ngoài công ty'],
        'Trưởng nhóm Chấm công', ['HR Operations', 'An toàn thông tin/IT khi thay đổi phương thức xác thực'], 'Trưởng phòng Nhân sự',
        [{ order: 1, actor: 'Hệ thống HRUX', decision: 'Tự động xác thực bản ghi', condition: 'Đúng tài khoản, ca, thời gian, vị trí và thiết bị', outcome: 'Ghi nhận hợp lệ hoặc trả cảnh báo' }]),
      steps: [
        { stepCode: 'ATT16.01', title: 'Mở chức năng chấm công', actor: 'Nhân viên', location: 'HRUX Mobile/Portal', timing: 'Khi bắt đầu hoặc kết thúc ca', typeCode: 'N', description: 'Đăng nhập bằng tài khoản cá nhân và chọn Chấm vào hoặc Chấm ra.', fieldsChecklist: ['Nhân viên', 'Ca làm việc', 'Loại ghi nhận In/Out'] },
        { stepCode: 'ATT16.02', title: 'Cho phép xác thực thiết bị và vị trí', actor: 'Nhân viên', location: 'Thiết bị cá nhân/thiết bị chấm công', timing: 'Trước khi xác nhận', typeCode: 'C', description: 'Cho phép GPS, camera hoặc phương thức xác thực được doanh nghiệp cấu hình.', fieldsChecklist: ['Quyền vị trí', 'Thiết bị', 'Phương thức xác thực'] },
        { stepCode: 'ATT16.03', title: 'Gửi bản ghi chấm công', actor: 'Nhân viên', location: 'HRUX Mobile/Portal', timing: 'Đúng thời điểm thực tế', typeCode: 'N', description: 'Kiểm tra thời gian và vị trí hiển thị rồi xác nhận thao tác.', fieldsChecklist: ['Thời gian hệ thống', 'Vị trí', 'Ảnh/xác thực nếu áp dụng'] },
        { stepCode: 'ATT16.04', title: 'Đối chiếu lịch và quy tắc chấm công', actor: 'Hệ thống HRUX', location: 'Attendance Engine', timing: 'Ngay khi nhận bản ghi', typeCode: 'A', description: 'Kiểm tra tài khoản, ca, vùng làm việc, trùng bản ghi và tính hợp lệ của phương thức xác thực.', fieldsChecklist: ['Mã bản ghi', 'Trạng thái hợp lệ', 'Mã cảnh báo'] },
        { stepCode: 'ATT16.05', title: 'Kiểm tra kết quả', actor: 'Nhân viên', location: 'HRUX Mobile/Portal', timing: 'Ngay sau khi gửi', typeCode: 'C', description: 'Xác nhận bản ghi thành công; nếu thất bại thì thử lại hoặc lập yêu cầu bổ sung in/out theo SOP-ATT-17.', fieldsChecklist: ['Giờ đã ghi nhận', 'Trạng thái', 'Hướng xử lý khi lỗi'] }
      ],
      sourceNote: 'Số hóa từ video “1. Chấm công hàng ngày.mp4”; dữ liệu minh họa phải dùng tài khoản demo.'
    }
  },
  {
    id: 'doc-hrux-att-17', code: 'SOP-ATT-17', workflowId: 'MODULE-ATT', moduleIds: ['att', 'leave'], sourceOrder: 170,
    title: 'Quy trình đăng ký bù công và bổ sung in/out',
    summary: 'Nhân viên giải trình bản ghi công bị thiếu, quản lý trực tiếp duyệt và HR Chấm công kiểm tra trước khi cập nhật.',
    content: {
      sopCode: 'SOP-ATT-17', sopTitle: 'Quy trình đăng ký bù công và bổ sung in/out',
      sopCategory: 'Chấm công · Điều chỉnh dữ liệu công',
      description: 'Bổ sung giờ vào/ra khi quên chấm công hoặc dữ liệu thiết bị không được ghi nhận, có bằng chứng và phê duyệt trước kỳ chốt công.',
      inputs: ['Ngày công có dữ liệu thiếu hoặc bất thường', 'Giờ đề nghị bổ sung', 'Lý do và bằng chứng'],
      outputs: ['Yêu cầu được duyệt/từ chối có lịch sử', 'Bản ghi công được cập nhật trước kỳ chốt'],
      rules: ['Chỉ nhân viên lập yêu cầu cho chính mình', 'Không tiếp nhận sau khi kỳ công đã khóa nếu không có mở kỳ được phê duyệt', 'Người duyệt không được tự duyệt yêu cầu của mình'],
      ...governance('restricted',
        ['Nhân viên thuộc đối tượng chấm công', 'Quản lý trực tiếp', 'HR Chấm công', 'Auditor được ủy quyền'],
        ['Nhân viên: yêu cầu của chính mình', 'Quản lý trực tiếp: yêu cầu của nhân viên thuộc quyền', 'HR Chấm công: toàn bộ yêu cầu trong đơn vị phụ trách'],
        ['Đồng nghiệp', 'Quản lý phòng khác', 'Payroll chỉ nhận kết quả công đã chốt'],
        'Trưởng nhóm Chấm công', ['HR Operations', 'Đại diện quản lý đơn vị'], 'Trưởng phòng Nhân sự',
        [
          { order: 1, actor: 'Quản lý trực tiếp', decision: 'Xác nhận nhân viên có làm việc trong thời gian đề nghị', outcome: 'Duyệt, từ chối hoặc trả bổ sung' },
          { order: 2, actor: 'HR Chấm công', decision: 'Kiểm tra kỳ công, trùng dữ liệu và chính sách', condition: 'Yêu cầu đã được quản lý duyệt', outcome: 'Cập nhật công hoặc từ chối có lý do' }
        ]),
      steps: [
        { stepCode: 'ATT17.01', title: 'Chọn ngày công cần bổ sung', actor: 'Nhân viên', location: 'ESS/Mobile', timing: 'Trước hạn chốt công', typeCode: 'N', description: 'Mở bảng công cá nhân và chọn ngày có dữ liệu in/out thiếu hoặc sai.', fieldsChecklist: ['Ngày công', 'Ca làm việc', 'Dữ liệu hiện có'] },
        { stepCode: 'ATT17.02', title: 'Khai báo giờ và lý do bù công', actor: 'Nhân viên', location: 'ESS/Mobile', timing: 'Ngay khi phát hiện', typeCode: 'N', description: 'Nhập giờ vào/ra đề nghị, chọn lý do và đính kèm bằng chứng nếu chính sách yêu cầu.', fieldsChecklist: ['Giờ vào đề nghị', 'Giờ ra đề nghị', 'Lý do', 'Bằng chứng'] },
        { stepCode: 'ATT17.03', title: 'Kiểm tra điều kiện gửi', actor: 'Hệ thống HRUX', location: 'Attendance Engine', timing: 'Khi gửi yêu cầu', typeCode: 'A', description: 'Kiểm tra kỳ công chưa khóa, giờ hợp lệ, không trùng và người duyệt tồn tại.', fieldsChecklist: ['Kỳ công', 'Trùng dữ liệu', 'Tuyến duyệt'] },
        { stepCode: 'ATT17.04', title: 'Xác nhận thời gian làm việc', actor: 'Quản lý trực tiếp', location: 'MSS/Portal phê duyệt', timing: 'Theo SLA đơn vị', typeCode: 'M', description: 'Đối chiếu lịch làm việc và bằng chứng rồi duyệt, từ chối hoặc trả bổ sung.', fieldsChecklist: ['Ý kiến quản lý', 'Quyết định', 'Thời điểm duyệt'] },
        { stepCode: 'ATT17.05', title: 'Kiểm tra và cập nhật dữ liệu công', actor: 'HR Chấm công', location: 'HRUX Chấm công', timing: 'Trước khi chốt kỳ', typeCode: 'C', description: 'Kiểm tra chính sách, dữ liệu thiết bị và phê duyệt trước khi cập nhật bản ghi điều chỉnh.', fieldsChecklist: ['Nguồn điều chỉnh', 'Người cập nhật', 'Lịch sử trước/sau'] },
        { stepCode: 'ATT17.06', title: 'Thông báo kết quả', actor: 'Hệ thống HRUX', location: 'ESS/Mobile/Email', timing: 'Ngay sau xử lý', typeCode: 'A', description: 'Thông báo trạng thái và phản ánh kết quả vào bảng công cá nhân.', fieldsChecklist: ['Trạng thái cuối', 'Bảng công cập nhật', 'Audit Log'] }
      ],
      sourceNote: 'Số hóa từ video “3. đăng ký bù công.mp4”; không sử dụng dữ liệu nhân viên thật trong bản hướng dẫn.'
    }
  },
  {
    id: 'doc-hrux-att-18', code: 'SOP-ATT-18', workflowId: 'MODULE-ATT', moduleIds: ['att', 'leave'], sourceOrder: 180,
    title: 'Quy trình đăng ký công tác ngoài',
    summary: 'Nhân viên đăng ký thời gian, địa điểm và nội dung công tác ngoài để quản lý duyệt và HR Chấm công ghi nhận.',
    content: {
      sopCode: 'SOP-ATT-18', sopTitle: 'Quy trình đăng ký công tác ngoài',
      sopCategory: 'Chấm công · Công tác ngoài',
      description: 'Đăng ký làm việc bên ngoài địa điểm công ty, phê duyệt trước khi thực hiện và đối soát vào kỳ công.',
      inputs: ['Thời gian công tác', 'Địa điểm/phạm vi công tác', 'Nội dung và đơn vị liên hệ', 'Phương tiện nếu áp dụng'],
      outputs: ['Đơn công tác ngoài được duyệt', 'Quy tắc ghi nhận công áp dụng cho thời gian được duyệt'],
      rules: ['Đăng ký trước thời điểm bắt đầu trừ trường hợp khẩn cấp', 'Chỉ người có trách nhiệm được xem vị trí chi tiết', 'Dữ liệu vị trí tuân theo thời hạn lưu của doanh nghiệp'],
      ...governance('restricted',
        ['Nhân viên', 'Quản lý trực tiếp', 'HR Chấm công', 'HR Operations'],
        ['Nhân viên: đơn của chính mình', 'Quản lý trực tiếp: đơn của nhân viên thuộc quyền', 'HR Chấm công: thông tin cần để tính công'],
        ['Đồng nghiệp', 'Quản lý ngoài tuyến', 'Bộ phận không tham gia xử lý'],
        'Trưởng nhóm Chấm công', ['HR Operations', 'Đại diện An toàn thông tin đối với dữ liệu vị trí'], 'Trưởng phòng Nhân sự',
        [
          { order: 1, actor: 'Quản lý trực tiếp', decision: 'Xác nhận nhu cầu, thời gian và phạm vi công tác', outcome: 'Duyệt, từ chối hoặc trả bổ sung' },
          { order: 2, actor: 'HR Chấm công', decision: 'Xác nhận cách ghi nhận công', condition: 'Đơn đã được quản lý duyệt', outcome: 'Kích hoạt quy tắc công tác ngoài' }
        ]),
      steps: [
        { stepCode: 'ATT18.01', title: 'Khởi tạo đăng ký công tác ngoài', actor: 'Nhân viên', location: 'ESS/Mobile', timing: 'Trước khi đi công tác', typeCode: 'N', description: 'Chọn loại yêu cầu công tác ngoài và khoảng thời gian thực hiện.', fieldsChecklist: ['Từ ngày/giờ', 'Đến ngày/giờ', 'Loại công tác'] },
        { stepCode: 'ATT18.02', title: 'Khai báo nội dung và địa điểm', actor: 'Nhân viên', location: 'ESS/Mobile', timing: 'Khi lập đơn', typeCode: 'N', description: 'Nhập mục đích, địa điểm, đơn vị liên hệ, phương tiện và tài liệu kèm theo nếu có.', fieldsChecklist: ['Mục đích', 'Địa điểm', 'Đơn vị liên hệ', 'Phương tiện', 'Tệp đính kèm'] },
        { stepCode: 'ATT18.03', title: 'Kiểm tra trùng lịch và tuyến duyệt', actor: 'Hệ thống HRUX', location: 'Workflow Engine', timing: 'Khi gửi đơn', typeCode: 'A', description: 'Kiểm tra trùng ca, nghỉ phép, công tác khác và xác định đúng quản lý phê duyệt.', fieldsChecklist: ['Xung đột lịch', 'Tuyến duyệt', 'Cảnh báo'] },
        { stepCode: 'ATT18.04', title: 'Phê duyệt công tác ngoài', actor: 'Quản lý trực tiếp', location: 'MSS/Portal phê duyệt', timing: 'Trước thời điểm bắt đầu', typeCode: 'M', description: 'Xem mục đích, lịch và phạm vi rồi duyệt, từ chối hoặc trả bổ sung.', fieldsChecklist: ['Quyết định', 'Ý kiến phê duyệt', 'Điều kiện kèm theo'] },
        { stepCode: 'ATT18.05', title: 'Áp dụng quy tắc ghi nhận công', actor: 'HR Chấm công', location: 'HRUX Chấm công', timing: 'Sau khi được duyệt', typeCode: 'C', description: 'Xác nhận phương thức chấm công ngoài, ký hiệu công và điều kiện đối soát.', fieldsChecklist: ['Ký hiệu công', 'Cách xác thực', 'Phạm vi thời gian'] },
        { stepCode: 'ATT18.06', title: 'Đối soát và hoàn tất', actor: 'Hệ thống HRUX & HR Chấm công', location: 'Attendance Engine', timing: 'Cuối ngày hoặc kỳ công', typeCode: 'A', description: 'Đối chiếu đơn đã duyệt với dữ liệu ghi nhận thực tế và chuyển kết quả vào bảng công.', fieldsChecklist: ['Đơn đã duyệt', 'Dữ liệu thực tế', 'Kết quả công'] }
      ],
      sourceNote: 'Số hóa từ video “2. đăng ký công tác ngoài.mp4”; vị trí minh họa phải được làm giả hoặc làm mờ.'
    }
  },
  {
    id: 'doc-hrux-pay-05', code: 'SOP-PAY-05', workflowId: 'MODULE-PAY', moduleIds: ['pay'], sourceOrder: 50,
    title: 'Quy trình import phụ cấp',
    summary: 'Chuẩn bị file mẫu, kiểm tra trước, phê duyệt và ghi nhận phụ cấp hàng loạt có khả năng đối soát và hoàn tác.',
    content: {
      sopCode: 'SOP-PAY-05', sopTitle: 'Quy trình import phụ cấp', sopCategory: 'Lương · Dữ liệu đầu vào',
      description: 'Nhập phụ cấp hàng loạt theo kỳ lương với kiểm tra file, preview, phân tách người lập/người duyệt và lưu lịch sử.',
      inputs: ['File mẫu đúng phiên bản', 'Danh sách nhân viên', 'Mã phụ cấp', 'Giá trị, kỳ và ngày hiệu lực'],
      outputs: ['Lô import được duyệt và ghi nhận', 'Danh sách thành công/lỗi', 'Biên bản đối soát hoặc hoàn tác'],
      rules: ['Không chạy SQL trực tiếp trong nghiệp vụ thông thường', 'Người lập không tự phê duyệt lô của mình', 'Không ghi dữ liệu khi file còn lỗi bắt buộc'],
      ...governance('confidential',
        ['Payroll/C&B', 'Payroll Approver', 'Auditor được phê duyệt', 'IT Support khi có ticket'],
        ['Payroll/C&B: lô thuộc đơn vị được giao', 'Payroll Approver: lô chờ duyệt', 'Auditor: chỉ đọc', 'IT Support: dữ liệu tối thiểu để xử lý lỗi'],
        ['Nhân viên', 'Recruiter', 'Quản lý trực tiếp', 'HR không phụ trách lương'],
        'Payroll Manager', ['C&B Senior', 'IT/HRIS đối với thay đổi template'], 'Giám đốc Nhân sự hoặc người được ủy quyền',
        [
          { order: 1, actor: 'C&B Senior', decision: 'Rà soát tổng tiền, kỳ, đối tượng và lỗi cảnh báo', outcome: 'Cho phép trình duyệt hoặc trả file' },
          { order: 2, actor: 'Payroll Manager', decision: 'Phê duyệt ghi dữ liệu vào kỳ lương', condition: 'Preview không còn lỗi bắt buộc', outcome: 'Cho phép commit hoặc từ chối' }
        ]),
      steps: [
        { stepCode: 'PAY05.01', title: 'Tải đúng file mẫu', actor: 'Payroll/C&B', location: 'HRUX Payroll', timing: 'Đầu kỳ hoặc khi phát sinh', typeCode: 'N', description: 'Tải template hiện hành từ hệ thống để bảo đảm đúng cột và mã dữ liệu.', fieldsChecklist: ['Phiên bản template', 'Kỳ lương', 'Đơn vị áp dụng'] },
        { stepCode: 'PAY05.02', title: 'Chuẩn bị dữ liệu phụ cấp', actor: 'Payroll/C&B', location: 'File làm việc được kiểm soát', timing: 'Trước khi import', typeCode: 'N', description: 'Nhập mã nhân viên, mã phụ cấp, giá trị, tiền tệ, ngày hiệu lực và ghi chú nguồn.', fieldsChecklist: ['Mã nhân viên', 'Mã phụ cấp', 'Giá trị', 'Tiền tệ', 'Ngày hiệu lực'] },
        { stepCode: 'PAY05.03', title: 'Tải file và chạy kiểm tra trước', actor: 'Hệ thống HRUX', location: 'HRUX Payroll', timing: 'Khi người lập tải file', typeCode: 'A', description: 'Kiểm tra cấu trúc, kiểu dữ liệu, nhân viên, mã phụ cấp, trùng dòng và kỳ đã khóa.', fieldsChecklist: ['Tổng số dòng', 'Dòng hợp lệ', 'Dòng lỗi', 'Cảnh báo'] },
        { stepCode: 'PAY05.04', title: 'Rà soát preview và sửa lỗi', actor: 'Payroll/C&B & C&B Senior', location: 'HRUX Payroll', timing: 'Trước khi trình duyệt', typeCode: 'C', description: 'Đối chiếu tổng tiền và chi tiết; tải báo cáo lỗi, sửa file và kiểm tra lại.', fieldsChecklist: ['Tổng tiền', 'Chênh lệch', 'Báo cáo lỗi', 'Tệp bằng chứng'] },
        { stepCode: 'PAY05.05', title: 'Phê duyệt lô import', actor: 'Payroll Manager', location: 'Portal phê duyệt', timing: 'Trước khi tính lương', typeCode: 'M', description: 'Kiểm tra preview, nguồn dữ liệu và xác nhận cho phép ghi lô vào kỳ lương.', fieldsChecklist: ['Người lập', 'Tổng dòng/tổng tiền', 'Quyết định', 'Ý kiến'] },
        { stepCode: 'PAY05.06', title: 'Ghi nhận, đối soát và hoàn tác khi cần', actor: 'Hệ thống HRUX & Payroll/C&B', location: 'Payroll Engine', timing: 'Sau phê duyệt', typeCode: 'A', description: 'Ghi dữ liệu theo giao dịch, tạo báo cáo kết quả và cho phép hoàn tác cả lô trước khi kỳ bị khóa.', fieldsChecklist: ['Mã lô', 'Kết quả từng dòng', 'Audit Log', 'Trạng thái rollback'] }
      ],
      sourceNote: 'Số hóa từ “Hướng dẫn import phụ cấp.docx”; câu SQL và định danh database chỉ được giữ ở phụ lục kỹ thuật hạn chế.'
    }
  },
  {
    id: 'doc-hrux-adm-01', code: 'SOP-ADM-01', workflowId: 'MODULE-PLT-DOC', moduleIds: ['emp'], sourceOrder: 90,
    title: 'Quy trình làm giấy giới thiệu',
    summary: 'Tiếp nhận yêu cầu, phê duyệt mục đích, soạn giấy, ký/đóng dấu, phát hành và lưu hồ sơ.',
    content: {
      sopCode: 'SOP-ADM-01', sopTitle: 'Quy trình làm giấy giới thiệu', sopCategory: 'Hành chính văn thư · Văn bản',
      description: 'Phát hành giấy giới thiệu đúng mục đích, đúng người đại diện, có số văn bản, chữ ký, dấu và hồ sơ lưu.',
      inputs: ['Thông tin người được giới thiệu', 'Nơi đến', 'Nội dung công việc', 'Thời hạn sử dụng', 'Căn cứ/yêu cầu của đơn vị'],
      outputs: ['Giấy giới thiệu đã ký và đóng dấu', 'Bản phát hành và hồ sơ lưu có thể tra cứu'],
      rules: ['Chỉ sử dụng mẫu đang hiệu lực', 'Không phát hành khi mục đích hoặc nơi đến chưa được duyệt', 'Mỗi giấy có số và thời hạn rõ ràng'],
      ...governance('restricted',
        ['Nhân viên: phần hướng dẫn yêu cầu', 'Quản lý trực tiếp', 'Hành chính/Văn thư', 'Người ký được ủy quyền'],
        ['Người yêu cầu: hồ sơ của mình', 'Quản lý: yêu cầu thuộc đơn vị', 'Văn thư: hồ sơ cần xử lý và sổ phát hành'],
        ['Nhân viên khác', 'Bộ phận không liên quan', 'Người ngoài công ty trước khi văn bản được phát hành hợp lệ'],
        'Trưởng bộ phận Hành chính/Văn thư', ['HR Operations', 'Pháp chế khi mẫu hoặc nội dung thay đổi'], 'Giám đốc Hành chính hoặc người được ủy quyền',
        [
          { order: 1, actor: 'Quản lý trực tiếp/Trưởng đơn vị', decision: 'Xác nhận nhu cầu và nội dung công việc', outcome: 'Duyệt, từ chối hoặc trả bổ sung' },
          { order: 2, actor: 'Người ký được ủy quyền', decision: 'Phê duyệt và ký giấy giới thiệu', condition: 'Văn thư đã kiểm tra thể thức', outcome: 'Cho phép phát hành' }
        ]),
      steps: [
        { stepCode: 'ADM01.01', title: 'Gửi yêu cầu giấy giới thiệu', actor: 'Nhân viên/Đơn vị yêu cầu', location: 'ESS/Portal', timing: 'Trước ngày cần sử dụng', typeCode: 'N', description: 'Khai báo người được giới thiệu, nơi đến, nội dung, thời gian và căn cứ.', fieldsChecklist: ['Họ tên/chức danh', 'Nơi đến', 'Nội dung', 'Thời hạn', 'Tệp căn cứ'] },
        { stepCode: 'ADM01.02', title: 'Phê duyệt nhu cầu và nội dung', actor: 'Quản lý trực tiếp/Trưởng đơn vị', location: 'Portal phê duyệt', timing: 'Theo SLA hành chính', typeCode: 'M', description: 'Xác nhận yêu cầu phục vụ công việc và nội dung được phép đại diện.', fieldsChecklist: ['Quyết định', 'Ý kiến', 'Phạm vi đại diện'] },
        { stepCode: 'ADM01.03', title: 'Soạn giấy theo mẫu hiệu lực', actor: 'Hành chính/Văn thư', location: 'HRUX Document', timing: 'Sau khi yêu cầu được duyệt', typeCode: 'N', description: 'Tạo dự thảo từ mẫu, kiểm tra thể thức, thông tin và thời hạn.', fieldsChecklist: ['Mẫu/phiên bản', 'Số dự kiến', 'Thông tin dự thảo'] },
        { stepCode: 'ADM01.04', title: 'Ký duyệt giấy giới thiệu', actor: 'Người ký được ủy quyền', location: 'Ký số hoặc ký trực tiếp', timing: 'Sau kiểm tra thể thức', typeCode: 'M', description: 'Kiểm tra nội dung và ký trong phạm vi ủy quyền.', fieldsChecklist: ['Người ký', 'Căn cứ ủy quyền', 'Ngày ký'] },
        { stepCode: 'ADM01.05', title: 'Đóng dấu và phát hành', actor: 'Hành chính/Văn thư', location: 'Văn thư', timing: 'Sau khi ký', typeCode: 'C', description: 'Cấp số, đóng dấu, ghi sổ và giao bản phát hành đúng người nhận.', fieldsChecklist: ['Số văn bản', 'Dấu', 'Ngày phát hành', 'Người nhận'] },
        { stepCode: 'ADM01.06', title: 'Lưu và đóng hồ sơ', actor: 'Hành chính/Văn thư', location: 'Kho tài liệu HRUX', timing: 'Ngay sau phát hành', typeCode: 'A', description: 'Lưu bản scan/bản số, liên kết yêu cầu gốc và áp dụng thời hạn lưu.', fieldsChecklist: ['Bản phát hành', 'Yêu cầu gốc', 'Thời hạn lưu', 'Quyền truy cập'] }
      ],
      sourceNote: 'Số hóa từ “HƯỚNG DẪN LÀM GIẤY GIỚI THIỆU.pdf”; ví dụ công bố không chứa dữ liệu cá nhân thật.'
    }
  },
  {
    id: 'doc-hrux-emp-16', code: 'SOP-EMP-16', workflowId: 'LIFE-03', moduleIds: ['emp'], sourceOrder: 160,
    title: 'Quy trình lập và phát hành quyết định công tác',
    summary: 'Từ đề nghị công tác, kiểm tra chính sách, phê duyệt thẩm quyền đến ký, phát hành và cập nhật hồ sơ.',
    content: {
      sopCode: 'SOP-EMP-16', sopTitle: 'Quy trình lập và phát hành quyết định công tác', sopCategory: 'Nhân sự · Công tác',
      description: 'Lập quyết định công tác có căn cứ, ngân sách, tuyến duyệt và hồ sơ phát hành đầy đủ.',
      inputs: ['Đề nghị công tác đã khai báo', 'Thời gian/địa điểm/nội dung', 'Chi phí hoặc ngân sách', 'Căn cứ phân công'],
      outputs: ['Quyết định công tác đã ký/phát hành', 'Thông tin cập nhật cho Chấm công và Payroll khi cần'],
      rules: ['Phê duyệt theo thẩm quyền và ngân sách', 'Người lập không tự ký quyết định', 'Dữ liệu cá nhân và địa điểm chỉ hiển thị theo phạm vi xử lý'],
      ...governance('confidential',
        ['Người được cử đi công tác', 'Quản lý trực tiếp', 'HR Operations', 'Hành chính/Văn thư', 'Payroll khi cần thanh toán'],
        ['Nhân viên: quyết định của chính mình', 'Quản lý: nhân viên thuộc quyền', 'HR/Văn thư: hồ sơ trong phạm vi xử lý', 'Payroll: dữ liệu đã duyệt cần thanh toán'],
        ['Nhân viên không liên quan', 'Quản lý ngoài tuyến', 'Recruiter', 'Bộ phận không tham gia'],
        'HR Operations Manager', ['Hành chính/Văn thư', 'Finance đối với ngân sách', 'Pháp chế đối với mẫu'], 'Giám đốc Nhân sự hoặc cấp có thẩm quyền',
        [
          { order: 1, actor: 'Quản lý trực tiếp/Trưởng đơn vị', decision: 'Xác nhận nhu cầu, người đi và thời gian', outcome: 'Duyệt đề nghị hoặc trả bổ sung' },
          { order: 2, actor: 'Finance/Chủ ngân sách', decision: 'Xác nhận ngân sách', condition: 'Có chi phí vượt hạn mức tự duyệt', outcome: 'Xác nhận nguồn chi hoặc từ chối' },
          { order: 3, actor: 'Giám đốc Nhân sự/Cấp có thẩm quyền', decision: 'Phê duyệt và ký quyết định', condition: 'Hồ sơ đủ căn cứ và đúng thẩm quyền', outcome: 'Cho phép phát hành quyết định' }
        ]),
      steps: [
        { stepCode: 'EMP16.01', title: 'Lập đề nghị công tác', actor: 'Nhân viên/Quản lý trực tiếp', location: 'ESS/MSS', timing: 'Trước ngày công tác', typeCode: 'N', description: 'Khai báo người đi, mục đích, địa điểm, thời gian, phương tiện và chi phí dự kiến.', fieldsChecklist: ['Người đi', 'Mục đích', 'Địa điểm', 'Thời gian', 'Chi phí'] },
        { stepCode: 'EMP16.02', title: 'Xác nhận nhu cầu của đơn vị', actor: 'Trưởng đơn vị', location: 'Portal phê duyệt', timing: 'Theo SLA', typeCode: 'M', description: 'Kiểm tra nhu cầu, lịch làm việc và phạm vi nhiệm vụ.', fieldsChecklist: ['Ý kiến', 'Quyết định', 'Phạm vi nhiệm vụ'] },
        { stepCode: 'EMP16.03', title: 'Kiểm tra chính sách và ngân sách', actor: 'HR Operations & Finance', location: 'HRUX/Finance', timing: 'Sau duyệt đơn vị', typeCode: 'C', description: 'Đối chiếu định mức, thẩm quyền ký, nguồn chi và hồ sơ kèm theo.', fieldsChecklist: ['Định mức', 'Ngân sách', 'Thẩm quyền ký', 'Căn cứ'] },
        { stepCode: 'EMP16.04', title: 'Soạn dự thảo quyết định', actor: 'HR Operations/Hành chính', location: 'HRUX Document', timing: 'Khi hồ sơ hợp lệ', typeCode: 'N', description: 'Sinh quyết định từ mẫu hiệu lực và kiểm tra thông tin người đi, nhiệm vụ, thời gian.', fieldsChecklist: ['Mẫu quyết định', 'Số dự kiến', 'Nội dung dự thảo'] },
        { stepCode: 'EMP16.05', title: 'Phê duyệt và ký quyết định', actor: 'Giám đốc Nhân sự/Cấp có thẩm quyền', location: 'Ký số hoặc ký trực tiếp', timing: 'Trước ngày hiệu lực', typeCode: 'M', description: 'Kiểm tra hồ sơ và ký theo thẩm quyền.', fieldsChecklist: ['Quyết định phê duyệt', 'Người ký', 'Ngày hiệu lực'] },
        { stepCode: 'EMP16.06', title: 'Phát hành và thông báo', actor: 'Hành chính/Văn thư', location: 'Văn thư/HRUX', timing: 'Sau khi ký', typeCode: 'C', description: 'Cấp số, đóng dấu, gửi cho người đi và các bộ phận cần xử lý.', fieldsChecklist: ['Số quyết định', 'Danh sách nhận', 'Bản phát hành'] },
        { stepCode: 'EMP16.07', title: 'Cập nhật hệ thống và lưu hồ sơ', actor: 'Hệ thống HRUX & HR Operations', location: 'EMP/ATT/PAY', timing: 'Theo ngày hiệu lực', typeCode: 'A', description: 'Liên kết quyết định vào hồ sơ, chuyển dữ liệu cần thiết sang Chấm công/Payroll và lưu Audit Log.', fieldsChecklist: ['Hồ sơ nhân viên', 'Dữ liệu liên phân hệ', 'Audit Log'] }
      ],
      sourceNote: 'Số hóa từ “HƯỚNG DẪN LÀM QUYẾT ĐỊNH CÔNG TÁC.pdf”; dữ liệu ví dụ phải được thay bằng dữ liệu giả.'
    }
  },
  {
    id: 'doc-hrux-cfg-09', code: 'CFG-09', workflowId: 'MODULE-PLT-CFG', moduleIds: ['emp'], sourceOrder: 90,
    title: 'Cấu hình mã hợp đồng và cảnh báo hết hạn',
    summary: 'Thiết lập công thức sinh mã hợp đồng, mốc cảnh báo hết hạn, kiểm thử và phát hành cấu hình có kiểm soát.',
    content: {
      sopCode: 'CFG-09', sopTitle: 'Cấu hình mã hợp đồng và cảnh báo hết hạn', sopCategory: 'Cấu hình HRUX · Hợp đồng',
      description: 'Work instruction quản trị cấu hình hợp đồng, bảo đảm mã không trùng và cảnh báo đến đúng người phụ trách.',
      inputs: ['Quy ước mã hợp đồng đã phê duyệt', 'Loại hợp đồng', 'Mốc cảnh báo', 'Nhóm nhận thông báo'],
      outputs: ['Công thức mã hợp đồng có phiên bản', 'Lịch cảnh báo hết hạn', 'Kết quả kiểm thử và Audit Log'],
      rules: ['Chỉ HRIS Admin được sửa cấu hình', 'Mọi thay đổi phải thử ở môi trường kiểm thử', 'Không sửa hồi tố mã hợp đồng đã phát hành'],
      ...governance('confidential',
        ['HRIS Admin', 'HR Operations Owner', 'HR Manager', 'Auditor được ủy quyền'],
        ['HRIS Admin: cấu hình kỹ thuật', 'HR Operations: quy tắc nghiệp vụ', 'Auditor: chỉ đọc lịch sử thay đổi'],
        ['Nhân viên', 'Quản lý thông thường', 'Recruiter', 'Payroll nếu không được giao quản trị cấu hình'],
        'HRIS Product Owner', ['HR Operations Owner', 'IT Application Support'], 'Giám đốc Nhân sự',
        [
          { order: 1, actor: 'HR Operations Owner', decision: 'Xác nhận quy tắc mã và mốc cảnh báo', outcome: 'Chấp thuận nghiệp vụ hoặc yêu cầu sửa' },
          { order: 2, actor: 'Giám đốc Nhân sự', decision: 'Phê duyệt áp dụng cấu hình', condition: 'Kiểm thử đạt và không ảnh hưởng hợp đồng hiện hữu', outcome: 'Cho phép kích hoạt' }
        ]),
      steps: [
        { stepCode: 'CFG09.01', title: 'Đề xuất thay đổi cấu hình', actor: 'HR Operations Owner', location: 'Phiếu yêu cầu cấu hình', timing: 'Khi thay đổi quy ước/chính sách', typeCode: 'N', description: 'Mô tả công thức mã, phạm vi hợp đồng, mốc cảnh báo và lý do thay đổi.', fieldsChecklist: ['Công thức đề xuất', 'Phạm vi', 'Mốc cảnh báo', 'Lý do'] },
        { stepCode: 'CFG09.02', title: 'Đánh giá tác động', actor: 'HRIS Admin', location: 'HRUX Admin', timing: 'Trước khi cấu hình', typeCode: 'C', description: 'Kiểm tra khả năng trùng mã, dữ liệu hiện hữu, tích hợp và người nhận cảnh báo.', fieldsChecklist: ['Mẫu mã', 'Khả năng trùng', 'Ảnh hưởng tích hợp', 'Kế hoạch rollback'] },
        { stepCode: 'CFG09.03', title: 'Cấu hình trên môi trường kiểm thử', actor: 'HRIS Admin', location: 'HRUX Test', timing: 'Sau khi đánh giá', typeCode: 'N', description: 'Thiết lập công thức và lịch cảnh báo trong môi trường kiểm thử.', fieldsChecklist: ['Loại hợp đồng', 'Token công thức', 'Số thứ tự', 'Mốc cảnh báo'] },
        { stepCode: 'CFG09.04', title: 'Kiểm thử các tình huống', actor: 'HRIS Admin & HR Operations', location: 'HRUX Test', timing: 'Trước phê duyệt', typeCode: 'C', description: 'Thử sinh mã mới, tái ký, phụ lục, nhiều đơn vị và các mốc hết hạn.', fieldsChecklist: ['Kịch bản test', 'Kết quả', 'Lỗi', 'Xác nhận nghiệp vụ'] },
        { stepCode: 'CFG09.05', title: 'Phê duyệt kích hoạt', actor: 'Giám đốc Nhân sự', location: 'Portal phê duyệt', timing: 'Sau khi kiểm thử đạt', typeCode: 'M', description: 'Phê duyệt phiên bản cấu hình và thời điểm áp dụng.', fieldsChecklist: ['Phiên bản', 'Ngày hiệu lực', 'Quyết định'] },
        { stepCode: 'CFG09.06', title: 'Kích hoạt và giám sát', actor: 'HRIS Admin & Hệ thống HRUX', location: 'HRUX Production', timing: 'Theo ngày hiệu lực', typeCode: 'A', description: 'Kích hoạt, kiểm tra mẫu đầu tiên, theo dõi cảnh báo và lưu đầy đủ lịch sử thay đổi.', fieldsChecklist: ['Mã sinh thử', 'Lịch cảnh báo', 'Audit Log', 'Trạng thái rollback'] }
      ],
      sourceNote: 'Số hóa từ “Hướng dẫn cấu hình nhân viên.docx”; ảnh màn hình quản trị chỉ hiển thị cho nhóm được phép.'
    }
  }
]

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Idempotently installs the HRUX procedures derived from the reviewed source documents. */
export async function ensureHruxSopLibrary(database: QueryRunner): Promise<void> {
  for (const document of documents) {
    await database.query(`INSERT INTO KnowledgeDocument
      (DocumentId, Code, Title, DocumentType, Summary, WorkflowId, SourceKey, Status, Visibility, SourceOrder, CurrentVersionNumber)
      VALUES (:id, :code, :title, 'procedure', :summary, :workflowId, :sourceKey, 'published', 'module', :sourceOrder, 1)
      ON DUPLICATE KEY UPDATE Code = :code, Title = :title, Summary = :summary, WorkflowId = :workflowId,
        SourceOrder = :sourceOrder`, {
      id: document.id, code: document.code, title: document.title, summary: document.summary,
      workflowId: document.workflowId, sourceKey: `hrux-source:${document.code}`, sourceOrder: document.sourceOrder
    })
    await database.query(`INSERT INTO KnowledgeDocumentVersion
      (DocumentId, VersionNumber, Status, ContentJson, ContentHash)
      VALUES (:id, 1, 'published', :content, :hash)
      ON DUPLICATE KEY UPDATE DocumentId = DocumentId`, {
      id: document.id, content: JSON.stringify(document.content), hash: hash(document.content)
    })
    for (const moduleId of document.moduleIds) {
      await database.query(`INSERT IGNORE INTO KnowledgeDocumentModule (DocumentId, ModuleId)
        SELECT :id, ModuleId FROM HrModule WHERE ModuleId = :moduleId AND Status = 'published'`, { id: document.id, moduleId })
    }
  }
}
