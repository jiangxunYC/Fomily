const { checkLogin, logout, getUserInfo, getFamilyInfo } = require('../../utils/auth')

Page({
  data: {
    isLoggedIn: false,
    userInfo: {},
    familyInfo: {}
  },

  onShow() {
    this.refreshState()
  },

  async refreshState() {
    const isLoggedIn = checkLogin()
    if (isLoggedIn) {
      const userInfo = await getUserInfo()
      const familyInfo = await getFamilyInfo()
      this.setData({ isLoggedIn, userInfo: userInfo || {}, familyInfo: familyInfo || {} })
    } else {
      this.setData({ isLoggedIn: false, userInfo: {}, familyInfo: {} })
    }
  },

  onUserCardTap() {
    if (!this.data.isLoggedIn) {
      wx.navigateTo({ url: '/pages/login/login' })
    }
  },

  onMenuTap(e) {
    const { url, needLogin } = e.currentTarget.dataset
    const requiresLogin = needLogin === 'true' || needLogin === true
    if (requiresLogin && !this.data.isLoggedIn) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wx.navigateTo({ url })
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: async (res) => {
        if (res.confirm) {
          await logout()
          this.setData({ isLoggedIn: false, userInfo: {}, familyInfo: {} })
          wx.showToast({ title: '已退出登录', icon: 'success' })
        }
      }
    })
  }
})
