import { db, auth } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion,
  collection, query, where, orderBy, getDocs,
  addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { loadUpcomingEvents, addEvent } from "./events.js";

// ── Rooster constants ──────────────────────────────────────────────────────

let SECTIONS = {};
let SECTION_ORDER = [];
const DAY_NAMES = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

const FUNCTIES_DEFAULTS = [
  { key: 'bediening',   label: 'Bediening',   color: '#7288ae', volgorde: 0 },
  { key: 'keuken',      label: 'Keuken',      color: '#4b5694', volgorde: 1 },
  { key: 'spoelkeuken', label: 'Spoelkeuken', color: '#7a9e7e', volgorde: 2 },
];

async function loadFuncties() {
  const snap = await getDocs(query(collection(db, 'functies'), orderBy('volgorde')));
  if (snap.empty) {
    await Promise.all(
      FUNCTIES_DEFAULTS.map(({ key, ...data }) => setDoc(doc(db, 'functies', key), data))
    );
    SECTIONS = Object.fromEntries(FUNCTIES_DEFAULTS.map(({ key, label, color }) => [key, { label, color }]));
    SECTION_ORDER = FUNCTIES_DEFAULTS.map(d => d.key);
  } else {
    SECTIONS = {};
    SECTION_ORDER = [];
    snap.forEach(s => {
      SECTIONS[s.id] = { label: s.data().label, color: s.data().color };
      SECTION_ORDER.push(s.id);
    });
  }
}

function shiftHrs(start, end) {
  const [ah, am] = start.split(':').map(Number);
  const [bh, bm] = end.split(':').map(Number);
  return (bh * 60 + bm - (ah * 60 + am)) / 60;
}
function fmtH(h) {
  const r = Math.round(h * 10) / 10;
  return (Number.isInteger(r) ? r : String(r).replace('.', ',')) + ' u';
}
function money(n) { return '€' + Math.round(n).toLocaleString('nl-NL'); }
function tint(hex) { return hex + '24'; }

const loginOverlay = document.getElementById("login-overlay");
const siteHeader = document.getElementById("site-header");
const mainEl = document.getElementById("main");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

onAuthStateChanged(auth, user => {
  if (user) {
    loginOverlay.hidden = true;
    siteHeader.hidden = false;
    mainEl.hidden = false;
    initDashboard();
  } else {
    loginOverlay.hidden = false;
    siteHeader.hidden = true;
    mainEl.hidden = true;
  }
});

loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  loginError.textContent = "";
  const email = loginForm.email.value.trim();
  const password = loginForm.password.value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = "Verkeerd e-mailadres of wachtwoord.";
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

let dashboardInitialized = false;
async function initDashboard() {
  if (dashboardInitialized) return;
  dashboardInitialized = true;

  await loadFuncties();

let dragSrc = null; // { dayKey, secKey, entry }

const weekGrid = document.getElementById("week-grid");
const weekLabel = document.getElementById("week-label");
const prevWeekBtn = document.getElementById("prev-week");
const myNameInput = document.getElementById("my-name");
const myShiftsList = document.getElementById("my-shifts");
const nextWeekBtn = document.getElementById("next-week");

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const DAYS_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];

let weekOffset = 0;

function getMonday(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1 + offset * 7);
  return d;
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatShort(date) {
  return `${DAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function weekKey(offset = 0) {
  const mon = getMonday(offset);
  const tmp = new Date(Date.UTC(mon.getFullYear(), mon.getMonth(), mon.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const wn = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return `${mon.getFullYear()}-W${String(wn).padStart(2, '0')}`;
}

async function loadWeek() {
  const monday = getMonday(weekOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const wn = weekKey(weekOffset).split('-W')[1];
  weekLabel.textContent = `Week ${wn} · ${monday.getDate()} ${MONTHS[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;
  prevWeekBtn.disabled = weekOffset === 0;

  weekGrid.innerHTML = '<p style="padding:1.5rem;color:#aaa;font-style:italic">Laden…</p>';

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const toLocalKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const mondayKey = toLocalKey(monday);
  const sundayKey = toLocalKey(sunday);

  const [snaps, eventsSnap, verlofSnap] = await Promise.all([
    Promise.all(dates.map(d => getDoc(doc(db, 'rooster', toDateKey(d))))),
    getDocs(query(
      collection(db, 'evenementen'),
      where('datum', '>=', mondayKey),
      where('datum', '<=', sundayKey),
      orderBy('datum')
    )),
    getDocs(query(
      collection(db, 'verlof'),
      where('van', '<=', sundayKey),
      orderBy('van')
    )),
  ]);

  const eventsByDate = {};
  eventsSnap.forEach(s => {
    const { datum, titel, beschrijving } = s.data();
    if (!eventsByDate[datum]) eventsByDate[datum] = [];
    eventsByDate[datum].push({ titel, beschrijving });
  });

  const verlofRecords = [];
  verlofSnap.forEach(s => verlofRecords.push({ id: s.id, ...s.data() }));

  const verlofByDate = {};
  for (const v of verlofRecords) {
    if (v.tot < mondayKey) continue;
    for (const d of dates) {
      const key = toLocalKey(d);
      if (key >= v.van && key <= v.tot) {
        if (!verlofByDate[key]) verlofByDate[key] = [];
        verlofByDate[key].push(v.naam);
      }
    }
  }

  const roster = dates.map((d, i) => ({
    i,
    label: DAY_NAMES[i],
    date: d.getDate(),
    month: MONTHS[d.getMonth()],
    key: toDateKey(d),
    data: snaps[i].exists() ? snaps[i].data() : {},
    events: eventsByDate[toLocalKey(d)] || [],
    verlof: verlofByDate[toLocalKey(d)] || [],
  }));

  renderRosterGrid(roster);
}

function renderRosterGrid(roster) {
  weekGrid.innerHTML = '';
  weekGrid.className = 'dash-roster';
  const isTouch = window.matchMedia('(hover: none)').matches;
  const now = new Date();
  const todayLabel = `${now.getDate()} ${MONTHS[now.getMonth()]}`;

  for (const d of roster) {
    const isToday  = `${d.date} ${d.month}` === todayLabel;
    const isClosed = !!d.data.gesloten;
    const dayEl = document.createElement('div');
    dayEl.className = 'dash-day' + (isToday ? ' dash-day--today' : '') + (isClosed ? ' dash-day--closed' : '');

    const head = document.createElement('div');
    head.className = 'dash-day-head';
    head.innerHTML = `<div class="dash-day-head__text"><span class="dash-day-label">${d.label}</span><span class="dash-day-date">${d.date} ${d.month}</span></div>`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'dash-day-close-btn';
    closeBtn.textContent = isClosed ? 'Openen' : 'Sluiten';
    closeBtn.addEventListener('click', async e => {
      e.stopPropagation();
      const ref  = doc(db, 'rooster', d.key);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, { gesloten: !isClosed });
      } else {
        await setDoc(ref, { gesloten: true });
      }
      loadWeek();
    });
    head.appendChild(closeBtn);
    dayEl.appendChild(head);

    if (d.verlof.length > 0) {
      const verlofBar = document.createElement('div');
      verlofBar.className = 'dash-verlof-bar';
      verlofBar.innerHTML = d.verlof.map(n => `<span class="dash-verlof-pill">✈ ${n}</span>`).join('');
      dayEl.appendChild(verlofBar);
    }

    for (const ev of d.events) {
      const evEl = document.createElement('div');
      evEl.className = 'dash-event';
      evEl.innerHTML = `<span class="dash-event__title">${ev.titel}</span>${ev.beschrijving ? `<span class="dash-event__desc">${ev.beschrijving}</span>` : ''}`;
      dayEl.appendChild(evEl);
    }

    // Notitie
    const notitie = d.data.notitie || '';
    const noteEl = document.createElement('div');
    noteEl.className = 'dash-note' + (notitie ? '' : ' dash-note--empty');
    noteEl.textContent = notitie;
    noteEl.setAttribute('contenteditable', 'false');
    noteEl.dataset.original = notitie;
    noteEl.addEventListener('click', e => {
      e.stopPropagation();
      noteEl.setAttribute('contenteditable', 'true');
      noteEl.classList.remove('dash-note--empty');
      noteEl.focus();
      const range = document.createRange();
      range.selectNodeContents(noteEl);
      range.collapse(false);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });
    noteEl.addEventListener('blur', async () => {
      noteEl.setAttribute('contenteditable', 'false');
      const text = noteEl.textContent.trim();
      noteEl.classList.toggle('dash-note--empty', !text);
      if (text === noteEl.dataset.original) return;
      noteEl.dataset.original = text;
      const ref = doc(db, 'rooster', d.key);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, { notitie: text });
      } else if (text) {
        await setDoc(ref, { notitie: text });
      }
    });
    noteEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); noteEl.blur(); }
      if (e.key === 'Escape') { noteEl.textContent = noteEl.dataset.original; noteEl.blur(); }
    });
    dayEl.appendChild(noteEl);

    if (isClosed) {
      const closedEl = document.createElement('div');
      closedEl.className = 'dash-closed';
      closedEl.textContent = 'Gesloten';
      dayEl.appendChild(closedEl);
      weekGrid.appendChild(dayEl);
      continue;
    }

    for (const secKey of SECTION_ORDER) {
      const sec = SECTIONS[secKey];
      const entries = d.data[secKey] || [];

      const secBar = document.createElement('div');
      secBar.className = 'dash-sec-bar';
      secBar.innerHTML = `<span class="dash-sec-dot" style="background:${sec.color}"></span>${sec.label}`;
      dayEl.appendChild(secBar);

      const cell = document.createElement('div');
      cell.className = 'dash-cell';

      for (const entry of entries) {
        const card = document.createElement('div');
        card.className = 'dash-shift';
        card.style.borderLeftColor = sec.color;
        card.setAttribute('draggable', 'true');
        card.innerHTML = `
          <span class="dash-shift__time">${entry.start}–${entry.end}</span>
          <span class="dash-shift__name">${entry.name}</span>
        `;
        card.addEventListener(isTouch ? 'click' : 'dblclick', e => {
          e.stopPropagation();
          openEditShiftModal(d, secKey, entry);
        });
        card.addEventListener('dragstart', e => {
          dragSrc = { dayKey: d.key, secKey, entry };
          e.dataTransfer.effectAllowed = 'move';
          setTimeout(() => card.classList.add('dash-shift--dragging'), 0);
        });
        card.addEventListener('dragend', () => {
          card.classList.remove('dash-shift--dragging');
          dragSrc = null;
        });
        cell.appendChild(card);
      }

      const addBtn = document.createElement('button');
      addBtn.className = 'dash-cell__add';
      addBtn.textContent = '+';
      addBtn.title = 'Dienst toevoegen';
      addBtn.addEventListener('click', e => { e.stopPropagation(); openAddShiftModal(d, secKey); });
      cell.appendChild(addBtn);

      if (!isTouch) cell.addEventListener('dblclick', () => openAddShiftModal(d, secKey));

      cell.addEventListener('dragover', e => {
        if (!dragSrc) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('dash-cell--dragover');
      });
      cell.addEventListener('dragleave', e => {
        if (!cell.contains(e.relatedTarget)) cell.classList.remove('dash-cell--dragover');
      });
      cell.addEventListener('drop', async e => {
        e.preventDefault();
        cell.classList.remove('dash-cell--dragover');
        if (!dragSrc) return;
        const { dayKey: srcDayKey, secKey: srcSecKey, entry } = dragSrc;
        dragSrc = null;
        if (srcDayKey === d.key && srcSecKey === secKey) return;

        const srcRef = doc(db, 'rooster', srcDayKey);
        const srcSnap = await getDoc(srcRef);
        if (srcSnap.exists()) {
          const updated = (srcSnap.data()[srcSecKey] || []).filter(
            e2 => !(e2.name === entry.name && e2.start === entry.start && e2.end === entry.end)
          );
          await updateDoc(srcRef, { [srcSecKey]: updated });
        }

        const dstRef = doc(db, 'rooster', d.key);
        const dstSnap = await getDoc(dstRef);
        if (dstSnap.exists()) {
          await updateDoc(dstRef, { [secKey]: arrayUnion(entry) });
        } else {
          await setDoc(dstRef, { [secKey]: [entry] });
        }

        loadWeek();
      });

      dayEl.appendChild(cell);
    }

    weekGrid.appendChild(dayEl);
  }
}

async function removeShift(dayKey, secKey, entry) {
  const ref = doc(db, 'rooster', dayKey);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const updated = (snap.data()[secKey] || []).filter(
    e => !(e.name === entry.name && e.start === entry.start && e.end === entry.end)
  );
  await updateDoc(ref, { [secKey]: updated });
  loadWeek();
}

function openAddShiftModal(day, secKey) {
  document.getElementById('wr-add-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'wr-add-modal';
  overlay.className = 'wr-modal-overlay';
  overlay.innerHTML = `
    <div class="wr-modal">
      <div class="wr-modal__header">
        <div class="wr-modal__title">Dienst toevoegen</div>
        <div class="wr-modal__sub">${day.label} ${day.date} ${day.month}</div>
      </div>
      <div class="wr-modal__body">
        <div class="wr-modal__row">
          <label class="wr-modal__label">Naam</label>
          <input class="wr-modal__input" id="wr-modal-name" type="text" value=""
            autocomplete="off" placeholder="Naam medewerker" />
        </div>
        <div class="wr-modal__row">
          <label class="wr-modal__label">Functie</label>
          <div class="wr-modal__radios">
            ${SECTION_ORDER.map(key => `
              <label class="wr-modal__radio">
                <input type="radio" name="wr-functie" value="${key}" ${key === secKey ? 'checked' : ''}> ${SECTIONS[key].label}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="wr-modal__row">
          <label class="wr-modal__label">Begin</label>
          <input class="wr-modal__input" id="wr-modal-start" type="time" value="12:00" />
        </div>
        <div class="wr-modal__row">
          <label class="wr-modal__label">Einde</label>
          <input class="wr-modal__input" id="wr-modal-end" type="time" value="22:00" />
        </div>
        <p class="wr-modal__error" id="wr-modal-error"></p>
      </div>
      <div class="wr-modal__footer">
        <button class="wr-modal__save">Opslaan</button>
      </div>
    </div>
  `;

  const cancel = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { cancel(); document.removeEventListener('keydown', esc); }
  });

  overlay.querySelector('.wr-modal__save').addEventListener('click', async () => {
    const name    = document.getElementById('wr-modal-name').value.trim();
    const functie = overlay.querySelector('input[name="wr-functie"]:checked')?.value;
    const start   = document.getElementById('wr-modal-start').value;
    const end     = document.getElementById('wr-modal-end').value;
    const errEl   = document.getElementById('wr-modal-error');

    if (!name) { errEl.textContent = 'Vul een naam in.'; return; }
    if (!start || !end || start >= end) { errEl.textContent = 'Vul een geldige begin- en eindtijd in.'; return; }

    const saveBtn = overlay.querySelector('.wr-modal__save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Opslaan…';

    try {
      const entry = { name, start, end };
      const ref = doc(db, 'rooster', day.key);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, { [functie]: arrayUnion(entry) });
      } else {
        await setDoc(ref, { [functie]: [entry] });
      }
      overlay.remove();
      loadWeek();
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Opslaan';
      document.getElementById('wr-modal-error').textContent = 'Opslaan mislukt. Probeer opnieuw.';
    }
  });

  document.body.appendChild(overlay);
  document.getElementById('wr-modal-name').focus();
}

function openEditShiftModal(d, secKey, entry) {
  document.getElementById('wr-add-modal')?.remove();

  const sec = SECTIONS[secKey];

  const overlay = document.createElement('div');
  overlay.id = 'wr-add-modal';
  overlay.className = 'wr-modal-overlay';
  overlay.innerHTML = `
    <div class="wr-modal">
      <div class="wr-modal__header">
        <div class="wr-modal__title">Dienst bewerken</div>
        <div class="wr-modal__sub">${d.label} ${d.date} ${d.month}</div>
      </div>
      <div class="wr-modal__body">
        <div class="wr-modal__row">
          <label class="wr-modal__label">Naam</label>
          <input class="wr-modal__input" id="wr-modal-name" type="text" value="${entry.name}"
            autocomplete="off" />
        </div>
        <div class="wr-modal__row">
          <label class="wr-modal__label">Functie</label>
          <div class="wr-modal__radios">
            ${SECTION_ORDER.map(key => `
              <label class="wr-modal__radio">
                <input type="radio" name="wr-functie" value="${key}" ${key === secKey ? 'checked' : ''}> ${SECTIONS[key].label}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="wr-modal__row">
          <label class="wr-modal__label">Begin</label>
          <input class="wr-modal__input" id="wr-modal-start" type="time" value="${entry.start}" />
        </div>
        <div class="wr-modal__row">
          <label class="wr-modal__label">Einde</label>
          <input class="wr-modal__input" id="wr-modal-end" type="time" value="${entry.end}" />
        </div>
        <p class="wr-modal__error" id="wr-modal-error"></p>
      </div>
      <div class="wr-modal__footer">
        <button class="wr-modal__delete">Verwijderen</button>
        <button class="wr-modal__save">Opslaan</button>
      </div>
    </div>
  `;

  const cancel = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { cancel(); document.removeEventListener('keydown', esc); }
  });

  overlay.querySelector('.wr-modal__delete').addEventListener('click', async () => {
    await removeShift(d.key, secKey, entry);
    overlay.remove();
  });

  overlay.querySelector('.wr-modal__save').addEventListener('click', async () => {
    const name    = document.getElementById('wr-modal-name').value.trim();
    const functie = overlay.querySelector('input[name="wr-functie"]:checked')?.value;
    const start   = document.getElementById('wr-modal-start').value;
    const end     = document.getElementById('wr-modal-end').value;
    const errEl   = document.getElementById('wr-modal-error');

    if (!name) { errEl.textContent = 'Vul een naam in.'; return; }
    if (!start || !end || start >= end) { errEl.textContent = 'Vul een geldige begin- en eindtijd in.'; return; }

    const saveBtn = overlay.querySelector('.wr-modal__save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Opslaan…';

    try {
      const ref = doc(db, 'rooster', d.key);
      const snap = await getDoc(ref);
      const existing = snap.exists() ? (snap.data()[secKey] || []) : [];
      // Replace old entry; if section changed, remove from old and add to new
      const newFunctie = functie || secKey;
      if (newFunctie === secKey) {
        const updated = existing.map(e =>
          (e.name === entry.name && e.start === entry.start && e.end === entry.end)
            ? { name, start, end }
            : e
        );
        await updateDoc(ref, { [secKey]: updated });
      } else {
        // Moving to different section
        const fromUpdated = existing.filter(e =>
          !(e.name === entry.name && e.start === entry.start && e.end === entry.end)
        );
        const toExisting = snap.exists() ? (snap.data()[newFunctie] || []) : [];
        await updateDoc(ref, { [secKey]: fromUpdated, [newFunctie]: [...toExisting, { name, start, end }] });
      }
      overlay.remove();
      loadWeek();
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Opslaan';
      document.getElementById('wr-modal-error').textContent = 'Opslaan mislukt. Probeer opnieuw.';
    }
  });

  document.body.appendChild(overlay);
  document.getElementById('wr-modal-name').focus();
}

prevWeekBtn.addEventListener("click", () => { if (weekOffset > 0) { weekOffset--; loadWeek(); } });
nextWeekBtn.addEventListener("click", () => { weekOffset++; loadWeek(); });

// ── Evenementen ──
const eventForm = document.getElementById("event-form");
const eventFeedback = document.getElementById("event-feedback");
const dashboardEventsList = document.getElementById("dashboard-events-list");

document.getElementById("event-date").valueAsDate = new Date();

loadUpcomingEvents(dashboardEventsList, { manage: true, onLoad: n => {
  const el = document.getElementById('ev-count');
  if (el) el.textContent = `${n} evenement${n !== 1 ? 'en' : ''}`;
}});

eventForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const datum = eventForm["event-date"].value;
  const titel = eventForm["event-title"].value.trim();
  const beschrijving = eventForm["event-desc"].value.trim();

  if (!datum || !titel) {
    eventFeedback.textContent = "Vul datum en titel in.";
    return;
  }

  await addEvent({ datum, titel, beschrijving });
  eventFeedback.textContent = `✓ "${titel}" toegevoegd.`;
  eventForm["event-title"].value = "";
  eventForm["event-desc"].value = "";
  loadUpcomingEvents(dashboardEventsList, { manage: true, onLoad: n => {
  const el = document.getElementById('ev-count');
  if (el) el.textContent = `${n} evenement${n !== 1 ? 'en' : ''}`;
}});
});

// ── Mijn rooster ──────────────────────────────────────────────────────────

const DAY_FULL = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];

let mijnWeekData  = [];
let mijnAllNames  = [];
let mijnActiveNaam = '';
let mijnWeekOffset = 0;

const mijnPrevBtn   = document.getElementById('mijn-prev-week');
const mijnNextBtn   = document.getElementById('mijn-next-week');
const mijnWeekLabel = document.getElementById('mijn-week-label');
const mijnWeekBadge = document.getElementById('mijn-week-badge');

function updateMijnWeekLabel() {
  const monday = getMonday(mijnWeekOffset);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  mijnWeekLabel.textContent = `${monday.getDate()} ${MONTHS[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;
  const badge = mijnWeekOffset === 0 ? 'Deze week' : mijnWeekOffset === 1 ? 'Volgende week' : '';
  mijnWeekBadge.textContent = badge;
  mijnWeekBadge.hidden = !badge;
  mijnPrevBtn.disabled = mijnWeekOffset === 0;
}

mijnPrevBtn.addEventListener('click', () => { if (mijnWeekOffset > 0) { mijnWeekOffset--; loadMijnData(); } });
mijnNextBtn.addEventListener('click', () => { mijnWeekOffset++; loadMijnData(); });

function mijnCalcH(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}
function mijnFmtH(h) {
  const r = Math.round(h * 10) / 10;
  return (Number.isInteger(r) ? r : r.toString().replace('.', ',')) + ' u';
}

async function loadMijnData() {
  updateMijnWeekLabel();
  const monday = getMonday(mijnWeekOffset);
  const dates  = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  const snaps  = await Promise.all(dates.map(d => getDoc(doc(db, 'rooster', toDateKey(d)))));
  mijnWeekData = snaps.map(s => s.exists() ? s.data() : {});

  const nameSet = new Set();
  for (const day of mijnWeekData)
    for (const key of SECTION_ORDER)
      (day[key] || []).forEach(e => nameSet.add(e.name));
  mijnAllNames = [...nameSet].sort();
  renderMijnChips(mijnAllNames);
  if (mijnActiveNaam) renderMijnResult(mijnActiveNaam);
}

function renderMijnChips(names) {
  const container = document.getElementById('mijn-chips');
  if (!container) return;
  container.innerHTML = '';
  names.forEach(naam => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mijn-chip' + (naam === mijnActiveNaam ? ' mijn-chip--active' : '');
    btn.innerHTML = `<span class="mijn-chip__dot"></span>${naam}`;
    btn.addEventListener('click', () => {
      mijnActiveNaam = naam;
      myNameInput.value = naam;
      renderMijnChips(mijnAllNames);
      renderMijnResult(naam);
    });
    container.appendChild(btn);
  });
}

function renderMijnResult(naam) {
  const result = document.getElementById('mijn-result');
  if (!result || !naam) { if (result) result.innerHTML = ''; return; }

  const monday = getMonday(mijnWeekOffset);
  let totalH = 0, shiftCount = 0;

  const rows = mijnWeekData.map((dayData, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
    const shifts = [];
    for (const key of SECTION_ORDER) {
      (dayData[key] || []).forEach(e => {
        if (e.name.toLowerCase() === naam.toLowerCase()) {
          const h = mijnCalcH(e.start, e.end);
          shifts.push({ ...e, functie: key, h });
          totalH += h; shiftCount++;
        }
      });
    }
    return { day: DAY_FULL[i], dateStr, shifts };
  });

  const wn  = weekKey(mijnWeekOffset).split('-W')[1];
  const sun = new Date(monday); sun.setDate(monday.getDate() + 6);
  const weekLbl = `Week ${wn} · ${monday.getDate()}–${sun.getDate()} ${MONTHS[sun.getMonth()]}`;
  const functies = [...new Set(rows.flatMap(r => r.shifts.map(s => SECTIONS[s.functie]?.label || s.functie)))];
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
          <span class="mijn-day__bar" style="background:${SECTIONS[s.functie]?.color || '#7288ae'}"></span>
          <span class="mijn-day__time">${s.start}–${s.end}</span>
          <span class="mijn-day__pill">${SECTIONS[s.functie]?.label || s.functie}</span>
        </div>
        <div class="mijn-day__hours">${mijnFmtH(s.h)}</div>
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
          <div class="mijn-card__hours">${mijnFmtH(totalH)}</div>
          <div class="mijn-card__count">${shiftCount} ${shiftCount === 1 ? 'DIENST' : 'DIENSTEN'}</div>
        </div>
      </div>
      <ul class="mijn-days">${dayRows}</ul>
    </div>`;
}

myNameInput.addEventListener('input', () => {
  const q = myNameInput.value.trim();
  if (!q) {
    mijnActiveNaam = '';
    renderMijnChips(mijnAllNames);
    document.getElementById('mijn-result').innerHTML = '';
    return;
  }
  const filtered = mijnAllNames.filter(n => n.toLowerCase().includes(q.toLowerCase()));
  renderMijnChips(filtered);
  if (filtered.length === 1) {
    mijnActiveNaam = filtered[0];
    renderMijnResult(filtered[0]);
  } else if (filtered.find(n => n.toLowerCase() === q.toLowerCase())) {
    const exact = filtered.find(n => n.toLowerCase() === q.toLowerCase());
    mijnActiveNaam = exact;
    renderMijnResult(exact);
  }
});

loadMijnData();

loadWeek();

// ── Verlof ────────────────────────────────────────────────────────────────

const verlofForm     = document.getElementById('verlof-form');
const verlofFeedback = document.getElementById('verlof-feedback');
const verlofList     = document.getElementById('verlof-list');

function formatVerlofRange(van, tot) {
  const MO = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  const d1 = new Date(van + 'T00:00:00');
  const d2 = new Date(tot + 'T00:00:00');
  if (van === tot) return `${d1.getDate()} ${MO[d1.getMonth()]} ${d1.getFullYear()}`;
  const sameMonthYear = d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  const sameYear = d1.getFullYear() === d2.getFullYear();
  const from = sameMonthYear ? `${d1.getDate()}` : sameYear ? `${d1.getDate()} ${MO[d1.getMonth()]}` : `${d1.getDate()} ${MO[d1.getMonth()]} ${d1.getFullYear()}`;
  return `${from} – ${d2.getDate()} ${MO[d2.getMonth()]} ${d2.getFullYear()}`;
}

function countDays(van, tot) {
  const d1 = new Date(van + 'T00:00:00');
  const d2 = new Date(tot + 'T00:00:00');
  return Math.round((d2 - d1) / 86400000) + 1;
}

async function loadVerlofList() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const snap = await getDocs(query(
    collection(db, 'verlof'),
    where('tot', '>=', todayKey),
    orderBy('tot')
  ));
  verlofList.innerHTML = '';

  const countEl = document.getElementById('verl-count');
  if (countEl) countEl.textContent = snap.size ? `${snap.size} aanvrage${snap.size !== 1 ? 'n' : ''}` : '';

  if (snap.empty) {
    verlofList.innerHTML = '<li class="verl-item verl-item--empty">Geen actief verlof.</li>';
    return;
  }

  const records = [];
  snap.forEach(s => records.push({ id: s.id, ...s.data() }));
  records.sort((a, b) => a.van.localeCompare(b.van));

  records.forEach(s => {
    const { naam, van, tot } = s;
    const days = countDays(van, tot);
    const initial = naam.charAt(0).toUpperCase();
    const li = document.createElement('li');
    li.className = 'verl-item';
    li.innerHTML = `
      <div class="verl-item__avatar">${initial}</div>
      <div class="verl-item__body">
        <strong class="verl-item__name">${naam}</strong>
        <div class="verl-item__range">${formatVerlofRange(van, tot)}</div>
      </div>
      <span class="verl-item__days">${days} dag${days !== 1 ? 'en' : ''}</span>
      <button class="verl-item__del" aria-label="${naam} verlof verwijderen">×</button>
    `;
    li.querySelector('.verl-item__del').addEventListener('click', async () => {
      await deleteDoc(doc(db, 'verlof', s.id));
      loadVerlofList();
      loadWeek();
    });
    verlofList.appendChild(li);
  });
}

verlofForm.addEventListener('submit', async e => {
  e.preventDefault();
  const naam = document.getElementById('verlof-naam').value.trim();
  const van  = document.getElementById('verlof-van').value;
  const tot  = document.getElementById('verlof-tot').value;
  if (!naam || !van || !tot) { verlofFeedback.textContent = 'Vul alle velden in.'; return; }
  if (tot < van) { verlofFeedback.textContent = '"Tot" mag niet voor "Van" liggen.'; return; }
  await addDoc(collection(db, 'verlof'), { naam, van, tot });
  verlofFeedback.textContent = `✓ Verlof voor ${naam} toegevoegd.`;
  verlofForm.reset();
  loadVerlofList();
  loadWeek();
});

loadVerlofList();

// ── Functies beheren ──────────────────────────────────────────────────────

const functiesFeedback = document.getElementById('functies-feedback');
const functiesListEl   = document.getElementById('functies-list');

const PRESET_COLORS = ['#7288ae', '#4b5694', '#7a9e7e', '#c9963a', '#9b59b6', '#3a8a8a'];

let functieItems  = [];
let functieDragSrc = null;

function renderColorSwatches() {
  const container = document.getElementById('func-color-swatches');
  if (!container) return;
  container.innerHTML = '';
  PRESET_COLORS.forEach((color, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'func-color-swatch' + (i === 0 ? ' func-color-swatch--active' : '');
    btn.dataset.color = color;
    btn.style.background = color;
    btn.addEventListener('click', () => {
      container.querySelectorAll('.func-color-swatch').forEach(b => b.classList.remove('func-color-swatch--active'));
      btn.classList.add('func-color-swatch--active');
    });
    container.appendChild(btn);
  });
}

async function getFunctieCountsThisWeek() {
  const monday = getMonday(0);
  const dates  = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  const snaps  = await Promise.all(dates.map(d => getDoc(doc(db, 'rooster', toDateKey(d)))));
  const counts = {};
  snaps.forEach(snap => {
    if (!snap.exists()) return;
    for (const key of SECTION_ORDER) {
      counts[key] = (counts[key] || 0) + (snap.data()[key]?.length || 0);
    }
  });
  return counts;
}

async function renderFunctiesList() {
  const [snap, counts] = await Promise.all([
    getDocs(query(collection(db, 'functies'), orderBy('volgorde'))),
    getFunctieCountsThisWeek(),
  ]);
  functieItems = [];
  snap.forEach(s => functieItems.push({ id: s.id, ...s.data() }));
  renderFunctiesDOM(counts);
}

function renderFunctiesDOM(counts = {}) {
  functiesListEl.innerHTML = '';
  functieItems.forEach((item, idx) => {
    const n   = counts[item.id] || 0;
    const lbl = n === 1 ? '1 medewerker' : `${n} medewerkers`;
    const li  = document.createElement('li');
    li.className = 'func-item';
    li.setAttribute('draggable', 'true');
    li.innerHTML = `
      <span class="func-item__handle" aria-hidden="true">⠿</span>
      <span class="func-item__dot" style="background:${item.color}"></span>
      <span class="func-item__name">${item.label}</span>
      <span class="func-item__count">${lbl}</span>
      <button class="func-item__del" aria-label="${item.label} verwijderen">×</button>
    `;

    li.querySelector('.func-item__del').addEventListener('click', async () => {
      await deleteDoc(doc(db, 'functies', item.id));
      await loadFuncties();
      await renderFunctiesList();
      loadWeek();
      populateBulkFuncties();
    });

    li.addEventListener('dragstart', e => {
      functieDragSrc = idx;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => li.classList.add('func-item--dragging'), 0);
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('func-item--dragging');
      functiesListEl.querySelectorAll('.func-item--over-top, .func-item--over-bottom')
        .forEach(el => el.classList.remove('func-item--over-top', 'func-item--over-bottom'));
    });
    li.addEventListener('dragover', e => {
      if (functieDragSrc === null) return;
      e.preventDefault();
      const mid = li.getBoundingClientRect().top + li.getBoundingClientRect().height / 2;
      functiesListEl.querySelectorAll('.func-item--over-top, .func-item--over-bottom')
        .forEach(el => el.classList.remove('func-item--over-top', 'func-item--over-bottom'));
      li.classList.add(e.clientY < mid ? 'func-item--over-top' : 'func-item--over-bottom');
    });
    li.addEventListener('dragleave', e => {
      if (!li.contains(e.relatedTarget))
        li.classList.remove('func-item--over-top', 'func-item--over-bottom');
    });
    li.addEventListener('drop', async e => {
      e.preventDefault();
      const insertBefore = li.classList.contains('func-item--over-top');
      li.classList.remove('func-item--over-top', 'func-item--over-bottom');
      if (functieDragSrc === null || functieDragSrc === idx) return;

      const newOrder = [...functieItems];
      const [moved]  = newOrder.splice(functieDragSrc, 1);
      let insertAt   = idx;
      if (functieDragSrc < idx) insertAt--;
      if (!insertBefore) insertAt++;
      insertAt = Math.max(0, Math.min(newOrder.length, insertAt));
      newOrder.splice(insertAt, 0, moved);
      functieDragSrc = null;

      functieItems = newOrder;
      renderFunctiesDOM(counts);
      await Promise.all(newOrder.map((item, i) => updateDoc(doc(db, 'functies', item.id), { volgorde: i })));
      await loadFuncties();
      loadWeek();
      populateBulkFuncties();
    });

    functiesListEl.appendChild(li);
  });
}

document.getElementById('functie-add-btn').addEventListener('click', async () => {
  const label      = document.getElementById('functie-label').value.trim();
  const activeColor = document.querySelector('.func-color-swatch--active');
  const color      = activeColor?.dataset.color || PRESET_COLORS[0];
  if (!label) { functiesFeedback.textContent = 'Vul een naam in.'; return; }
  const key  = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const snap = await getDocs(query(collection(db, 'functies'), orderBy('volgorde')));
  await setDoc(doc(db, 'functies', key), { label, color, volgorde: snap.size });
  functiesFeedback.textContent = `✓ "${label}" toegevoegd.`;
  document.getElementById('functie-label').value = '';
  await loadFuncties();
  await renderFunctiesList();
  loadWeek();
  populateBulkFuncties();
});

renderColorSwatches();
renderFunctiesList();

// ── Dienst voor meerdere dagen ────────────────────────────────────────────

let bulkWeekOffset = 0;
const bulkWeekLabel  = document.getElementById('bulk-week-label');
const bulkWeekBadge  = document.getElementById('bulk-week-badge');
const bulkPrevBtn    = document.getElementById('bulk-prev-week');
const bulkNextBtn    = document.getElementById('bulk-next-week');
const bulkPreview    = document.getElementById('bulk-preview');
const bulkSubmitBtn  = document.getElementById('bulk-submit');
const bulkFeedback   = document.getElementById('bulk-feedback');
const bulkForm       = document.getElementById('bulk-form');

function populateBulkFuncties() {
  const container = document.getElementById('bulk-functies');
  container.innerHTML = '';
  SECTION_ORDER.forEach((key, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bulk-functie-btn' + (i === 0 ? ' bulk-functie-btn--active' : '');
    btn.dataset.key = key;
    btn.innerHTML = `<span class="bulk-functie-dot" style="background:${SECTIONS[key].color}"></span>${SECTIONS[key].label}`;
    btn.addEventListener('click', () => {
      container.querySelectorAll('.bulk-functie-btn').forEach(b => b.classList.remove('bulk-functie-btn--active'));
      btn.classList.add('bulk-functie-btn--active');
      updateBulkPreview();
    });
    container.appendChild(btn);
  });
}

function renderBulkDays() {
  const container = document.getElementById('bulk-days');
  const checked = new Set([...container.querySelectorAll('input:checked')].map(i => i.value));
  container.innerHTML = '';
  const monday = getMonday(bulkWeekOffset);
  const names = ['MA','DI','WO','DO','VR','ZA','ZO'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const label = document.createElement('label');
    label.className = 'bulk-day';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(i);
    if (checked.has(String(i))) input.checked = true;
    const span = document.createElement('span');
    span.innerHTML = `<span class="bulk-day__name">${names[i]}</span><span class="bulk-day__date">${d.getDate()}</span>`;
    label.appendChild(input);
    label.appendChild(span);
    label.addEventListener('change', updateBulkPreview);
    container.appendChild(label);
  }
}

function updateDuration() {
  const start = document.getElementById('bulk-start').value;
  const end   = document.getElementById('bulk-end').value;
  const el    = document.getElementById('bulk-duration');
  if (start && end && start < end) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const hrs = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    const r = Math.round(hrs * 10) / 10;
    el.textContent = (Number.isInteger(r) ? r : r.toString().replace('.', ',')) + 'u';
  } else {
    el.textContent = '';
  }
}

function updateBulkPreview() {
  const name  = document.getElementById('bulk-name').value.trim();
  const start = document.getElementById('bulk-start').value;
  const end   = document.getElementById('bulk-end').value;
  const days  = [...document.querySelectorAll('#bulk-days input:checked')];
  const active = document.querySelector('.bulk-functie-btn--active');

  if (!name) {
    bulkPreview.textContent = 'Vul een naam in om een dienst te plannen.';
    bulkSubmitBtn.disabled = true;
    return;
  }
  if (days.length === 0) {
    bulkPreview.textContent = 'Selecteer minimaal één dag.';
    bulkSubmitBtn.disabled = true;
    return;
  }
  if (!start || !end || start >= end) {
    bulkPreview.textContent = 'Vul een geldige begin- en eindtijd in.';
    bulkSubmitBtn.disabled = true;
    return;
  }
  const functieLabel = active ? SECTIONS[active.dataset.key]?.label : '';
  bulkPreview.textContent = `${name} · ${functieLabel} · ${start}–${end} · ${days.length} dag${days.length > 1 ? 'en' : ''}`;
  bulkSubmitBtn.disabled = false;
}

function updateBulkWeekLabel() {
  const monday = getMonday(bulkWeekOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  bulkWeekLabel.textContent = `${monday.getDate()} ${MONTHS[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;
  const badge = bulkWeekOffset === 0 ? 'Deze week' : bulkWeekOffset === 1 ? 'Volgende week' : '';
  bulkWeekBadge.textContent = badge;
  bulkWeekBadge.hidden = !badge;
  bulkPrevBtn.disabled = bulkWeekOffset === 0;
  renderBulkDays();
}

bulkPrevBtn.addEventListener('click', () => { if (bulkWeekOffset > 0) { bulkWeekOffset--; updateBulkWeekLabel(); } });
bulkNextBtn.addEventListener('click', () => { bulkWeekOffset++; updateBulkWeekLabel(); });

document.getElementById('bulk-select-all').addEventListener('click', () => {
  const inputs = [...document.querySelectorAll('#bulk-days input')];
  const allChecked = inputs.every(i => i.checked);
  inputs.forEach(i => i.checked = !allChecked);
  updateBulkPreview();
});

document.getElementById('bulk-name').addEventListener('input', updateBulkPreview);
document.getElementById('bulk-start').addEventListener('change', () => { updateDuration(); updateBulkPreview(); });
document.getElementById('bulk-end').addEventListener('change', () => { updateDuration(); updateBulkPreview(); });

bulkForm.addEventListener('submit', async e => {
  e.preventDefault();
  const name    = document.getElementById('bulk-name').value.trim();
  const active  = document.querySelector('.bulk-functie-btn--active');
  const functie = active?.dataset.key;
  const start   = document.getElementById('bulk-start').value;
  const end     = document.getElementById('bulk-end').value;
  const days    = [...document.querySelectorAll('#bulk-days input:checked')].map(cb => parseInt(cb.value));

  if (!name || !functie || !start || !end || start >= end || days.length === 0) return;

  bulkSubmitBtn.disabled = true;
  bulkFeedback.textContent = '';

  const monday = getMonday(bulkWeekOffset);
  const entry  = { name, start, end };

  try {
    await Promise.all(days.map(async dayIdx => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + dayIdx);
      const ref  = doc(db, 'rooster', toDateKey(d));
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, { [functie]: arrayUnion(entry) });
      } else {
        await setDoc(ref, { [functie]: [entry] });
      }
    }));
    bulkFeedback.textContent = `✓ Dienst toegevoegd voor ${days.length} dag${days.length > 1 ? 'en' : ''}.`;
    document.getElementById('bulk-name').value = '';
    document.querySelectorAll('#bulk-days input').forEach(cb => cb.checked = false);
    updateBulkPreview();
    loadWeek();
  } catch {
    bulkFeedback.textContent = 'Opslaan mislukt. Probeer opnieuw.';
    bulkSubmitBtn.disabled = false;
  }
});

updateBulkWeekLabel();
populateBulkFuncties();

// ── Tabs ──────────────────────────────────────────────────────────────────

document.querySelectorAll('.mgmt-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mgmt-tab').forEach(b => b.classList.remove('mgmt-tab--active'));
    document.querySelectorAll('.mgmt-tab-content').forEach(c => { c.hidden = true; });
    btn.classList.add('mgmt-tab--active');
    document.getElementById('tab-' + btn.dataset.tab).hidden = false;
  });
});

} // end initDashboard
