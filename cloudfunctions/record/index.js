const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const TYPE_COLLECTION = {
  medical: 'medical_records',
  vaccine: 'vaccine_records',
  insurance: 'insurance_records'
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {} } = event

  switch (action) {
    case 'list':
      return await list(OPENID, data)
    case 'listRecent':
      return await listRecent(OPENID, data)
    case 'add':
      return await add(OPENID, data)
    case 'update':
      return await update(OPENID, data)
    case 'delete':
      return await deleteRecord(OPENID, data)
    case 'batchDelete':
      return await batchDelete(OPENID, data)
    default:
      return { code: -1, msg: 'unknown action' }
  }
}

async function getFamilyContext(openid) {
  const userRes = await db.collection('users').where({ openid }).get()
  if (userRes.data.length === 0) return null
  const user = userRes.data[0]
  if (!user.family_id) return null
  return { family_id: user.family_id, openid }
}

async function verifyMemberAccess(openid, family_id, member_id) {
  try {
    const memberRes = await db.collection('members').doc(member_id).get()
    if (!memberRes.data || memberRes.data.family_id !== family_id) return false
    return true
  } catch (e) {
    return false
  }
}

async function list(openid, data) {
  const ctx = await getFamilyContext(openid)
  if (!ctx) return { code: -1, msg: 'no family' }

  const { member_id, type, page = 1, page_size = 20 } = data
  if (!member_id) return { code: -1, msg: 'member_id required' }
  if (!(await verifyMemberAccess(openid, ctx.family_id, member_id))) {
    return { code: -1, msg: 'permission denied' }
  }

  if (type) {
    const col = TYPE_COLLECTION[type]
    if (!col) return { code: -1, msg: 'invalid type' }
    const res = await db.collection(col)
      .where({ member_id })
      .orderBy('created_at', 'desc')
      .skip((page - 1) * page_size)
      .limit(page_size)
      .get()
    return { code: 0, data: res.data.map(r => ({ ...r, record_type: type })) }
  }

  const results = await Promise.all(
    Object.entries(TYPE_COLLECTION).map(([t, col]) =>
      db.collection(col).where({ member_id }).orderBy('created_at', 'desc').get()
        .then(res => res.data.map(r => ({ ...r, record_type: t })))
    )
  )
  const allRecords = results.flat()
  allRecords.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
  const sliced = allRecords.slice((page - 1) * page_size, page * page_size)
  return { code: 0, data: sliced }
}

async function listRecent(openid, data) {
  const ctx = await getFamilyContext(openid)
  if (!ctx) return { code: -1, msg: 'no family' }

  const { limit = 10 } = data
  const membersRes = await db.collection('members').where({ family_id: ctx.family_id }).get()
  const memberIds = membersRes.data.map(m => m._id)
  if (memberIds.length === 0) return { code: 0, data: [] }

  const results = await Promise.all(
    Object.entries(TYPE_COLLECTION).map(([t, col]) =>
      db.collection(col)
        .where({ member_id: _.in(memberIds) })
        .orderBy('created_at', 'desc')
        .limit(limit)
        .get()
        .then(res => res.data.map(r => ({ ...r, record_type: t })))
    )
  )
  const allRecords = results.flat()
  allRecords.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
  return { code: 0, data: allRecords.slice(0, limit) }
}

async function add(openid, data) {
  const ctx = await getFamilyContext(openid)
  if (!ctx) return { code: -1, msg: 'no family' }

  const { type, member_id, ...fields } = data
  if (!type || !member_id) return { code: -1, msg: 'type and member_id required' }
  const col = TYPE_COLLECTION[type]
  if (!col) return { code: -1, msg: 'invalid type' }
  if (!(await verifyMemberAccess(openid, ctx.family_id, member_id))) {
    return { code: -1, msg: 'permission denied' }
  }

  const record = { member_id, family_id: ctx.family_id, creator_openid: openid }

  if (type === 'medical') {
    Object.assign(record, pick(fields, ['visit_date', 'hospital', 'diagnosis', 'prescription', 'cost', 'next_visit_date', 'images']))
  } else if (type === 'vaccine') {
    Object.assign(record, pick(fields, ['vacc_date', 'vaccine_name', 'institution', 'next_dose_date', 'images']))
  } else if (type === 'insurance') {
    Object.assign(record, pick(fields, ['start_date', 'end_date', 'company', 'insurance_type', 'policy_no', 'premium', 'images']))
  }

  record.created_at = db.serverDate()
  const res = await db.collection(col).add({ data: record })
  return { code: 0, data: { _id: res._id } }
}

async function update(openid, data) {
  const ctx = await getFamilyContext(openid)
  if (!ctx) return { code: -1, msg: 'no family' }

  const { type, record_id, ...fields } = data
  if (!type || !record_id) return { code: -1, msg: 'type and record_id required' }
  const col = TYPE_COLLECTION[type]
  if (!col) return { code: -1, msg: 'invalid type' }

  let record
  try {
    const recordRes = await db.collection(col).doc(record_id).get()
    record = recordRes.data
  } catch (e) {
    return { code: -1, msg: 'record not found' }
  }
  if (!record || record.family_id !== ctx.family_id) {
    return { code: -1, msg: 'record not found' }
  }

  // Permission check: verify cross-edit permission if not the record creator
  if (record.creator_openid && record.creator_openid !== openid) {
    const familyRes = await db.collection('families').doc(ctx.family_id).get()
    if (!familyRes.data || !familyRes.data.allow_cross_edit) {
      return { code: -1, msg: 'cross-edit not allowed' }
    }
  }

  // Whitelist allowed fields per type to prevent mass assignment
  let updateData = {}
  if (type === 'medical') {
    updateData = pick(fields, ['visit_date', 'hospital', 'diagnosis', 'prescription', 'cost', 'next_visit_date', 'images'])
  } else if (type === 'vaccine') {
    updateData = pick(fields, ['vacc_date', 'vaccine_name', 'institution', 'next_dose_date', 'images'])
  } else if (type === 'insurance') {
    updateData = pick(fields, ['start_date', 'end_date', 'company', 'insurance_type', 'policy_no', 'premium', 'images'])
  }
  updateData.updated_at = db.serverDate()

  await db.collection(col).doc(record_id).update({ data: updateData })
  return { code: 0, msg: 'ok' }
}

async function deleteRecord(openid, data) {
  const ctx = await getFamilyContext(openid)
  if (!ctx) return { code: -1, msg: 'no family' }

  const { type, record_id } = data
  if (!type || !record_id) return { code: -1, msg: 'type and record_id required' }
  const col = TYPE_COLLECTION[type]
  if (!col) return { code: -1, msg: 'invalid type' }

  let record
  try {
    const recordRes = await db.collection(col).doc(record_id).get()
    record = recordRes.data
  } catch (e) {
    return { code: -1, msg: 'record not found' }
  }
  if (!record || record.family_id !== ctx.family_id) {
    return { code: -1, msg: 'record not found' }
  }

  // Permission check: verify cross-edit permission if not the record creator
  if (record.creator_openid && record.creator_openid !== openid) {
    const familyRes = await db.collection('families').doc(ctx.family_id).get()
    if (!familyRes.data || !familyRes.data.allow_cross_edit) {
      return { code: -1, msg: 'cross-edit not allowed' }
    }
  }

  await db.collection(col).doc(record_id).remove()
  return { code: 0, msg: 'ok' }
}

async function batchDelete(openid, data) {
  const ctx = await getFamilyContext(openid)
  if (!ctx) return { code: -1, msg: 'no family' }

  const { type, record_ids } = data
  if (!type || !record_ids || !Array.isArray(record_ids) || !record_ids.length) {
    return { code: -1, msg: 'type and record_ids required' }
  }
  if (record_ids.length > 50) {
    return { code: -1, msg: 'too many records (max 50)' }
  }
  const col = TYPE_COLLECTION[type]
  if (!col) return { code: -1, msg: 'invalid type' }

  // Check cross-edit permission if needed
  const familyRes = await db.collection('families').doc(ctx.family_id).get()
  const allowCrossEdit = familyRes.data && familyRes.data.allow_cross_edit

  // Verify all records belong to this family and check creator permission
  const recordsRes = await db.collection(col).where({
    _id: _.in(record_ids),
    family_id: ctx.family_id
  }).get()

  if (!allowCrossEdit) {
    const hasOthers = recordsRes.data.some(r => r.creator_openid && r.creator_openid !== openid)
    if (hasOthers) {
      return { code: -1, msg: 'cross-edit not allowed' }
    }
  }

  const validIds = recordsRes.data.map(r => r._id)
  if (validIds.length === 0) return { code: 0, msg: 'no records to delete' }

  await db.collection(col).where({
    _id: _.in(validIds),
    family_id: ctx.family_id
  }).remove()

  return { code: 0, msg: 'ok' }
}

function pick(obj, keys) {
  const result = {}
  for (const key of keys) {
    if (obj[key] !== undefined) result[key] = obj[key]
  }
  return result
}
