import { db } from "./firebase.js";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy, getDocs, arrayUnion } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { loadUpcomingEvents } from "./events.js";

// ── Dag-weergave ──────────────────────────────────────────────────────────

const dayTitle   = document.getElementById("day-title");
const listBediening = document.getElementById("list-bediening");
const listKeuken    = document.getElementById("list-keuken");
const emptyState = document.getElementById("empty-state");
const rosterEl   = document.getElementById("roster");
const prevBtn    = document.getElementById("prev-day");
const nextBtn    = document.getElementById("next-day");

let currentDate = new Date();
currentDate.setHours(0, 0, 0, 0);

const DAYS   = ["zondag","maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag"];
const MONTHS = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];

function toDateKey(date) { return date.toISOString().slice(0, 10); }

function formatTitle(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff  = (date - today) / 86400000;
  const name  = diff === 0 ? "Vandaag" : diff === 1 ? "Morgen" : diff === -1 ? "Gisteren" : DAYS[date.getDay()];
  return `${name} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function renderCards(list, names) {
  list.innerHTML = "";
  if (!names || !names.length) {
    const li = document.createElement("li");
    li.className = "card card--empty";
    li.textContent = "Niemand";
    list.appendChild(li);
    return 0;
  }
  names.forEach(entry => {
    const li = document.createElement("li");
    li.className = "card";
    li.innerHTML = `<span class="card__name">${entry.name}</span><span class="card__time">${entry.start}–${entry.end}</span>`;
    list.appendChild(li);
  });
  return names.length;
}

async function loadDay(date) {
  dayTitle.textContent = formatTitle(date);
  rosterEl.hidden      = false;
  emptyState.hidden    = true;
  listBediening.innerHTML = '<li class="card card--loading"></li>';
  listKeuken.innerHTML    = '<li class="card card--loading"></li>';

  try {
    const snap = await getDoc(doc(db, "rooster", toDateKey(date)));
    const data = snap.exists() ? snap.data() : {};
    const countB = renderCards(listBediening, data.bediening);
    const countK = renderCards(listKeuken, data.keuken);
    const hasShifts = countB + countK > 0;
    rosterEl.hidden  = !hasShifts;
    emptyState.hidden = hasShifts;
  } catch (err) {
    rosterEl.hidden   = true;
    emptyState.textContent = `Fout bij laden: ${err.message}`;
    emptyState.hidden = false;
  }
}

prevBtn.addEventListener("click", () => { currentDate.setDate(currentDate.getDate() - 1); loadDay(currentDate); });
nextBtn.addEventListener("click", () => { currentDate.setDate(currentDate.getDate() + 1); loadDay(currentDate); });

loadDay(currentDate);

// ── Mijn rooster ──────────────────────────────────────────────────────────

const DAY_FULL_PUB = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];

let pubFuncties    = [];
let pubWeekData    = [];
let pubAllNames    = [];
let pubActiveNaam  = '';
let pubWeekOffset  = 0;

const myNameInput   = document.getElementById('my-name');
const mijnPrevBtn   = document.getElementById('mijn-prev-week');
const mijnNextBtn   = document.getElementById('mijn-next-week');
const mijnWeekLabel = document.getElementById('mijn-week-label');
const mijnWeekBadge = document.getElementById('mijn-week-badge');

function getMonday(offset = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1 + offset * 7);
  return d;
}

function toLocalKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function weekNum(offset) {
  const mon = getMonday(offset);
  const tmp = new Date(Date.UTC(mon.getFullYear(), mon.getMonth(), mon.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const y = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp - y) / 86400000) + 1) / 7);
}

function pubCalcH(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}
function pubFmtH(h) {
  const r = Math.round(h * 10) / 10;
  return (Number.isInteger(r) ? r : r.toString().replace('.', ',')) + ' u';
}

function updatePubWeekLabel() {
  const monday = getMonday(pubWeekOffset);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  mijnWeekLabel.textContent = `${monday.getDate()} ${MONTHS[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;
  const badge = pubWeekOffset === 0 ? 'Deze week' : pubWeekOffset === 1 ? 'Volgende week' : '';
  mijnWeekBadge.textContent = badge;
  mijnWeekBadge.hidden = !badge;
  mijnPrevBtn.disabled = pubWeekOffset === 0;
}

async function loadPubMijnData() {
  updatePubWeekLabel();
  const monday = getMonday(pubWeekOffset);
  const dates  = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  const snaps  = await Promise.all(dates.map(d => getDoc(doc(db, 'rooster', toDateKey(d)))));
  pubWeekData  = snaps.map(s => s.exists() ? s.data() : {});

  const nameSet = new Set();
  for (const day of pubWeekData)
    for (const [key, val] of Object.entries(day))
      if (Array.isArray(val)) val.forEach(e => e?.name && nameSet.add(e.name));
  pubAllNames = [...nameSet].sort();
  renderPubChips(pubAllNames);
  if (pubActiveNaam) renderPubResult(pubActiveNaam);
}

function renderPubChips(names) {
  const container = document.getElementById('mijn-chips');
  if (!container) return;
  container.innerHTML = '';
  names.forEach(naam => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mijn-chip' + (naam === pubActiveNaam ? ' mijn-chip--active' : '');
    btn.innerHTML = `<span class="mijn-chip__dot"></span>${naam}`;
    btn.addEventListener('click', () => {
      pubActiveNaam = naam;
      myNameInput.value = naam;
      renderPubChips(pubAllNames);
      renderPubResult(naam);
    });
    container.appendChild(btn);
  });
}

function renderPubResult(naam) {
  const result = document.getElementById('mijn-result');
  if (!result || !naam) { if (result) result.innerHTML = ''; return; }

  const SECTIONS_MAP = Object.fromEntries(pubFuncties.map(f => [f.id, f]));
  const monday = getMonday(pubWeekOffset);
  let totalH = 0, shiftCount = 0;

  const rows = pubWeekData.map((dayData, i) => {
    const date = new Date(monday); date.setDate(monday.getDate() + i);
    const dateStr = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
    const shifts = [];
    for (const [key, val] of Object.entries(dayData)) {
      if (!Array.isArray(val)) continue;
      val.forEach(e => {
        if (e.name.toLowerCase() === naam.toLowerCase()) {
          const h = pubCalcH(e.start, e.end);
          shifts.push({ ...e, functie: key, h });
          totalH += h; shiftCount++;
        }
      });
    }
    return { day: DAY_FULL_PUB[i], dateStr, shifts };
  });

  const wn     = weekNum(pubWeekOffset);
  const sun    = new Date(monday); sun.setDate(monday.getDate() + 6);
  const weekLbl = `Week ${wn} · ${monday.getDate()}–${sun.getDate()} ${MONTHS[sun.getMonth()]}`;
  const functies = [...new Set(rows.flatMap(r => r.shifts.map(s => SECTIONS_MAP[s.functie]?.label || s.functie)))];
  const initial  = naam.charAt(0).toUpperCase();

  const dayRows = rows.map(({ day, dateStr, shifts }) => {
    if (!shifts.length) return `
      <li class="mijn-day">
        <div class="mijn-day__label"><strong>${day}</strong><span>${dateStr}</span></div>
        <div class="mijn-day__free">Vrij</div>
      </li>`;
    return shifts.map(s => `
      <li class="mijn-day">
        <div class="mijn-day__label"><strong>${day}</strong><span>${dateStr}</span></div>
        <div class="mijn-day__shift">
          <span class="mijn-day__bar" style="background:${SECTIONS_MAP[s.functie]?.color || '#7288ae'}"></span>
          <span class="mijn-day__time">${s.start}–${s.end}</span>
          <span class="mijn-day__pill">${SECTIONS_MAP[s.functie]?.label || s.functie}</span>
        </div>
        <div class="mijn-day__hours">${pubFmtH(s.h)}</div>
      </li>`).join('');
  }).join('');

  result.innerHTML = `
    <div class="mijn-card">
      <div class="mijn-card__top">
        <div class="mijn-card__avatar">${initial}</div>
        <div class="mijn-card__info">
          <strong class="mijn-card__name">${naam}</strong>
          <div class="mijn-card__meta">${functies.join(', ')} · ${weekLbl}</div>
        </div>
        <div class="mijn-card__totals">
          <div class="mijn-card__hours">${pubFmtH(totalH)}</div>
          <div class="mijn-card__count">${shiftCount} ${shiftCount === 1 ? 'DIENST' : 'DIENSTEN'}</div>
        </div>
      </div>
      <ul class="mijn-days">${dayRows}</ul>
    </div>`;
}

mijnPrevBtn.addEventListener('click', () => { if (pubWeekOffset > 0) { pubWeekOffset--; loadPubMijnData(); } });
mijnNextBtn.addEventListener('click', () => { pubWeekOffset++; loadPubMijnData(); });

myNameInput.addEventListener('input', () => {
  const q = myNameInput.value.trim();
  if (!q) { pubActiveNaam = ''; renderPubChips(pubAllNames); document.getElementById('mijn-result').innerHTML = ''; return; }
  const filtered = pubAllNames.filter(n => n.toLowerCase().includes(q.toLowerCase()));
  renderPubChips(filtered);
  const exact = filtered.find(n => n.toLowerCase() === q.toLowerCase()) || (filtered.length === 1 ? filtered[0] : null);
  if (exact) { pubActiveNaam = exact; renderPubResult(exact); }
});

// ── Open diensten ─────────────────────────────────────────────────────────

const DAYS_SHORT_PUB = ['zo','ma','di','wo','do','vr','za'];

let openShifts   = [];
let openFilter   = 'alle';
let openFuncties = {};

function calcOpenH(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const h = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
  const r = Math.round(h * 10) / 10;
  return (Number.isInteger(r) ? r : r.toString().replace('.', ',')) + ' uur';
}

async function loadOpenDiensten() {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const snap = await getDocs(query(
    collection(db, 'open-diensten'),
    where('datum', '>=', todayStr),
    orderBy('datum')
  ));
  openShifts = [];
  snap.forEach(s => openShifts.push({ id: s.id, ...s.data() }));
  renderOpenDiensten();
}

function renderOpenDiensten() {
  const countEl = document.getElementById('open-count');
  const filterEl = document.getElementById('open-filter');
  const listEl  = document.getElementById('open-list');
  if (!listEl) return;

  // Count per functie
  const counts = { alle: openShifts.length };
  openShifts.forEach(s => { counts[s.functie] = (counts[s.functie] || 0) + 1; });

  if (countEl) countEl.textContent = `${openShifts.length} open dienst${openShifts.length !== 1 ? 'en' : ''}`;

  // Filter bar
  if (filterEl) {
    const filters = [{ key: 'alle', label: 'Alle', count: openShifts.length }];
    Object.entries(counts).forEach(([key, n]) => {
      if (key !== 'alle') filters.push({ key, label: openFuncties[key]?.label || key, count: n, color: openFuncties[key]?.color });
    });
    filterEl.innerHTML = `<span class="open-filter__label">Filter</span>` + filters.map(f => `
      <button class="open-filter__btn${openFilter === f.key ? ' open-filter__btn--active' : ''}" data-key="${f.key}">
        ${f.color ? `<span class="open-filter__dot" style="background:${f.color}"></span>` : ''}
        ${f.label} <span class="open-filter__count">${f.count}</span>
      </button>`).join('');
    filterEl.querySelectorAll('.open-filter__btn').forEach(btn => {
      btn.addEventListener('click', () => { openFilter = btn.dataset.key; renderOpenDiensten(); });
    });
  }

  // Shift list
  const visible = openFilter === 'alle' ? openShifts : openShifts.filter(s => s.functie === openFilter);
  listEl.innerHTML = '';

  if (!visible.length) {
    listEl.innerHTML = '<li class="open-item open-item--empty">Geen open diensten beschikbaar.</li>';
    return;
  }

  visible.forEach(shift => {
    const d   = new Date(shift.datum + 'T00:00:00');
    const day = DAYS_SHORT_PUB[d.getDay()].toUpperCase();
    const color = openFuncties[shift.functie]?.color || '#7288ae';
    const label = openFuncties[shift.functie]?.label || shift.functie;
    const li = document.createElement('li');
    li.className = 'open-item';
    li.innerHTML = `
      <div class="open-item__bar" style="background:${color}"></div>
      <div class="open-item__date">
        <span class="open-item__day">${day}</span>
        <span class="open-item__num">${d.getDate()}</span>
        <span class="open-item__month">${MONTHS[d.getMonth()]}</span>
      </div>
      <div class="open-item__body">
        <div class="open-item__top">
          <span class="open-item__time">${shift.start}–${shift.end}</span>
          <span class="open-item__functie">${label}</span>
          ${shift.urgent ? '<span class="open-item__urgent">URGENT</span>' : ''}
        </div>
        <div class="open-item__meta">
          <span>⏱ ${calcOpenH(shift.start, shift.end)}</span>
          ${shift.beschrijving ? `<span>📍 ${shift.beschrijving}</span>` : ''}
        </div>
      </div>
      <button class="open-item__btn" data-id="${shift.id}">Oppakken</button>
    `;
    li.querySelector('.open-item__btn').addEventListener('click', () => openOppakken(shift));
    listEl.appendChild(li);
  });
}

function openOppakken(shift) {
  document.getElementById('oppakken-modal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'oppakken-modal';
  overlay.className = 'wr-modal-overlay';
  overlay.innerHTML = `
    <div class="wr-modal">
      <div class="wr-modal__header">
        <div class="wr-modal__title">Dienst oppakken</div>
        <div class="wr-modal__sub">${shift.start}–${shift.end} · ${openFuncties[shift.functie]?.label || shift.functie}</div>
      </div>
      <div class="wr-modal__body">
        <div class="wr-modal__row">
          <label class="wr-modal__label">Naam</label>
          <input class="wr-modal__input" id="oppakken-naam" type="text" placeholder="Jouw naam" autocomplete="off" />
        </div>
        <p class="wr-modal__error" id="oppakken-error"></p>
      </div>
      <div class="wr-modal__footer">
        <button class="wr-modal__save" id="oppakken-confirm">Bevestigen</button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
  });

  overlay.querySelector('#oppakken-confirm').addEventListener('click', async () => {
    const naam = document.getElementById('oppakken-naam').value.trim();
    if (!naam) { document.getElementById('oppakken-error').textContent = 'Vul je naam in.'; return; }
    const btn = overlay.querySelector('#oppakken-confirm');
    btn.disabled = true; btn.textContent = 'Bezig…';
    try {
      const ref  = doc(db, 'rooster', shift.datum);
      const snap = await getDoc(ref);
      const entry = { name: naam, start: shift.start, end: shift.end };
      if (snap.exists()) {
        await updateDoc(ref, { [shift.functie]: arrayUnion(entry) });
      } else {
        await setDoc(ref, { [shift.functie]: [entry] });
      }
      await deleteDoc(doc(db, 'open-diensten', shift.id));
      overlay.remove();
      openShifts = openShifts.filter(s => s.id !== shift.id);
      renderOpenDiensten();
    } catch {
      document.getElementById('oppakken-error').textContent = 'Er ging iets mis. Probeer opnieuw.';
      btn.disabled = false; btn.textContent = 'Bevestigen';
    }
  });

  document.body.appendChild(overlay);
  document.getElementById('oppakken-naam').focus();
}

// Init: load functies, then open diensten + mijn data
getDocs(query(collection(db, 'functies'), orderBy('volgorde'))).then(snap => {
  if (snap.empty) {
    pubFuncties = [
      { id: 'bediening', label: 'Bediening', color: '#7288ae' },
      { id: 'keuken',    label: 'Keuken',    color: '#4b5694' },
    ];
  } else {
    snap.forEach(s => pubFuncties.push({ id: s.id, ...s.data() }));
  }
  openFuncties = Object.fromEntries(pubFuncties.map(f => [f.id, f]));
  loadPubMijnData();
  loadOpenDiensten();
});
