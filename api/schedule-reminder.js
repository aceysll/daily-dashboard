const { getAccessToken, calendarId } = require('./_google');

// POST { start: "2026-09-29T13:45:00+01:00" }
// Creates a one-off calendar event with a popup notification at start time.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const start = new Date(body.start);

    if (isNaN(start.getTime())) {
      return res.status(400).json({ error: 'Invalid start time' });
    }

    // Guard rails: only allow reminders from 5 minutes ago up to 24 hours ahead.
    const now = Date.now();
    if (start.getTime() < now - 5 * 60 * 1000 || start.getTime() > now + 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Start time out of allowed range' });
    }

    const end = new Date(start.getTime() + 15 * 60 * 1000);
    const token = await getAccessToken();

    const apiRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId()}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: 'Fast day meal reminder',
          description: 'One meal today. Protein first: rice, fish or chicken, beef, and an egg. Log it in the dashboard.',
          start: { dateTime: start.toISOString(), timeZone: 'Africa/Lagos' },
          end: { dateTime: end.toISOString(), timeZone: 'Africa/Lagos' },
          reminders: {
            useDefault: false,
            overrides: [{ method: 'popup', minutes: 0 }]
          }
        })
      }
    );

    const data = await apiRes.json();
    if (!apiRes.ok) {
      return res.status(502).json({ error: (data.error && data.error.message) || 'Calendar API error' });
    }

    return res.status(200).json({ id: data.id });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
