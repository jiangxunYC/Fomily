const { db, _, collections } = require('./util')

function checkLogin() {
  const app = getApp()
  return app.globalData.isLoggedIn
}

function requireLogin() {
  if (!checkLogin()) {
    wx.navigateTo({ url: '/pages/login/login' })
    return false
  }
  return true
}

async function login() {
  const app = getApp()
  try {
    const { result } = await wx.cloud.callFunction({ name: 'user', data: { action: 'login' } })
    if (result.code === 0) {
      app.globalData.userInfo = result.data.user
      app.globalData.familyInfo = result.data.family
      app.globalData.memberInfo = result.data.member
      app.globalData.isLoggedIn = true
      return result.data
    }
    return null
  } catch (e) {
    console.error('login failed:', e)
    return null
  }
}

async function logout() {
  const app = getApp()
  app.globalData.userInfo = null
  app.globalData.familyInfo = null
  app.globalData.memberInfo = null
  app.globalData.isLoggedIn = false
}

async function getUserInfo() {
  const app = getApp()
  if (app.globalData.userInfo) return app.globalData.userInfo
  const loginResult = await login()
  return loginResult ? loginResult.user : null
}

async function getFamilyInfo() {
  const app = getApp()
  if (app.globalData.familyInfo) return app.globalData.familyInfo
  const loginResult = await login()
  return loginResult ? loginResult.family : null
}

module.exports = {
  checkLogin, requireLogin, login, logout, getUserInfo, getFamilyInfo
}
