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
3. Verander bovenaan `GEHEIM` (`"VERANDER-MIJ"`) in je eigen wachtwoord en klik op **Opslaan**.

### 2. Deployen als web-app

1. **Implementeren → Implementaties beheren**.
2. Klik bij de bestaande web-app op het potloodje, kies bij versie **Nieuwe versie** en klik **Implementeren**. De URL blijft dan hetzelfde.
3. Instellingen: **Uitvoeren als: ik** en **Toegang: Iedereen**.

Maak je ooit een nieuwe implementatie (andere URL), pas dan `WEBAPP_URL` bovenaan `script.js` aan.

### 3. Inloggen

Open de app en vul je wachtwoord in. Dat hoeft maar één keer per apparaat; daarna onthoudt de app je. Verander je het wachtwoord in het script, dan vraagt de app er op elk apparaat opnieuw om.

Staan er al uren in de Sheet zonder bekende maand, dan vraagt de app één keer bij welke maand die horen.

## Bestanden

| Bestand | Wat |
| --- | --- |
| `index.html`, `style.css`, `script.js` | De app (vanilla HTML/CSS/JS) |
| `instructies.html` | Uitleg om de app op je beginscherm te zetten |
| `apps-script/Code.gs` | Backend die in de Google Sheet draait |
| `manifest.webmanifest`, `icon*` | App-icoon en installatie-info |
