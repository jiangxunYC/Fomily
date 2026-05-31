const db = wx.cloud.database()
const _ = db.command

const collections = {
  FAMILY: 'families',
  USER: 'users',
  MEMBER: 'members',
  MEDICAL: 'medical_records',
  VACCINE: 'vaccine_records',
  INSURANCE: 'insurance_records',
  AUDIT: 'audit_logs'
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatRelativeTime(date) {
  if (!date) return ''
  const now = new Date()
  const d = new Date(date)
  const diff = now - d
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return formatDate(date)
}

function calcAge(birthday) {
  if (!birthday) return ''
  const birth = new Date(birthday)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--
  }
  return age
}

function getRecordTypeLabel(type) {
  const map = { medical: '看病', vaccine: '疫苗', insurance: '保险' }
  return map[type] || type
}

function getRelationLabel(relation) {
  const map = {
    self: '本人', spouse: '配偶', child: '子女',
    parent: '父母', pet: '宠物', other: '其他'
  }
  return map[relation] || relation
}

function getRoleLabel(role) {
  const map = { owner: '管理员', editor: '编辑者', viewer: '查看者' }
  return map[role] || role
}

const TYPE_COLLECTION = {
  medical: collections.MEDICAL,
  vaccine: collections.VACCINE,
  insurance: collections.INSURANCE
}

const PRIMARY_DATE_FIELD = {
  medical: 'visit_date',
  vaccine: 'vacc_date',
  insurance: 'start_date'
}

function getCollectionByType(type) {
  return TYPE_COLLECTION[type] || ''
}

function getRecordSummary(record, type) {
  if (type === 'medical') return record.diagnosis || record.hospital || '就诊记录'
  if (type === 'vaccine') return record.vaccine_name || '疫苗接种'
  if (type === 'insurance') return record.insurance_type || record.company || '保险记录'
  return ''
}

function getRecordDate(record, type) {
  return record[PRIMARY_DATE_FIELD[type]] || record.created_at || ''
}

function getFamilyId() {
  return getApp().globalData.familyInfo?._id || ''
}

module.exports = {
  db, _, collections,
  generateId, generateInviteCode,
  formatDate, formatRelativeTime, calcAge,
  getRecordTypeLabel, getRelationLabel, getRoleLabel,
  TYPE_COLLECTION, PRIMARY_DATE_FIELD,
  getCollectionByType, getRecordSummary, getRecordDate, getFamilyId
}
