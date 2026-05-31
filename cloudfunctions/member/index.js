const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {} } = event

  switch (action) {
    case 'list':
      return await list(OPENID)
    case 'add':
      return await add(OPENID, data)
    case 'update':
      return await update(OPENID, data)
    case 'delete':
      return await deleteMember(OPENID, data)
    case 'setRole':
      return await setRole(OPENID, data)
    default:
      return { code: -1, msg: 'unknown action' }
  }
}

async function getFamilyId(openid) {
  const userRes = await db.collection('users').where({ openid }).get()
  if (userRes.data.length === 0) return null
  return userRes.data[0].family_id || null
}

async function isOwner(openid, family_id) {
  try {
    const res = await db.collection('families').doc(family_id).get()
    return res.data && res.data.owner_openid === openid
  } catch (e) {
    return false
  }
}

async function list(openid) {
  const family_id = await getFamilyId(openid)
  if (!family_id) return { code: -1, msg: 'no family' }

  const res = await db.collection('members').where({ family_id }).get()
  return { code: 0, data: res.data }
}

async function add(openid, data) {
  const family_id = await getFamilyId(openid)
  if (!family_id) return { code: -1, msg: 'no family' }
  if (!(await isOwner(openid, family_id))) return { code: -1, msg: 'permission denied' }

  const { name, type, relation, birthday, breed, phone, avatar } = data
  if (!name) return { code: -1, msg: 'name required' }

  const member = {
    family_id,
    name,
    type: type || 'human',
    relation: relation || '',
    role: 'viewer',
    is_bound: false,
    bound_openid: '',
    birthday: birthday || '',
    breed: breed || '',
    phone: phone || '',
    avatar: avatar || '',
    created_at: db.serverDate()
  }

  const res = await db.collection('members').add({ data: member })
  return { code: 0, data: { _id: res._id } }
}

async function update(openid, data) {
  const family_id = await getFamilyId(openid)
  if (!family_id) return { code: -1, msg: 'no family' }
  if (!(await isOwner(openid, family_id))) return { code: -1, msg: 'permission denied' }

  const { member_id, ...fields } = data
  if (!member_id) return { code: -1, msg: 'member_id required' }

  let memberData
  try {
    const memberRes = await db.collection('members').doc(member_id).get()
    memberData = memberRes.data
  } catch (e) {
    return { code: -1, msg: 'member not found' }
  }
  if (!memberData || memberData.family_id !== family_id) {
    return { code: -1, msg: 'member not found' }
  }

  const allowed = ['name', 'type', 'relation', 'birthday', 'breed', 'phone', 'avatar']
  const updateData = {}
  for (const key of allowed) {
    if (fields[key] !== undefined) updateData[key] = fields[key]
  }
  updateData.updated_at = db.serverDate()

  await db.collection('members').doc(member_id).update({ data: updateData })
  return { code: 0, msg: 'ok' }
}

async function deleteMember(openid, data) {
  const family_id = await getFamilyId(openid)
  if (!family_id) return { code: -1, msg: 'no family' }
  if (!(await isOwner(openid, family_id))) return { code: -1, msg: 'permission denied' }

  const { member_id } = data
  if (!member_id) return { code: -1, msg: 'member_id required' }

  let member
  try {
    const memberRes = await db.collection('members').doc(member_id).get()
    member = memberRes.data
  } catch (e) {
    return { code: -1, msg: 'member not found' }
  }
  if (!member || member.family_id !== family_id) {
    return { code: -1, msg: 'member not found' }
  }
  if (member.bound_openid === openid && member.role === 'owner') {
    return { code: -1, msg: 'cannot delete self as owner' }
  }

  for (const col of ['medical_records', 'vaccine_records', 'insurance_records']) {
    await db.collection(col).where({ member_id }).remove()
  }

  if (member.is_bound && member.bound_openid) {
    await db.collection('users').where({ openid: member.bound_openid }).update({
      data: { family_id: '' }
    })
  }

  await db.collection('members').doc(member_id).remove()
  return { code: 0, msg: 'ok' }
}

async function setRole(openid, data) {
  const family_id = await getFamilyId(openid)
  if (!family_id) return { code: -1, msg: 'no family' }
  if (!(await isOwner(openid, family_id))) return { code: -1, msg: 'permission denied' }

  const { member_id, role } = data
  if (!member_id || !role) return { code: -1, msg: 'params required' }
  if (!['editor', 'viewer'].includes(role)) return { code: -1, msg: 'invalid role' }

  const memberRes = await db.collection('members').doc(member_id).get().catch(() => ({}))
  if (!memberRes.data || memberRes.data.family_id !== family_id) {
    return { code: -1, msg: 'member not found' }
  }

  await db.collection('members').doc(member_id).update({
    data: { role, updated_at: db.serverDate() }
  })
  return { code: 0, msg: 'ok' }
}
