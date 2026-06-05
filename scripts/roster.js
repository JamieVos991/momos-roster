import { db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { loadUpcomingEvents } from "./events.js";

const dayTitle = document.getElementById("day-title");
const listBediening = document.getElementById("list-bediening");
const listKeuken = document.getElementById("list-keuken");
const emptyState = document.getElementById("empty-state");
const rosterEl = document.getElementById("roster");
const prevBtn = document.getElementById("prev-day");
const nextBtn = document.getElementById("next-day");

let currentDate = new Date();
currentDate.setHours(0, 0, 0, 0);

const DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatTitle(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (date - today) / 86400000;

  const dayName = diff === 0 ? "Vandaag" : diff === 1 ? "Morgen" : diff === -1 ? "Gisteren" : DAYS[date.getDay()];
  return `${dayName} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function renderCards(list, names) {
  list.innerHTML = "";
  if (!names || names.length === 0) {
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
  rosterEl.hidden = false;
  emptyState.hidden = true;
  listBediening.innerHTML = '<li class="card card--loading"></li>';
  listKeuken.innerHTML = '<li class="card card--loading"></li>';

  try {
    const key = toDateKey(date);
    const snap = await getDoc(doc(db, "rooster", key));
    const data = snap.exists() ? snap.data() : {};

    const countB = renderCards(listBediening, data.bediening);
    const countK = renderCards(listKeuken, data.keuken);

    const hasShifts = countB + countK > 0;
    rosterEl.hidden = !hasShifts;
    emptyState.hidden = hasShifts;
  } catch (err) {
    rosterEl.hidden = true;
    emptyState.textContent = `Fout bij laden: ${err.message}`;
    emptyState.hidden = false;
    console.error(err);
  }
}

prevBtn.addEventListener("click", () => {
  currentDate.setDate(currentDate.getDate() - 1);
  loadDay(currentDate);
});

nextBtn.addEventListener("click", () => {
  currentDate.setDate(currentDate.getDate() + 1);
  loadDay(currentDate);
});

loadDay(currentDate);

// ── Evenementen ──
loadUpcomingEvents(document.getElementById("events-list"));

// ── Mijn rooster ──
const myNameInput = document.getElementById("my-name");
const myShiftsList = document.getElementById("my-shifts");

function formatShort(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (date - today) / 86400000;
  if (diff === 0) return "Vandaag";
  if (diff === 1) return "Morgen";
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

async function searchMyShifts(query) {
  myShiftsList.innerHTML = '<li class="my-shift my-shift--loading">Zoeken…</li>';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 56 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
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
