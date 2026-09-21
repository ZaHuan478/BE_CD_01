export type ChatIntent =
  | 'SOP_LOOKUP'
  | 'HOW_TO'
  | 'RESPONSIBILITY'
  | 'DEADLINE_LOOKUP'
  | 'FORM_LOOKUP'
  | 'SOP_STATUS'
  | 'NAVIGATION'
  | 'OUT_OF_SCOPE'

const normalize = (value: string) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .toLowerCase()
  .trim()

const includesAny = (text: string, values: string[]) => values.some(value => text.includes(value))

export const classifyChatIntent = (message: string): ChatIntent => {
  const text = normalize(message)
  const hasSopContext = includesAny(text, [
    'sop', 'quy trinh', 'quy dinh', 'thu tuc', 'chinh sach', 'huong dan',
    'bieu mau', 'hr', 'nhan su', 'onboarding', 'offboarding',
    'phan he', 'module', 'he thong', 'man hinh', 'chuc nang', 'thao tac',
    'tai khoan', 'quyen', 'danh muc', 'workflow', 'phe duyet', 'ho so', 'tai lieu', 'isop'
  ])

  if (!hasSopContext) return 'OUT_OF_SCOPE'
  if (text.startsWith('ai ') || includesAny(text, ['ai thuc hien', 'nguoi chiu trach nhiem', 'phu trach', 'actor', 'raci', 'responsible'])) {
    return 'RESPONSIBILITY'
  }
  if (includesAny(text, ['thoi han', 'bao lau', 'khi nao', 'deadline', 'sla', 'han hoan thanh'])) {
    return 'DEADLINE_LOOKUP'
  }
  if (includesAny(text, ['bieu mau', 'form', 'mau don', 'template', 'tai lieu mau'])) {
    return 'FORM_LOOKUP'
  }
  if (includesAny(text, ['mo sop', 'mo quy trinh', 'di toi', 'di den', 'link sop', 'xem tai lieu'])) {
    return 'NAVIGATION'
  }
  if (includesAny(text, ['trang thai', 'phien ban', 'da publish', 'da cong bo', 'bao nhieu sop', 'so luong sop'])) {
    return 'SOP_STATUS'
  }
  if (includesAny(text, ['cac buoc', 'lam the nao', 'nhu the nao', 'cach ', 'huong dan', 'how to', 'thuc hien', 'bat dau tu dau'])) {
    return 'HOW_TO'
  }
  return 'SOP_LOOKUP'
}
