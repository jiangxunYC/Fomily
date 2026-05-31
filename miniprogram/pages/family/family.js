const { checkLogin } = require('../../utils/auth')
const { db, collections, formatDate, calcAge, getRecordTypeLabel, getRelationLabel } = require('../../utils/util')

Page({
  data: {
    isLoggedIn: false,
    members: [],
    currentMemberId: '',
    currentMember: null,
    records: [],
    multiSelect: false,
    selectedIds: []
  },

  onShow() {
    const isLoggedIn = checkLogin()
    this.setData({ isLoggedIn })
    if (isLoggedIn) {
      this.loadMembers()
    }
  },

  async loadMembers() {
    try {
      const app = getApp()
      const familyInfo = app.globalData.familyInfo
      if (!familyInfo) return

      const { data } = await db.collection(collections.MEMBER)
        .where({ family_id: familyInfo._id })
        .orderBy('created_at', 'asc')
        .get()

      const members = data.map(m => ({
        ...m,
        relationLabel: getRelationLabel(m.relation),
        age: calcAge(m.birthday)
      }))

      const currentMemberId = this.data.currentMemberId || (members[0] && members[0]._id) || ''
      this.setData({ members, currentMemberId })

      if (currentMemberId) {
        this.setCurrentMember(currentMemberId)
        this.loadRecords(currentMemberId)
      }
    } catch (e) {
      console.error('loadMembers:', e)
    }
  },

  setCurrentMember(id) {
    const member = this.data.members.find(m => m._id === id)
    this.setData({ currentMember: member || null })
  },

  async loadRecords(memberId) {
    try {
      const types = [
        { col: collections.MEDICAL, type: 'medical' },
        { col: collections.VACCINE, type: 'vaccine' },
        { col: collections.INSURANCE, type: 'insurance' }
      ]

      const results = await Promise.all(
        types.map(t =>
          db.collection(t.col)
            .where({ member_id: memberId })
            .orderBy('created_at', 'desc')
            .limit(50)
            .get()
            .then(res => res.data.map(r => ({ ...r, type: t.type })))
        )
      )

      let records = results.flat()
      records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      records = records.map(r => ({
        ...r,
        typeLabel: getRecordTypeLabel(r.type),
        dateStr: formatDate(r.created_at),
        summary: r.type === 'medical' ? (r.diagnosis || r.hospital || '就诊记录')
          : r.type === 'vaccine' ? (r.vaccine_name || '疫苗接种')
          : (r.company || r.insurance_type || '保险记录')
      }))

      this.setData({ records, multiSelect: false, selectedIds: [] })
    } catch (e) {
      console.error('loadRecords:', e)
      this.setData({ records: [] })
    }
  },

  switchMember(e) {
    const id = e.currentTarget.dataset.id
    if (id === this.data.currentMemberId) return
    this.setData({ currentMemberId: id, multiSelect: false, selectedIds: [] })
    this.setCurrentMember(id)
    this.loadRecords(id)
  },

  goMemberDetail() {
    wx.navigateTo({
      url: `/pages/member-detail/member-detail?id=${this.data.currentMemberId}`
    })
  },

  tapRecord(e) {
    const { id, type } = e.currentTarget.dataset
    if (this.data.multiSelect) {
      this.toggleSelect(id)
      return
    }
    wx.navigateTo({
      url: `/pages/record-detail/record-detail?id=${id}&type=${type}`
    })
  },

  longPressRecord(e) {
    const id = e.currentTarget.dataset.id
    if (this.data.multiSelect) return
    this.setData({ multiSelect: true, selectedIds: [id] })
  },

  toggleSelect(id) {
    const selectedIds = [...this.data.selectedIds]
    const idx = selectedIds.indexOf(id)
    if (idx > -1) {
      selectedIds.splice(idx, 1)
    } else {
      selectedIds.push(id)
    }
    this.setData({ selectedIds })
  },

  cancelMultiSelect() {
    this.setData({ multiSelect: false, selectedIds: [] })
  },

  batchDelete() {
    const count = this.data.selectedIds.length
    if (!count) return
    wx.showModal({
      title: '确认删除',
      content: `确定删除选中的 ${count} 条记录？`,
      success: (res) => {
        if (res.confirm) this.doDelete()
      }
    })
  },

  async doDelete() {
    try {
      wx.showLoading({ title: '删除中...' })
      const tasks = this.data.selectedIds.map(id => {
        const record = this.data.records.find(r => r._id === id)
        if (!record) return Promise.resolve()
        const col = record.type === 'medical' ? collections.MEDICAL
          : record.type === 'vaccine' ? collections.VACCINE
          : collections.INSURANCE
        return db.collection(col).doc(id).remove()
      })
      await Promise.all(tasks)
      wx.hideLoading()
      wx.showToast({ title: '已删除', icon: 'success' })
      this.setData({ multiSelect: false, selectedIds: [] })
      this.loadRecords(this.data.currentMemberId)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },

  goAddRecord() {
    wx.navigateTo({
      url: `/pages/record-edit/record-edit?memberId=${this.data.currentMemberId}`
    })
  },

  goAddMember() {
    wx.navigateTo({ url: '/pages/member-manage/member-manage' })
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  }
})
