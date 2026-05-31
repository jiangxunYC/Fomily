const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {} } = event

  switch (action) {
    case 'log':
      return await log(OPENID, data)
    case 'list':
      return await list(OPENID, data)
    default:
      return { code: -1, msg: 'unknown action' }
  }
}

async function log(openid, data) {
  const { family_id, target_type, target_id, action, description } = data
  if (!family_id || !action) return { code: -1, msg: 'params required' }

  const memberCheck = await db.collection('members').where({
    family_id, bound_openid: openid
  }).get()
  if (memberCheck.data.length === 0) return { code: -1, msg: 'permission denied' }

  const entry = {
    family_id,
    actor_openid: openid,
    target_type: target_type || '',
    target_id: target_id || '',
    action,
    description: description || '',
    created_at: db.serverDate()
  }

  await db.collection('audit_logs').add({ data: entry })
  return { code: 0, msg: 'ok' }
}

async function list(openid, data) {
  const { family_id, member_openid, action_filter, page = 1, page_size = 20 } = data
  if (!family_id) return { code: -1, msg: 'family_id required' }

  const memberCheck = await db.collection('members').where({
    family_id, bound_openid: openid
  }).get()
  if (memberCheck.data.length === 0) return { code: -1, msg: 'permission denied' }

  const query = { family_id }
  if (member_openid) query.actor_openid = member_openid
  if (action_filter) query.action = action_filter

  const res = await db.collection('audit_logs')
    .where(query)
    .orderBy('created_at', 'desc')
    .skip((page - 1) * page_size)
    .limit(page_size)
    .get()

  return { code: 0, data: res.data }
}
