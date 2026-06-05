import { db, auth } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { loadUpcomingEvents, addEvent } from "./events.js";

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

const form = document.getElementById("roster-form");
const feedback = document.getElementById("form-feedback");
const weekGrid = document.getElementById("week-grid");
const weekLabel = document.getElementById("week-label");
const prevWeekBtn = document.getElementById("prev-week");
const myNameInput = document.getElementById("my-name");
const myShiftsList = document.getElementById("my-shifts");
const nextWeekBtn = document.getElementById("next-week");

const DAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

// Set default date to today
document.getElementById("date").valueAsDate = new Date();

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
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

async function loadWeek() {
  const monday = getMonday(weekOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  weekLabel.textContent = `${monday.getDate()} ${MONTHS[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;

  weekGrid.innerHTML = "";

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const snaps = await Promise.all(days.map(d => getDoc(doc(db, "rooster", toDateKey(d)))));

  days.forEach((date, i) => {
    const data = snaps[i].exists() ? snaps[i].data() : {};
    const key = toDateKey(date);

    const col = document.createElement("div");
    col.className = "week-col";

    const heading = document.createElement("h3");
    heading.className = "week-col__heading";
    heading.textContent = formatShort(date);
    col.appendChild(heading);

    ["bediening", "keuken"].forEach(afd => {
      const section = document.createElement("div");
      section.className = "week-col__section";

      const label = document.createElement("p");
      label.className = "week-col__label";
      label.textContent = afd.charAt(0).toUpperCase() + afd.slice(1);
      section.appendChild(label);

      const entries = data[afd] || [];
      entries.forEach(entry => {
        const chip = document.createElement("span");
        chip.className = "chip";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = `${entry.name} ${entry.start}–${entry.end}`;

        const removeBtn = document.createElement("button");
        removeBtn.className = "chip__remove";
        removeBtn.setAttribute("aria-label", `${entry.name} verwijderen`);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => removeEntry(key, afd, entry));

        chip.appendChild(nameSpan);
        chip.appendChild(removeBtn);
        section.appendChild(chip);
      });

      col.appendChild(section);
    });

    weekGrid.appendChild(col);
  });
}

async function removeEntry(dateKey, afdeling, entry) {
  const ref = doc(db, "rooster", dateKey);
  await updateDoc(ref, { [afdeling]: arrayRemove(entry) });
  loadWeek();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  feedback.textContent = "";

  const date = new Date(form.date.value + "T00:00:00");
  const name = form.name.value.trim();
  const afdeling = form.afdeling.value;
  const start = form.start.value;
  const end = form.end.value;

  if (!name || !start || !end) {
    feedback.textContent = "Vul naam en tijden in.";
    return;
  }

  const entry = { name, start, end };
  const key = toDateKey(date);
  const ref = doc(db, "rooster", key);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    await updateDoc(ref, { [afdeling]: arrayUnion(entry) });
  } else {
    await setDoc(ref, { [afdeling]: [entry] });
  }

  feedback.textContent = `✓ ${name} (${start}–${end}) toegevoegd aan ${afdeling}.`;
  form.name.value = "";
  form.start.value = "";
  form.end.value = "";
  loadWeek();
});

prevWeekBtn.addEventListener("click", () => { weekOffset--; loadWeek(); });
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
