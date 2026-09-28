const { getAccessToken, calendarId } = require('./_google');

// POST { id: "<calendar event id>" }
// Deletes a reminder created by schedule-reminder.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const id = body.id;

    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const token = await getAccessToken();
    const apiRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId()}/events/${id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );

    // 204 = deleted, 404/410 = already gone. All fine.
    if (apiRes.status === 204 || apiRes.status === 404 || apiRes.status === 410) {
      return res.status(200).json({ ok: true });
    }

    const data = await apiRes.json().catch(() => ({}));
    return res.status(502).json({ error: (data.error && data.error.message) || 'Calendar API error' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
