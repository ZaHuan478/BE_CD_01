import type { QueryRunner } from './database.js'

export interface SeedGlossaryTerm {
  id: string
  slug: string
  term: string
  vietnameseName: string
  category: string
  routePath: string | null
  sortOrder: number
  shortDefinition: string
  detailedDefinition: string
  aliases: string[]
  examples: string[]
  relatedTermSlugs: string[]
}

export const glossaryTerms: SeedGlossaryTerm[] = [
  // 1. Khái niệm SOP
  {
    id: 'term-sop',
    slug: 'sop',
    term: 'SOP (Standard Operating Procedure)',
    vietnameseName: 'Quy trình thao tác chuẩn',
    category: 'Khái niệm SOP',
    routePath: '/employee-lifecycle?tab=process-library&cluster=core',
    sortOrder: 10,
    shortDefinition: 'Bộ tài liệu quy chuẩn hướng dẫn chi tiết từng bước thực hiện một công việc nhân sự nhằm đảm bảo chất lượng, tính nhất quán và tuân thủ.',
    detailedDefinition: 'Trong hệ thống HRM SOP, SOP là thực thể trung tâm được số hóa từ văn bản quy định thành các bước thực thi cụ thể, có phân định rõ vai trò thực hiện (Actor), điều kiện đầu vào/đầu ra, lưu đồ tương tác và lịch sử phiên bản kiểm soát.',
    aliases: ['Quy trình chuẩn', 'Thao tác chuẩn', 'Standard Operating Procedure', 'SOP nhân sự'],
    examples: ['SOP Tuyển dụng nhân viên mới', 'SOP Thanh toán công tác phí', 'SOP Tiếp nhận thử việc'],
    relatedTermSlugs: ['quy-trinh-nghiep-vu', 'tai-lieu-nguon', 'interactive-canvas', 'phien-ban-sop']
  },
  {
    id: 'term-business-process',
    slug: 'quy-trinh-nghiep-vu',
    term: 'Business Process',
    vietnameseName: 'Quy trình nghiệp vụ',
    category: 'Khái niệm SOP',
    routePath: '/employee-lifecycle?tab=process-library&cluster=core',
    sortOrder: 20,
    shortDefinition: 'Chuỗi các hoạt động có thứ tự logic và sự phối hợp giữa nhiều phòng ban nhằm hoàn thành một mục tiêu cụ thể của tổ chức.',
    detailedDefinition: 'Quy trình nghiệp vụ biểu diễn dòng chảy công việc từ điểm khởi đầu (Trigger/Business Event) qua các bước xử lý, phê duyệt cho đến khi đạt được kết quả đầu ra mong đợi.',
    aliases: ['Quy trình công việc', 'Luồng nghiệp vụ', 'Business Flow', 'Workflow'],
    examples: ['Quy trình đánh giá hiệu suất cuối năm (KPI)', 'Quy trình giải quyết chế độ thai sản'],
    relatedTermSlugs: ['sop', 'nghiep-vu-phat-sinh', 'decision-branch']
  },
  {
    id: 'term-business-event',
    slug: 'nghiep-vu-phat-sinh',
    term: 'Business Event',
    vietnameseName: 'Nghiệp vụ phát sinh',
    category: 'Khái niệm SOP',
    routePath: '/employee-lifecycle',
    sortOrder: 30,
    shortDefinition: 'Sự kiện hoặc biến động trong thực tế kích hoạt một quy trình nghiệp vụ cần được giải quyết.',
    detailedDefinition: 'Mỗi nghiệp vụ phát sinh là một điểm kích hoạt (Trigger Event) làm căn cứ để nhân viên hoặc hệ thống bắt đầu thực hiện một SOP tương ứng.',
    aliases: ['Sự kiện nghiệp vụ', 'Biến động nhân sự', 'Trigger Event'],
    examples: ['Nhân viên nộp đơn xin thôi việc', 'Phòng ban đề xuất tuyển dụng đột xuất', 'Nhân viên hoàn thành 60 ngày thử việc'],
    relatedTermSlugs: ['quy-trinh-nghiep-vu', 'vong-doi-nhan-vien', 'sop']
  },
  {
    id: 'term-source-document',
    slug: 'tai-lieu-nguon',
    term: 'Source Document',
    vietnameseName: 'Tài liệu nguồn',
    category: 'Khái niệm SOP',
    routePath: '/employee-lifecycle/documents',
    sortOrder: 40,
    shortDefinition: 'Văn bản gốc ở dạng PDF, DOCX hoặc quét giấy do ban lãnh đạo ban hành làm căn cứ pháp lý để số hóa thành SOP.',
    detailedDefinition: 'Hệ thống cho phép lưu trữ tài liệu nguồn trong phân hệ Tài liệu của tôi và sử dụng công cụ AI chuyển hóa để trích xuất cấu trúc văn bản thành lưu đồ và các bước SOP số.',
    aliases: ['Văn bản nguồn', 'Tài liệu gốc', 'Hồ sơ pháp lý', 'Raw Document'],
    examples: ['Quyết định số 12/QĐ-TGĐ về chính sách công tác', 'Sổ tay nhân viên phiên bản 2026'],
    relatedTermSlugs: ['sop', 'rag', 'chunk-embedding']
  },

  // 2. Phân hệ & Kiến trúc
  {
    id: 'term-module-cluster',
    slug: 'cum-nghiep-vu',
    term: 'Business Module Cluster',
    vietnameseName: 'Cụm nghiệp vụ',
    category: 'Phân hệ & Kiến trúc',
    routePath: '/employee-lifecycle',
    sortOrder: 50,
    shortDefinition: 'Cấp phân nhóm cao nhất gộp các phân hệ có chung miền nghiệp vụ trong kiến trúc HRMS tổng thể.',
    detailedDefinition: 'Trong hệ thống có 4 cụm nghiệp vụ chính: Vận hành lõi (Core), Phát triển con người (Talent), Quản trị tổ chức (Governance) và Nền tảng hệ thống (Platform).',
    aliases: ['Nhóm phân hệ', 'Miền nghiệp vụ', 'Business Domain Cluster'],
    examples: ['Cụm Vận hành lõi gộp Tuyển dụng, Hồ sơ và Chấm công', 'Cụm Phát triển con người gộp Đào tạo và Đánh giá'],
    relatedTermSlugs: ['phan-he', 'master-data', 'vong-doi-nhan-vien']
  },
  {
    id: 'term-subsystem-module',
    slug: 'phan-he',
    term: 'Subsystem / Module',
    vietnameseName: 'Phân hệ',
    category: 'Phân hệ & Kiến trúc',
    routePath: '/employee-lifecycle',
    sortOrder: 60,
    shortDefinition: 'Một khối chức năng phần mềm chuyên biệt quản lý một mảng nghiệp vụ độc lập nhưng kết nối dữ liệu chặt chẽ.',
    detailedDefinition: 'Mỗi phân hệ (như Tuyển dụng, Chấm công, Tiền lương) sở hữu dữ liệu nghiệp vụ, các SOP tương ứng và được phân quyền truy cập thông qua nhóm quyền phân hệ.',
    aliases: ['Module chức năng', 'Phân hệ hệ thống', 'Chức năng con'],
    examples: ['Phân hệ Tuyển dụng (Recruitment)', 'Phân hệ Quản lý hồ sơ (HR Records)', 'Phân hệ Nghỉ phép & Chấm công'],
    relatedTermSlugs: ['cum-nghiep-vu', 'quyen-phan-he', 'rbac']
  },
  {
    id: 'term-master-data',
    slug: 'master-data',
    term: 'Master Data',
    vietnameseName: 'Dữ liệu danh mục gốc',
    category: 'Phân hệ & Kiến trúc',
    routePath: '/employee-lifecycle/admin',
    sortOrder: 70,
    shortDefinition: 'Bộ dữ liệu chuẩn dùng chung làm quy chuẩn tham chiếu cho toàn bộ các giao dịch và nghiệp vụ trong hệ thống.',
    detailedDefinition: 'Master Data bao gồm danh mục Cơ cấu tổ chức, Phòng ban, Chức danh, Ngạch bậc lương, Địa điểm làm việc. Thay đổi Master Data ảnh hưởng trực tiếp đến định tuyến quy trình và phân quyền.',
    aliases: ['Dữ liệu chủ', 'Danh mục chuẩn', 'Danh mục dùng chung'],
    examples: ['Mã phòng ban HR_ADMIN', 'Chức danh Senior HR Specialist', 'Ngạch lương C2'],
    relatedTermSlugs: ['cum-nghiep-vu', 'phan-he', 'rbac']
  },
  {
    id: 'term-employee-lifecycle',
    slug: 'vong-doi-nhan-vien',
    term: 'Employee Lifecycle',
    vietnameseName: 'Vòng đời nhân viên',
    category: 'Phân hệ & Kiến trúc',
    routePath: '/employee-lifecycle',
    sortOrder: 80,
    shortDefinition: 'Hành trình toàn diện của một nhân sự từ thời điểm ứng tuyển đến khi thôi việc và kết thúc hợp đồng lao động.',
    detailedDefinition: 'Gồm các chặng chính: Tuyển dụng (Attract/Hire) → Tiếp nhận (Onboard) → Đào tạo & Phát triển (Develop) → Duy trì & Đãi ngộ (Retain) → Thôi việc (Offboard). Mỗi chặng có các SOP chuẩn hóa tương ứng.',
    aliases: ['Vòng đời nhân sự', 'Chu kỳ làm việc', 'Employee Journey'],
    examples: ['Quy trình đón tiếp nhân viên mới ngày đầu tiên (Onboarding day 1)', 'Quy trình bàn giao tài sản khi nghỉ việc'],
    relatedTermSlugs: ['cum-nghiep-vu', 'nghiep-vu-phat-sinh', 'sop']
  },

  // 3. Vai trò & Trách nhiệm
  {
    id: 'term-sop-owner',
    slug: 'sop-owner',
    term: 'SOP Owner',
    vietnameseName: 'Chủ sở hữu SOP',
    category: 'Vai trò & Trách nhiệm',
    routePath: '/employee-lifecycle?tab=process-library&cluster=core',
    sortOrder: 90,
    shortDefinition: 'Cá nhân hoặc trưởng đơn vị chịu trách nhiệm cao nhất về tính chính xác, tính khả thi và thời hạn cập nhật của quy trình.',
    detailedDefinition: 'SOP Owner là người quyết định khi nào cần sửa đổi quy trình, chỉ định người soạn thảo (Editor) và bảo vệ nội dung quy trình trước hội đồng phê duyệt.',
    aliases: ['Chủ quản quy trình', 'Chủ sở hữu quy trình', 'Process Owner'],
    examples: ['Trưởng phòng Tuyển dụng là SOP Owner của toàn bộ quy trình thu hút nhân tài'],
    relatedTermSlugs: ['editor', 'reviewer', 'approver', 'sop']
  },
  {
    id: 'term-editor',
    slug: 'editor',
    term: 'Editor',
    vietnameseName: 'Người soạn thảo',
    category: 'Vai trò & Trách nhiệm',
    routePath: '/employee-lifecycle/documents',
    sortOrder: 100,
    shortDefinition: 'Thành viên được giao quyền tạo mới hoặc hiệu chỉnh nội dung các bước, lưu đồ và tài liệu của SOP ở trạng thái nháp.',
    detailedDefinition: 'Editor trực tiếp thao tác trên trình soạn thảo SOP và công cụ Interactive Canvas. Khi hoàn thiện bản thảo, Editor có trách nhiệm chuyển trạng thái sang In Review.',
    aliases: ['Người biên tập', 'Người xây dựng quy trình', 'Author'],
    examples: ['Chuyên viên Nhân sự soạn thảo các bước trong SOP giải quyết chế độ nghỉ phép'],
    relatedTermSlugs: ['sop-owner', 'reviewer', 'draft']
  },
  {
    id: 'term-reviewer',
    slug: 'reviewer',
    term: 'Reviewer',
    vietnameseName: 'Người rà soát',
    category: 'Vai trò & Trách nhiệm',
    routePath: '/employee-lifecycle/admin',
    sortOrder: 110,
    shortDefinition: 'Nhân sự có thẩm quyền kiểm tra tính hợp chuẩn, sự phối hợp liên phòng ban và đối chiếu tính pháp lý của bản thảo SOP.',
    detailedDefinition: 'Reviewer không trực tiếp sửa đổi văn bản mà ghi nhận phản hồi (Comments) hoặc yêu cầu hiệu chỉnh (Request Changes) trước khi gửi tới Approver.',
    aliases: ['Người thẩm định', 'Cán bộ kiểm tra', 'Auditor'],
    examples: ['Chuyên viên Pháp chế rà soát tính tuân thủ Luật Lao động của SOP Kỷ luật lao động'],
    relatedTermSlugs: ['editor', 'approver', 'in-review']
  },
  {
    id: 'term-approver',
    slug: 'approver',
    term: 'Approver',
    vietnameseName: 'Người phê duyệt',
    category: 'Vai trò & Trách nhiệm',
    routePath: '/employee-lifecycle/admin',
    sortOrder: 120,
    shortDefinition: 'Cấp lãnh đạo có thẩm quyền cao nhất phê chuẩn hiệu lực chính thức cho một phiên bản SOP để đưa vào áp dụng.',
    detailedDefinition: 'Sau khi Approver bấm phê duyệt, phiên bản chuyển sang trạng thái Approved hoặc Published, kích hoạt thông báo tới toàn thể người dùng liên quan.',
    aliases: ['Người ký duyệt', 'Cấp có thẩm quyền', 'Signer'],
    examples: ['Giám đốc Nhân sự (CHRO) phê duyệt SOP Đánh giá hiệu suất định kỳ'],
    relatedTermSlugs: ['reviewer', 'sop-owner', 'approved', 'published']
  },
  {
    id: 'term-actor',
    slug: 'actor',
    term: 'Actor',
    vietnameseName: 'Tác nhân thực hiện',
    category: 'Vai trò & Trách nhiệm',
    routePath: '/employee-lifecycle/canvas',
    sortOrder: 130,
    shortDefinition: 'Chức danh hoặc vai trò cụ thể thực hiện một hành động hoặc một bước xác định trên lưu đồ quy trình.',
    detailedDefinition: 'Trong lưu đồ SOP, mỗi node hành động đều gắn liền với một Actor cụ thể (VD: Nhân viên, Quản lý trực tiếp, Kế toán thanh toán) giúp phân rõ ranh giới trách nhiệm.',
    aliases: ['Người thực hiện bước', 'Chủ thể thao tác', 'Process Participant'],
    examples: ['Bước 1: "Nhân viên" điền đơn; Bước 2: "Trưởng bộ phận" xác nhận; Bước 3: "HR Specialist" lưu hồ sơ'],
    relatedTermSlugs: ['node', 'interactive-canvas', 'quy-trinh-nghiep-vu']
  },

  // 4. Vòng đời & Trạng thái
  {
    id: 'term-draft',
    slug: 'draft',
    term: 'Draft',
    vietnameseName: 'Bản nháp',
    category: 'Vòng đời & Trạng thái',
    routePath: '/employee-lifecycle/documents',
    sortOrder: 140,
    shortDefinition: 'Trạng thái phiên bản đang được soạn thảo hoặc hiệu chỉnh, chưa có hiệu lực thực thi và chỉ hiển thị cho người có thẩm quyền sửa đổi.',
    detailedDefinition: 'Một SOP có thể duy trì bản Published hiện hành cho nhân viên tra cứu trong khi Editor đang soạn bản Draft mới cho lần cập nhật tiếp theo.',
    aliases: ['Bản phác thảo', 'Đang biên soạn', 'Chưa công bố'],
    examples: ['Bản nháp SOP Tuyển dụng 2026 đang bổ sung phần phỏng vấn trực tuyến'],
    relatedTermSlugs: ['in-review', 'published', 'phien-ban-sop']
  },
  {
    id: 'term-in-review',
    slug: 'in-review',
    term: 'In Review',
    vietnameseName: 'Đang rà soát',
    category: 'Vòng đời & Trạng thái',
    routePath: '/employee-lifecycle/admin',
    sortOrder: 150,
    shortDefinition: 'Trạng thái bản thảo SOP đã được nộp lên cấp kiểm tra và tạm khóa chỉnh sửa để hội đồng thẩm định đánh giá.',
    detailedDefinition: 'Trong giai đoạn này, Reviewer sẽ kiểm tra tính khả thi và đưa ra khuyến nghị chấp thuận hoặc trả về bản nháp kèm lý do.',
    aliases: ['Chờ thẩm định', 'Đang kiểm tra', 'Pending Review'],
    examples: ['SOP Chính sách phúc lợi đang trong trạng thái In Review bởi phòng Tài chính và Pháp chế'],
    relatedTermSlugs: ['draft', 'reviewer', 'approved']
  },
  {
    id: 'term-approved',
    slug: 'approved',
    term: 'Approved',
    vietnameseName: 'Đã phê duyệt',
    category: 'Vòng đời & Trạng thái',
    routePath: '/employee-lifecycle/admin',
    sortOrder: 160,
    shortDefinition: 'Trạng thái bản thảo đã được cấp thẩm quyền ký duyệt thông qua nhưng có thể đang chờ ngày hiệu lực ấn định để phát hành.',
    detailedDefinition: 'Sau khi Approved, phiên bản được bảo toàn nguyên vẹn và sẵn sàng được hệ thống tự động hoặc Admin bấm chuyển sang Published.',
    aliases: ['Đã ký duyệt', 'Đã thông qua', 'Chờ ban hành'],
    examples: ['Quy chế tiền thưởng đã Approved ngày 25/12 và hẹn Published vào 01/01 năm sau'],
    relatedTermSlugs: ['in-review', 'approver', 'published']
  },
  {
    id: 'term-published',
    slug: 'published',
    term: 'Published',
    vietnameseName: 'Đã công bố',
    category: 'Vòng đời & Trạng thái',
    routePath: '/employee-lifecycle?tab=process-library&cluster=core',
    sortOrder: 170,
    shortDefinition: 'Trạng thái chính thức có hiệu lực áp dụng, được hiển thị công khai trên Thư viện quy trình cho toàn thể nhân viên tra cứu.',
    detailedDefinition: 'Chỉ các SOP ở trạng thái Published mới được bộ máy RAG đưa vào lập chỉ mục tìm kiếm và phục vụ trợ lý AI giải đáp thắc mắc.',
    aliases: ['Đã ban hành', 'Có hiệu lực', 'Đang áp dụng', 'Active'],
    examples: ['SOP Quản lý tài sản công ty ở trạng thái Published v2.0'],
    relatedTermSlugs: ['draft', 'archived', 'rag', 'phien-ban-sop']
  },
  {
    id: 'term-archived',
    slug: 'archived',
    term: 'Archived',
    vietnameseName: 'Đã lưu trữ',
    category: 'Vòng đời & Trạng thái',
    routePath: '/employee-lifecycle/admin',
    sortOrder: 180,
    shortDefinition: 'Trạng thái hết hiệu lực thực thi do được thay thế bởi phiên bản mới hoặc không còn phù hợp với chính sách công ty.',
    detailedDefinition: 'SOP Archived bị ẩn khỏi danh sách tra cứu thông thường của nhân viên nhưng vẫn được lưu trữ đầy đủ trong lịch sử phục vụ kiểm toán và đối soát.',
    aliases: ['Hết hiệu lực', 'Đã lưu kho', 'Lịch sử quy trình', 'Deprecated'],
    examples: ['SOP Chấm công vân tay cũ năm 2020 đã được Archived khi chuyển sang chấm công FaceID'],
    relatedTermSlugs: ['published', 'withdrawn', 'audit-log']
  },
  {
    id: 'term-withdrawn',
    slug: 'withdrawn',
    term: 'Withdrawn',
    vietnameseName: 'Thu hồi hiệu lực',
    category: 'Vòng đời & Trạng thái',
    routePath: '/employee-lifecycle/admin',
    sortOrder: 190,
    shortDefinition: 'Trạng thái quy trình bị đình chỉ hoặc rút lại khẩn cấp do phát hiện sai sót nghiêm trọng hoặc có thay đổi đột xuất của luật định.',
    detailedDefinition: 'Khi bị Withdrawn, hệ thống lập tức khóa truy cập của người dùng và gửi thông báo cảnh báo đến những vị trí đang áp dụng quy trình đó.',
    aliases: ['Hủy bỏ khẩn cấp', 'Đình chỉ hiệu lực', 'Bị thu hồi'],
    examples: ['Thu hồi quy trình áp dụng định mức chi phí cũ do thông tư mới ban hành có hiệu lực ngay'],
    relatedTermSlugs: ['archived', 'published', 'audit-log']
  },

  // 5. Trực quan & Canvas
  {
    id: 'term-mermaid',
    slug: 'mermaid',
    term: 'Mermaid Diagram',
    vietnameseName: 'Lưu đồ Mermaid',
    category: 'Trực quan & Canvas',
    routePath: '/employee-lifecycle/canvas',
    sortOrder: 200,
    shortDefinition: 'Cú pháp định nghĩa lưu đồ bằng văn bản giúp sinh ra sơ đồ quy trình tự động, nhất quán và dễ dàng bảo trì.',
    detailedDefinition: 'Thay vì vẽ hình ảnh tĩnh khó sửa đổi, hệ thống lưu trữ cấu trúc SOP bằng cú pháp văn bản Mermaid và dựng thành flowchart động trên trình duyệt.',
    aliases: ['Sơ đồ Mermaid', 'Khai báo lưu đồ văn bản', 'Flowchart syntax'],
    examples: ['graph TD; A[Nhân viên nộp đơn] --> B{Trưởng phòng duyệt}; B -- Đồng ý --> C[HR cập nhật]'],
    relatedTermSlugs: ['interactive-canvas', 'node', 'edge', 'decision-branch']
  },
  {
    id: 'term-interactive-canvas',
    slug: 'interactive-canvas',
    term: 'Interactive Canvas',
    vietnameseName: 'Khung vẽ tương tác',
    category: 'Trực quan & Canvas',
    routePath: '/employee-lifecycle/canvas',
    sortOrder: 210,
    shortDefinition: 'Vùng làm việc đồ họa thông minh cho phép người dùng thu phóng (zoom), di chuyển (pan) và bấm vào từng bước để xem chi tiết.',
    detailedDefinition: 'Interactive Canvas là trung tâm trải nghiệm thị giác của SOP, kết nối trực quan giữa sơ đồ hình khối và văn bản hướng dẫn chi tiết của từng bước.',
    aliases: ['Canvas quy trình', 'Bản đồ quy trình tương tác', 'Visual Process Board'],
    examples: ['Bấm vào một node trên Canvas để mở drawer hiển thị biểu mẫu và hướng dẫn của bước đó'],
    relatedTermSlugs: ['mermaid', 'node', 'edge', 'sub-process']
  },
  {
    id: 'term-node',
    slug: 'node',
    term: 'Node',
    vietnameseName: 'Nút quy trình',
    category: 'Trực quan & Canvas',
    routePath: '/employee-lifecycle/canvas',
    sortOrder: 220,
    shortDefinition: 'Một điểm dừng hoặc đơn vị công việc độc lập trên sơ đồ biểu diễn một hành động, quyết định hoặc điểm mốc.',
    detailedDefinition: 'Mỗi Node trên canvas có định danh duy nhất, tiêu đề, mô tả hành động, vai trò phụ trách (Actor) và thời lượng dự kiến thực hiện.',
    aliases: ['Bước thực hiện', 'Hộp thao tác', 'Điểm quy trình', 'Step Block'],
    examples: ['Node bắt đầu: "Gửi thông báo mời ứng viên"; Node quyết định: "Kết quả thử việc đạt?"'],
    relatedTermSlugs: ['edge', 'decision-branch', 'actor', 'sub-process']
  },
  {
    id: 'term-edge',
    slug: 'edge',
    term: 'Edge',
    vietnameseName: 'Đường nối / Luồng chuyển tiếp',
    category: 'Trực quan & Canvas',
    routePath: '/employee-lifecycle/canvas',
    sortOrder: 230,
    shortDefinition: 'Mũi tên kết nối giữa hai node biểu diễn hướng luân chuyển và thứ tự thực hiện tuần tự giữa các bước.',
    detailedDefinition: 'Edge có thể mang nhãn điều kiện (VD: "Đồng ý", "Từ chối", "Cần bổ sung") để chỉ dẫn dòng công việc sẽ rẽ sang hướng nào.',
    aliases: ['Mũi tên liên kết', 'Đường chuyển luồng', 'Luồng dữ liệu', 'Connector'],
    examples: ['Đường nối từ node "Nộp đơn" sang node "Kiểm tra điều kiện"'],
    relatedTermSlugs: ['node', 'decision-branch', 'interactive-canvas']
  },
  {
    id: 'term-decision-branch',
    slug: 'decision-branch',
    term: 'Decision Branch',
    vietnameseName: 'Nhánh điều kiện',
    category: 'Trực quan & Canvas',
    routePath: '/employee-lifecycle/canvas',
    sortOrder: 240,
    shortDefinition: 'Điểm phân nhánh hình thoi trên lưu đồ nơi quy trình rẽ sang các hướng xử lý khác nhau dựa trên điều kiện kiểm tra.',
    detailedDefinition: 'Nhánh điều kiện giúp quy trình xử lý được mọi ngoại lệ và trường hợp thực tế phát sinh mà không bị tắc nghẽn công việc.',
    aliases: ['Rẽ nhánh điều kiện', 'Điểm quyết định', 'Ngã rẽ logic', 'Conditional Fork'],
    examples: ['Nếu thâm niên > 3 năm thì rẽ sang nhánh xét thưởng đặc biệt, ngược lại xét theo ngạch chuẩn'],
    relatedTermSlugs: ['node', 'edge', 'quy-trinh-nghiep-vu']
  },
  {
    id: 'term-sub-process',
    slug: 'sub-process',
    term: 'Sub-process',
    vietnameseName: 'Quy trình con',
    category: 'Trực quan & Canvas',
    routePath: '/employee-lifecycle/canvas',
    sortOrder: 250,
    shortDefinition: 'Một cụm các bước chi tiết được đóng gói thành một node độc lập trên quy trình tổng để giữ cho sơ đồ chính gọn gàng.',
    detailedDefinition: 'Người dùng có thể bấm vào node quy trình con để mở ra một canvas riêng biểu diễn chi tiết các bước bên trong của phân hệ đó.',
    aliases: ['Quy trình thành phần', 'Module con', 'Nested Flow'],
    examples: ['Trong quy trình Tuyển dụng tổng thể, node "Khám sức khỏe đầu vào" là một Sub-process riêng'],
    relatedTermSlugs: ['node', 'interactive-canvas', 'sop']
  },

  // 6. Bảo mật & Phân quyền
  {
    id: 'term-rbac',
    slug: 'rbac',
    term: 'RBAC (Role-Based Access Control)',
    vietnameseName: 'Kiểm soát truy cập theo vai trò',
    category: 'Bảo mật & Phân quyền',
    routePath: '/employee-lifecycle/admin',
    sortOrder: 260,
    shortDefinition: 'Mô hình bảo mật trong đó quyền truy cập tài nguyên hệ thống được gán theo chức vụ và vai trò người dùng thay vì gán trực tiếp cho từng cá nhân.',
    detailedDefinition: 'Trong HRM SOP, RBAC định đoạt việc người dùng chỉ có thể xem, biên soạn, duyệt hoặc quản trị các quy trình thuộc thẩm quyền của mình.',
    aliases: ['Phân quyền theo vai trò', 'Mô hình phân quyền RBAC', 'Role-Based Security'],
    examples: ['Tài khoản vai trò EMPLOYEE chỉ được xem SOP công bố; tài khoản ADMIN có quyền sửa đổi và cấu hình'],
    relatedTermSlugs: ['vai-tro-he-thong', 'quyen-thao-tac', 'quyen-phan-he']
  },
  {
    id: 'term-system-role',
    slug: 'vai-tro-he-thong',
    term: 'System Role',
    vietnameseName: 'Vai trò hệ thống',
    category: 'Bảo mật & Phân quyền',
    routePath: '/employee-lifecycle/admin',
    sortOrder: 270,
    shortDefinition: 'Tập hợp các trách nhiệm và thẩm quyền được định danh gán cho tài khoản (VD: EMPLOYEE, MANAGER, ADMIN, SUPER_ADMIN).',
    detailedDefinition: 'Vai trò hệ thống là cơ sở để xác định giao diện hiển thị, các menu được mở và quyền thao tác trên các màn hình quản trị.',
    aliases: ['Nhóm người dùng', 'Cấp bậc tài khoản', 'User Role'],
    examples: ['SUPER_ADMIN có toàn quyền trên cấu hình; HR_MANAGER có quyền phê duyệt quy trình nhân sự'],
    relatedTermSlugs: ['rbac', 'quyen-thao-tac', 'quyen-phan-he']
  },
  {
    id: 'term-permission-capability',
    slug: 'quyen-thao-tac',
    term: 'Capability / Permission',
    vietnameseName: 'Quyền thao tác',
    category: 'Bảo mật & Phân quyền',
    routePath: '/employee-lifecycle/admin',
    sortOrder: 280,
    shortDefinition: 'Đơn vị thẩm quyền hạt nhân nhỏ nhất quy định việc một tài khoản có thể thực hiện một hành động cụ thể trên một đối tượng.',
    detailedDefinition: 'Các quyền được định nghĩa theo cú pháp resource.action (VD: `sop.view`, `sop.create`, `sop.approve`, `user.manage`).',
    aliases: ['Thẩm quyền', 'Đặc quyền thao tác', 'Hạt quyền', 'Access Right'],
    examples: ['Quyền sop.create cho phép tạo mới bản nháp SOP; quyền sop.publish cho phép công bố'],
    relatedTermSlugs: ['rbac', 'vai-tro-he-thong', 'quyen-phan-he']
  },
  {
    id: 'term-module-permission',
    slug: 'quyen-phan-he',
    term: 'Module Permission',
    vietnameseName: 'Quyền phân hệ',
    category: 'Bảo mật & Phân quyền',
    routePath: '/employee-lifecycle/admin',
    sortOrder: 290,
    shortDefinition: 'Phạm vi cho phép tài khoản nhìn thấy và thao tác với dữ liệu của một hoặc nhiều phân hệ cụ thể trong HRMS.',
    detailedDefinition: 'Ngay cả khi có vai trò quản lý, nhân sự chỉ được xem và phê duyệt các SOP thuộc những phân hệ mà họ được ban quản trị phân quyền.',
    aliases: ['Phạm vi phân hệ', 'Quyền truy cập module', 'Module Scope'],
    examples: ['Cán bộ tuyển dụng chỉ được cấp quyền phân hệ "Tuyển dụng" và "Hồ sơ ứng viên"'],
    relatedTermSlugs: ['phan-he', 'rbac', 'quyen-thao-tac']
  },

  // 7. AI & RAG
  {
    id: 'term-rag',
    slug: 'rag',
    term: 'RAG (Retrieval-Augmented Generation)',
    vietnameseName: 'Tạo sinh có tra cứu trích xuất',
    category: 'AI & RAG',
    routePath: '/employee-lifecycle',
    sortOrder: 300,
    shortDefinition: 'Kiến trúc AI kết hợp giữa việc tìm kiếm chính xác các đoạn văn bản trong SOP với mô hình ngôn ngữ để trả lời câu hỏi nghiệp vụ.',
    detailedDefinition: 'RAG giúp Trợ lý AI giải đáp thắc mắc dựa 100% trên các quy định thực tế của công ty, hạn chế tối đa hiện tượng bịa đặt thông tin (hallucination) và luôn kèm nguồn trích dẫn kiểm chứng.',
    aliases: ['Kiến trúc RAG', 'Hỏi đáp dựa trên tài liệu', 'Retrieval Augmented Generation'],
    examples: ['Trợ lý AI tra cứu điều khoản nghỉ phép trong SOP Published để trả lời: "Bạn được nghỉ tối đa bao nhiêu ngày?"'],
    relatedTermSlugs: ['chunk-embedding', 'trich-dan-nguon', 'sop']
  },
  {
    id: 'term-chunk-embedding',
    slug: 'chunk-embedding',
    term: 'Chunk & Embedding',
    vietnameseName: 'Phân đoạn & Nhúng vector',
    category: 'AI & RAG',
    routePath: '/employee-lifecycle/admin',
    sortOrder: 310,
    shortDefinition: 'Quá trình cắt nhỏ tài liệu SOP thành từng đoạn ngữ nghĩa (Chunk) và chuyển hóa chúng thành các vector số học (Embedding) để tra cứu tương đồng.',
    detailedDefinition: 'Khi người dùng đặt câu hỏi tự nhiên, câu hỏi cũng được chuyển thành vector để tìm kiếm các đoạn Chunk có độ tương đồng ngữ nghĩa cao nhất trong cơ sở dữ liệu.',
    aliases: ['Cắt đoạn và vector hóa', 'Vector embedding', 'Text chunking'],
    examples: ['Một quy trình 10 trang được chia thành 25 chunk, mỗi chunk chứa 300 từ kèm ngữ cảnh tiêu đề'],
    relatedTermSlugs: ['rag', 'trich-dan-nguon', 'tai-lieu-nguon']
  },
  {
    id: 'term-citation',
    slug: 'trich-dan-nguon',
    term: 'Citation',
    vietnameseName: 'Trích dẫn nguồn',
    category: 'AI & RAG',
    routePath: '/employee-lifecycle',
    sortOrder: 320,
    shortDefinition: 'Đường dẫn liên kết kèm số điều khoản trỏ thẳng về vị trí cụ thể trong SOP gốc làm căn cứ cho câu trả lời của AI.',
    detailedDefinition: 'Trong câu trả lời của Trợ lý AI, mỗi nhận định đều đính kèm thẻ Citation. Người dùng có thể bấm vào thẻ để mở đúng trang hoặc bước của SOP tương ứng để đối soát.',
    aliases: ['Căn cứ trích dẫn', 'Nguồn tham chiếu', 'Source Reference'],
    examples: ['Thẻ trích dẫn: "[SOP-RECRUIT-01 §3.2] Quy định về hồ sơ ứng viên"'],
    relatedTermSlugs: ['rag', 'chunk-embedding', 'sop']
  },

  // 8. Kiểm soát & Nhật ký
  {
    id: 'term-audit-log',
    slug: 'audit-log',
    term: 'Audit Log',
    vietnameseName: 'Nhật ký kiểm toán',
    category: 'Kiểm soát & Nhật ký',
    routePath: '/employee-lifecycle/admin',
    sortOrder: 330,
    shortDefinition: 'Bản ghi lịch sử bất biến ghi lại mọi thao tác quan trọng: ai thực hiện, hành động gì, vào thời điểm nào và thay đổi dữ liệu ra sao.',
    detailedDefinition: 'Audit Log ghi nhận các sự kiện như tạo mới tài khoản, công bố SOP, thay đổi phân quyền, thu hồi hiệu lực quy trình, đảm bảo tính minh bạch và phục vụ công tác thanh kiểm tra.',
    aliases: ['Nhật ký hệ thống', 'Lịch sử thao tác', 'Dấu vết kiểm toán', 'Audit Trail'],
    examples: ['Ghi nhận: "User admin_01 đã công bố phiên bản 3.0 của SOP Tuyển dụng lúc 14:30 ngày 12/09"'],
    relatedTermSlugs: ['phien-ban-sop', 'rbac', 'published']
  },
  {
    id: 'term-sop-version',
    slug: 'phien-ban-sop',
    term: 'SOP Version',
    vietnameseName: 'Phiên bản SOP',
    category: 'Kiểm soát & Nhật ký',
    routePath: '/employee-lifecycle?tab=process-library&cluster=core',
    sortOrder: 340,
    shortDefinition: 'Chỉ số phiên bản ghi nhận một mốc phát hành nội dung cụ thể của quy trình (VD: v1.0, v1.1, v2.0).',
    detailedDefinition: 'Mỗi phiên bản SOP lưu trữ độc lập nội dung các bước, lưu đồ, người ban hành và ngày hiệu lực. Hệ thống cho phép so sánh sự khác biệt giữa hai phiên bản để theo dõi lịch sử cải tiến.',
    aliases: ['Mốc phiên bản', 'Lịch sử sửa đổi', 'Version Control'],
    examples: ['Phiên bản 1.0 ban hành năm 2024; Phiên bản 2.0 cập nhật bổ sung quy trình ký số điện tử năm 2026'],
    relatedTermSlugs: ['sop', 'audit-log', 'draft', 'published']
  }
]

export const guideTermAssociations: Array<{ guideId: string; termIds: string[] }> = [
  {
    guideId: 'guide-system-overview',
    termIds: ['term-sop', 'term-business-process', 'term-employee-lifecycle', 'term-subsystem-module', 'term-rbac']
  },
  {
    guideId: 'guide-navigation',
    termIds: ['term-subsystem-module', 'term-module-cluster', 'term-sop']
  },
  {
    guideId: 'guide-architecture-dashboard',
    termIds: ['term-module-cluster', 'term-subsystem-module', 'term-master-data', 'term-employee-lifecycle']
  },
  {
    guideId: 'guide-process-library',
    termIds: ['term-sop', 'term-business-process', 'term-published', 'term-sop-version']
  },
  {
    guideId: 'guide-my-documents',
    termIds: ['term-source-document', 'term-draft', 'term-editor']
  },
  {
    guideId: 'guide-canvas-navigation',
    termIds: ['term-mermaid', 'term-interactive-canvas', 'term-node', 'term-edge', 'term-decision-branch', 'term-actor', 'term-sub-process']
  },
  {
    guideId: 'guide-ai-copilot',
    termIds: ['term-rag', 'term-chunk-embedding', 'term-citation', 'term-sop']
  },
  {
    guideId: 'guide-administration',
    termIds: ['term-rbac', 'term-system-role', 'term-permission-capability', 'term-audit-log', 'term-master-data']
  }
]

export async function ensureSystemGlossarySchema(database: QueryRunner): Promise<void> {
  // 1. Tạo bảng SystemGlossaryTerm
  await database.query(`CREATE TABLE IF NOT EXISTS SystemGlossaryTerm (
    TermId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
    Slug VARCHAR(160) CHARACTER SET ascii NOT NULL,
    Term VARCHAR(240) NOT NULL,
    VietnameseName VARCHAR(240) NULL,
    Category VARCHAR(100) NOT NULL,
    RoutePath VARCHAR(500) NULL,
    Status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'published',
    CurrentPublishedVersion INT NULL,
    SortOrder INT NOT NULL DEFAULT 0,
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy VARCHAR(100) CHARACTER SET ascii NULL DEFAULT 'system',
    UpdatedBy VARCHAR(100) CHARACTER SET ascii NULL DEFAULT 'system',
    CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY UQ_SystemGlossaryTerm_Slug (Slug),
    KEY IX_SystemGlossaryTerm_StatusCategory (Status, Category, SortOrder)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)

  // 2. Tạo bảng SystemGlossaryTermVersion
  await database.query(`CREATE TABLE IF NOT EXISTS SystemGlossaryTermVersion (
    TermId VARCHAR(100) CHARACTER SET ascii NOT NULL,
    VersionNumber INT NOT NULL,
    ShortDefinition VARCHAR(1000) NOT NULL,
    DetailedDefinition LONGTEXT NOT NULL,
    AliasesJson JSON NOT NULL,
    ExamplesJson JSON NOT NULL,
    RelatedTermSlugsJson JSON NOT NULL,
    VersionStatus ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'published',
    CreatedBy VARCHAR(100) CHARACTER SET ascii NULL DEFAULT 'system',
    CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PublishedBy VARCHAR(100) CHARACTER SET ascii NULL DEFAULT 'system',
    PublishedAt DATETIME(3) NULL,
    PRIMARY KEY (TermId, VersionNumber),
    CONSTRAINT FK_SystemGlossaryTermVersion_Term FOREIGN KEY (TermId) REFERENCES SystemGlossaryTerm(TermId) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)

  // 3. Tạo bảng SystemGuideVersionTerm
  await database.query(`CREATE TABLE IF NOT EXISTS SystemGuideVersionTerm (
    GuideId VARCHAR(100) CHARACTER SET ascii NOT NULL,
    GuideVersionNumber INT NOT NULL DEFAULT 1,
    TermId VARCHAR(100) CHARACTER SET ascii NOT NULL,
    SortOrder INT NOT NULL DEFAULT 0,
    PRIMARY KEY (GuideId, GuideVersionNumber, TermId),
    CONSTRAINT FK_SystemGuideVersionTerm_Guide FOREIGN KEY (GuideId) REFERENCES SystemGuide(GuideId) ON DELETE CASCADE,
    CONSTRAINT FK_SystemGuideVersionTerm_Term FOREIGN KEY (TermId) REFERENCES SystemGlossaryTerm(TermId) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)

  // 4. Seed dữ liệu thuật ngữ ban đầu (Idempotent với INSERT IGNORE)
  for (const item of glossaryTerms) {
    await database.query(
      `INSERT IGNORE INTO SystemGlossaryTerm
      (TermId, Slug, Term, VietnameseName, Category, RoutePath, Status, CurrentPublishedVersion, SortOrder, IsActive, CreatedBy, UpdatedBy)
      VALUES (:id, :slug, :term, :vietnameseName, :category, :routePath, 'published', 1, :sortOrder, 1, 'system', 'system')`,
      {
        id: item.id,
        slug: item.slug,
        term: item.term,
        vietnameseName: item.vietnameseName,
        category: item.category,
        routePath: item.routePath,
        sortOrder: item.sortOrder
      }
    )

    await database.query(
      `INSERT IGNORE INTO SystemGlossaryTermVersion
      (TermId, VersionNumber, ShortDefinition, DetailedDefinition, AliasesJson, ExamplesJson, RelatedTermSlugsJson, VersionStatus, CreatedBy, PublishedBy, PublishedAt)
      VALUES (:termId, 1, :shortDefinition, :detailedDefinition, :aliasesJson, :examplesJson, :relatedTermSlugsJson, 'published', 'system', 'system', CURRENT_TIMESTAMP(3))`,
      {
        termId: item.id,
        shortDefinition: item.shortDefinition,
        detailedDefinition: item.detailedDefinition,
        aliasesJson: JSON.stringify(item.aliases),
        examplesJson: JSON.stringify(item.examples),
        relatedTermSlugsJson: JSON.stringify(item.relatedTermSlugs)
      }
    )
  }

  // 5. Seed liên kết hướng dẫn - thuật ngữ
  for (const assoc of guideTermAssociations) {
    let order = 10
    for (const termId of assoc.termIds) {
      await database.query(
        `INSERT IGNORE INTO SystemGuideVersionTerm
        (GuideId, GuideVersionNumber, TermId, SortOrder)
        VALUES (:guideId, 1, :termId, :sortOrder)`,
        {
          guideId: assoc.guideId,
          termId,
          sortOrder: order
        }
      )
      order += 10
    }
  }
}
