const { checkLogin, requireLogin } = require('../../utils/auth')
const { db, collections, formatDate, getRecordTypeLabel, getRelationLabel, calcAge } = require('../../utils/util')

Page({
  data: {
    member: {},
    relationLabel: '',
    age: '',
    medicalCount: 0,
    vaccineCount: 0,
    insuranceCount: 0,
    activeTab: 'medical',
    activeTabLabel: '看病',
    records: []
  },

  onLoad(options) {
    if (!requireLogin()) return
    this.memberId = options.id
    this.loadMember()
  },

  onShow() {
    if (this.memberId) {
      this.loadCounts()
      this.loadRecords()
    }
  },

  async loadMember() {
    try {
      const { data } = await db.collection(collections.MEMBER).doc(this.memberId).get()
      this.setData({
        member: data,
        relationLabel: getRelationLabel(data.relation),
        age: calcAge(data.birthday)
      })
      this.loadCounts()
      this.loadRecords()
    } catch (e) {
      console.error('loadMember:', e)
    }
  },

  async loadCounts() {
    const id = this.memberId
    const [medical, vaccine, insurance] = await Promise.all([
      db.collection(collections.MEDICAL).where({ member_id: id }).count(),
      db.collection(collections.VACCINE).where({ member_id: id }).count(),
      db.collection(collections.INSURANCE).where({ member_id: id }).count()
    ])
    this.setData({
      medicalCount: medical.total,
      vaccineCount: vaccine.total,
      insuranceCount: insurance.total
    })
  },

  async loadRecords() {
    const tab = this.data.activeTab
    const collMap = {
      medical: collections.MEDICAL,
      vaccine: collections.VACCINE,
      insurance: collections.INSURANCE
    }
    try {
      const { data } = await db.collection(collMap[tab])
        .where({ member_id: this.memberId })
        .orderBy('created_at', 'desc')
        .limit(50)
        .get()

      const records = data.map(item => ({
        ...item,
        dateStr: formatDate(item.visit_date || item.vacc_date || item.start_date || item.created_at),
        summary: this.getSummary(item, tab)
      }))
      this.setData({ records })
    } catch (e) {
      console.error('loadRecords:', e)
    }
  },

  getSummary(item, type) {
    if (type === 'medical') return item.diagnosis || item.hospital || '就诊记录'
    if (type === 'vaccine') return item.vaccine_name || '疫苗接种'
    if (type === 'insurance') return item.insurance_type || item.company || '保险记录'
    return ''
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    const labelMap = { medical: '看病', vaccine: '疫苗', insurance: '保险' }
    this.setData({ activeTab: tab, activeTabLabel: labelMap[tab] })
    this.loadRecords()
  },

  goRecordDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/record-detail/record-detail?id=${id}&type=${this.data.activeTab}`
    })
  }
})
