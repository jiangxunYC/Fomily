const { requireLogin } = require('../../utils/auth')
const { db, collections, generateInviteCode } = require('../../utils/util')

Page({
  data: {
    familyName: '',
    inviteCode: '',
    allowCrossEdit: false,
    allowCrossView: true,
    isOwner: false,
    editingName: false,
    boundMembers: []
  },

  onLoad() {
    if (!requireLogin()) return
    this.loadFamilyInfo()
  },

  loadFamilyInfo() {
    const app = getApp()
    const family = app.globalData.familyInfo
    const member = app.globalData.memberInfo
    if (!family) return

    this.setData({
      familyName: family.name || '',
      inviteCode: family.invite_code || '',
      allowCrossEdit: !!family.allow_cross_edit,
      allowCrossView: family.allow_cross_view !== false,
      isOwner: member && member.role === 'owner'
    })

    if (member && member.role === 'owner') this.loadBoundMembers()
  },

  async loadBoundMembers() {
    const app = getApp()
    const familyId = app.globalData.familyInfo?._id
    try {
      const { data } = await db.collection(collections.MEMBER)
        .where({ family_id: familyId, is_bound: true })
        .field({ _id: true, name: true })
        .get()
      this.setData({ boundMembers: data })
    } catch (e) {
      console.error('loadBoundMembers:', e)
    }
  },

  onToggleEditName() {
    if (this.data.editingName) {
      this.saveFamilyName()
    }
    this.setData({ editingName: !this.data.editingName })
  },

  onNameInput(e) {
    this.setData({ familyName: e.detail.value })
  },

  async saveFamilyName() {
    const name = this.data.familyName.trim()
    if (!name) return
    const app = getApp()
    const family_id = app.globalData.familyInfo?._id
    try {
      await wx.cloud.callFunction({
        name: 'family',
        data: { action: 'update', data: { family_id, name } }
      })
      app.globalData.familyInfo.name = name
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  onCopyCode() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  },

  async onToggleCrossEdit(e) {
    if (!this.data.isOwner) return
    const val = e.detail.value
    const app = getApp()
    const family_id = app.globalData.familyInfo?._id
    try {
      await wx.cloud.callFunction({
        name: 'family',
        data: { action: 'update', data: { family_id, allow_cross_edit: val } }
      })
      this.setData({ allowCrossEdit: val })
    } catch (e) {
      wx.showToast({ title: '设置失败', icon: 'none' })
    }
  },

  async onToggleCrossView(e) {
    if (!this.data.isOwner) return
    const val = e.detail.value
    const app = getApp()
    const family_id = app.globalData.familyInfo?._id
    try {
      await wx.cloud.callFunction({
        name: 'family',
        data: { action: 'update', data: { family_id, allow_cross_view: val } }
      })
      this.setData({ allowCrossView: val })
    } catch (e) {
      wx.showToast({ title: '设置失败', icon: 'none' })
    }
  },

  onTransferOwner() {
    const members = this.data.boundMembers
    if (members.length === 0) {
      wx.showToast({ title: '暂无可转让成员', icon: 'none' })
      return
    }
    const names = members.map(m => m.name)
    wx.showActionSheet({
      itemList: names,
      success: (res) => {
        const target = members[res.tapIndex]
        wx.showModal({
          title: '确认转让',
          content: `确定将管理员转让给 ${target.name}？转让后你将变为编辑者。`,
          confirmColor: '#4CAF50',
          success: async (modalRes) => {
            if (!modalRes.confirm) return
            try {
              const app = getApp()
              const family_id = app.globalData.familyInfo?._id
              await wx.cloud.callFunction({
                name: 'family',
                data: { action: 'transferOwner', data: { family_id, target_member_id: target._id } }
              })
              wx.showToast({ title: '已转让', icon: 'success' })
              setTimeout(() => wx.navigateBack(), 1500)
            } catch (e) {
              wx.showToast({ title: '转让失败', icon: 'none' })
            }
          }
        })
      }
    })
  },

  onDisbandFamily() {
    wx.showModal({
      title: '解散家庭',
      content: '解散后所有数据永久删除，此操作不可撤销！',
      confirmColor: '#f44336',
      confirmText: '确认解散',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const app = getApp()
          const family_id = app.globalData.familyInfo?._id
          await wx.cloud.callFunction({
            name: 'family',
            data: { action: 'disband', data: { family_id } }
          })
          app.globalData.isLoggedIn = false
          app.globalData.userInfo = null
          app.globalData.familyInfo = null
          wx.reLaunch({ url: '/pages/login/login' })
        } catch (e) {
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  }
})
