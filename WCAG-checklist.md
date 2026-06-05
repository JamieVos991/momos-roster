# WCAG 2.1 AA Checklist

Doorloop deze checklist voor oplevering van elk project.

## Contrast

- [ ] Kleine tekst (< 18px normaal / < 14px bold) heeft minimaal 4.5:1 contrast
- [ ] Grote tekst (≥ 18px normaal / ≥ 14px bold) heeft minimaal 3:1 contrast
- [ ] UI componenten (knoppen, inputs, iconen) hebben minimaal 3:1 contrast
- [ ] Tekst op afbeeldingen of gradients getest

## Toetsenbord

- [ ] Alle interactieve elementen bereikbaar via Tab
- [ ] Focusvolgorde is logisch (van boven naar beneden, links naar rechts)
- [ ] Focus is altijd zichtbaar (geen `outline: none` zonder alternatief)
- [ ] Escape sluit modals, dropdowns en navigatie
- [ ] Geen toetsenbordval (focus zit niet vast in een component)

## Schermlezers

- [ ] Alle afbeeldingen hebben een `alt` attribuut
  - Decoratieve afbeeldingen: `alt=""`
  - Informatieve afbeeldingen: beschrijvende alt-tekst
- [ ] Formuliervelden hebben een gekoppeld `<label>`
- [ ] Knoppen en links hebben een duidelijke tekst of `aria-label`
- [ ] Paginatitel is uniek en beschrijvend (`<title>`)
- [ ] Taal is ingesteld op `<html lang="nl">`
- [ ] Koppen zijn hiërarchisch (h1 → h2 → h3, geen sprongen)

## Formulieren

- [ ] Foutmeldingen zijn duidelijk en beschrijven wat er mis is
- [ ] Verplichte velden zijn gemarkeerd (`required` + visueel)
- [ ] Autocomplete is ingesteld op bekende velden (`name`, `email` etc.)

## Beweging

- [ ] Animaties respecteren `prefers-reduced-motion`
- [ ] Geen content die meer dan 3x per seconde knippert

## Structuur

- [ ] Skip link aanwezig (`<a href="#main">Ga naar inhoud</a>`)
- [ ] Landmarks aanwezig: `<header>`, `<main>`, `<footer>`, `<nav>`
- [ ] Lijsten gebruiken `<ul>` of `<ol>`, geen losse `<div>` of `<br>`

## Testen

- [ ] Getest met toetsenbord (geen muis)
- [ ] Getest met VoiceOver (Mac) of NVDA (Windows)
- [ ] Getest met [axe DevTools](https://www.deque.com/axe/) browserextensie
- [ ] Lighthouse accessibility score ≥ 95
