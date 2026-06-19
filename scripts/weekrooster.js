import { db, auth } from "./firebase.js";
import {
  doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

// ── Constants ──────────────────────────────────────────────────────────────

const SECTIONS = {
  bediening: { label: 'Bediening', color: '#7288ae' },
  keuken:    { label: 'Keuken',    color: '#4b5694' },
};
const SECTION_ORDER = ['bediening', 'keuken'];

const EMPLOYEES = [
  { id: 'sanne',  name: 'Sanne',  section: 'bediening', rate: 16 },
  { id: 'daan',   name: 'Daan',   section: 'bediening', rate: 14.5 },
  { id: 'lotte',  name: 'Lotte',  section: 'bediening', rate: 15 },
  { id: 'sophie', name: 'Sophie', section: 'bediening', rate: 14 },
  { id: 'marco',  name: 'Marco',  section: 'keuken',    rate: 22, badge: 'Chef' },
  { id: 'emma',   name: 'Emma',   section: 'keuken',    rate: 17 },
  { id: 'noa',    name: 'Noa',    section: 'keuken',    rate: 16.5 },
];

const REQUESTS = [
  { name: 'Lotte',  initials: 'L', detail: 'Verlof · Wo 18 jun',           status: 'Goedgekeurd',  ok: true,  section: 'bediening' },
  { name: 'Emma',   initials: 'E', detail: 'Vrij gevraagd · Za 21 jun',    status: 'In afwachting', ok: false, section: 'keuken' },
  { name: 'Sophie', initials: 'S', detail: 'Niet beschikbaar · Zo 22 jun', status: 'Goedgekeurd',  ok: true,  section: 'bediening' },
  { name: 'Daan',   initials: 'D', detail: 'Verlofaanvraag · Vr 27 jun',   status: 'In afwachting', ok: false, section: 'bediening' },
];

const UNAVAIL = new Set(['lotte-2', 'emma-5', 'sophie-6']);

const DAY_NAMES = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

// ── State ──────────────────────────────────────────────────────────────────

let weekOffset = 0;
let dragId = null;
let shifts = [];
let dirty = false;

// ── Helpers ────────────────────────────────────────────────────────────────

function getMonday(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1 + offset * 7);
  return d;
}

function getDays(offset = 0) {
  const mon = getMonday(offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return { i, label: DAY_NAMES[i], date: d.getDate(), month: MONTHS[d.getMonth()], closed: i === 0 };
  });
}

function weekKey(offset = 0) {
  const mon = getMonday(offset);
  const y = mon.getFullYear();
  // ISO week number
  const tmp = new Date(Date.UTC(mon.getFullYear(), mon.getMonth(), mon.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const wn = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return `${y}-W${String(wn).padStart(2, '0')}`;
}

function dateKey(dayObj, offset = 0) {
  const mon = getMonday(offset);
  const d = new Date(mon);
  d.setDate(mon.getDate() + dayObj.i);
  return d.toISOString().slice(0, 10);
}

function hrs(start, end) {
  const [ah, am] = start.split(':').map(Number);
  const [bh, bm] = end.split(':').map(Number);
  return (bh * 60 + bm - (ah * 60 + am)) / 60;
}

function fmtH(h) {
  const r = Math.round(h * 10) / 10;
  return (Number.isInteger(r) ? r : String(r).replace('.', ',')) + ' u';
}

function money(n) {
  return '€' + Math.round(n).toLocaleString('nl-NL');
}

function tint(hex) { return hex + '24'; }

function buildDefaultShifts() {
  let sid = 0;
  const out = [];
  const add = (empId, day, section, start, end) =>
    out.push({ id: 's' + (++sid), empId, day, section, start, end });
  // Di
  add('sanne',1,'bediening','16:00','23:00'); add('daan',1,'bediening','11:00','16:30');
  add('marco',1,'keuken','15:00','23:00'); add('emma',1,'keuken','10:00','16:00'); add('noa',1,'keuken','16:00','23:00');
  // Wo (lotte verlof)
  add('sanne',2,'bediening','11:00','16:30'); add('daan',2,'bediening','16:00','23:00'); add('sophie',2,'bediening','16:00','23:00');
  add('marco',2,'keuken','15:00','23:00'); add('emma',2,'keuken','15:00','23:00');
  // Do
  add('sanne',3,'bediening','16:00','23:00'); add('lotte',3,'bediening','16:00','23:00'); add('daan',3,'bediening','11:00','16:30');
  add('marco',3,'keuken','15:00','23:00'); add('emma',3,'keuken','10:00','16:00'); add('noa',3,'keuken','16:00','23:00');
  // Vr
  add('sanne',4,'bediening','16:00','23:30'); add('lotte',4,'bediening','16:00','23:30'); add('daan',4,'bediening','16:00','23:30'); add('sophie',4,'bediening','11:00','17:00');
  add('marco',4,'keuken','15:00','23:30'); add('emma',4,'keuken','15:00','23:30'); add('noa',4,'keuken','16:00','23:30');
  // Za (emma verlof)
  add('sanne',5,'bediening','16:00','23:30'); add('lotte',5,'bediening','16:00','23:30'); add('daan',5,'bediening','11:00','16:30'); add('sophie',5,'bediening','16:00','23:30');
  add('marco',5,'keuken','15:00','23:30'); add('noa',5,'keuken','16:00','23:30');
  // Zo (sophie verlof)
  add('sanne',6,'bediening','16:00','22:30'); add('daan',6,'bediening','16:00','22:30');
  add('marco',6,'keuken','15:00','22:30'); add('emma',6,'keuken','11:00','17:00'); add('noa',6,'keuken','16:00','22:30');
  // Openstaand
  add(null,5,'keuken','15:00','23:30'); add(null,4,'bediening','16:00','23:30');
  add(null,3,'keuken','16:00','23:00'); add(null,6,'bediening','11:00','17:00');
  return out;
}

// ── Drag-and-drop ──────────────────────────────────────────────────────────

function onShiftDragStart(e, shiftId) {
  dragId = shiftId;
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', shiftId); } catch (_) {}
  setTimeout(() => document.querySelectorAll('.wr-cell, .wr-pool').forEach(el => el.classList.add('wr-dnd-active')), 0);
}

function onShiftDragEnd() {
  dragId = null;
  document.querySelectorAll('.wr-dnd-active').forEach(el => el.classList.remove('wr-dnd-active'));
  document.querySelectorAll('.wr-cell--dragover, .wr-pool--dragover').forEach(el => {
    el.classList.remove('wr-cell--dragover', 'wr-pool--dragover');
  });
}

function assignShift(empId, day) {
  if (!dragId) return;
  shifts = shifts.map(s => s.id === dragId ? { ...s, empId, day } : s);
  dirty = true;
  render();
}

function unassignShift() {
  if (!dragId) return;
  shifts = shifts.map(s => s.id === dragId ? { ...s, empId: null } : s);
  dirty = true;
  render();
}

// ── Firebase ───────────────────────────────────────────────────────────────

async function loadWeek() {
  const key = weekKey(weekOffset);
  const snap = await getDoc(doc(db, 'weekrooster', key));
  if (snap.exists() && snap.data().shifts) {
    shifts = snap.data().shifts;
  } else {
    shifts = buildDefaultShifts();
  }
  dirty = false;
  render();
}

async function saveConcept() {
  const btn = document.getElementById('wr-save-btn');
  btn.disabled = true;
  btn.textContent = 'Opslaan…';
  try {
    await setDoc(doc(db, 'weekrooster', weekKey(weekOffset)), { shifts, savedAt: new Date().toISOString() }, { merge: true });
    dirty = false;
    showToast('Concept opgeslagen ✓');
  } catch (err) {
    showToast('Fout bij opslaan: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Concept opslaan';
  }
}

async function publish() {
  const btn = document.getElementById('wr-publish-btn');
  btn.disabled = true;
  btn.textContent = 'Publiceren…';
  try {
    // Save concept first
    await setDoc(doc(db, 'weekrooster', weekKey(weekOffset)), { shifts, savedAt: new Date().toISOString(), publishedAt: new Date().toISOString() }, { merge: true });

    const days = getDays(weekOffset);
    // Build per-day rooster entries for assigned shifts
    const perDay = {};
    for (const d of days) {
      perDay[d.i] = { bediening: [], keuken: [] };
    }
    for (const sh of shifts) {
      if (sh.empId === null) continue;
      const emp = EMPLOYEES.find(e => e.id === sh.empId);
      if (!emp) continue;
      perDay[sh.day][sh.section].push({ name: emp.name, start: sh.start, end: sh.end });
    }
    // Write to rooster collection (what index.html reads)
    await Promise.all(days.map(d => {
      if (d.closed) return Promise.resolve();
      const key = dateKey(d, weekOffset);
      return setDoc(doc(db, 'rooster', key), perDay[d.i]);
    }));
    dirty = false;
    showToast('Gepubliceerd ✓ — rooster is live');
  } catch (err) {
    showToast('Fout bij publiceren: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publiceren';
  }
}

// ── Toast ──────────────────────────────────────────────────────────────────

let toastTimer;
function showToast(msg) {
  let toast = document.getElementById('wr-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'wr-toast';
    toast.className = 'wr-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

// ── Render ─────────────────────────────────────────────────────────────────

function render() {
  const days = getDays(weekOffset);
  const COLS = '170px ' + 'repeat(7, 1fr)';

  // Week label in topbar
  const mon = days[0], sun = days[6];
  document.getElementById('wr-week-label').textContent =
    `Weekrooster · Week ${weekKey(weekOffset).split('-W')[1]} · ${mon.date}–${sun.date} ${sun.month} ${getMonday(weekOffset).getFullYear()}`;

  // Stats
  const assigned = shifts.filter(s => s.empId);
  const totalHours = assigned.reduce((t, s) => t + hrs(s.start, s.end), 0);
  const totalCost  = assigned.reduce((t, s) => {
    const emp = EMPLOYEES.find(e => e.id === s.empId);
    return t + (emp ? hrs(s.start, s.end) * emp.rate : 0);
  }, 0);
  const openCount = shifts.filter(s => !s.empId).length;
  const openColor = openCount === 0 ? 'hsl(142,55%,30%)' : '#4b5694';

  const statsEl = document.getElementById('wr-stats');
  statsEl.innerHTML = `
    <div class="wr-stat"><span class="wr-stat__label">Geplande uren</span><span class="wr-stat__val">${fmtH(totalHours)}</span></div>
    <div class="wr-stat"><span class="wr-stat__label">Loonkosten week</span><span class="wr-stat__val">${money(totalCost)}</span></div>
    <div class="wr-stat"><span class="wr-stat__label">Openstaand</span><span class="wr-stat__val" style="color:${openColor}">${openCount === 0 ? 'Compleet' : openCount + ' diensten'}</span></div>
    <div class="wr-stat"><span class="wr-stat__label">Medewerkers</span><span class="wr-stat__val">${EMPLOYEES.length}</span></div>
  `;

  // Legend
  document.getElementById('wr-legend').innerHTML = SECTION_ORDER.map(k => `
    <span class="wr-legend-item">
      <span class="wr-legend-dot" style="background:${SECTIONS[k].color}"></span>
      ${SECTIONS[k].label}
    </span>
  `).join('');

  // Open pill
  const pill = document.getElementById('wr-open-pill');
  pill.textContent = openCount;
  if (openCount === 0) {
    pill.style.background = 'hsl(142,45%,92%)';
    pill.style.color = 'hsl(142,55%,28%)';
  } else {
    pill.style.background = tint('#4b5694');
    pill.style.color = '#4b5694';
  }

  // ── Grid ──
  const grid = document.getElementById('wr-grid');
  grid.innerHTML = '';
  grid.style.display = 'block';

  // Day header row
  const hdr = document.createElement('div');
  hdr.className = 'wr-day-header';
  hdr.style.gridTemplateColumns = COLS;
  hdr.style.display = 'grid';
  // Name column placeholder
  const nameCell = document.createElement('div');
  nameCell.className = 'wr-day-header-name';
  nameCell.style.cssText = 'background:#fff;border-bottom:1px solid #e6e3da;border-right:1px solid #e6e3da';
  hdr.appendChild(nameCell);
  for (const d of days) {
    const dc = document.createElement('div');
    dc.className = 'wr-day-cell' + (d.closed ? ' wr-day-cell--closed' : '');
    dc.innerHTML = `<span class="wr-day-cell__label">${d.label}</span><span class="wr-day-cell__date">${d.date} ${d.month}</span>`;
    hdr.appendChild(dc);
  }
  grid.appendChild(hdr);

  // Employee rows per section
  for (const secKey of SECTION_ORDER) {
    const sec = SECTIONS[secKey];
    const emps = EMPLOYEES.filter(e => e.section === secKey);

    // Section header
    const secRow = document.createElement('div');
    secRow.className = 'wr-section-row';
    secRow.innerHTML = `
      <span class="wr-section-dot" style="background:${sec.color}"></span>
      <span class="wr-section-label">${sec.label}</span>
      <span class="wr-section-count">${emps.length} medewerkers</span>
    `;
    grid.appendChild(secRow);

    for (const emp of emps) {
      const c = sec.color;
      const myShifts = shifts.filter(s => s.empId === emp.id);
      const totalEmpHours = myShifts.reduce((t, s) => t + hrs(s.start, s.end), 0);
      const empCost = myShifts.reduce((t, s) => t + hrs(s.start, s.end) * emp.rate, 0);

      const row = document.createElement('div');
      row.className = 'wr-emp-row';
      row.style.gridTemplateColumns = COLS;
      row.style.display = 'grid';

      // Employee info cell
      const info = document.createElement('div');
      info.className = 'wr-emp-info';
      info.innerHTML = `
        <div class="wr-emp-meta">
          <div class="wr-avatar" style="background:${tint(c)};color:${c}">${emp.name[0]}</div>
          <div class="wr-emp-names">
            <span class="wr-emp-name">${emp.name}</span>
            <span class="wr-emp-role">${emp.badge || sec.label}</span>
          </div>
        </div>
        <div class="wr-emp-hours">
          <strong>${fmtH(totalEmpHours)}</strong>
          <span>${money(empCost)}</span>
        </div>
      `;
      row.appendChild(info);

      // Day cells
      for (const d of days) {
        const closed = d.closed;
        const unavail = UNAVAIL.has(emp.id + '-' + d.i);
        const cellShifts = shifts.filter(s => s.empId === emp.id && s.day === d.i);

        const cell = document.createElement('div');
        let cls = 'wr-cell';
        if (closed) cls += ' wr-cell--closed';
        else if (unavail) cls += ' wr-cell--unavail';
        cell.className = cls;

        if (closed) {
          cell.innerHTML = '<span class="wr-cell__closed-label">Gesloten</span>';
        } else if (unavail) {
          cell.innerHTML = '<span class="wr-cell__unavail-label">Niet<br>beschikbaar</span>';
        } else {
          // Drop target
          cell.addEventListener('dragover', e => {
            e.preventDefault();
            cell.classList.add('wr-cell--dragover');
          });
          cell.addEventListener('dragleave', () => cell.classList.remove('wr-cell--dragover'));
          cell.addEventListener('drop', e => {
            e.preventDefault();
            cell.classList.remove('wr-cell--dragover');
            assignShift(emp.id, d.i);
          });

          // Shift cards
          for (const sh of cellShifts) {
            const card = document.createElement('div');
            card.className = 'wr-shift';
            card.draggable = true;
            card.style.borderLeftColor = c;
            card.innerHTML = `<span class="wr-shift__time">${sh.start}–${sh.end}</span><span class="wr-shift__role">${sec.label}</span>`;
            card.addEventListener('dragstart', e => onShiftDragStart(e, sh.id));
            card.addEventListener('dragend', onShiftDragEnd);
            cell.appendChild(card);
          }
        }
        row.appendChild(cell);
      }
      grid.appendChild(row);
    }
  }

  // ── Pool (unassigned shifts) ──
  const pool = shifts.filter(s => !s.empId).sort((a, b) => a.day - b.day);
  const poolEl = document.getElementById('wr-pool');
  poolEl.innerHTML = '';
  poolEl.addEventListener('dragover', e => { e.preventDefault(); poolEl.classList.add('wr-pool--dragover'); });
  poolEl.addEventListener('dragleave', () => poolEl.classList.remove('wr-pool--dragover'));
  poolEl.addEventListener('drop', e => { e.preventDefault(); poolEl.classList.remove('wr-pool--dragover'); unassignShift(); });

  if (pool.length === 0) {
    poolEl.innerHTML = '<span class="wr-pool-empty">Alle diensten toegewezen ✓</span>';
  } else {
    for (const sh of pool) {
      const sec = SECTIONS[sh.section];
      const d = days[sh.day];
      const card = document.createElement('div');
      card.className = 'wr-pool-card';
      card.draggable = true;
      card.style.borderLeftColor = sec.color;
      card.innerHTML = `
        <div class="wr-pool-card__top">
          <span class="wr-pool-card__time">${sh.start}–${sh.end}</span>
          <span class="wr-pool-card__tag" style="color:${sec.color};background:${tint(sec.color)}">${sec.label}</span>
        </div>
        <span class="wr-pool-card__day">${d.label} ${d.date} ${d.month}</span>
      `;
      card.addEventListener('dragstart', e => onShiftDragStart(e, sh.id));
      card.addEventListener('dragend', onShiftDragEnd);
      poolEl.appendChild(card);
    }
  }

  // ── Requests ──
  const reqList = document.getElementById('wr-requests');
  reqList.innerHTML = REQUESTS.map(r => {
    const c = SECTIONS[r.section].color;
    return `
      <li class="wr-request">
        <div class="wr-avatar" style="width:28px;height:28px;font-size:11px;background:${tint(c)};color:${c}">${r.initials}</div>
        <div class="wr-request__info">
          <span class="wr-request__name">${r.name}</span>
          <span class="wr-request__detail">${r.detail}</span>
        </div>
        <span class="wr-request__status ${r.ok ? 'wr-request__status--ok' : 'wr-request__status--pending'}">${r.status}</span>
      </li>
    `;
  }).join('');

  // ── Day overview (Variant B) ──
  renderDayView(days);
}

function renderDayView(days) {
  const staffByDay = days.map(d =>
    new Set(shifts.filter(s => s.day === d.i && s.empId).map(s => s.empId)).size
  );
  const maxStaff = Math.max(1, ...staffByDay);
  const colsEl = document.getElementById('wr-dayview-cols');
  colsEl.innerHTML = '';

  for (const d of days) {
    const col = document.createElement('div');
    col.className = 'wr-daycol';

    // Column head
    const head = document.createElement('div');
    head.className = 'wr-daycol-head' + (d.closed ? ' wr-daycol-head--closed' : '');
    if (d.closed) {
      head.innerHTML = `
        <div class="wr-daycol-top">
          <span class="wr-daycol-name">${d.label}</span>
          <span class="wr-daycol-date">${d.date} ${d.month}</span>
        </div>
        <span class="wr-daycol-closed-label">Gesloten</span>
      `;
    } else {
      const staff = staffByDay[d.i];
      const pct = Math.round((staff / maxStaff) * 100);
      head.innerHTML = `
        <div class="wr-daycol-top">
          <span class="wr-daycol-name">${d.label}</span>
          <span class="wr-daycol-date">${d.date} ${d.month}</span>
        </div>
        <div class="wr-daycol-bar-wrap">
          <div class="wr-daycol-bar-bg"><div class="wr-daycol-bar-fill" style="width:${pct}%"></div></div>
          <span class="wr-daycol-staff">${staff} in dienst</span>
        </div>
      `;
    }
    col.appendChild(head);

    if (!d.closed) {
      for (const secKey of SECTION_ORDER) {
        const sec = SECTIONS[secKey];
        const items = shifts
          .filter(s => s.day === d.i && s.section === secKey)
          .sort((a, b) => a.start.localeCompare(b.start));
        if (!items.length) continue;

        const group = document.createElement('div');
        group.className = 'wr-daycol-group';
        group.innerHTML = `
          <div class="wr-daycol-group-head">
            <span class="wr-daycol-group-dot" style="background:${sec.color}"></span>
            <span class="wr-daycol-group-label">${sec.label}</span>
          </div>
          <div class="wr-daycol-items" id="dyv-${secKey}-${d.i}"></div>
        `;
        col.appendChild(group);

        const itemsEl = group.querySelector('.wr-daycol-items');
        for (const sh of items) {
          const open = !sh.empId;
          const emp = open ? null : EMPLOYEES.find(e => e.id === sh.empId);
          const item = document.createElement('div');
          item.className = 'wr-daycol-item' + (open ? ' wr-daycol-item--open' : '');
          item.style.borderLeftColor = open ? '#4b5694' : sec.color;
          if (open) item.style.borderColor = '#4b5694';
          item.innerHTML = `
            <span class="wr-daycol-item__time">${sh.start.slice(0,5)}</span>
            <span class="wr-daycol-item__name${open ? ' wr-daycol-item__name--open' : ''}" style="${open ? 'color:#4b5694' : ''}">${open ? 'Toewijzen' : emp.name}</span>
          `;
          itemsEl.appendChild(item);
        }
      }
    }
    colsEl.appendChild(col);
  }
}

// ── Auth & init ────────────────────────────────────────────────────────────

const loginOverlay = document.getElementById('login-overlay');
const appEl = document.getElementById('app');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

onAuthStateChanged(auth, user => {
  if (user) {
    loginOverlay.hidden = true;
    appEl.hidden = false;
    init();
  } else {
    loginOverlay.hidden = false;
    appEl.hidden = true;
  }
});

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.textContent = '';
  try {
    await signInWithEmailAndPassword(auth, loginForm.email.value.trim(), loginForm.password.value);
  } catch {
    loginError.textContent = 'Verkeerd e-mailadres of wachtwoord.';
  }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

let initialized = false;
function init() {
  if (initialized) return;
  initialized = true;

  document.getElementById('wr-prev-week').addEventListener('click', () => { weekOffset--; loadWeek(); });
  document.getElementById('wr-next-week').addEventListener('click', () => { weekOffset++; loadWeek(); });
  document.getElementById('wr-save-btn').addEventListener('click', saveConcept);
  document.getElementById('wr-publish-btn').addEventListener('click', publish);

  loadWeek();
}
