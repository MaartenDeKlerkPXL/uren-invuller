# Uren-invuller

Kleine web-app om je gewerkte uren en standby direct in je Google Sheet-urenstaat te zetten. Geen database: de app praat via een Apps Script rechtstreeks met de Sheet.

- Elke dag die je opslaat komt meteen op de juiste rij in `Blad1` (dag 1 = rij 10, dag 31 = rij 40).
- Aanpassen en verwijderen kan vanuit de lijst met deze maand.
- **Nieuwe maand starten** kopieert `Blad1` eerst naar een archief-tabblad (bijv. "Oktober 2026") en maakt daarna `Blad1` leeg. Er gaat dus niks verloren.
- Totalen in de Sheet worden met formules berekend, ook voor diensten over middernacht.

Live: https://maartendeklerkpxl.github.io/uren-invuller/

## Installeren

### 1. Apps Script in de Sheet zetten

1. Open je urenstaat in Google Sheets → **Extensies → Apps Script**.
2. Vervang alle code door de inhoud van [`apps-script/Code.gs`](apps-script/Code.gs).
3. Verander bovenaan `GEHEIM` in een eigen wachtwoord.
4. Klik op **Opslaan**.

### 2. Deployen als web-app

1. **Implementeren → Implementaties beheren**.
2. Heb je al een web-app implementatie? Klik op het potloodje, kies bij versie **Nieuwe versie** en klik **Implementeren**. De URL blijft dan hetzelfde.
   Anders: **Implementeren → Nieuwe implementatie → Web-app**.
3. Instellingen: **Uitvoeren als: ik** en **Toegang: Iedereen**.
   (Iedereen kan de URL aanroepen, maar zonder het wachtwoord doet het script niks.)
4. Geef toestemming als Google daarom vraagt en kopieer de URL die eindigt op `/exec`.

### 3. App koppelen

Open de app, plak de `/exec`-URL en vul je wachtwoord in. Dit wordt alleen op je eigen telefoon bewaard.

Staan er al uren in de Sheet, dan vraagt de app één keer bij welke maand die horen.

## Bestanden

| Bestand | Wat |
| --- | --- |
| `index.html`, `style.css`, `script.js` | De app (vanilla HTML/CSS/JS) |
| `instructies.html` | Uitleg om de app op je beginscherm te zetten |
| `apps-script/Code.gs` | Backend die in de Google Sheet draait |
| `manifest.webmanifest`, `icon*` | App-icoon en installatie-info |
