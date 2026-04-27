# AI - Janival és Krisszel — Chrome Side Panel

Chrome Manifest V3 bővítmény az AI Janival és Krisszel Facebook-csoport tartalmához. Három tabos side panel: tabloid landing, mentett posztok kezelése, és Chrome beépített AI chat.

## Betöltés Chrome-ba

1. Nyisd meg: `chrome://extensions`
2. Kapcsold be a **Developer mode** kapcsolót.
3. Kattints a **Load unpacked** gombra.
4. Válaszd ezt a könyvtárat.
5. Kattints a bővítmény ikonjára — a side panel megnyílik.

## Követelmények

- Chrome 138+ desktop.
- A Prompt API-t támogató gép (beépített AI modell).
- Elég szabad tárhely a Chrome-profil meghajtóján.

## Felépítés

```
├── manifest.json
├── background.js          # Service worker: LIVE badge, schedule check, alarm
├── sidepanel.html / .js   # React UI (no build step)
├── styles.css
├── fb-saver-content.js    # Facebook content script: csillag gomb, mentés
├── fb-saver-content.css
├── database/
│   └── posts-categorized.json  # 617 poszt kategória + alkategória mezőkkel
├── vendor/                # Lokálisan csomagolt runtime (nincs CDN)
│   ├── react.production.min.js
│   ├── react-dom.production.min.js
│   ├── lucide.min.js
│   ├── marked.min.js
│   └── tailwind.css       # @tailwindcss/cli kimenet
└── tailwind.input.css
```

## Funkciók

### Landing tab (tabloid stílus)
- Bulvár újság elrendezés: Hero carousel, Alapítók szekció, Trending lista, poszt feed.
- Kategória szűrő: Hírek, Eszköz, Alkotás, Oktatás, Kérdés, Vita, Egyéb.
- Alkategória badge minden kártyán (16 féle: Előadás, Workflow, Prompt stb.).
- BM25 keresés az összes (~617) poszt között.
- LIVE esemény ticker, ha éppen tart az online előadás.

### Mentett posztok tab
- Facebook-posztok mentése content script-tel (csillag gomb a csoportban).
- Saját kategóriák, keresés, törlés, JSON export.
- Esemény-csatlakozás gomb, ha a poszt Meet linket tartalmaz.

### Chat tab
- Chrome beépített LanguageModel API (Prompt API).
- BM25 RAG: a `database/posts-categorized.json` releváns forrásait adja kontextusba.
- Streamelt válasz Stop gombbal.
- IndexedDB session mentés és history.
- Markdown renderelés (`marked.js`).
- Settings drawer: system prompt, language, temperature, top-K.

### Toolbar badge
- `LIVE` feliratú piros badge, ha éppen tart az esemény.
- 5 percenként ellenőrzi a távoli `schedule.json`-t.

## Fejlesztés

Tailwind CSS újrageneráláshoz:
```bash
npm run build:css   # egyszeri build
npm run watch:css   # figyelés
```

A vendor JS fájlok (`react`, `react-dom`, `lucide`, `marked`) kézzel vannak csomagolva — nincs webpack/vite build step a JS-hez.
