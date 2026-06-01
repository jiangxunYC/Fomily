const { checkLogin, requireLogin } = require('../../utils/auth')
const { db, collections, formatDate, getRecordTypeLabel } = require('../../utils/util')

Page({
  data: {
    record: {},
    type: '',
    typeLabel: '',
    memberName: '',
    dateStr: ''
  },

  onLoad(options) {
    if (!requireLogin()) return
    this.recordId = options.id
    this.setData({ type: options.type, typeLabel: getRecordTypeLabel(options.type) })
    this.loadRecord()
  },

  async loadRecord() {
    const collMap = {
      medical: collections.MEDICAL,
      vaccine: collections.VACCINE,
      insurance: collections.INSURANCE
    }
    try {
      const { data } = await db.collection(collMap[this.data.type]).doc(this.recordId).get()
      this.setData({
        record: data,
        dateStr: formatDate(data.date || data.visit_date || data.vacc_date || data.start_date)
      })
      this.loadMemberName(data.member_id)
    } catch (e) {
      console.error('loadRecord:', e)
    }
  },

  async loadMemberName(memberId) {
    try {
      const { data } = await db.collection(collections.MEMBER).doc(memberId).get()
      this.setData({ memberName: data.name })
    } catch (e) {
      console.error('loadMemberName:', e)
    }
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      current: url,
      urls: this.data.record.images || []
    })
  },

  goEdit() {
    wx.navigateTo({
      url: `/pages/record-edit/record-edit?id=${this.recordId}&type=${this.data.type}&mode=edit`
    })
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除吗？',
      confirmColor: '#e57373',
      success: (res) => {
        if (res.confirm) this.doDelete()
      }
    })
  },

  async doDelete() {
    try {
      await wx.cloud.callFunction({
        name: 'record',
        data: { action: 'delete', data: { type: this.data.type, record_id: this.recordId } }
      })
      wx.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 800)
    } catch (e) {
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  }
})
