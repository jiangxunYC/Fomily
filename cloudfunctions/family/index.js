const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {} } = event

  switch (action) {
    case 'create':
      return await create(OPENID, data)
    case 'join':
      return await join(OPENID, data)
    case 'update':
      return await update(OPENID, data)
    case 'transferOwner':
      return await transferOwner(OPENID, data)
    case 'disband':
      return await disband(OPENID, data)
    case 'getInfo':
      return await getInfo(OPENID, data)
    default:
      return { code: -1, msg: 'unknown action' }
  }
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

async function ensureUser(openid) {
  const userRes = await db.collection('users').where({ openid }).get()
  if (userRes.data.length > 0) return userRes.data[0]
  const newUser = { openid, nickname: '', avatar: '', phone: '', family_id: '', created_at: db.serverDate() }
  const addRes = await db.collection('users').add({ data: newUser })
  newUser._id = addRes._id
  return newUser
}

async function create(openid, data) {
  const { name } = data
  if (!name) return { code: -1, msg: 'name required' }

  const user = await ensureUser(openid)
  if (user.family_id) return { code: -1, msg: 'already in a family' }

  const invite_code = generateInviteCode()
  const family = {
    name,
    invite_code,
    owner_openid: openid,
    allow_cross_edit: false,
    allow_cross_view: true,
    created_at: db.serverDate()
  }
  const familyRes = await db.collection('families').add({ data: family })
  const family_id = familyRes._id

  const member = {
    family_id,
    name: user.nickname || '我',
    type: 'human',
    relation: 'self',
    role: 'owner',
    is_bound: true,
    bound_openid: openid,
    birthday: '',
    phone: user.phone || '',
    avatar: user.avatar || '',
    created_at: db.serverDate()
  }
  await db.collection('members').add({ data: member })
  await db.collection('users').where({ openid }).update({ data: { family_id } })

  return { code: 0, data: { family_id, invite_code } }
}

async function join(openid, data) {
  const { invite_code } = data
  if (!invite_code) return { code: -1, msg: 'invite_code required' }

  const user = await ensureUser(openid)
  if (user.family_id) return { code: -1, msg: 'already in a family' }

  const familyRes = await db.collection('families').where({ invite_code }).get()
  if (familyRes.data.length === 0) return { code: -1, msg: 'invalid invite code' }
  const family = familyRes.data[0]
  const family_id = family._id

  const unboundRes = await db.collection('members').where({
    family_id,
    is_bound: false,
    bound_openid: ''
  }).get()

  let memberId
  if (unboundRes.data.length > 0) {
    const target = unboundRes.data[0]
    memberId = target._id
    await db.collection('members').doc(memberId).update({
      data: { is_bound: true, bound_openid: openid, updated_at: db.serverDate() }
    })
  } else {
    const newMember = {
      family_id,
      name: user.nickname || '新成员',
      type: 'human',
      relation: '',
      role: 'editor',
      is_bound: true,
      bound_openid: openid,
      birthday: '',
      phone: '',
      avatar: user.avatar || '',
      created_at: db.serverDate()
    }
    const addRes = await db.collection('members').add({ data: newMember })
    memberId = addRes._id
  }

  await db.collection('users').where({ openid }).update({ data: { family_id } })
  return { code: 0, data: { family_id, member_id: memberId } }
}

async function update(openid, data) {
  const { family_id, name, allow_cross_edit, allow_cross_view } = data
  if (!family_id) return { code: -1, msg: 'family_id required' }

  const family = await verifyOwner(openid, family_id)
  if (!family) return { code: -1, msg: 'permission denied' }

  const updateData = {}
  if (name !== undefined) updateData.name = name
  if (allow_cross_edit !== undefined) updateData.allow_cross_edit = allow_cross_edit
  if (allow_cross_view !== undefined) updateData.allow_cross_view = allow_cross_view
  updateData.updated_at = db.serverDate()

  await db.collection('families').doc(family_id).update({ data: updateData })
  return { code: 0, msg: 'ok' }
}

async function transferOwner(openid, data) {
  const { family_id, target_member_id } = data
  if (!family_id || !target_member_id) return { code: -1, msg: 'params required' }

  const family = await verifyOwner(openid, family_id)
  if (!family) return { code: -1, msg: 'permission denied' }

  let target
  try {
    const targetRes = await db.collection('members').doc(target_member_id).get()
    target = targetRes.data
  } catch (e) {
    return { code: -1, msg: 'invalid target member' }
  }
  if (!target || target.family_id !== family_id || !target.is_bound) {
    return { code: -1, msg: 'invalid target member' }
  }

  await db.collection('families').doc(family_id).update({
    data: { owner_openid: target.bound_openid, updated_at: db.serverDate() }
  })
  await db.collection('members').where({ family_id, bound_openid: openid }).update({
    data: { role: 'editor' }
  })
  await db.collection('members').doc(target_member_id).update({
    data: { role: 'owner' }
  })

  return { code: 0, msg: 'ok' }
}

async function disband(openid, data) {
  const { family_id } = data
  if (!family_id) return { code: -1, msg: 'family_id required' }

  const family = await verifyOwner(openid, family_id)
  if (!family) return { code: -1, msg: 'permission denied' }

  const members = await db.collection('members').where({ family_id }).get()
  const memberIds = members.data.map(m => m._id)

  if (memberIds.length > 0) {
    await Promise.all(
      ['medical_records', 'vaccine_records', 'insurance_records'].map(col =>
        db.collection(col).where({ member_id: _.in(memberIds) }).remove()
      )
    )
  }
  await db.collection('audit_logs').where({ family_id }).remove()
  await db.collection('members').where({ family_id }).remove()
  await db.collection('families').doc(family_id).remove()
  await db.collection('users').where({ family_id }).update({ data: { family_id: '' } })

  return { code: 0, msg: 'ok' }
}

async function getInfo(openid, data) {
  const { family_id } = data
  if (!family_id) return { code: -1, msg: 'family_id required' }

  const memberCheck = await db.collection('members').where({
    family_id, bound_openid: openid
  }).get()
  if (memberCheck.data.length === 0) return { code: -1, msg: 'permission denied' }

  const familyRes = await db.collection('families').doc(family_id).get()
  return { code: 0, data: familyRes.data }
}

async function verifyOwner(openid, family_id) {
  try {
    const res = await db.collection('families').doc(family_id).get()
    if (!res.data || res.data.owner_openid !== openid) return null
    return res.data
  } catch (e) {
    return null
  }
}
