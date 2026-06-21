import { db } from "./firebase.js";
import {
  collection, addDoc, deleteDoc, doc, updateDoc,
  query, orderBy, where, getDocs, Timestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const DAYS_SHORT = ["ZO", "MA", "DI", "WO", "DO", "VR", "ZA"];
const DAYS_LONG  = ["zo", "ma", "di", "wo", "do", "vr", "za"];

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export async function loadUpcomingEvents(listEl, { manage = false, onLoad = null } = {}) {
  listEl.innerHTML = manage
    ? '<li class="ev-item ev-item--loading"></li>'
    : '<li class="event-card event-card--loading"></li>';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const snap = await getDocs(query(
    collection(db, "evenementen"),
    where("datum", ">=", todayStr),
    orderBy("datum")
  ));

  listEl.innerHTML = "";
  if (onLoad) onLoad(snap.size);

  if (snap.empty) {
    const empty = document.createElement("li");
    empty.className = manage ? "ev-item ev-item--empty" : "event-card event-card--empty";
    empty.textContent = "Geen aankomende evenementen.";
    listEl.appendChild(empty);
    return;
  }

  snap.forEach(docSnap => {
    const { datum, titel, beschrijving } = docSnap.data();

    if (manage) {
      const d = new Date(datum + "T00:00:00");
      const li = document.createElement("li");
      li.className = "ev-item";
      li.innerHTML = `
        <div class="ev-item__date">
          <span class="ev-item__day">${DAYS_SHORT[d.getDay()]}</span>
          <span class="ev-item__num">${d.getDate()}</span>
          <span class="ev-item__month">${MONTHS[d.getMonth()]} ${d.getFullYear()}</span>
        </div>
        <div class="ev-item__body">
          <strong class="ev-item__title">${titel}</strong>
          ${beschrijving ? `<p class="ev-item__desc">${beschrijving}</p>` : ""}
        </div>
        <div class="ev-item__actions">
          <button class="ev-item__edit">Bewerk</button>
          <button class="ev-item__delete" aria-label="${titel} verwijderen">×</button>
        </div>
      `;
      li.querySelector(".ev-item__delete").addEventListener("click", async () => {
        await deleteDoc(doc(db, "evenementen", docSnap.id));
        loadUpcomingEvents(listEl, { manage, onLoad });
      });
      li.querySelector(".ev-item__edit").addEventListener("click", () => {
        openEditEventModal({ id: docSnap.id, datum, titel, beschrijving: beschrijving || "" }, listEl, onLoad);
      });
      listEl.appendChild(li);
    } else {
      const li = document.createElement("li");
      li.className = "event-card";
      li.innerHTML = `
        <div class="event-card__date">${formatDate(datum)}</div>
        <div class="event-card__body">
          <strong class="event-card__title">${titel}</strong>
          ${beschrijving ? `<p class="event-card__desc">${beschrijving}</p>` : ""}
        </div>
      `;
      listEl.appendChild(li);
    }
  });
}

export async function addEvent({ datum, titel, beschrijving }) {
  await addDoc(collection(db, "evenementen"), { datum, titel, beschrijving });
}

function openEditEventModal(event, listEl, onLoad) {
  document.getElementById("edit-event-modal")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "edit-event-modal";
  overlay.className = "wr-modal-overlay";
  overlay.innerHTML = `
    <div class="wr-modal">
      <div class="wr-modal__header">
        <div class="wr-modal__title">Evenement bewerken</div>
      </div>
      <div class="wr-modal__body">
        <div class="wr-modal__row">
          <label class="wr-modal__label">Datum</label>
          <input class="wr-modal__input" id="edit-event-date" type="date" value="${event.datum}" />
        </div>
        <div class="wr-modal__row">
          <label class="wr-modal__label">Titel</label>
          <input class="wr-modal__input" id="edit-event-title" type="text" value="${event.titel}" autocomplete="off" />
        </div>
        <div class="wr-modal__row">
          <label class="wr-modal__label">Omschrijving</label>
          <textarea class="wr-modal__input" id="edit-event-desc" rows="3">${event.beschrijving}</textarea>
        </div>
        <p class="wr-modal__error" id="edit-event-error"></p>
      </div>
      <div class="wr-modal__footer">
        <button class="wr-modal__save">Opslaan</button>
      </div>
    </div>
  `;

  const cancel = () => overlay.remove();
  overlay.addEventListener("click", e => { if (e.target === overlay) cancel(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { cancel(); document.removeEventListener("keydown", esc); }
  });

  overlay.querySelector(".wr-modal__save").addEventListener("click", async () => {
    const datum       = document.getElementById("edit-event-date").value;
    const titel       = document.getElementById("edit-event-title").value.trim();
    const beschrijving = document.getElementById("edit-event-desc").value.trim();
    const errEl       = document.getElementById("edit-event-error");

    if (!datum || !titel) { errEl.textContent = "Vul datum en titel in."; return; }

    const saveBtn = overlay.querySelector(".wr-modal__save");
    saveBtn.disabled = true;
    saveBtn.textContent = "Opslaan…";

    try {
      await updateDoc(doc(db, "evenementen", event.id), { datum, titel, beschrijving });
      overlay.remove();
      loadUpcomingEvents(listEl, { manage: true, onLoad });
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = "Opslaan";
      errEl.textContent = "Opslaan mislukt. Probeer opnieuw.";
    }
  });

  document.body.appendChild(overlay);
  document.getElementById("edit-event-title").focus();
}
