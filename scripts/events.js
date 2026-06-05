import { db } from "./firebase.js";
import {
  collection, addDoc, deleteDoc, doc,
  query, orderBy, where, getDocs, Timestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const DAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"];

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export async function loadUpcomingEvents(listEl, { manage = false } = {}) {
  listEl.innerHTML = '<li class="event-card event-card--loading"></li>';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const q = query(
    collection(db, "evenementen"),
    where("datum", ">=", todayStr),
    orderBy("datum")
  );

  const snap = await getDocs(q);

  listEl.innerHTML = "";

  if (snap.empty) {
    listEl.innerHTML = '<li class="event-card event-card--empty">Geen aankomende evenementen.</li>';
    return;
  }

  snap.forEach(docSnap => {
    const { datum, titel, beschrijving } = docSnap.data();
    const li = document.createElement("li");
    li.className = "event-card";
    li.innerHTML = `
      <div class="event-card__date">${formatDate(datum)}</div>
      <div class="event-card__body">
        <strong class="event-card__title">${titel}</strong>
        ${beschrijving ? `<p class="event-card__desc">${beschrijving}</p>` : ""}
      </div>
      ${manage ? `<button class="event-card__delete btn btn--danger" data-id="${docSnap.id}" aria-label="${titel} verwijderen">Verwijder</button>` : ""}
    `;
    if (manage) {
      li.querySelector(".event-card__delete").addEventListener("click", async () => {
        await deleteDoc(doc(db, "evenementen", docSnap.id));
        loadUpcomingEvents(listEl, { manage });
      });
    }
    listEl.appendChild(li);
  });
}

export async function addEvent({ datum, titel, beschrijving }) {
  await addDoc(collection(db, "evenementen"), { datum, titel, beschrijving });
}
