const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {} } = event

  switch (action) {
    case 'login':
      return await login(OPENID)
    case 'update':
      return await update(OPENID, data)
    case 'getInfo':
      return await getInfo(OPENID)
    default:
      return { code: -1, msg: 'unknown action' }
  }
}

async function login(openid) {
  const userRes = await db.collection('users').where({ openid }).get()

  if (userRes.data.length > 0) {
    const user = userRes.data[0]
    let family = null
    let member = null
    if (user.family_id) {
      try {
        const familyRes = await db.collection('families').doc(user.family_id).get()
        family = familyRes.data
      } catch (e) {
        // Family was deleted but user still references it - clean up
        await db.collection('users').where({ openid }).update({ data: { family_id: '' } })
        user.family_id = ''
      }
      if (family) {
        const memberRes = await db.collection('members').where({
          family_id: user.family_id,
          bound_openid: openid
        }).get()
        if (memberRes.data.length > 0) member = memberRes.data[0]
      }
    }
    return { code: 0, data: { user, family, member } }
  }

  const newUser = {
    openid,
    nickname: '',
    avatar: '',
    phone: '',
    family_id: '',
    created_at: db.serverDate()
  }
  const addRes = await db.collection('users').add({ data: newUser })
  newUser._id = addRes._id
  return { code: 0, data: { user: newUser, family: null, member: null } }
}

async function update(openid, data) {
  const { nickname, avatar, phone } = data
  const updateData = {}
  if (nickname !== undefined) updateData.nickname = nickname
  if (avatar !== undefined) updateData.avatar = avatar
  if (phone !== undefined) updateData.phone = phone
  updateData.updated_at = db.serverDate()

  await db.collection('users').where({ openid }).update({ data: updateData })
  return { code: 0, msg: 'ok' }
}

async function getInfo(openid) {
  const userRes = await db.collection('users').where({ openid }).get()
  if (userRes.data.length === 0) return { code: -1, msg: 'user not found' }

  const user = userRes.data[0]
  let family = null
  let member = null

  if (user.family_id) {
    const familyRes = await db.collection('families').doc(user.family_id).get()
    family = familyRes.data
    const memberRes = await db.collection('members').where({
      family_id: user.family_id,
      bound_openid: openid
    }).get()
    if (memberRes.data.length > 0) member = memberRes.data[0]
  }

  return { code: 0, data: { user, family, member } }
}
