const { login } = require('../../utils/auth')

Page({
  data: {
    showCreateModal: false,
    showJoinModal: false,
    familyName: '',
    inviteCode: ''
  },

  onCreate() {
    this.setData({ showCreateModal: true, showJoinModal: false, familyName: '' })
  },

  onJoin() {
    this.setData({ showJoinModal: true, showCreateModal: false, inviteCode: '' })
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
    const familyName = this.data.familyName.trim()
    if (!familyName) {
      return wx.showToast({ title: '请输入家庭名称', icon: 'none' })
    }

    wx.showLoading({ title: '创建中...', mask: true })
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'family',
        data: { action: 'create', data: { name: familyName } }
      })

      if (result.code !== 0) {
        wx.hideLoading()
        if (result.msg === 'already in a family') {
          // Already has a family — just sign in
          await login()
          wx.reLaunch({ url: '/pages/home/home' })
          return
        }
        return wx.showToast({ title: result.msg || '创建失败', icon: 'none', duration: 2000 })
      }

      await login()
      wx.hideLoading()
      wx.reLaunch({ url: '/pages/home/home' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '网络错误，请重试', icon: 'none' })
      console.error('doCreate:', e)
    }
  },

  async doJoin() {
    const inviteCode = this.data.inviteCode.trim().toUpperCase()
    if (!inviteCode || inviteCode.length < 6) {
      return wx.showToast({ title: '请输入6位邀请码', icon: 'none' })
    }

    wx.showLoading({ title: '加入中...', mask: true })
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'family',
        data: { action: 'join', data: { invite_code: inviteCode } }
      })

      if (result.code !== 0) {
        wx.hideLoading()
        if (result.msg === 'already in a family') {
          await login()
          wx.reLaunch({ url: '/pages/home/home' })
          return
        }
        return wx.showToast({ title: result.msg || '加入失败', icon: 'none', duration: 2000 })
      }

      await login()
      wx.hideLoading()
      wx.reLaunch({ url: '/pages/home/home' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '网络错误，请重试', icon: 'none' })
      console.error('doJoin:', e)
    }
  }
})
