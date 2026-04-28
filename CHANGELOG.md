# Changelog

## [0.4.6] - 2026-04-28

### Hozzáadva
- **Quoridor játék tab**: új „Quoridor" tab a sidepanelben, iframe-ben beágyazva a https://quoridor-snowy.vercel.app/ oldal.
- `Newspaper` és `Gamepad2` Lucide ikonok hozzáadva az icon maphez.

## [0.4.5] - 2026-04-28

### Hozzáadva
- `PRIVACY.md` és `TERMS.md` adatvédelmi nyilatkozat és felhasználási feltételek (általános, technikai részletek nélkül).
- In-app jogi modal: a footer „Adatvédelem" és „Feltételek" linkjei alulról felcsúszó panelben jelenítik meg a tartalmakat.

## [0.4.4] - 2026-04-28

### Javítva
- Firefox fetch: background relay `XMLHttpRequest`-re váltva (Firefox `host_permissions` CORS-bypass XHR-rel megbízhatóbb mint `fetch()`).
- Firefox manifest: explicit `connect-src` CSP hozzáadva az `extension_pages` CSP-hez.

## [0.4.3] - 2026-04-28

### Javítva
- Firefox NetworkError javítva: a `fetch()` hívások background scripten keresztül kerülnek küldésre ha az extension page direkt fetch-e meghiúsul — Firefox CORS-korlátozás megkerülése.
- `background.js`: `FETCH_JSON` üzenetkezelő hozzáadva a fetch relay-hez.
- `sidepanel.js`: `fetchJson()` helper — direkt fetch-et próbál, fallback: background relay.

## [0.4.2] - 2026-04-28

### Javítva
- Firefox manifest: `background.service_worker` helyett `background.scripts` — megszünteti a `BACKGROUND_SERVICE_WORKER_NOFALLBACK` hibát, ami "corrupt add-on" üzenetet okozott telepítéskor.
- Firefox build: `background.js` IIFE formátumban épül (volt: ESM), Firefox event page kompatibilitás.

## [0.4.1] - 2026-04-28

### Javítva
- ZIP fájl struktúra: a `manifest.json` mostantól a ZIP gyökerében van (volt: almappában), Firefox és Chrome Web Store kompatibilitás.

## [0.4.0] - 2026-04-28

### Új funkció: Keresztböngésző támogatás (Firefox / Opera / Vivaldi)
- Külön manifest fájlok: `manifest.chrome.json` és `manifest.firefox.json` (MV3, `sidebar_action`).
- `webextension-polyfill` hozzáadva a Firefox API kompatibilitáshoz.
- Firefox fallback: `browser.sidebarAction.open()` ha `chrome.sidePanel` nem elérhető.
- AI chat automatikusan le van tiltva nem-Chrome böngészőkben — info szöveg jelenik meg.
- Dual build: `scripts/release.js` most két külön ZIP-et generál (`-chrome-` és `-firefox-` névvel).
- GitHub Actions workflow frissítve: mindkét ZIP feltöltődik a release asset-ek közé.
- Új npm scriptek: `build:firefox`, `build:release:chrome`, `build:release:firefox`.

## [0.3.9] - 2026-04-28

### Javítva
- `fb-saver-content.js`: „Extension context invalidated" hiba megszüntetve — `isContextAlive()` guard minden `chrome.runtime.*` és `chrome.storage.*` hívás előtt ellenőrzi a kontextus érvényességét.
- `teardown()`: plugin újratöltésekor automatikusan leállítja a MutationObserver-t, scroll/popstate figyelőket és a pending timeout-ot; bezárja a mentési dialógot.
- `ChevronsUpDown` / `ChevronsDownUp` Lucide ikonok importálva — az összecsukható szekciók fejlécének chevron ikonjai mostantól helyesen jelennek meg.
- `ArrowUpCircle` Lucide ikon importálva — az update banner ikonja helyesen jelenik meg.

## [0.3.8] - 2026-04-28

### Módosítva
- AJÁNLÓ és LEGÚJABB szekciók összecsukhatók: fejlécre kattintva nyit/zár, chevron ikonnal jelezve.
- Összecsukott állapotban 2 csempe látszik + „+ N további" chip az összes darabszámmal.
- Az összecsukott/kibontott állapot `localStorage`-ban megmarad panel újranyitás után is.
- `TileSection` közös komponens: a két szekció kód-duplikációja megszüntetve.

## [0.3.7] - 2026-04-28

### Eltávolítva
- `database/posts-categorized.json` és `database/posts.json` törölve a repóból — az adatok mostantól kizárólag HTTP-ről érkeznek (`http://ai-janival-es-krisszel.hu/posts-categorized.json`).

## [0.3.6] - 2026-04-28

### Hozzáadva
- `AjánlóSection`: új kiemelt poszt szekció a landing oldalon, az `announcements.json`-ban szereplő posztokat mutatja csempe (tile) formátumban az Alapítók szekció alatt.
- `loadAnnouncements()`: lekéri az `http://ai-janival-es-krisszel.hu/announcements.json` fájlt és visszaadja a kiemelt postId-k `Set`-jét.

### Módosítva
- Adatforrás migráció: `database/posts-categorized.json` (lokális) → `http://ai-janival-es-krisszel.hu/posts-categorized.json` (HTTP, no-cache).
- `loadLatestPosts()` és `loadKnowledgeBase()` mostantól HTTP-ről tölt le, `cache: "no-store"` opcióval.
- Hero Carousel: az `announcements.json`-ban szereplő képes posztokat mutatja (fallback: legfrissebb képes posztok, ha nincs announcement).
- `manifest.json`: `http://ai-janival-es-krisszel.hu/*` és `https://ai-janival-es-krisszel.hu/*` hozzáadva a `host_permissions`-höz (www nélküli verzió).

## [0.3.5] - 2026-04-28

### Módosítva
- „LEGFELKAPOTTABB" szekció átnevezve **„LEGÚJABB"**-ra — a felirat most helyesen tükrözi, hogy a legfrissebb posztok láthatók (nem valódi trending-metrika alapján).
- „LEGÚJABB" szekció vizuális megjelenése: a számozott lista helyett **2 oszlopos csempe (tile) rács** jelenik meg; minden csempén kategóriacímke + cím, kép esetén gradiens-overlay, kép nélkül kategória-színes háttér.
- „LEGÚJABB" szekció 5 poszt helyett **6 posztot** mutat (páros szám a 2 oszlopos elrendezéshez).
- GitHub Actions CI/CD workflow hozzáadva: `v*` tag pusholásakor automatikusan buildelés és GitHub Release létrehozása a zip-fájllal.
- `updates.xml` hozzáadva a Chrome extension auto-update mechanizmushoz.

## [0.3.4] - 2026-04-28

### Módosítva
- Profilképek WebP formátumba konvertálva, 200×200 px-re vágva (~10 KB/kép, volt 21–890 KB).

## [0.3.3] - 2026-04-27

### Hozzáadva
- `AiTermsScreen`: Gemini Nano feltételek és figyelmeztetések képernyő a Chat fülön, az első használat előtt kötelező elfogadni. Tartalmazza a hardver-követelményeket, az aktiválási lépéseket, adatvédelmi tájékoztatót és a személyes használatra vonatkozó figyelmeztetést. Elfogadás után `localStorage`-ban megjegyzi (nem kérdezi újra).

### Módosítva
- Build pipeline átírva: a `vendor/` könyvtárból eltávolítva a kézileg kezelt React, ReactDOM, Lucide, Marked UMD fájlok és az `extension-shim.js`.
- `sidepanel.js` mostantól proper ES module importokat használ (`react`, `react-dom/client`, `lucide-react`, `marked`).
- esbuild bundler hozzáadva: `sidepanel.js` + összes függőség egyetlen minifikált IIFE bundle-be kerül buildkor.
- `lucide-react` npm csomag váltotta fel a kézzel kezelt `lucide.min.js` vendor fájlt; az `Icon` komponens közvetlenül lucide-react komponenseket használ.
- `marked` npm csomag váltotta fel a `marked.min.js` vendor fájlt; eltávolítva a `self.marked` global fallback.
- `scripts/release.js` újraírva: esbuild JS API-t használ, csak `vendor/tailwind.css` kerül a dist-be a vendor JS fájlok helyett.
- `sidepanel.html`: vendor JS `<script>` tagek eltávolítva, egyetlen bundled `sidepanel.js` marad.

### Javítva
- `React is not defined` hiba vélegesen megszüntetve: nincs több UMD global workaround, React standard npm csomagból bundlölve.

## [0.3.2] - 2026-04-27

### Javítva
- `React is not defined` hiba végleges javítása: a `vendor/react.production.min.js` és `vendor/react-dom.production.min.js` fájlok egy `(function(module,exports){...})(undefined,undefined)` IIFE-be vannak csomagolva, ami árnyékolja a Vivaldi által injektált `module`/`exports` globálisokat és kikényszeríti a browser-global UMD path-t.

## [0.3.1] - 2026-04-27

### Javítva
- `React is not defined` hiba Vivaldi és más Chromium alapú böngészőkben: a `vendor/extension-shim.js` lefuttatja a `var module = void 0; var exports = void 0;` sorokat a React UMD betöltése előtt, ezzel kikényszeríti a globális path-t.
- `createDocuments()` mostantól megőrzi a `category`, `subcategory`, `images`, `scrapedAt` mezőket a BM25 indexben (keresési találatoknál is jelenik meg alkategória és helyes kategória).
- `recordTimestamp()`: `scrapedAt` eltávolítva, csak `postDate` alapján rendez — a tömeges scrape egyforma `scrapedAt` értékei nem befolyásolják a sorrendet.
- Scramble-szűrő: 25+ karakteres hash-tokenek kiszűrése a szövegből, értelmetlen cím helyett "Cím nélkül" fallback.
- Poszt sorrend: aktuális dátumtól visszafelé, dátum nélküli posztok a végén.

## [0.3.0] - 2026-04-27

### Hozzáadva
- Tabloid stílusú landing page: Hero carousel, Alapítók szekció, Trending lista, kategória-szűrős poszt feed.
- Tabloid kategóriák a `posts-categorized.json` beépített `category` mezőjéből: Hírek, Eszköz, Alkotás, Oktatás, Kérdés, Vita, Egyéb.
- Alkategória badge (16 féle: Előadás, Workflow, Prompt, Tool bemutató stb.) minden poszthoz.
- BM25 keresés az összes poszt között a landing oldalon (kb. 617 rekord).
- Magyar dátumformátum parser (`"2026. április 27., hétfő, 16:29"` → formázott idő).
- LIVE esemény ticker és toolbar badge: 5 percenként ellenőrzi a schedule.json-t; Szerda 3h / Vasárnap 8h esemény-időtartam.
- IndexedDB chat session mentés és history drawer.
- Markdown renderelés AI válaszokban (`marked.js` v4).
- Inline kategória-kezelés (nincs `window.prompt` / `alert`).
- Tailwind CSS v4 build pipeline (`@tailwindcss/cli`).
- Google Fonts: Playfair Display + Inter.
- Scramble-szűrő: hash-szerű tokenek eltávolítása a szövegből, "Cím nélkül" fallback.

### Módosítva
- Adatforrás: `database/posts.json` → `database/posts-categorized.json`.
- `categorizeRecord()`: regex alapú kategorizálás helyett közvetlen `category` mező olvasás.
- `recordTimestamp()`: `postDate` az elsődleges forrás, `scrapedAt` nem használt.
- Poszt sorrend: `postDate` szerint csökkenő, dátum nélküli posztok a végén.
- `createDocuments()`: `category`, `subcategory`, `images` mezők megőrzése a BM25 indexben.
- Mentett posztok tab neve: "Mentett posztok".
- Szerző neve jelenik meg az azonosító helyett a mentett posztoknál.
- `loadLatestPosts()`: nincs 60-as limit, az összes poszt betöltődik.

## [0.2.0] - korábbi verzió

- Alap side panel: landing, mentett posztok, chat tab.
- Facebook content script: csillag gomb, mentési dialóg.
- Chrome beépített AI chat (LanguageModel Prompt API).
- BM25 knowledge base a chat RAG-hoz.
- Smart RAG: author detection, follow-up context.
