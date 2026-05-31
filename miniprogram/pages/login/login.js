const { login } = require('../../utils/auth')

Page({
  data: {
    showCreateModal: false,
    showJoinModal: false,
    familyName: '',
    inviteCode: ''
  },

  async getUserProfile() {
    try {
      const { userInfo } = await wx.getUserProfile({ desc: '用于完善个人资料' })
      return userInfo
    } catch (e) {
      return null
    }
  },

  onCreate() {
    this.setData({ showCreateModal: true, showJoinModal: false })
  },

  onJoin() {
    this.setData({ showJoinModal: true, showCreateModal: false })
  },

  closeModal() {
    this.setData({ showCreateModal: false, showJoinModal: false })
  },

  onFamilyNameInput(e) {
    this.setData({ familyName: e.detail.value })
  },

  onInviteCodeInput(e) {
    this.setData({ inviteCode: e.detail.value.toUpperCase() })
  },

  async doCreate() {
    const { familyName } = this.data
    if (!familyName.trim()) {
      return wx.showToast({ title: '请输入家庭名称', icon: 'none' })
    }

    const userInfo = await this.getUserProfile()
    wx.showLoading({ title: '创建中...' })
    try {
      await wx.cloud.callFunction({
        name: 'family',
        data: { action: 'create', data: { name: familyName.trim() } }
      })
      await login()
      wx.hideLoading()
      wx.reLaunch({ url: '/pages/home/home' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '创建失败', icon: 'none' })
      console.error('doCreate:', e)
    }
  },

  async doJoin() {
    const { inviteCode } = this.data
    if (!inviteCode.trim() || inviteCode.length < 6) {
      return wx.showToast({ title: '请输入正确的邀请码', icon: 'none' })
    }

    const userInfo = await this.getUserProfile()
    wx.showLoading({ title: '加入中...' })
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'family',
        data: { action: 'join', data: { invite_code: inviteCode.trim() } }
      })
      if (result.code !== 0) {
        wx.hideLoading()
        wx.showToast({ title: result.message || '加入失败', icon: 'none' })
        return
      }
      await login()
      wx.hideLoading()
      wx.reLaunch({ url: '/pages/home/home' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '加入失败', icon: 'none' })
      console.error('doJoin:', e)
    }
  }
})
