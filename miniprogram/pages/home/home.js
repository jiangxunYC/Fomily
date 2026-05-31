const { checkLogin, requireLogin, getFamilyInfo } = require('../../utils/auth')
const { db, collections, formatRelativeTime, getRecordTypeLabel } = require('../../utils/util')

Page({
  data: {
    isLoggedIn: false,
    familyName: '',
    memberCount: 0,
    recentRecords: []
  },

  onLoad() {
    this.refreshData()
  },

  onShow() {
    this.refreshData()
  },

  async refreshData() {
    const loggedIn = checkLogin()
    this.setData({ isLoggedIn: loggedIn })

    if (!loggedIn) {
      this.setData({ familyName: '', memberCount: 0, recentRecords: [] })
      return
    }

    await Promise.all([this.loadFamilyInfo(), this.loadRecentRecords()])
  },

  async loadFamilyInfo() {
    try {
      const family = await getFamilyInfo()
      if (family) {
        this.setData({
          familyName: family.name || '我的家庭',
          memberCount: family.memberCount || 0
        })
      }
    } catch (e) {
      console.error('loadFamilyInfo:', e)
    }
  },

  async loadRecentRecords() {
    const app = getApp()
    const familyId = app.globalData.familyInfo && app.globalData.familyInfo._id
    if (!familyId) {
      this.setData({ recentRecords: [] })
      return
    }

    try {
      const types = ['medical', 'vaccine', 'insurance']
      const queries = types.map(type => {
        const col = type === 'medical' ? collections.MEDICAL
          : type === 'vaccine' ? collections.VACCINE
          : collections.INSURANCE
        return db.collection(col)
          .where({ family_id: familyId })
          .orderBy('created_at', 'desc')
          .limit(5)
          .get()
          .then(res => res.data.map(r => ({ ...r, type })))
      })

      const results = await Promise.all(queries)
      const all = results.flat()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 10)
        .map(r => ({
          _id: r._id,
          type: r.type,
          typeLabel: getRecordTypeLabel(r.type),
          title: r.title || r.hospital || r.vaccine_name || r.company || '',
          memberName: r.memberName || '',
          summary: r.summary || r.diagnosis || r.note || '',
          relativeTime: formatRelativeTime(r.created_at)
        }))

      this.setData({ recentRecords: all })
    } catch (e) {
      console.error('loadRecentRecords:', e)
      this.setData({ recentRecords: [] })
    }
  },

  goFamily() {
    wx.switchTab({ url: '/pages/family/family' })
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  quickAdd(e) {
    if (!requireLogin()) return
    const type = e.currentTarget.dataset.type
    wx.navigateTo({ url: `/pages/record-edit/record-edit?type=${type}` })
  },

  goRecordDetail(e) {
    const { id, type } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/record-detail/record-detail?id=${id}&type=${type}` })
  }
})
