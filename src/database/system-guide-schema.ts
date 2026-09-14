import type { QueryRunner } from './database.js'

interface SeedGuide {
  id: string
  slug: string
  title: string
  summary: string
  category: string
  routePath: string | null
  permission: string | null
  audience: 'ALL' | 'AUTHORIZED' | 'ADMIN'
  sortOrder: number
  content: object
  tour?: Array<{ id: string; anchor: string; title: string; description: string; routePath: string; sortOrder: number }>
}

const guides: SeedGuide[] = [
  {
    id: 'guide-system-overview', slug: 'tong-quan-he-thong', title: 'Bắt đầu với hệ thống SOP',
    summary: 'Hiểu mục đích hệ thống, bố cục màn hình và lộ trình sử dụng phù hợp với công việc của bạn.',
    category: 'Bắt đầu', routePath: '/employee-lifecycle', permission: null, audience: 'ALL', sortOrder: 10,
    content: {
      purpose: 'Giúp người dùng mới biết hệ thống đang hiển thị gì và nên bắt đầu từ đâu.',
      audience: 'Tất cả người dùng đã đăng nhập', accessPath: 'Thanh bên → Hướng dẫn chi tiết', prerequisites: ['Đăng nhập bằng tài khoản được cấp'],
      steps: [
        { title: 'Xem quyền của tôi', description: 'Kiểm tra vai trò, phòng ban, chức danh và các phân hệ được cấp ở đầu trang hướng dẫn.' },
        { title: 'Chọn mục tiêu công việc', description: 'Dùng khu vực “Tôi muốn…” để đi thẳng tới tra cứu, tài liệu, chuyển hóa hoặc quản trị.' },
        { title: 'Tra cứu SOP đã công bố', description: 'Mở Thư viện quy trình hoặc dùng ô tìm kiếm toàn hệ thống.' },
        { title: 'Xem hướng dẫn của từng chức năng', description: 'Mỗi thẻ nêu rõ mục đích, đường dẫn, điều kiện và kết quả mong đợi.' }
      ],
      result: 'Bạn xác định được đúng khu vực cần dùng mà không cần hiểu dữ liệu mẫu hoặc cấu trúc kỹ thuật.',
      permissions: ['Không yêu cầu quyền bổ sung'], commonErrors: ['Nếu không thấy một chức năng, tài khoản chưa được cấp quyền tương ứng.'],
      relatedRoutes: ['/employee-lifecycle?tab=process-library&cluster=core', '/employee-lifecycle/policies'], support: 'Liên hệ quản trị viên khi vai trò hoặc phân hệ của bạn chưa đúng.'
    },
    tour: [
      { id: 'tour-overview-sidebar', anchor: 'main-sidebar', title: 'Thanh điều hướng', description: 'Các chức năng được nhóm theo mục đích sử dụng và tự lọc theo quyền của bạn.', routePath: '/employee-lifecycle/system-guide', sortOrder: 10 },
      { id: 'tour-overview-search', anchor: 'global-sop-search', title: 'Tìm kiếm SOP', description: 'Nhập tên quy trình hoặc mã SOP để mở nhanh nội dung đã công bố.', routePath: '/employee-lifecycle/system-guide', sortOrder: 20 },
      { id: 'tour-overview-profile', anchor: 'guide-profile', title: 'Quyền của tôi', description: 'Xem vai trò, đơn vị và phạm vi chức năng hiện có của tài khoản.', routePath: '/employee-lifecycle/system-guide', sortOrder: 30 },
      { id: 'tour-overview-tasks', anchor: 'guide-task-shortcuts', title: 'Bắt đầu theo công việc', description: 'Chọn việc cần làm để hệ thống chỉ đúng màn hình và hướng dẫn liên quan.', routePath: '/employee-lifecycle/system-guide', sortOrder: 40 }
    ]
  },
  {
    id: 'guide-navigation', slug: 'dieu-huong-va-tim-kiem', title: 'Điều hướng và tìm kiếm',
    summary: 'Sử dụng thanh bên, thanh đầu trang và tìm kiếm toàn hệ thống.', category: 'Bắt đầu',
    routePath: '/employee-lifecycle', permission: null, audience: 'ALL', sortOrder: 20,
    content: {
      purpose: 'Đi nhanh tới đúng chức năng hoặc SOP.', audience: 'Tất cả người dùng', accessPath: 'Thanh bên hoặc ô tìm kiếm ở đầu trang', prerequisites: [],
      steps: [{ title: 'Mở nhóm chức năng', description: 'Chọn mục ở thanh bên trái.' }, { title: 'Tìm SOP', description: 'Nhập tên hoặc mã SOP trong ô tìm kiếm.' }, { title: 'Quay lại', description: 'Dùng nút quay lại trong trang chi tiết để giữ ngữ cảnh làm việc.' }],
      result: 'Mở đúng nội dung cần xem.', permissions: ['Kết quả tìm kiếm được lọc theo quyền đọc'], commonErrors: ['SOP nháp chưa xuất hiện trong tìm kiếm công khai.'], relatedRoutes: ['/employee-lifecycle'], support: 'Kiểm tra trạng thái công bố và quyền phân hệ nếu không tìm thấy SOP.'
    }
  },
  {
    id: 'guide-architecture-dashboard', slug: 'tong-quan-kien-truc-hrms', title: 'Tổng quan kiến trúc HRMS',
    summary: 'Đọc bức tranh tổng thể về các cụm nghiệp vụ, phân hệ và quan hệ dữ liệu trên dashboard.', category: 'Khám phá hệ thống',
    routePath: '/employee-lifecycle', permission: null, audience: 'ALL', sortOrder: 25,
    content: {
      purpose: 'Giúp người mới hiểu các khu vực lớn của hệ thống trước khi mở một quy trình cụ thể.', audience: 'Tất cả người dùng', accessPath: 'Thanh bên → Tổng quan hệ thống', prerequisites: ['Tài khoản có ít nhất một phân hệ; Admin có thể xem toàn bộ'],
      steps: [{ title: 'Chọn cụm nghiệp vụ', description: 'Chuyển giữa Vận hành lõi, Phát triển con người, Quản trị tổ chức và Nền tảng.' }, { title: 'Chọn phân hệ', description: 'Mở Tuyển dụng, Onboarding, Nhân sự, Chấm công hoặc phân hệ khác được cấp.' }, { title: 'Mở quy trình', description: 'Chọn nghiệp vụ trong menu phân hệ để xem quy trình và các bước.' }, { title: 'Đọc quan hệ dữ liệu', description: 'Dùng sơ đồ quan hệ và đầu vào, đầu ra để hiểu dữ liệu được chuyển tiếp.' }],
      result: 'Xác định được vị trí của nghiệp vụ trong bức tranh HRMS.', permissions: ['Theo quyền phân hệ'], commonErrors: ['Các nhãn trên dashboard mô tả kiến trúc; SOP chính thức nằm trong Thư viện quy trình.'], relatedRoutes: ['/employee-lifecycle', '/employee-lifecycle?tab=process-library&cluster=core'], support: 'Hỏi quản trị viên về phạm vi phân hệ nếu thiếu một khu vực cần làm việc.'
    }
  },
  {
    id: 'guide-master-data', slug: 'danh-muc-master-data', title: 'Danh mục dùng chung & Master Data',
    summary: 'Hiểu các danh mục chuẩn dùng chung, mối liên hệ với quy trình và dữ liệu nguồn.', category: 'Khám phá hệ thống',
    routePath: '/employee-lifecycle/masterdata', permission: 'sop.read', audience: 'AUTHORIZED', sortOrder: 26,
    content: {
      purpose: 'Tra cứu dữ liệu chuẩn được nhiều quy trình sử dụng chung.', audience: 'Người dùng có quyền xem phân hệ liên quan', accessPath: 'Thanh bên → Danh mục dùng chung', prerequisites: ['Có quyền đọc phân hệ'],
      steps: [{ title: 'Mở Danh mục', description: 'Xem các nhóm quốc tịch, tiền tệ, trình độ và danh mục nền tảng.' }, { title: 'Chuyển Theo quy trình', description: 'Xem danh mục nào được một nghiệp vụ sử dụng.' }, { title: 'Mở Bản đồ quan hệ', description: 'Kiểm tra liên kết giữa các danh mục và phân hệ.' }, { title: 'Mở chi tiết', description: 'Xem mô tả, phạm vi và trường dữ liệu của mục được chọn.' }],
      result: 'Biết quy trình đang dùng dữ liệu chuẩn nào.', permissions: ['sop.read và quyền phân hệ'], commonErrors: ['Dữ liệu danh mục chỉ nên sửa tại khu vực quản trị bởi người được giao.'], relatedRoutes: ['/employee-lifecycle/masterdata', '/employee-lifecycle/admin/master-data'], support: 'Liên hệ Data Owner hoặc Admin khi danh mục cần điều chỉnh.'
    }
  },
  {
    id: 'guide-employee-journey', slug: 'hanh-trinh-vong-doi-nhan-vien', title: 'Hành trình vòng đời nhân viên',
    summary: 'Xem trình tự từ định biên, tiếp nhận, hồ sơ, hợp đồng đến nghỉ việc và bàn giao.', category: 'Khám phá hệ thống',
    routePath: '/employee-lifecycle/journey', permission: 'sop.read', audience: 'AUTHORIZED', sortOrder: 27,
    content: {
      purpose: 'Cho biết một nhân viên đi qua các giai đoạn nào và quy trình nào tham gia ở mỗi giai đoạn.', audience: 'Nhân sự, quản lý và người có quyền phân hệ liên quan', accessPath: 'Thanh bên → Vòng đời nhân sự', prerequisites: ['Có quyền đọc ít nhất một phân hệ liên quan'],
      steps: [{ title: 'Chọn giai đoạn', description: 'Chọn một chặng trong hành trình.' }, { title: 'Đọc phạm vi', description: 'Xem mục tiêu, đầu vào, đầu ra và nhóm chịu trách nhiệm.' }, { title: 'Chọn quy trình', description: 'Mở SOP liên quan của giai đoạn.' }, { title: 'Đối chiếu bước', description: 'Xem chi tiết các bước và lưu đồ đã công bố.' }],
      result: 'Hiểu vị trí của một quy trình trong toàn bộ vòng đời nhân viên.', permissions: ['Theo quyền phân hệ'], commonErrors: ['Vòng đời là bản đồ điều hướng; nội dung thực thi chính thức nằm trong SOP.'], relatedRoutes: ['/employee-lifecycle/journey', '/employee-lifecycle?tab=process-library&cluster=core'], support: 'Liên hệ HR Operations nếu chưa rõ giai đoạn phụ trách.'
    }
  },
  {
    id: 'guide-operations', slug: 'nghiep-vu-phat-sinh', title: 'Nghiệp vụ phát sinh',
    summary: 'Tra cứu các nghiệp vụ xảy ra trong quá trình làm việc như công, phép, điều chuyển và hỗ trợ.', category: 'Khám phá hệ thống',
    routePath: '/employee-lifecycle/operations', permission: 'sop.read', audience: 'AUTHORIZED', sortOrder: 28,
    content: {
      purpose: 'Đi từ một tình huống thực tế tới quy trình xử lý tương ứng.', audience: 'Nhân viên và bộ phận vận hành được cấp quyền', accessPath: 'Thanh bên → Nghiệp vụ phát sinh', prerequisites: ['Có quyền đọc phân hệ'],
      steps: [{ title: 'Chọn nhóm nghiệp vụ', description: 'Chọn thẻ phù hợp với tình huống đang phát sinh.' }, { title: 'Đọc khi nào dùng', description: 'Xác nhận điều kiện kích hoạt, người tham gia và kết quả.' }, { title: 'Mở quy trình', description: 'Đi tới SOP hướng dẫn thao tác.' }, { title: 'Theo dõi đầu ra', description: 'Kiểm tra dữ liệu hoặc hồ sơ được cập nhật sau xử lý.' }],
      result: 'Xác định được SOP cần dùng cho một sự việc cụ thể.', permissions: ['Theo quyền phân hệ'], commonErrors: ['Không dùng nội dung mô tả tổng quan thay cho phiên bản SOP đã công bố.'], relatedRoutes: ['/employee-lifecycle/operations'], support: 'Liên hệ bộ phận sở hữu nghiệp vụ khi tình huống chưa có quy trình.'
    }
  },
  {
    id: 'guide-flow-viewer', slug: 'xem-luu-do-va-canvas-sop', title: 'Xem lưu đồ và canvas SOP',
    summary: 'Đọc trình tự, nhánh điều kiện, bước con, vai trò và hình minh họa của một SOP.', category: 'Trực quan hóa',
    routePath: '/employee-lifecycle?tab=process-library&cluster=core', permission: 'sop.read', audience: 'AUTHORIZED', sortOrder: 35,
    content: {
      purpose: 'Giúp người dùng hiểu nhanh quy trình bằng sơ đồ trước khi đọc từng bước.', audience: 'Người có quyền đọc SOP', accessPath: 'Thư viện quy trình → Chọn SOP → Flowchart Mermaid hoặc Canvas', prerequisites: ['SOP đã công bố và có cấu trúc bước'],
      steps: [{ title: 'Mở SOP', description: 'Chọn SOP trong thư viện hoặc kết quả tìm kiếm.' }, { title: 'Chọn kiểu xem', description: 'Dùng Mermaid để xem nhanh hoặc Canvas để tương tác trực quan.' }, { title: 'Theo đường nối', description: 'Đọc trình tự, nhãn điều kiện và quy trình con.' }, { title: 'Chọn node', description: 'Xem người thực hiện, thời hạn, mô tả và hình minh họa của bước.' }],
      result: 'Hiểu được luồng xử lý và trách nhiệm của từng bước.', permissions: ['sop.read và quyền phân hệ'], commonErrors: ['Nếu canvas trống, SOP cần được lưu lại cấu trúc bước hoặc kiểm tra dữ liệu chuyển đổi.'], relatedRoutes: ['/employee-lifecycle?tab=process-library&cluster=core'], support: 'Báo SOP Owner khi sơ đồ khác nội dung chi tiết.'
    }
  },
  {
    id: 'guide-process-library', slug: 'thu-vien-quy-trinh', title: 'Tra cứu thư viện quy trình',
    summary: 'Xem toàn bộ SOP đã công bố mà tài khoản được phép truy cập.', category: 'Tra cứu',
    routePath: '/employee-lifecycle?tab=process-library&cluster=core', permission: 'sop.read', audience: 'AUTHORIZED', sortOrder: 30,
    content: {
      purpose: 'Tra cứu phiên bản SOP đang có hiệu lực.', audience: 'Người dùng có quyền đọc SOP', accessPath: 'Thanh bên → Thư viện quy trình', prerequisites: ['Có ít nhất một phân hệ được cấp'],
      steps: [{ title: 'Mở thư viện', description: 'Chọn Thư viện quy trình.' }, { title: 'Lọc hoặc tìm', description: 'Chọn phân hệ hoặc nhập từ khóa.' }, { title: 'Mở SOP', description: 'Xem tổng quan, các bước, lưu đồ và nội dung chi tiết.' }],
      result: 'Xem đúng SOP đã công bố và phiên bản hiện hành.', permissions: ['sop.read'], commonErrors: ['SOP Draft chỉ có trong khu vực soạn thảo hoặc duyệt.'], relatedRoutes: ['/employee-lifecycle?tab=process-library&cluster=core'], support: 'Liên hệ SOP Owner nếu nội dung đã cũ.'
    }
  },
  {
    id: 'guide-policies', slug: 'quy-dinh-tuan-thu', title: 'Quy định & Tuân thủ',
    summary: 'Đọc các quy định chung áp dụng cho toàn công ty và xác nhận đã đọc.', category: 'Tra cứu',
    routePath: '/employee-lifecycle/policies', permission: null, audience: 'ALL', sortOrder: 40,
    content: {
      purpose: 'Cung cấp một nguồn quy định chung cho toàn thể nhân viên.', audience: 'Tất cả nhân viên', accessPath: 'Thanh bên → Quy định & Tuân thủ', prerequisites: ['Đăng nhập'],
      steps: [{ title: 'Chọn quy định', description: 'Mở danh sách và chọn tài liệu cần đọc.' }, { title: 'Đọc nội dung', description: 'Kiểm tra phạm vi, ngày hiệu lực và phiên bản.' }, { title: 'Xác nhận', description: 'Đánh dấu đã đọc khi hệ thống yêu cầu.' }],
      result: 'Nhân viên nắm được quy định hiện hành.', permissions: ['Mọi tài khoản đã đăng nhập'], commonErrors: [], relatedRoutes: ['/employee-lifecycle/policies'], support: 'Liên hệ bộ phận ban hành khi cần giải thích nội dung.'
    }
  },
  {
    id: 'guide-my-documents', slug: 'tai-lieu-cua-toi', title: 'Tài liệu của tôi',
    summary: 'Upload, lưu trữ, xem, cập nhật hoặc xóa tài liệu PDF/DOCX thuộc tài khoản.', category: 'Tài liệu',
    routePath: '/employee-lifecycle/sop-imports', permission: 'sop.read', audience: 'AUTHORIZED', sortOrder: 50,
    content: {
      purpose: 'Lưu tài liệu nguồn cá nhân trước khi chuyển hóa.', audience: 'Người dùng có quyền SOP và phân hệ', accessPath: 'Thanh bên → Tài liệu của tôi', prerequisites: ['File PDF hoặc DOCX hợp lệ'],
      steps: [{ title: 'Upload', description: 'Chọn file và điền thông tin mô tả.' }, { title: 'Xem trực tiếp', description: 'Mở trình xem PDF hoặc DOCX trong web.' }, { title: 'Quản lý', description: 'Cập nhật thông tin hoặc xóa tài liệu không còn dùng.' }],
      result: 'Tài liệu được lưu và sẵn sàng cho chuyển hóa.', permissions: ['sop.read'], commonErrors: ['File quá dung lượng hoặc định dạng không được hỗ trợ.'], relatedRoutes: ['/employee-lifecycle/sop-imports', '/employee-lifecycle/document-conversions'], support: 'Kiểm tra kết nối lưu trữ nếu upload thất bại.'
    }
  },
  {
    id: 'guide-conversion', slug: 'chuyen-hoa-tai-lieu', title: 'Chuyển hóa tài liệu thành SOP',
    summary: 'Trích xuất PDF/DOCX, hiệu chỉnh cấu trúc bước, tạo lưu đồ và tạo SOP Draft.', category: 'Chuyển hóa',
    routePath: '/employee-lifecycle/document-conversions', permission: 'sop.create', audience: 'AUTHORIZED', sortOrder: 60,
    content: {
      purpose: 'Biến tài liệu nghiệp vụ thô thành cấu trúc SOP có thể rà soát.', audience: 'Người soạn thảo được cấp quyền', accessPath: 'Thanh bên → Chuyển hóa tài liệu', prerequisites: ['Tài liệu đã có trong Tài liệu của tôi'],
      steps: [{ title: 'Chọn tài liệu', description: 'Chọn PDF hoặc DOCX đã upload.' }, { title: 'Trích xuất', description: 'Hệ thống đọc nội dung và cấu trúc phân cấp.' }, { title: 'Hiệu chỉnh', description: 'Kiểm tra bước lớn, bước con, vai trò và hình minh họa.' }, { title: 'Tạo lưu đồ', description: 'Kiểm tra node và đường nối trên canvas.' }, { title: 'Tạo Draft', description: 'Lưu kết quả thành SOP Draft để tiếp tục vòng đời duyệt.' }],
      result: 'Tạo được SOP Draft có nguồn tài liệu và cấu trúc bước.', permissions: ['sop.create hoặc vai trò quản trị'], commonErrors: ['Cần hiệu chỉnh thủ công khi tài liệu nguồn thiếu cấu trúc rõ ràng.'], relatedRoutes: ['/employee-lifecycle/document-conversions', '/employee-lifecycle/sop-management'], support: 'Gửi bản trích xuất cho người am hiểu nghiệp vụ kiểm tra trước khi duyệt.'
    }
  },
  {
    id: 'guide-sop-lifecycle', slug: 'quan-ly-vong-doi-sop', title: 'Quản lý vòng đời SOP',
    summary: 'Soạn thảo, gửi rà soát, phê duyệt, công bố, cập nhật và thu hồi SOP.', category: 'Quản lý SOP',
    routePath: '/employee-lifecycle/sop-management', permission: 'sop.edit', audience: 'AUTHORIZED', sortOrder: 70,
    content: {
      purpose: 'Kiểm soát nội dung và phiên bản SOP trước khi phổ biến.', audience: 'Owner, Editor, Reviewer, Approver và quản trị viên', accessPath: 'Thanh bên → Quản lý SOP', prerequisites: ['Có vai trò phù hợp trên SOP'],
      steps: [{ title: 'Soạn Draft', description: 'Hoàn thiện thông tin và các bước.' }, { title: 'Gửi rà soát', description: 'Reviewer kiểm tra và yêu cầu chỉnh sửa nếu cần.' }, { title: 'Phê duyệt', description: 'Approver xác nhận phiên bản đủ điều kiện.' }, { title: 'Công bố', description: 'Phiên bản hiện hành xuất hiện trong thư viện và tìm kiếm.' }, { title: 'Cập nhật hoặc thu hồi', description: 'Tạo phiên bản mới hoặc dừng hiệu lực bản cũ.' }],
      result: 'SOP được công bố có kiểm soát và truy vết.', permissions: ['sop.edit, sop.review hoặc sop.publish tùy bước'], commonErrors: ['Không thể công bố nếu chưa hoàn thành trạng thái duyệt bắt buộc.'], relatedRoutes: ['/employee-lifecycle/sop-management'], support: 'Liên hệ SOP Owner hoặc quản trị viên nội dung.'
    }
  },
  {
    id: 'guide-ai-assistant', slug: 'tro-ly-ai-sop', title: 'Hỏi đáp SOP bằng AI',
    summary: 'Đặt câu hỏi tự nhiên, nhận câu trả lời có trích dẫn và được lọc theo quyền.', category: 'Trợ lý AI',
    routePath: '/employee-lifecycle', permission: 'sop.read', audience: 'AUTHORIZED', sortOrder: 80,
    content: {
      purpose: 'Tìm câu trả lời nhanh trong các SOP được phép xem.', audience: 'Người dùng có quyền đọc SOP', accessPath: 'Nút Hỏi đáp SOP ở góc màn hình', prerequisites: ['SOP đã công bố và đã được lập chỉ mục'],
      steps: [{ title: 'Đặt câu hỏi', description: 'Nêu nghiệp vụ, đối tượng hoặc bước cần biết.' }, { title: 'Kiểm tra nguồn', description: 'Mở thẻ trích dẫn trong câu trả lời.' }, { title: 'Mở SOP', description: 'Đi tới đúng quy trình để đọc nội dung chính thức.' }],
      result: 'Nhận câu trả lời có nguồn kiểm chứng.', permissions: ['sop.read và quyền phân hệ'], commonErrors: ['AI không trả lời nội dung nằm ngoài phạm vi tài liệu được cấp.'], relatedRoutes: ['/employee-lifecycle?tab=process-library&cluster=core'], support: 'Dùng Thư viện quy trình nếu chỉ mục AI chưa đồng bộ.'
    }
  },
  {
    id: 'guide-administration', slug: 'quan-tri-he-thong', title: 'Quản trị hệ thống',
    summary: 'Quản lý tài khoản, quyền, danh mục, tài liệu, duyệt SOP, chỉ mục AI, Audit Log và cấu hình.', category: 'Quản trị',
    routePath: '/employee-lifecycle/admin', permission: null, audience: 'ADMIN', sortOrder: 90,
    content: {
      purpose: 'Vận hành cấu hình và kiểm soát toàn hệ thống.', audience: 'ADMIN và SUPER_ADMIN', accessPath: 'Thanh bên → Quản trị hệ thống', prerequisites: ['Tài khoản có vai trò quản trị'],
      steps: [{ title: 'Kiểm tra tổng quan', description: 'Theo dõi tài khoản, phân hệ và nội dung cần xử lý.' }, { title: 'Cấp quyền', description: 'Gán vai trò, phân hệ và nhóm quyền theo trách nhiệm.' }, { title: 'Quản trị nội dung', description: 'Duyệt SOP, quản lý tài liệu và chỉ mục AI.' }, { title: 'Kiểm tra lịch sử', description: 'Tra cứu Audit Log khi cần đối soát.' }],
      result: 'Hệ thống được vận hành đúng quyền và có lịch sử thay đổi.', permissions: ['ADMIN hoặc SUPER_ADMIN'], commonErrors: ['ADMIN không được thay đổi các cấu hình chỉ dành cho SUPER_ADMIN.'], relatedRoutes: ['/employee-lifecycle/admin'], support: 'SUPER_ADMIN xử lý các thay đổi quyền hệ thống và cấu hình nhạy cảm.'
    }
  }
]

export async function ensureSystemGuideSchema(database: QueryRunner): Promise<void> {
  await database.query(`CREATE TABLE IF NOT EXISTS SystemGuide (
    GuideId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
    Slug VARCHAR(160) CHARACTER SET ascii NOT NULL,
    Title VARCHAR(240) NOT NULL,
    Summary VARCHAR(1000) NOT NULL,
    Category VARCHAR(100) NOT NULL,
    RoutePath VARCHAR(500) NULL,
    RequiredPermission VARCHAR(100) CHARACTER SET ascii NULL,
    AudienceMode ENUM('ALL', 'AUTHORIZED', 'ADMIN') NOT NULL DEFAULT 'ALL',
    Status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    SortOrder INT NOT NULL DEFAULT 0,
    CurrentVersionNumber INT NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) CHARACTER SET ascii NULL,
    UpdatedBy VARCHAR(100) CHARACTER SET ascii NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY UQ_SystemGuide_Slug (Slug),
    KEY IX_SystemGuide_StatusCategory (Status, Category, SortOrder)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)
  await database.query(`CREATE TABLE IF NOT EXISTS SystemGuideVersion (
    GuideId VARCHAR(100) CHARACTER SET ascii NOT NULL,
    VersionNumber INT NOT NULL,
    ContentJson LONGTEXT NOT NULL,
    Status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    CreatedBy VARCHAR(100) CHARACTER SET ascii NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PublishedAt DATETIME(3) NULL,
    PRIMARY KEY (GuideId, VersionNumber),
    CONSTRAINT CK_SystemGuideVersion_Content CHECK (JSON_VALID(ContentJson)),
    CONSTRAINT FK_SystemGuideVersion_Guide FOREIGN KEY (GuideId) REFERENCES SystemGuide(GuideId) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)
  await database.query(`CREATE TABLE IF NOT EXISTS SystemGuideTour (
    TourStepId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
    GuideId VARCHAR(100) CHARACTER SET ascii NOT NULL,
    HelpAnchorId VARCHAR(120) CHARACTER SET ascii NOT NULL,
    Title VARCHAR(240) NOT NULL,
    Description VARCHAR(1000) NOT NULL,
    RoutePath VARCHAR(500) NOT NULL,
    SortOrder INT NOT NULL DEFAULT 0,
    CONSTRAINT FK_SystemGuideTour_Guide FOREIGN KEY (GuideId) REFERENCES SystemGuide(GuideId) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)
  await database.query(`CREATE TABLE IF NOT EXISTS UserGuideProgress (
    AccountId VARCHAR(100) CHARACTER SET ascii NOT NULL,
    GuideId VARCHAR(100) CHARACTER SET ascii NOT NULL,
    CompletedStepsJson LONGTEXT NOT NULL,
    TourCompleted BOOLEAN NOT NULL DEFAULT FALSE,
    DismissedAt DATETIME(3) NULL,
    LastViewedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CompletedAt DATETIME(3) NULL,
    PRIMARY KEY (AccountId, GuideId),
    CONSTRAINT CK_UserGuideProgress_Steps CHECK (JSON_VALID(CompletedStepsJson)),
    CONSTRAINT FK_UserGuideProgress_Account FOREIGN KEY (AccountId) REFERENCES Account(AccountId) ON DELETE CASCADE,
    CONSTRAINT FK_UserGuideProgress_Guide FOREIGN KEY (GuideId) REFERENCES SystemGuide(GuideId) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)

  for (const guide of guides) {
    await database.query(`INSERT IGNORE INTO SystemGuide
      (GuideId, Slug, Title, Summary, Category, RoutePath, RequiredPermission, AudienceMode, Status, SortOrder, CurrentVersionNumber)
      VALUES (:id, :slug, :title, :summary, :category, :routePath, :permission, :audience, 'published', :sortOrder, 1)`, {
      id: guide.id, slug: guide.slug, title: guide.title, summary: guide.summary, category: guide.category,
      routePath: guide.routePath, permission: guide.permission, audience: guide.audience, sortOrder: guide.sortOrder
    })
    await database.query(`INSERT IGNORE INTO SystemGuideVersion
      (GuideId, VersionNumber, ContentJson, Status, PublishedAt)
      VALUES (:id, 1, :content, 'published', CURRENT_TIMESTAMP(3))`, { id: guide.id, content: JSON.stringify(guide.content) })
    for (const step of guide.tour ?? []) {
      await database.query(`INSERT IGNORE INTO SystemGuideTour
        (TourStepId, GuideId, HelpAnchorId, Title, Description, RoutePath, SortOrder)
        VALUES (:id, :guideId, :anchor, :title, :description, :routePath, :sortOrder)`, { ...step, guideId: guide.id })
    }
  }
}
