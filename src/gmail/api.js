import { getGmailToken } from './auth.js'

const BASE = '/api/gcal/gmail/v1/users/me'

async function gmailFetch(path) {
  const token = getGmailToken()
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Gmail API ${res.status}`)
  return res.json()
}

export async function fetchUnreadCount() {
  const data = await gmailFetch('/messages?q=is:unread&maxResults=1')
  return data.resultSizeEstimate ?? 0
}

function decodeHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

function stripEmail(from) {
  const m = from.match(/^(.+?)\s*</)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : from.split('@')[0]
}

export async function fetchLatestEmails(n = 5) {
  const list = await gmailFetch(`/messages?q=in:inbox&maxResults=${n}`)
  if (!list.messages?.length) return []
  const emails = await Promise.allSettled(
    list.messages.map(m => gmailFetch(`/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`))
  )
  return emails
    .filter(r => r.status === 'fulfilled')
    .map(r => {
      const headers = r.value.payload?.headers
      return {
        id: r.value.id,
        from: stripEmail(decodeHeader(headers, 'From')),
        subject: decodeHeader(headers, 'Subject') || '(no subject)',
        date: decodeHeader(headers, 'Date'),
      }
    })
}

export async function summarizeInbox() {
  const [unreadCount, emails] = await Promise.all([
    fetchUnreadCount().catch(() => 0),
    fetchLatestEmails(5).catch(() => []),
  ])
  return { unreadCount, emails }
}
