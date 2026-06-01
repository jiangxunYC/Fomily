const { checkLogin, requireLogin } = require('../../utils/auth')
const { db, collections, formatDate, getRecordTypeLabel } = require('../../utils/util')

Page({
  data: {
    mode: 'add',
    type: 'medical',
    members: [],
    memberIndex: -1,
    form: {},
    images: []
  },

  onLoad(options) {
    if (!requireLogin()) return
    this.recordId = options.id || ''
    const type = options.type || 'medical'
    const mode = options.mode || 'add'
    this.setData({ type, mode })

    if (mode === 'edit') {
      wx.setNavigationBarTitle({ title: '编辑记录' })
    }

    this.loadMembers(options.memberId)
    if (mode === 'edit' && this.recordId) {
      this.loadRecord()
    }
  },

  async loadMembers(presetMemberId) {
    const app = getApp()
    const familyId = app.globalData.familyInfo?._id
    if (!familyId) return
    try {
      const { data } = await db.collection(collections.MEMBER)
        .where({ family_id: familyId })
        .get()
      this.setData({ members: data })
      if (presetMemberId) {
        const idx = data.findIndex(m => m._id === presetMemberId)
        if (idx >= 0) this.setData({ memberIndex: idx })
      }
    } catch (e) {
      console.error('loadMembers:', e)
    }
  },

  async loadRecord() {
    const collMap = {
      medical: collections.MEDICAL,
      vaccine: collections.VACCINE,
      insurance: collections.INSURANCE
    }
    try {
      const { data } = await db.collection(collMap[this.data.type]).doc(this.recordId).get()
      const DATE_KEY = { medical: 'visit_date', vaccine: 'vacc_date', insurance: 'start_date' }
      const primaryDate = data[DATE_KEY[this.data.type]] || Object.values(data).find(v => typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}/))
      const form = { ...data, date: formatDate(primaryDate) }
      if (data.next_visit_date) form.nextVisit = formatDate(data.next_visit_date)
      if (data.next_dose_date) form.nextDate = formatDate(data.next_dose_date)
      if (data.end_date) form.expireDate = formatDate(data.end_date)
      this.setData({ form, images: data.images || [] })

      const idx = this.data.members.findIndex(m => m._id === data.member_id)
      if (idx >= 0) this.setData({ memberIndex: idx })
    } catch (e) {
      console.error('loadRecord:', e)
    }
  },

  selectType(e) {
    this.setData({ type: e.currentTarget.dataset.type })
  },

  onMemberChange(e) {
    this.setData({ memberIndex: Number(e.detail.value) })
  },

  onDateChange(e) {
    this.setData({ 'form.date': e.detail.value })
  },

  onFieldDateChange(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  chooseImage() {
    wx.chooseImage({
      count: 9 - this.data.images.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ images: [...this.data.images, ...res.tempFilePaths] })
      }
    })
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(idx, 1)
    this.setData({ images })
  },

  async onSave() {
    const { type, memberIndex, members, form, images, mode } = this.data
    if (memberIndex < 0) {
      return wx.showToast({ title: '请选择成员', icon: 'none' })
    }
    if (!form.date) {
      return wx.showToast({ title: '请选择日期', icon: 'none' })
    }

    wx.showLoading({ title: '保存中...' })
    try {
      let uploadedImages = []
      for (const img of images) {
        if (img.startsWith('cloud://') || img.startsWith('http')) {
          uploadedImages.push(img)
        } else {
          const ext = img.split('.').pop()
          const cloudPath = `records/${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${ext}`
          const { fileID } = await wx.cloud.uploadFile({ cloudPath, filePath: img })
          uploadedImages.push(fileID)
        }
      }

      // Map camelCase form fields to snake_case for cloud function
      // Also map generic 'date' to the type-specific primary date field
      const DATE_KEY = { medical: 'visit_date', vaccine: 'vacc_date', insurance: 'start_date' }
      const fieldMap = { nextVisit: 'next_visit_date', nextDate: 'next_dose_date', expireDate: 'end_date', policyNo: 'policy_no' }
      const mapped = { [DATE_KEY[type] || 'date']: form.date }
      for (const [key, val] of Object.entries(form)) {
        if (key === 'date') continue
        if (val !== '' && val !== undefined) {
          mapped[fieldMap[key] || key] = val
        }
      }
      mapped.images = uploadedImages

      const action = mode === 'edit' ? 'update' : 'add'
      const callData = { action, data: { type, ...mapped, member_id: members[memberIndex]._id } }
      if (mode === 'edit') {
        callData.data.record_id = this.recordId
      }
      await wx.cloud.callFunction({
        name: 'record',
        data: callData
      })

      const app = getApp()
      const familyId = app.globalData.familyInfo && app.globalData.familyInfo._id
      await wx.cloud.callFunction({
        name: 'audit',
        data: { action: 'log', data: { family_id: familyId, action: mode === 'edit' ? 'update_record' : 'add_record', target_type: type, target_id: members[memberIndex]._id } }
      })

      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 800)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
      console.error('onSave:', e)
    }
  }
})
