import { describe, expect, it } from 'vitest'
import { classifyChatIntent } from '../src/services/chat/intent.router.js'

describe('AI chat intent routing', () => {
  it.each([
    ['Quy trình nghỉ phép thực hiện như thế nào?', 'HOW_TO'],
    ['Ai chịu trách nhiệm phê duyệt onboarding?', 'RESPONSIBILITY'],
    ['Mẫu đơn điều chuyển nhân sự ở đâu?', 'FORM_LOOKUP'],
    ['Mở SOP tuyển dụng cho tôi', 'NAVIGATION'],
    ['Thời hạn xử lý hồ sơ là bao lâu?', 'DEADLINE_LOOKUP'],
    ['Xin chào, hôm nay thời tiết thế nào?', 'OUT_OF_SCOPE']
  ])('%s -> %s', (message, intent) => {
    expect(classifyChatIntent(message)).toBe(intent)
  })
})
