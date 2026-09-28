// Shared helpers for Google Calendar calls.
// Files starting with an underscore are not exposed as routes on Vercel.

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Token exchange failed');
  }
  return data.access_token;
}

function calendarId() {
  return encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || 'primary');
}

module.exports = { getAccessToken, calendarId };
