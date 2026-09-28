// Fast day module: mark today as a fast day and schedule a calendar reminder.
// Add to index.html just before </body>:  <script src="fast-day.js"></script>
(function () {
  var DEFAULT_TIME = '13:45';
  var TZ_OFFSET = '+01:00'; // Nigeria (WAT)

  function todayKey() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function storageKey() { return 'fastday:' + todayKey(); }

  function load() {
    try { return JSON.parse(localStorage.getItem(storageKey())); } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(storageKey(), JSON.stringify(v)); } catch (e) {}
  }
  function clear() {
    try { localStorage.removeItem(storageKey()); } catch (e) {}
  }

  function post(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.error || 'Request failed');
        return data;
      });
    });
  }

  // Card UI
  var card = document.createElement('div');
  card.style.cssText = 'margin:16px auto;max-width:480px;padding:14px 16px;border-radius:12px;' +
    'background:#1a1a1a;color:#eee;font-family:system-ui,sans-serif;font-size:14px;' +
    'border:1px solid #333;box-sizing:border-box;';

  var title = document.createElement('div');
  title.style.cssText = 'font-weight:600;margin-bottom:8px;';
  title.textContent = 'Fast day';

  var row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;';

  var label = document.createElement('label');
  label.textContent = 'Remind me at';
  label.style.cssText = 'opacity:.8;';

  var timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.value = DEFAULT_TIME;
  timeInput.style.cssText = 'padding:6px 8px;border-radius:8px;border:1px solid #444;' +
    'background:#111;color:#eee;font-size:14px;';

  var btn = document.createElement('button');
  btn.style.cssText = 'padding:8px 14px;border-radius:8px;border:0;background:#3b82f6;' +
    'color:#fff;font-size:14px;cursor:pointer;';

  var status = document.createElement('div');
  status.style.cssText = 'margin-top:8px;font-size:13px;opacity:.85;min-height:1em;';

  row.appendChild(label);
  row.appendChild(timeInput);
  row.appendChild(btn);
  card.appendChild(title);
  card.appendChild(row);
  card.appendChild(status);

  function render() {
    var state = load();
    if (state) {
      btn.textContent = 'Unmark fast day';
      btn.style.background = '#555';
      timeInput.disabled = true;
      timeInput.value = state.time || DEFAULT_TIME;
      status.textContent = state.eventId
        ? 'Today is a fast day. Reminder set for ' + state.time + '.'
        : 'Today is a fast day. No reminder was set.';
    } else {
      btn.textContent = 'Mark today as fast day';
      btn.style.background = '#3b82f6';
      timeInput.disabled = false;
      status.textContent = '';
    }
  }

  function broadcast() {
    var evt;
    try { evt = new CustomEvent('fastday-change', { detail: { fast: !!load(), date: todayKey() } }); }
    catch (e) { return; }
    window.dispatchEvent(evt);
  }

  btn.addEventListener('click', function () {
    var state = load();
    btn.disabled = true;

    if (state) {
      // Unmark
      status.textContent = 'Removing reminder...';
      var done = function () { clear(); btn.disabled = false; render(); broadcast(); };
      if (state.eventId) {
        post('/api/cancel-reminder', { id: state.eventId })
          .then(done)
          .catch(function (err) {
            btn.disabled = false;
            status.textContent = 'Could not remove reminder: ' + err.message;
          });
      } else {
        done();
      }
      return;
    }

    // Mark
    var time = timeInput.value || DEFAULT_TIME;
    var start = new Date(todayKey() + 'T' + time + ':00' + TZ_OFFSET);
    if (start.getTime() < Date.now()) {
      // Time already passed today: mark the day but skip the reminder.
      save({ time: time, eventId: null });
      btn.disabled = false;
      render();
      broadcast();
      status.textContent = 'Today is a fast day. That time has passed, so no reminder was set.';
      return;
    }

    status.textContent = 'Setting reminder...';
    post('/api/schedule-reminder', { start: todayKey() + 'T' + time + ':00' + TZ_OFFSET })
      .then(function (data) {
        save({ time: time, eventId: data.id });
        btn.disabled = false;
        render();
        broadcast();
      })
      .catch(function (err) {
        btn.disabled = false;
        status.textContent = 'Could not set reminder: ' + err.message;
      });
  });

  // Helper for wiring into the rest of the dashboard later.
  window.FastDay = {
    isFastDay: function () { return !!load(); }
  };

  function mount() {
    document.body.appendChild(card);
    render();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
