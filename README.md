# Studio Starter

Lychees.studio boilerplate voor nieuwe projecten.

## Opstarten

1. Kopieer deze map naar een nieuwe projectmap
2. Doorloop de checklist hieronder
3. Verwijder wat je niet nodig hebt

## Checklist nieuw project

### Verplicht
- [ ] `example.com` vervangen door het echte domein (index.html, sitemap.xml, robots.txt)
- [ ] `Paginatitel` en `Bedrijfsnaam` invullen in `<title>` en meta tags
- [ ] `BEDRIJFSNAAM` aanpassen in footer
- [ ] `images/favicon.png` toevoegen
- [ ] Schema.org JSON-LD invullen
- [ ] `sitemap.xml` lastmod bijwerken

### Formulier
- [ ] Formspree account aanmaken op formspree.io
- [ ] Endpoint ID invullen in `scripts/main.js`

### Analytics & SEO
- [ ] Plausible snippet uncomment + domein invullen
- [ ] Search Console verifiëren + sitemap indienen

### Meertalig (optioneel)
- [ ] `en/index.html` aanmaken
- [ ] `hreflang` tags uncomment in `<head>`
- [ ] `/en` toevoegen aan `sitemap.xml`

## Structuur

```
├── index.html              NL homepage
├── en/
│   └── index.html          EN homepage (optioneel)
├── styles/
│   ├── styleguide.css      Design tokens + base styles
│   └── style.css           Project-specifieke styles
├── scripts/
│   ├── main.js             Contactformulier
│   └── nav.js              Hamburger navigatie
├── assets/
│   ├── fonts/              Lokale fonts (.woff2)
│   └── svg/                Iconen
├── images/                 Afbeeldingen (gebruik .avif)
├── sitemap.xml
└── robots.txt
```

## Design tokens

Pas aan in `styles/styleguide.css` onder `:root`:

### Typografie
| Token | Omschrijving |
|---|---|
| `--f-size` | Basis fontgrootte |
| `--f-size-h1` t/m `--f-size-h6` | Heading groottes via `clamp()` |
| `--f-family-serif` | Primair font |
| `--lh-p` | Regelafstand paragraaf |
| `--lh-h` | Regelafstand headings |

### Kleur
| Token | Omschrijving |
|---|---|
| `--c-primary` | Hoofdkleur |
| `--c-secondary` | Secundaire kleur |
| `--c-tertiary` | Tertiaire kleur |
| `--c-light` | Lichte achtergrond |
| `--c-dark` | Donkere tekst/achtergrond |

### Feedback states
| Token | Omschrijving |
|---|---|
| `--c-succes-h` / `--c-succes-s` | Groen tint + verzadiging |
| `--c-waarschuwing-h` / `--c-waarschuwing-s` | Oranje tint + verzadiging |
| `--c-fout-h` / `--c-fout-s` | Rood tint + verzadiging |

### Ruimte & vorm
| Token | Omschrijving |
|---|---|
| `--space-xs` t/m `--space-xl` | Spacing schaal |
| `--radius` | Border radius |
| `--transition` | Standaard transitieduur |

## Componenten

### Navigatie
Voeg `data-nav-toggle` toe aan de hamburgerknop en `data-nav` aan het `<nav>` element. De knop is automatisch verborgen boven 768px.

```html
<button data-nav-toggle aria-expanded="false" aria-controls="main-nav">
  Menu
</button>
<nav id="main-nav" data-nav>...</nav>
```

### Feedback states
```html
<p class="is-succes">Verstuurd!</p>
<p class="is-waarschuwing">Let op...</p>
<p class="is-fout">Er ging iets mis.</p>
```

### Fonts
Vul `@font-face` bovenaan `styleguide.css` in en voeg een preload toe in de `<head>`:

```html
<link rel="preload" as="font" type="font/woff2" href="assets/fonts/font-regular.woff2" crossorigin>
```
