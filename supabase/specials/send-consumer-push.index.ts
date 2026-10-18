// send-consumer-push v5: adds a `user_ids` list mode for specials.
// Modes:  { user_id, title, body }              one person (stamps, rewards, reminders)
//         { broadcast: true, title, body }      everyone (merchant launch announcement)
//         { user_ids: [...], title, body, data } a list (a merchant's special to their customers)
// Deploy this as the function body; verify_jwt stays false (secret header auth).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405)

  const internalSecret = Deno.env.get('NOTIFY_INTERNAL_SECRET')
  if (internalSecret && req.headers.get('x-internal-secret') !== internalSecret) {
    return json({ ok: false, reason: 'unauthorized' }, 401)
  }

  try {
    const { user_id, user_ids, title, body: messageBody, broadcast, data } = await req.json()
    const hasList = Array.isArray(user_ids) && user_ids.length > 0
    if ((!user_id && !broadcast && !hasList) || !title || !messageBody) {
      return json({ ok: false, reason: 'missing_fields' }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Collect tokens. A list is fetched in chunks so a shop with
    // thousands of customers never builds an oversized IN clause.
    let tokens: { token: string }[] = []
    if (broadcast) {
      const { data: rows } = await admin.from('push_tokens').select('token')
      tokens = rows ?? []
    } else if (hasList) {
      for (let i = 0; i < user_ids.length; i += 500) {
        const { data: rows } = await admin
          .from('push_tokens')
          .select('token')
          .in('user_id', user_ids.slice(i, i + 500))
        if (rows?.length) tokens.push(...rows)
      }
    } else {
      const { data: rows } = await admin.from('push_tokens').select('token').eq('user_id', user_id)
      tokens = rows ?? []
    }

    if (!tokens.length) {
      return json({ ok: true, delivered: false, reason: 'no_tokens' })
    }

    const unique = [...new Set(tokens.map((t) => t.token))]
    const messages = unique.map((to) => ({
      to,
      title,
      body: messageBody,
      sound: 'default',
      ...(data ? { data } : {}),
    }))

    // Expo push API accepts at most 100 messages per request
    let sent = 0
    let allOk = true
    for (let i = 0; i < messages.length; i += 100) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      })
      if (res.ok) sent += Math.min(100, messages.length - i)
      else allOk = false
    }

    return json({ ok: true, delivered: allOk, sent, tokens: unique.length })
  } catch (e) {
    return json({ ok: false, reason: String(e) }, 500)
  }
})
