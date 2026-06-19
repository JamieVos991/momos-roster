import { db, auth } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion,
  collection, query, where, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { loadUpcomingEvents, addEvent } from "./events.js";

// ── Rooster constants ──────────────────────────────────────────────────────

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
const UNAVAIL = new Set(['lotte-2', 'emma-5', 'sophie-6']);
const DAY_NAMES = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

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
function initDashboard() {
  if (dashboardInitialized) return;
  dashboardInitialized = true;

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
  weekLabel.textContent = `${monday.getDate()} ${MONTHS[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;
  prevWeekBtn.disabled = weekOffset === 0;

  weekGrid.innerHTML = '<p style="padding:1.5rem;color:#aaa;font-style:italic">Laden…</p>';

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const mondayKey = toDateKey(monday);
  const sundayKey = toDateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));

  const [snaps, eventsSnap] = await Promise.all([
    Promise.all(dates.map(d => getDoc(doc(db, 'rooster', toDateKey(d))))),
    getDocs(query(
      collection(db, 'evenementen'),
      where('datum', '>=', mondayKey),
      where('datum', '<=', sundayKey),
      orderBy('datum')
    )),
  ]);

  const eventsByDate = {};
  eventsSnap.forEach(s => {
    const { datum, titel, beschrijving } = s.data();
    if (!eventsByDate[datum]) eventsByDate[datum] = [];
    eventsByDate[datum].push({ titel, beschrijving });
  });

  const toLocalKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const roster = dates.map((d, i) => ({
    i,
    label: DAY_NAMES[i],
    date: d.getDate(),
    month: MONTHS[d.getMonth()],
    key: toDateKey(d),
    data: snaps[i].exists() ? snaps[i].data() : {},
    events: eventsByDate[toLocalKey(d)] || [],
  }));

  renderRosterGrid(roster);
}

function renderRosterGrid(roster) {
  weekGrid.innerHTML = '';
  weekGrid.className = 'dash-roster';
  const isTouch = window.matchMedia('(hover: none)').matches;

  for (const d of roster) {
    const dayEl = document.createElement('div');
    dayEl.className = 'dash-day';

    const head = document.createElement('div');
    head.className = 'dash-day-head';
    head.innerHTML = `<span class="dash-day-label">${d.label}</span><span class="dash-day-date">${d.date} ${d.month}</span>`;
    dayEl.appendChild(head);

    for (const ev of d.events) {
      const evEl = document.createElement('div');
      evEl.className = 'dash-event';
      evEl.innerHTML = `<span class="dash-event__title">${ev.titel}</span>${ev.beschrijving ? `<span class="dash-event__desc">${ev.beschrijving}</span>` : ''}`;
      dayEl.appendChild(evEl);
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
        card.innerHTML = `
          <span class="dash-shift__time">${entry.start}–${entry.end}</span>
          <span class="dash-shift__name">${entry.name}</span>
        `;
        card.addEventListener(isTouch ? 'click' : 'dblclick', e => {
          e.stopPropagation();
          openEditShiftModal(d, secKey, entry);
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

  const empOptions = EMPLOYEES.map(e => `<option value="${e.name}">`).join('');

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
            list="wr-emp-list" autocomplete="off" placeholder="Naam medewerker" />
          <datalist id="wr-emp-list">${empOptions}</datalist>
        </div>
        <div class="wr-modal__row">
          <label class="wr-modal__label">Functie</label>
          <div class="wr-modal__radios">
            <label class="wr-modal__radio">
              <input type="radio" name="wr-functie" value="bediening" ${secKey === 'bediening' ? 'checked' : ''}> Bediening
            </label>
            <label class="wr-modal__radio">
              <input type="radio" name="wr-functie" value="keuken" ${secKey === 'keuken' ? 'checked' : ''}> Keuken
            </label>
          </div>
        </div>
        <div class="wr-modal__row">
          <label class="wr-modal__label">Begin</label>
          <input class="wr-modal__input" id="wr-modal-start" type="time" value="16:00" />
        </div>
        <div class="wr-modal__row">
          <label class="wr-modal__label">Einde</label>
          <input class="wr-modal__input" id="wr-modal-end" type="time" value="23:00" />
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

  const empOptions = EMPLOYEES.map(e => `<option value="${e.name}">`).join('');
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
            list="wr-emp-list" autocomplete="off" />
          <datalist id="wr-emp-list">${empOptions}</datalist>
        </div>
        <div class="wr-modal__row">
          <label class="wr-modal__label">Functie</label>
          <div class="wr-modal__radios">
            <label class="wr-modal__radio">
              <input type="radio" name="wr-functie" value="bediening" ${secKey === 'bediening' ? 'checked' : ''}> Bediening
            </label>
            <label class="wr-modal__radio">
              <input type="radio" name="wr-functie" value="keuken" ${secKey === 'keuken' ? 'checked' : ''}> Keuken
            </label>
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

loadUpcomingEvents(dashboardEventsList, { manage: true });

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
  loadUpcomingEvents(dashboardEventsList, { manage: true });
});

// ── Mijn rooster ──
async function searchMyShifts(query) {
  myShiftsList.innerHTML = '<li class="my-shift my-shift--loading">Zoeken…</li>';

  // Zoek 8 weken vooruit en 1 week terug (63 dagen)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 63 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - 7 + i);
    return d;
  });

  const snaps = await Promise.all(days.map(d => getDoc(doc(db, "rooster", toDateKey(d)))));

  const results = [];
  days.forEach((date, i) => {
    if (!snaps[i].exists()) return;
    const data = snaps[i].data();
    ["bediening", "keuken"].forEach(afd => {
      (data[afd] || []).forEach(entry => {
        if (entry.name.toLowerCase().includes(query.toLowerCase())) {
          results.push({ date, afd, entry });
        }
      });
    });
  });

  myShiftsList.innerHTML = "";

  if (results.length === 0) {
    myShiftsList.innerHTML = `<li class="my-shift my-shift--empty">Geen diensten gevonden voor "${query}".</li>`;
    return;
  }

  results.forEach(({ date, afd, entry }) => {
    const li = document.createElement("li");
    li.className = "my-shift";
    li.innerHTML = `
      <span class="my-shift__date">${formatShort(date)}</span>
      <span class="my-shift__afd">${afd}</span>
      <span class="my-shift__time">${entry.start}–${entry.end}</span>
    `;
    myShiftsList.appendChild(li);
  });
}

let searchTimer;
myNameInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = myNameInput.value.trim();
  if (q.length < 2) { myShiftsList.innerHTML = ""; return; }
  searchTimer = setTimeout(() => searchMyShifts(q), 300);
});

loadWeek();
} // end initDashboard
