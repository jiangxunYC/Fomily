const { requireLogin } = require('../../utils/auth')
const { db, collections, formatDate } = require('../../utils/util')
const { formatRelativeTime } = require('../../utils/util')

Page({
  data: {
    logs: [],
    loading: true,
    memberFilterIndex: 0,
    actionFilterIndex: 0,
    memberOptions: [{ label: '全部成员', value: '' }],
    actionOptions: [
      { label: '全部类型', value: '' },
      { label: '添加成员', value: 'add_member' },
      { label: '编辑成员', value: 'update_member' },
      { label: '删除成员', value: 'delete_member' },
      { label: '添加记录', value: 'add_record' },
      { label: '编辑记录', value: 'update_record' },
      { label: '删除记录', value: 'delete_record' }
    ],
    allLogs: []
  },

  onLoad() {
    if (!requireLogin()) return
    this.loadMembers()
    this.loadLogs()
  },

  async loadMembers() {
    const app = getApp()
    const familyId = app.globalData.familyInfo?._id
    if (!familyId) return

    try {
      const { data } = await db.collection(collections.MEMBER)
        .where({ family_id: familyId })
        .field({ _id: true, name: true })
        .get()

      const options = [{ label: '全部成员', value: '' }]
      data.forEach(m => options.push({ label: m.name, value: m._id }))
      this.setData({ memberOptions: options })
    } catch (e) {
      console.error('loadMembers:', e)
    }
  },

  async loadLogs() {
    const app = getApp()
    const familyId = app.globalData.familyInfo?._id
    if (!familyId) return

    try {
      const { data } = await db.collection(collections.AUDIT)
        .where({ family_id: familyId })
        .orderBy('created_at', 'desc')
        .limit(100)
        .get()

      const logs = data.map(log => ({
        ...log,
        timeLabel: formatRelativeTime(log.created_at)
      }))

      this.setData({ allLogs: logs, logs, loading: false })
    } catch (e) {
      console.error('loadLogs:', e)
      this.setData({ loading: false })
    }
  },

  onMemberFilter(e) {
    this.setData({ memberFilterIndex: +e.detail.value })
    this.applyFilter()
  },

  onActionFilter(e) {
    this.setData({ actionFilterIndex: +e.detail.value })
    this.applyFilter()
  },

  applyFilter() {
    const { allLogs, memberOptions, actionOptions, memberFilterIndex, actionFilterIndex } = this.data
    const memberId = memberOptions[memberFilterIndex].value
    const actionType = actionOptions[actionFilterIndex].value

    let filtered = allLogs
    if (memberId) {
      filtered = filtered.filter(l => l.actor_openid === memberId || l.target_id === memberId)
    }
    if (actionType) {
      filtered = filtered.filter(l => l.action === actionType)
    }
    this.setData({ logs: filtered })
  }
})
