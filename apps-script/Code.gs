/**
 * Uren-invuller — Apps Script backend
 *
 * Plak dit in Extensies > Apps Script van je urenstaat-Sheet
 * en deploy als web-app (Uitvoeren als: ik, Toegang: iedereen).
 */

const BLAD = "Blad1";
const EERSTE_RIJ = 10;       // dag 1 staat op rij 10, dag 31 op rij 40
const MAAND_CEL = "K4";      // naast het label "Maand"
const MAANDEN = ["Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli",
  "Augustus", "September", "Oktober", "November", "December"];

function doPost(e) {
  let input;
  try {
    input = JSON.parse(e.postData.contents);
  } catch (err) {
    return antwoord({ ok: false, fout: "Ongeldig verzoek" });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    switch (input.actie) {
      case "status":      return antwoord(status());
      case "opslaan":     return antwoord(opslaan(input));
      case "verwijderen": return antwoord(verwijderen(input.datum));
      case "nieuweMaand": return antwoord(nieuweMaand(input.maand));
      case "stelMaandIn": return antwoord(stelMaandIn(input.maand));
      default:            return antwoord({ ok: false, fout: "Onbekende actie" });
    }
  } catch (err) {
    return antwoord({ ok: false, fout: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function antwoord(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function blad() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BLAD);
  if (!sheet) throw new Error("Tabblad '" + BLAD + "' niet gevonden");
  return sheet;
}

// Maand waar Blad1 nu voor staat, als "2026-10" (of null als nog niet ingesteld)
function huidigeMaand() {
  return PropertiesService.getScriptProperties().getProperty("maand");
}

// Staat er iets in de tijdkolommen, los van welke maand het is?
function heeftData(sheet) {
  const tijden = sheet.getRange(EERSTE_RIJ, 2, 31, 8).getDisplayValues();
  return tijden.some(function (r) { return r[0] || r[1] || r[6] || r[7]; });
}

function zetMaand(sheet, maand) {
  PropertiesService.getScriptProperties().setProperty("maand", maand);
  const [jaar, m] = maand.split("-").map(Number);
  sheet.getRange(MAAND_CEL).setValue(MAANDEN[m - 1] + " " + jaar);
}

// Alle ingevulde dagen van Blad1
function leesRitten(sheet, maand) {
  if (!maand) return [];
  const waarden = sheet.getRange(EERSTE_RIJ, 1, 31, 10).getDisplayValues();
  const ritten = [];
  waarden.forEach(function (r, i) {
    const dag = i + 1;
    const rit = {
      datum: maand + "-" + String(dag).padStart(2, "0"),
      werkStart: tijd(r[1]), werkEind: tijd(r[2]),
      standbyStart: tijd(r[7]), standbyEind: tijd(r[8])
    };
    if (rit.werkStart || rit.werkEind || rit.standbyStart || rit.standbyEind) ritten.push(rit);
  });
  return ritten;
}

// "5:00:00" -> "05:00"
function tijd(waarde) {
  const m = String(waarde).match(/^(\d{1,2}):(\d{2})/);
  return m ? m[1].padStart(2, "0") + ":" + m[2] : "";
}

function status() {
  const sheet = blad();
  const maand = huidigeMaand();
  return {
    ok: true,
    maand: maand,
    // Er staan al uren in de sheet maar we weten niet van welke maand (eerste keer)
    onbekendeMaand: !maand && heeftData(sheet),
    ritten: leesRitten(sheet, maand),
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl()
  };
}

function geldigeDatum(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || ""); }
function geldigeTijd(t) { return !t || /^\d{2}:\d{2}$/.test(t); }
function geldigeMaand(m) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(m || ""); }

function opslaan(input) {
  if (!geldigeDatum(input.datum)) return { ok: false, fout: "Ongeldige datum" };
  if (![input.werkStart, input.werkEind, input.standbyStart, input.standbyEind].every(geldigeTijd)) {
    return { ok: false, fout: "Ongeldige tijd" };
  }
  const sheet = blad();
  const maand = input.datum.slice(0, 7);
  const huidig = huidigeMaand();

  if (!huidig && heeftData(sheet)) {
    return { ok: false, onbekendeMaand: true };
  }
  if (!huidig || leesRitten(sheet, huidig).length === 0) {
    zetMaand(sheet, maand);
  } else if (huidig !== maand) {
    return { ok: false, andereMaand: true, maand: huidig };
  }

  const dag = parseInt(input.datum.slice(8, 10), 10);
  const rij = EERSTE_RIJ + dag - 1;
  // MOD(...;1) zodat een dienst over middernacht geen negatieve tijd geeft
  const totaal = function (a, b) {
    return "=IF(AND(" + a + rij + "<>\"\";" + b + rij + "<>\"\"); MOD(" + b + rij + "-" + a + rij + "; 1); \"\")";
  };

  sheet.getRange(rij, 1, 1, 10).setValues([[
    dag,
    input.werkStart || "", input.werkEind || "",
    "", "",
    totaal("B", "C"),
    "",
    input.standbyStart || "", input.standbyEind || "",
    totaal("H", "I")
  ]]);

  return status();
}

function verwijderen(datum) {
  if (!geldigeDatum(datum)) return { ok: false, fout: "Ongeldige datum" };
  const sheet = blad();
  if (datum.slice(0, 7) !== huidigeMaand()) return { ok: false, fout: "Die datum staat niet in de sheet" };
  const rij = EERSTE_RIJ + parseInt(datum.slice(8, 10), 10) - 1;
  sheet.getRange(rij, 2, 1, 2).clearContent();
  sheet.getRange(rij, 8, 1, 2).clearContent();
  return status();
}

// Kopieert Blad1 naar een archief-tabblad en maakt Blad1 leeg voor de nieuwe maand
function nieuweMaand(nieuw) {
  if (!geldigeMaand(nieuw)) return { ok: false, fout: "Ongeldige maand" };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = blad();
  const huidig = huidigeMaand();

  if (!huidig && heeftData(sheet)) {
    return { ok: false, onbekendeMaand: true };
  }
  if (huidig && leesRitten(sheet, huidig).length > 0) {
    const [jaar, m] = huidig.split("-").map(Number);
    let naam = MAANDEN[m - 1] + " " + jaar;
    let n = 2;
    while (ss.getSheetByName(naam)) naam = MAANDEN[m - 1] + " " + jaar + " (" + n++ + ")";
    // De formules in de kopie verwijzen naar de kopie zelf, dus het archief blijft kloppen
    sheet.copyTo(ss).setName(naam);
  }

  sheet.getRange(EERSTE_RIJ, 2, 31, 2).clearContent();
  sheet.getRange(EERSTE_RIJ, 8, 31, 2).clearContent();
  zetMaand(sheet, nieuw);
  return status();
}

// Eenmalig: vertel bij welke maand de uren horen die al in Blad1 stonden
function stelMaandIn(maand) {
  if (!geldigeMaand(maand)) return { ok: false, fout: "Ongeldige maand" };
  zetMaand(blad(), maand);
  return status();
}
