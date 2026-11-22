# Diet

En lokal web-app til at tracke kalorier, makro- og mikronæringsstoffer samt vand og vægt – med mål om at tabe, holde eller tage på i vægt.

Ren HTML/CSS/JavaScript uden afhængigheder eller build-trin. Åbn `index.html` direkte i browseren, kør den lokalt, eller udgiv den via GitHub Pages.

## Installér på telefonen

Appen er en PWA (Progressive Web App). Den kan installeres med eget ikon, åbner i fuld skærm og virker uden internet (undtagen Open Food Facts). En telefon kan **ikke** installere den fra en lokal fil eller en zip – den skal ligge på en https-adresse. GitHub Pages er gratis og nemmest:

1. Læg **alle 12 filer** i roden af et GitHub-repo (fx `diet`) – `index.html` skal ligge øverst, ikke i en undermappe. Der er ingen undermapper, så alle filer kan vælges på én gang med **Add file → Upload files**. Mangler ikonerne eller `manifest.webmanifest`, kan appen ikke installeres. Under Profil → Installér på telefonen → *Tjek om alt er på plads* viser appen, hvad der mangler.
2. På GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, vælg `main` og mappen `/ (root)`, og tryk **Save**.
3. Efter et minut eller to er appen live på `https://<brugernavn>.github.io/diet/`.
4. Åbn adressen på telefonen:
   - **iPhone:** Åbn i **Safari** → tryk **Del** (firkant med pil op) → **Føj til hjemmeskærm**.
   - **Android:** Åbn i **Chrome** → menu **⋮** → **Installér app** (eller tryk på knappen under Profil i appen).

Bemærk: Data ligger på den enhed og i den browser, hvor du bruger appen. Data fra computeren flyttes til telefonen med **Eksportér backup** og **Importér backup** under Profil. På iPhone har den installerede app sit eget lager adskilt fra Safari.

Når du lægger en ny version op, så hæv versionsnummeret i `CACHE` øverst i `sw.js`, så telefonerne henter de nye filer.

## Funktioner

- **Flere profiler** – hver profil har egne mål, dagbog, vejninger og egne fødevarer.
- **Automatisk kaloriemål** – Mifflin-St Jeor (BMR) × aktivitetsniveau (TDEE), justeret efter mål og tempo (7.700 kcal pr. kg). Målet hæves til mindst 1.200 kcal (kvinder) / 1.500 kcal (mænd) og opdateres, når du vejer dig.
- **Makrofordeling** – protein i g pr. kg kropsvægt, fedt i % af energien, resten kulhydrat. Kan justeres under Profil → Avancerede indstillinger.
- **Dagbog** – morgenmad, frokost, aftensmad og snacks. Redigér mængde ved at trykke på en registrering. Kopiér et måltid fra i går.
- **Fire måder at tilføje mad på**
  - Søg i den indbyggede basisdatabase (122 almindelige fødevarer, `foods.js`)
  - Søg online i [Open Food Facts](https://world.openfoodfacts.org) (kræver internet)
  - Stregkode – indtast eller scan med kamera (kamera virker i Chrome på Android og kræver https eller localhost)
  - Egne fødevarer (pr. 100 g, med valgfrie vitaminer/mineraler og portionsstørrelse) og hurtig registrering af kalorier
- **Vitaminer og mineraler** – A, D, E, C, B12, folat, calcium, jern, magnesium, kalium og zink sammenlignet med vejledende anbefalinger. Dag- eller 7-dagesgennemsnit. Markerer, når nogle registreringer mangler data.
- **Vand** – dagligt mål (35 ml pr. kg, kan overstyres).
- **Vægt** – graf med 7-dages gennemsnit, målvægt og tendens i kg/uge sammenlignet med planen.
- **Træning** – manuel registrering nu. Profilen styrer, om forbrændte kalorier lægges oven i dagsmålet.
- **Backup** – eksportér/importér alle profiler som JSON.

## Filer

| Fil | Indhold |
|---|---|
| `index.html` | Sidens skelet |
| `styles.css` | Layout, lys/mørk tilstand |
| `app.js` | Al logik: beregninger, visninger, lagring, Open Food Facts |
| `foods.js` | Basisdatabase med vejledende næringsværdier pr. 100 g |
| `manifest.webmanifest` | Navn, ikon og farver til installation på telefon |
| `sw.js` | Service worker – installation og offline-brug |
| `` | App-ikoner |

## Data

Alt gemmes i browserens `localStorage` under nøgler med præfikset `kt.`:

- `kt.profiles` – liste over profiler
- `kt.activeProfile` – id på aktiv profil
- `kt.data.<profilId>` – `{ days: { 'YYYY-MM-DD': { entries, water, exercise } }, weights, customFoods, recent }`

Data deles ikke mellem browsere eller enheder. Brug eksport/import for at flytte data.

## Integration med træningsapps (forberedt)

Appen eksponerer et lille API på `window.Diet` (også tilgængeligt som `window.Kalorietracker`):

```js
// Tilføj træning (dubletter undgås via externalId)
Diet.addExercise({
  date: '2026-11-22', name: 'Løb', kcal: 320, minutes: 30,
  source: 'Løbeapp', externalId: 'run-123'
});

// Hent dagsoversigt: indtag, mål og træning
Diet.getDay('2026-11-22');
```

Træningsregistreringer har feltet `source`, så de kan skelnes fra manuelle. Hvis apps'ene kører på samme domæne (fx samme GitHub Pages-site), kan de læse og skrive hinandens `localStorage` direkte. Ellers kan de udveksle data via JSON-eksport/import.

## Næste skridt (idéer)

- Hente træning automatisk fra træningsapps'ene
- Import af DTU's Frida-fødevaredatabase for flere danske fødevarer med præcise mikronæringsstoffer
- Opskrifter/retter sammensat af flere fødevarer
- Login og synkronisering, hvis appen skal udgives

## Forbehold

Næringsværdierne i basisdatabasen er afrundede gennemsnit. Beregnede mål er vejledende og erstatter ikke rådgivning fra læge eller diætist.
