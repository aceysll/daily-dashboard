import { useState, useEffect, useMemo } from 'react';

// ---------- storage (same keys as the old single-page version, so history carries over) ----------
const ls = {
  get: k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} },
  logs: () => {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('log:')) { const v = ls.get(k); if (v) out.push(v); }
      }
    } catch {}
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
};

const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const label = m => { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60); return `${h % 12 || 12}:${pad(m % 60)} ${h < 12 ? 'AM' : 'PM'}`; };
const nowLabel = () => 'at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const TZ = '+01:00';

// ---------- content ----------
const M = (m1, m2, kcal, protein) => ({ m1, m2, kcal, protein });
const MENU = [
  M('Jollof rice + chicken + egg (5 spoons)', 'Rice & beans + egg (4 spoons)', 2050, 95),
  M('Jollof rice + 3 beef pieces + egg (5 spoons)', 'Rice & beans + egg (4 spoons)', 1900, 88),
  M('White rice + fish + egg (5 spoons)', 'Rice & beans + egg (4 spoons)', 1880, 92),
  M('Fried rice + 3 beef pieces + egg (5 spoons)', 'Rice & beans + egg (4 spoons)', 1950, 88),
  M('Jollof rice + fish + egg (5 spoons)', 'White rice + egg (4 spoons)', 1900, 90),
  M('White rice + 3 beef pieces + egg (5 spoons)', 'Rice & beans + egg (4 spoons)', 1900, 88),
  M('Fried rice + fish + egg (5 spoons)', 'Rice & beans + egg (4 spoons)', 1900, 92)
];
const FAST_MENU = 'Option A: 6 spoons rice + chicken + egg\nOption B: 5 spoons rice + fish + 5 beef pieces + egg (more protein per naira)';
const CYCLE = ['chest', 'backshoulders', 'legs'];
const WORK = {
  chest: ['Chest', ['Bench press (barbell or dumbbell): 4 x 6-10', 'Incline dumbbell press: 3 x 8-12', 'Cable or machine fly: 3 x 12-15', 'Push-ups: 2 sets, stop 2 reps before failure', 'Triceps pushdown: 3 x 10-15']],
  backshoulders: ['Back & shoulders', ['Lat pulldown or assisted pull-ups: 4 x 8-12', 'Seated cable row: 3 x 8-12', 'One-arm dumbbell row: 3 x 10 each side', 'Overhead dumbbell press: 3 x 8-10', 'Lateral raises: 3 x 12-15', 'Face pulls or rear delt fly: 3 x 12-15']],
  legs: ['Legs', ['Squat or leg press: 4 x 8-12', 'Romanian deadlift: 3 x 8-10', 'Walking lunges: 3 x 10 each leg', 'Leg curl: 3 x 10-15', 'Leg extension: 3 x 12-15', 'Calf raises: 4 x 12-20']]
};

// ---------- google form backup ----------
const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLScInG7Ip0pUaKXt4d6PS13a82VacyAu6pI7ujMQYSOr1V4qdQ/formResponse';
const F = { date: 'entry.1407182388', weight: 'entry.591745938', steps: 'entry.2006155217', meal1: 'entry.903070913', meal2: 'entry.974669481', fruit: 'entry.263373733', dayType: 'entry.81904081', extra: 'entry.1630377366' };
function backup(e) {
  try {
    const b = new URLSearchParams(), fast = e.dayType === 'fast', yn = v => (v ? 'Yes' : 'No');
    b.append(F.date, e.date); b.append(F.weight, e.weight || ''); b.append(F.steps, e.steps || '');
    b.append(F.meal1, yn(fast ? e.fastMeal : e.meal1)); b.append(F.meal2, yn(fast ? e.fastMeal : e.meal2));
    b.append(F.fruit, yn(e.fruit)); b.append(F.dayType, fast ? 'Fast' : 'Normal'); b.append(F.extra, yn(e.extraMeal));
    fetch(FORM, { method: 'POST', mode: 'no-cors', body: b });
  } catch {}
}

async function post(url, payload) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  let d = {}; try { d = await r.json(); } catch {}
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

const dayHit = l => (l.dayType === 'fast' ? !!l.fastMeal : !!(l.meal1 && l.meal2));

function getPhase(now, s, fast, day) {
  const n = now.getHours() * 60 + now.getMinutes(), w = mins(s.wake), m2 = mins(s.meal2), sl = mins(s.sleep);
  const m1 = fast ? mins(fast.time) : mins(s.meal1);
  const within = (a, b) => (a <= b ? n >= a && n < b : n >= a || n < b);
  const left = t => { const d = (((t - n) % 1440) + 1440) % 1440; return `${Math.floor(d / 60)}h ${d % 60}m`; };
  if (within(m1, m1 + 60)) return { t: fast ? 'Fast day meal: eat now' : 'Meal 1: eat now', sub: fast ? 'One meal today, protein first' : day.m1, hot: true };
  if (!fast && within(m2, m2 + 60)) return { t: 'Meal 2: eat now', sub: day.m2, hot: true };
  if (within(w, m1)) return { t: fast ? 'Fast day, before your meal' : 'Before Meal 1', sub: `Meal at ${label(m1)} · ${left(m1)} to go` };
  if (!fast && within(m1 + 60, m2)) return { t: 'Between meals', sub: `Meal 2 in ${left(m2)}` };
  if (within((fast ? m1 : m2) + 60, sl)) return { t: 'Wind down', sub: `Bedtime in ${left(sl)}` };
  return { t: 'Asleep', sub: 'Rest up', dim: true };
}

const Row = ({ on, onClick, time, children }) => (
  <div className={'check' + (on ? ' on' : '')} onClick={onClick}>
    <span className="row" style={{ justifyContent: 'flex-start' }}><span className="box">{on ? '✓' : ''}</span>{children}</span>
    <span className="mut">{time}</span>
  </div>
);

// ---------- TODAY ----------
function Today({ c }) {
  const { now, sched, fast, log, patch, day, isFast } = c;
  const ph = getPhase(now, sched, fast, day);
  const n = now.getHours() * 60 + now.getMinutes(), sl = mins(sched.sleep), m2 = mins(sched.meal2);
  const m1 = isFast ? mins(fast.time) : mins(sched.meal1);
  let nudge = null;
  if (isFast) { if (n > m1 + 60 && n < sl && !log.fastMeal) nudge = 'Fast day meal not logged yet. Mark it below when you eat.'; }
  else if (n > m1 + 60 && n < m2 && !log.meal1) nudge = 'Meal 1 window passed. Did you eat? Mark it below.';
  else if (n > m2 + 60 && n < sl && !log.meal2) nudge = 'Meal 2 window passed. Did you eat? Mark it below.';
  const tog = k => patch({ [k]: !log[k], [k + 'Time']: !log[k] ? nowLabel() : '' });
  return (<>
    <div className={'card hero' + (ph.hot ? ' hot' : ph.dim ? ' dim' : '')}>
      <div className="big">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="mut">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      <div style={{ marginTop: 12, fontWeight: 600 }}>{ph.t}</div>
      <div className="mut">{ph.sub}</div>
    </div>
    {nudge && <div className="nudge">{nudge}</div>}
    <div className="card">
      <div className="seg">
        <button className={!isFast ? 'on' : ''} disabled={c.busy} onClick={c.goNormal}>Normal day</button>
        <button className={isFast ? 'on' : ''} disabled={c.busy} onClick={c.goFast}>Fast day</button>
      </div>
      <label>Fast day meal reminder at</label>
      <input type="time" value={isFast ? fast.time : c.ftime} disabled={isFast} onChange={e => c.setFtime(e.target.value)} />
      {c.msg && <div className="mut" style={{ marginTop: 8 }}>{c.msg}</div>}
    </div>
    <div className="card">
      <h2>Today's menu</h2>
      {isFast ? <div style={{ whiteSpace: 'pre-line', fontSize: 14 }}>{FAST_MENU}</div> : <>
        <div className="mut">Meal 1</div><div style={{ fontSize: 14, marginBottom: 10 }}>{day.m1}</div>
        <div className="mut">Meal 2</div><div style={{ fontSize: 14 }}>{day.m2}</div></>}
      <div className="stat" style={{ marginTop: 10 }}><span className="mut">Est. calories</span><b>{isFast ? '~1,400-1,700' : '~' + day.kcal} kcal</b></div>
      <div className="stat"><span className="mut">Est. protein</span><b style={{ color: 'var(--green)' }}>{isFast ? '~55-85' : '~' + day.protein}g</b></div>
    </div>
    <div className="card">
      <h2>Checklist</h2>
      {isFast
        ? <Row on={log.fastMeal} time={log.fastMealTime} onClick={() => tog('fastMeal')}>Fast day meal eaten</Row>
        : <><Row on={log.meal1} time={log.meal1Time} onClick={() => tog('meal1')}>Meal 1 eaten</Row>
            <Row on={log.meal2} time={log.meal2Time} onClick={() => tog('meal2')}>Meal 2 eaten</Row></>}
      <Row on={log.fruit} onClick={() => patch({ fruit: !log.fruit })}>Fruit / evening bridge snack</Row>
      <Row on={log.extraMeal} time={log.extraMealTime} onClick={() => tog('extraMeal')}>Extra meal (unplanned)</Row>
      {log.extraMeal && <input placeholder="What was it? (optional)" value={log.extraMealNote || ''} onChange={e => patch({ extraMealNote: e.target.value })} />}
    </div>
    <div className="card">
      <h2>Quick log</h2>
      <div className="mut" style={{ marginBottom: 6 }}>Water, goal 8</div>
      <div className="glasses">{[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
        <button key={i} className={'glass' + (i <= (log.water || 0) ? ' on' : '')} onClick={() => patch({ water: log.water === i ? i - 1 : i })}>💧</button>))}</div>
      <div className="grid2">
        <div><label>Steps</label><input type="number" inputMode="numeric" value={log.steps || ''} onChange={e => patch({ steps: parseInt(e.target.value) || 0 })} /></div>
        <div><label>Weight (kg)</label><input type="number" inputMode="decimal" step="0.1" value={log.weight || ''} onChange={e => patch({ weight: parseFloat(e.target.value) || 0 })} /></div>
      </div>
      <button className="full" onClick={c.sync}>Back up today to sheet</button>
      {c.synced && <div className="mut" style={{ marginTop: 6 }}>{c.synced}</div>}
    </div>
  </>);
}

// ---------- TRAIN ----------
function Train({ c }) {
  const { log, patch, logs } = c;
  const past = logs.filter(l => l.date !== today() && l.workoutDone && CYCLE.includes(l.workoutType));
  const next = past.length ? CYCLE[(CYCLE.indexOf(past[past.length - 1].workoutType) + 1) % 3] : 'chest';
  const type = log.workoutType || next, w = WORK[type];
  return (<>
    <div className="card">
      <h2>Today's session</h2>
      <div className="seg" style={{ flexWrap: 'wrap' }}>
        {[...CYCLE, 'rest'].map(t => <button key={t} className={type === t ? 'on' : ''} onClick={() => patch({ workoutType: t })}>{t === 'rest' ? 'Rest' : WORK[t][0].split(' ')[0]}</button>)}
      </div>
      <div className="tip" style={{ marginTop: 12 }}>
        {w ? <><b>{w[0]}{type === next ? ' (next in your rotation)' : ''}</b><ul>{w[1].map(x => <li key={x}>{x}</li>)}</ul></>
           : <b>Rest day. Easy walk, hit your steps and water, keep protein up.</b>}
        <div className="mut" style={{ marginTop: 8 }}>Suggestions only. Your trainer's plan comes first.</div>
      </div>
      <label>Notes from your trainer (optional)</label>
      <input value={log.workoutNote || ''} placeholder="e.g. Add weight on incline press" onChange={e => patch({ workoutNote: e.target.value })} />
      <Row on={log.workoutDone} onClick={() => patch({ workoutDone: !log.workoutDone })}>Workout completed</Row>
    </div>
  </>);
}

// ---------- PROGRESS ----------
function Progress({ c }) {
  const { logs, set, log } = c;
  const l7 = logs.slice(-7), avg = (arr, k) => (arr.length ? Math.round(arr.reduce((a, l) => a + l[k], 0) / arr.length) : 0);
  const hit = l7.filter(dayHit).length, fastN = l7.filter(l => l.dayType === 'fast').length, extraN = l7.filter(l => l.extraMeal).length;
  const wl = logs.filter(l => l.weight);
  const latest = wl.length ? wl[wl.length - 1].weight : null;
  let streak = 0; const hits = new Set(logs.filter(dayHit).map(l => l.date)); const d = new Date();
  while (hits.has(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)) { streak++; d.setDate(d.getDate() - 1); }
  let proj = null;
  if (set.goalWeight && wl.length >= 2) {
    const days = (new Date(wl[wl.length - 1].date) - new Date(wl[0].date)) / 864e5, lost = wl[0].weight - latest;
    if (days > 0 && lost > 0 && latest > set.goalWeight) { const p = new Date(); p.setDate(p.getDate() + Math.round((latest - set.goalWeight) / (lost / days))); proj = p.toLocaleDateString([], { month: 'short', day: 'numeric' }); }
  }
  const pts = wl.map(l => l.weight), mn = Math.min(...pts) - 0.5, mx = Math.max(...pts) + 0.5;
  const path = pts.map((w, i) => `${8 + i * (284 / Math.max(1, pts.length - 1))},${112 - ((w - mn) / (mx - mn)) * 104}`).join(' ');
  const ring = (v, goal, col, name) => <div className="ring" style={{ '--p': Math.min(100, (v / goal) * 100), '--c': col }}><div><b>{v}</b><br />{name}</div></div>;
  let fb = !l7.length ? 'Log a few days to see your weekly summary.' : hit / l7.length >= 0.85 ? 'Strong week. Meals are consistently on track.' : hit / l7.length >= 0.5 ? 'Decent week, a few meals slipped. Catch tomorrow\'s window early.' : 'A rough week. No need to overcorrect, just refocus on today.';
  if (extraN >= 3) fb += ` Extra meals showed up on ${extraN} days and can cancel out the deficit.`;
  if (fastN >= 5) fb += ' Lots of fast days, so keep each one protein-heavy.';
  return (<>
    <div className="card"><h2>Today</h2>
      <div className="rings">{ring(log.steps || 0, set.stepGoal, 'var(--rust)', 'steps')}{ring(log.water || 0, 8, 'var(--blue)', 'water')}</div></div>
    <div className="card"><h2>This week</h2>
      <div className="stat"><span className="mut">Days on plan</span><b>{hit}/{l7.length}</b></div>
      <div className="stat"><span className="mut">Avg steps</span><b>{avg(l7.filter(l => l.steps), 'steps').toLocaleString()}</b></div>
      <div className="stat"><span className="mut">Workouts</span><b>{l7.filter(l => l.workoutDone).length}</b></div>
      <div className="stat"><span className="mut">Fast days</span><b>{fastN}</b></div>
      <div className="stat"><span className="mut">Extra meals</span><b style={{ color: 'var(--rust)' }}>{extraN}</b></div>
      <div className="tip" style={{ marginTop: 10 }}>{fb}</div></div>
    <div className="card"><h2>Weight</h2>
      <div className="stat"><span className="mut">Start</span><b>{set.startWeight} kg</b></div>
      <div className="stat"><span className="mut">Latest</span><b>{latest ? latest + ' kg' : '-'}</b></div>
      <div className="stat"><span className="mut">Lost so far</span><b style={{ color: 'var(--green)' }}>{latest ? (set.startWeight - latest).toFixed(1) + ' kg' : '-'}</b></div>
      <div className="stat"><span className="mut">Streak</span><b>{streak}d</b></div>
      {proj && <div className="stat"><span className="mut">Projected goal date</span><b style={{ color: 'var(--blue)' }}>{proj}</b></div>}
      {pts.length > 1 ? <svg viewBox="0 0 300 120" style={{ width: '100%', marginTop: 10 }}><polyline points={path} fill="none" stroke="#3F5D45" strokeWidth="2.5" strokeLinejoin="round" /></svg>
        : <div className="mut" style={{ marginTop: 10 }}>Log your weight on a few days to see the trend.</div>}</div>
  </>);
}

// ---------- MORE ----------
function More({ c }) {
  const { sched, setSched, set, setSet, logs } = c;
  const t = (k, l) => <div key={k}><label>{l}</label><input type="time" value={sched[k]} onChange={e => setSched({ ...sched, [k]: e.target.value })} /></div>;
  const exportCsv = () => {
    const H = ['date', 'weight', 'steps', 'water', 'meal1', 'meal1Time', 'meal2', 'meal2Time', 'fruit', 'workoutDone', 'workoutNote', 'dayType', 'fastMeal', 'fastMealTime', 'workoutType', 'extraMeal', 'extraMealTime', 'extraMealNote'];
    const rows = [H.join(',')].concat(logs.map(l => H.map(h => { let v = l[h]; if (v == null) v = ''; if (typeof v === 'boolean') v = v ? 'Yes' : 'No'; return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })); a.download = 'dashboard-history.csv'; a.click();
  };
  return (<>
    <div className="card"><h2>Schedule</h2><div className="grid2">{t('wake', 'Wake')}{t('sleep', 'Bedtime')}{t('meal1', 'Meal 1')}{t('meal2', 'Meal 2')}</div></div>
    <div className="card"><h2>Goals</h2><div className="grid2">
      <div><label>Start weight (kg)</label><input type="number" step="0.1" value={set.startWeight} onChange={e => setSet({ ...set, startWeight: parseFloat(e.target.value) || 0 })} /></div>
      <div><label>Goal weight (kg)</label><input type="number" step="0.1" value={set.goalWeight || ''} onChange={e => setSet({ ...set, goalWeight: parseFloat(e.target.value) || null })} /></div>
      <div><label>Daily step goal</label><input type="number" step="500" value={set.stepGoal} onChange={e => setSet({ ...set, stepGoal: parseInt(e.target.value) || 5000 })} /></div></div></div>
    <div className="card"><h2>History</h2>
      <table><thead><tr><th>Date</th><th>Wt</th><th>Steps</th><th>Water</th><th>Plan</th></tr></thead><tbody>
        {logs.slice(-10).reverse().map(l => <tr key={l.date}><td>{l.date.slice(5)}</td><td>{l.weight || '-'}</td><td>{l.steps || '-'}</td><td>{l.water ?? '-'}</td><td>{dayHit(l) ? '✓' : '·'}{l.dayType === 'fast' ? ' F' : ''}{l.extraMeal ? ' +' : ''}</td></tr>)}
      </tbody></table>
      <button className="ghost full" onClick={exportCsv}>Export full history (.csv)</button></div>
  </>);
}

// ---------- APP ----------
export default function App() {
  const [tab, setTab] = useState('today');
  const [now, setNow] = useState(new Date());
  const [sched, setSched] = useState(() => ls.get('schedule') || { wake: '05:30', meal1: '11:30', meal2: '18:00', sleep: '22:00' });
  const [set, setSet] = useState(() => ls.get('settings') || { startWeight: 95, startDate: today(), stepGoal: 5000, goalWeight: null });
  const [fast, setFast] = useState(() => ls.get('fastday:' + today()));
  const [log, setLog] = useState(() => ls.get('log:' + today()) || { date: today() });
  const [ftime, setFtime] = useState(() => ls.get('fastDefaultTime') || '13:45');
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [synced, setSynced] = useState('');

  useEffect(() => { const i = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(i); }, []);
  useEffect(() => ls.set('schedule', sched), [sched]);
  useEffect(() => ls.set('settings', set), [set]);

  const save = fn => setLog(l => { const n = fn(l); ls.set('log:' + today(), n); return n; });
  const patch = p => save(l => ({ ...l, ...p, dayType: fast ? 'fast' : 'normal' }));
  const logs = useMemo(() => ls.logs(), [log]);

  const goFast = async () => {
    if (fast) return; setBusy(true);
    const iso = `${today()}T${ftime}:00${TZ}`; let id = null, m = 'Fast day on.';
    if (new Date(iso) < new Date()) m = 'Fast day on. That time has passed, so no reminder was set.';
    else { try { id = (await post('/api/schedule-reminder', { start: iso })).id; m = `Fast day on. Reminder set for ${ftime}.`; } catch (e) { m = 'Fast day on, but the reminder failed: ' + e.message; } }
    const f = { time: ftime, eventId: id }; ls.set('fastday:' + today(), f); ls.set('fastDefaultTime', ftime);
    setFast(f); save(l => ({ ...l, dayType: 'fast' })); setMsg(m); setBusy(false);
  };
  const goNormal = async () => {
    if (!fast) return; setBusy(true);
    if (fast.eventId) { try { await post('/api/cancel-reminder', { id: fast.eventId }); } catch (e) { setMsg('Could not remove the reminder, try again: ' + e.message); setBusy(false); return; } }
    ls.del('fastday:' + today()); setFast(null); save(l => ({ ...l, dayType: 'normal' })); setMsg(''); setBusy(false);
  };
  const sync = () => { backup({ ...log, dayType: fast ? 'fast' : 'normal' }); setSynced('Backed up.'); setTimeout(() => setSynced(''), 2500); };

  const c = { now, sched, setSched, set, setSet, fast, isFast: !!fast, log, patch, logs, day: MENU[now.getDay()], busy, msg, ftime, setFtime, goFast, goNormal, sync, synced };
  const tabs = [['today', '◷', 'Today'], ['train', '◆', 'Train'], ['progress', '▲', 'Progress'], ['more', '≡', 'More']];
  return (<>
    <div className="app">
      <h1>{{ today: 'Today', train: 'Train', progress: 'Progress', more: 'More' }[tab]}</h1>
      {tab === 'today' && <Today c={c} />}{tab === 'train' && <Train c={c} />}
      {tab === 'progress' && <Progress c={c} />}{tab === 'more' && <More c={c} />}
    </div>
    <nav><div>{tabs.map(([k, i, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><span>{i}</span>{n}</button>)}</div></nav>
  </>);
}
