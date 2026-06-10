import { getCalendarToken } from './auth.js'

export async function fetchTodayEvents() {
  const token = getCalendarToken()
  if (!token) return []
  try {
    const now = new Date()
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0)
    const endOfDay   = new Date(now); endOfDay.setHours(23, 59, 59, 999)
    const params = new URLSearchParams({
      timeMin:      startOfDay.toISOString(),
      timeMax:      endOfDay.toISOString(),
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '10',
    })
    const res = await fetch(
      `/api/gcal/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) throw new Error(`Calendar API ${res.status}`)
    const data = await res.json()
    return (data.items || []).map(evt => ({
      id:     evt.id,
      title:  evt.summary || 'Untitled',
      start:  evt.start?.dateTime || evt.start?.date,
      end:    evt.end?.dateTime   || evt.end?.date,
      allDay: !evt.start?.dateTime,
    }))
  } catch (err) {
    console.error('[EVA Calendar]', err)
    return []
  }
}

export function formatEventTime(event) {
  if (event.allDay) return 'all day'
  return new Date(event.start).toLocaleTimeString('en-US', {
    timeZone: 'Pacific/Honolulu',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}
