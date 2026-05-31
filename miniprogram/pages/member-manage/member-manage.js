const { checkLogin, requireLogin } = require('../../utils/auth')
const { db, collections, formatDate, getRelationLabel, getRoleLabel } = require('../../utils/util')

Page({
  data: {
    members: [],
    loading: true,
    showForm: false,
    editIndex: -1,
    isOwner: false,
    form: {
      avatar: '',
      name: '',
      typeIndex: 0,
      relationIndex: 0,
      birthday: '',
      phone: '',
      breed: '',
      roleIndex: 0
    },
    typeOptions: [
      { label: '人', value: 'human' },
      { label: '宠物', value: 'pet' }
    ],
    relationOptions: [
      { label: '本人', value: 'self' },
      { label: '配偶', value: 'spouse' },
      { label: '子女', value: 'child' },
      { label: '父母', value: 'parent' },
      { label: '宠物', value: 'pet' },
      { label: '其他', value: 'other' }
    ],
    roleOptions: [
      { label: '管理员', value: 'owner' },
      { label: '编辑者', value: 'editor' },
      { label: '查看者', value: 'viewer' }
    ]
  },

  onLoad() {
    if (!requireLogin()) return
    const app = getApp()
    const memberInfo = app.globalData.memberInfo
    this.setData({ isOwner: memberInfo && memberInfo.role === 'owner' })
    this.loadMembers()
  },

  onShow() {
    if (checkLogin()) this.loadMembers()
  },

  async loadMembers() {
    const app = getApp()
    const familyId = app.globalData.familyInfo?._id
    if (!familyId) return

    try {
      const { data } = await db.collection(collections.MEMBER)
        .where({ family_id: familyId })
        .orderBy('created_at', 'asc')
        .get()

      const members = data.map(m => ({
        ...m,
        relationLabel: getRelationLabel(m.relation),
        roleLabel: getRoleLabel(m.role)
      }))

      this.setData({ members, loading: false })
    } catch (e) {
      console.error('loadMembers:', e)
      this.setData({ loading: false })
    }
  },

  onShowForm() {
    this.setData({
      showForm: true,
      editIndex: -1,
      form: { avatar: '', name: '', typeIndex: 0, relationIndex: 0, birthday: '', phone: '', breed: '', roleIndex: 0 }
    })
  },

  onHideForm() {
    this.setData({ showForm: false })
  },

  onEditMember(e) {
    const idx = e.currentTarget.dataset.index
    const m = this.data.members[idx]
    const typeIndex = this.data.typeOptions.findIndex(t => t.value === m.type) || 0
    const relationIndex = this.data.relationOptions.findIndex(r => r.value === m.relation) || 0
    const roleIndex = this.data.roleOptions.findIndex(r => r.value === m.role) || 0

    this.setData({
      showForm: true,
      editIndex: idx,
      form: {
        avatar: m.avatar || '',
        name: m.name || '',
        typeIndex: Math.max(typeIndex, 0),
        relationIndex: Math.max(relationIndex, 0),
        birthday: m.birthday || '',
        phone: m.phone || '',
        breed: m.breed || '',
        roleIndex: Math.max(roleIndex, 0)
      }
    })
  },

  onDeleteMember(e) {
    const idx = e.currentTarget.dataset.index
    const member = this.data.members[idx]

    wx.showModal({
      title: '确认删除',
      content: '删除后该成员的所有记录将被一并删除',
      confirmColor: '#f44336',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await wx.cloud.callFunction({
            name: 'member',
            data: { action: 'delete', data: { member_id: member._id } }
          })
          const app = getApp()
          const family_id = app.globalData.familyInfo?._id
          await wx.cloud.callFunction({
            name: 'audit',
            data: { action: 'log', data: { family_id, action: 'delete_member', description: member.name } }
          })
          this.loadMembers()
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (e) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  onChooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        this.setData({ 'form.avatar': tempPath })
      }
    })
  },

  onInputName(e) { this.setData({ 'form.name': e.detail.value }) },
  onInputPhone(e) { this.setData({ 'form.phone': e.detail.value }) },
  onInputBreed(e) { this.setData({ 'form.breed': e.detail.value }) },
  onTypeChange(e) { this.setData({ 'form.typeIndex': +e.detail.value }) },
  onRelationChange(e) { this.setData({ 'form.relationIndex': +e.detail.value }) },
  onBirthdayChange(e) { this.setData({ 'form.birthday': e.detail.value }) },
  onRoleChange(e) { this.setData({ 'form.roleIndex': +e.detail.value }) },

  async onSaveMember() {
    const { form, editIndex, members, typeOptions, relationOptions, roleOptions } = this.data
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }

    const memberData = {
      name: form.name.trim(),
      avatar: form.avatar,
      type: typeOptions[form.typeIndex].value,
      relation: relationOptions[form.relationIndex].value,
      birthday: form.birthday,
      phone: form.phone,
      breed: typeOptions[form.typeIndex].value === 'pet' ? form.breed : '',
      role: roleOptions[form.roleIndex].value
    }

    wx.showLoading({ title: '保存中...' })
    try {
      const app = getApp()
      const family_id = app.globalData.familyInfo?._id
      if (editIndex >= 0) {
        await wx.cloud.callFunction({
          name: 'member',
          data: { action: 'update', data: { member_id: members[editIndex]._id, ...memberData } }
        })
        await wx.cloud.callFunction({
          name: 'audit',
          data: { action: 'log', data: { family_id, action: 'update_member', description: memberData.name } }
        })
      } else {
        await wx.cloud.callFunction({
          name: 'member',
          data: { action: 'add', data: memberData }
        })
        await wx.cloud.callFunction({
          name: 'audit',
          data: { action: 'log', data: { family_id, action: 'add_member', description: memberData.name } }
        })
      }
      wx.hideLoading()
      this.setData({ showForm: false })
      this.loadMembers()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  }
})
