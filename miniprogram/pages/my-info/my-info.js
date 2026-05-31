const { requireLogin } = require('../../utils/auth')
const auth = require('../../utils/auth')
const { getRoleLabel } = require('../../utils/util')

Page({
  data: {
    avatar: '',
    nickname: '',
    phone: '',
    familyName: '',
    role: '',
    roleLabel: ''
  },

  onLoad() {
    if (!requireLogin()) return
    this.loadUserInfo()
  },

  loadUserInfo() {
    const app = getApp()
    const user = app.globalData.userInfo
    const family = app.globalData.familyInfo
    const member = app.globalData.memberInfo

    this.setData({
      avatar: user.avatar || '',
      nickname: user.nickname || user.name || '',
      phone: user.phone || '',
      familyName: family?.name || '',
      role: member?.role || '',
      roleLabel: getRoleLabel(member?.role)
    })
  },

  onChangeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        this.setData({ avatar: res.tempFiles[0].tempFilePath })
      }
    })
  },

  onInputNickname(e) { this.setData({ nickname: e.detail.value }) },
  onInputPhone(e) { this.setData({ phone: e.detail.value }) },

  async onSave() {
    const { nickname, phone, avatar } = this.data
    if (!nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })
    try {
      let avatarUrl = avatar
      if (avatar && (avatar.startsWith('wxfile://') || avatar.startsWith('http://tmp'))) {
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: `avatars/${Date.now()}.jpg`,
          filePath: avatar
        })
        avatarUrl = uploadRes.fileID
      }

      await wx.cloud.callFunction({
        name: 'user',
        data: { action: 'update', data: { nickname: nickname.trim(), phone, avatar: avatarUrl } }
      })

      const app = getApp()
      app.globalData.userInfo.nickname = nickname.trim()
      app.globalData.userInfo.phone = phone
      app.globalData.userInfo.avatar = avatarUrl

      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmColor: '#f44336',
      success: async (res) => {
        if (!res.confirm) return
        await auth.logout()
        wx.reLaunch({ url: '/pages/home/home' })
      }
    })
  }
})
