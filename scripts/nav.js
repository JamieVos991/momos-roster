const knop = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");

function sluit() {
  nav.classList.remove("is-open");
  knop.setAttribute("aria-expanded", "false");
}

if (knop && nav) {
  knop.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    knop.setAttribute("aria-expanded", isOpen);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      sluit();
      knop.focus();
    }
  });

  document.addEventListener("click", (e) => {
    if (nav.classList.contains("is-open") && !nav.contains(e.target) && e.target !== knop) {
      sluit();
    }
  });
}
