# Chuẩn dữ liệu SOP thống nhất

## Nguyên tắc danh mục

- Mỗi mã SOP chỉ có một tài liệu `procedure` đang công bố.
- Một SOP có thể liên kết nhiều phân hệ qua `KnowledgeDocumentModule`; không nhân bản SOP để xuất hiện ở nhiều phân hệ.
- Hướng dẫn thao tác cấp màn hình được phân loại là `guide` và liên kết với SOP bằng `relatedDocuments`; không coi mỗi hướng dẫn là một SOP độc lập.
- Bản trùng được chuyển sang `archived` để còn khả năng truy vết. Chỉ dữ liệu UAT/test đã xác minh mới bị xóa hẳn.
- Không tự suy diễn đầu vào, đầu ra, điều kiện hoặc SLA của một bước từ vị trí của bước trong mảng.

## Cấu trúc chuẩn

### Cấp quy trình

| Nhóm | Trường chuẩn | Yêu cầu |
|---|---|---|
| Nhận diện | `code`, `title`, `category`, `description` | Bắt buộc mã và tên; mô tả phải nêu kết quả kinh doanh mong đợi |
| Phạm vi | `purpose`, `scope`, `owner` | Nêu mục đích, điểm bắt đầu/kết thúc và chủ sở hữu quy trình |
| SIPOC tối thiểu | `inputs`, `outputs` | Dữ liệu/vật phẩm đi vào và kết quả bàn giao |
| Luồng | `steps`, `transitions` | Thứ tự hoạt động; chỉ tạo nhánh khi có transition/điều kiện rõ ràng |
| Quản trị | `rules`, `controls`, `risks`, `approvalFlow` | Quy tắc, kiểm soát, rủi ro và tuyến phê duyệt có nguồn |
| Đo lường | `metrics` hoặc `kpis` | Chỉ số hiệu quả, chất lượng, thời gian hoặc lỗi |
| Tài liệu | `relatedDocuments`, `sourceNote`, `sourceStructure` | Chính sách, biểu mẫu, hướng dẫn và bằng chứng nguồn |
| Vòng đời | phiên bản, trạng thái, ngày hiệu lực, người soạn/duyệt/công bố | Phải truy vết được thay đổi và hiệu lực |

### Cấp bước

| Trường | Ý nghĩa |
|---|---|
| `stepCode`, `title`, `description` | Nhận diện và nội dung hành động |
| `actor` | Vai trò chịu trách nhiệm thực hiện |
| `location` | Hệ thống, kênh hoặc nơi xử lý |
| `timing` | Thời điểm hoặc SLA của chính bước đó |
| `inputs`, `outputs` | Dữ liệu riêng của bước; không lấy tuần tự từ danh sách cấp quy trình |
| `fieldsChecklist` | Tiêu chí kiểm tra/hoàn thành có trong nguồn |
| `sourceRefs`, `confidence` | Dẫn chứng và mức tin cậy khi số hóa |

## Quy tắc hiển thị

- Chỉ hiển thị trường có dữ liệu thật hoặc được người rà soát xác nhận.
- Không dùng câu mặc định để làm người đọc hiểu nhầm rằng dữ liệu đã được khai báo.
- Điều kiện rẽ nhánh chỉ xuất hiện khi transition có `kind = conditional` và có `condition` hoặc `branchLabel`.
- `guide`, `form`, `policy` là tài liệu liên quan; chúng không làm tăng số lượng SOP.

## Cơ sở tham chiếu

- ISO 9001 Process Approach: xác định đầu vào, đầu ra, trình tự/tương tác, trách nhiệm, kiểm soát và đo lường.
  <https://www.iso.org/iso/iso9001_2015_process_approach.pdf>
- ISO guidance on documented information: phân biệt process map, procedure, work/test instruction, form và record.
  <https://www.iso.org/files/live/sites/isoorg/files/standards/docs/en/iso_9001_2015_guidance_documented_information.pdf>
- APQC Process Classification Framework: dùng phân cấp quy trình và ngôn ngữ chung để tránh chồng chéo.
  <https://www.apqc.org/process-frameworks>
- OMG BPMN 2.0: mô hình hóa activity, event, gateway và sequence flow; gateway/condition là căn cứ cho rẽ nhánh.
  <https://www.omg.org/spec/BPMN/2.0/>
