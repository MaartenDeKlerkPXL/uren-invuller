// ---------- Instellingen & staat ----------

const OPSLAG = {
    url: 'uren_url',
    geheim: 'uren_geheim',
    cache: 'uren_cache'
};

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli',
    'augustus', 'september', 'oktober', 'november', 'december'];

let staat = { maand: null, ritten: [], sheetUrl: null };
let bewerkDatum = null;   // datum van de rit die we aanpassen, of null
let gekozenRit = null;    // rit waarop is getikt
let laatstOpgeslagen = null;

const $ = (id) => document.getElementById(id);

function lees(sleutel) {
    try { return localStorage.getItem(sleutel); } catch { return null; }
}
function schrijf(sleutel, waarde) {
    try {
        if (waarde === null) localStorage.removeItem(sleutel);
        else localStorage.setItem(sleutel, waarde);
    } catch { /* privémodus: dan maar zonder onthouden */ }
}

// ---------- Hulpfuncties voor tijd en datum ----------

function minuten(van, tot) {
    if (!van || !tot) return 0;
    const [h1, m1] = van.split(':').map(Number);
    const [h2, m2] = tot.split(':').map(Number);
    const verschil = (h2 * 60 + m2) - (h1 * 60 + m1);
    return verschil < 0 ? verschil + 1440 : verschil; // over middernacht
}

function uren(min) {
    return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
}

function isoDatum(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function maandNaam(maand) {
    if (!maand) return '';
    const [jaar, m] = maand.split('-').map(Number);
    return MAANDEN[m - 1] + ' ' + jaar;
}

function hoofdletter(tekst) {
    return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

function datumLang(iso) {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---------- Verbinding met Apps Script ----------

async function api(actie, data = {}) {
    const url = lees(OPSLAG.url);
    const geheim = lees(OPSLAG.geheim);
    if (!url || !geheim) throw new Error('Nog niet gekoppeld');

    let res;
    try {
        // Geen eigen headers: dan blijft het een "simple request" en is er geen CORS-preflight nodig
        res = await fetch(url, { method: 'POST', body: JSON.stringify({ geheim, actie, ...data }) });
    } catch {
        throw new Error('Geen verbinding. Check je internet.');
    }

    let json;
    try {
        json = await res.json();
    } catch {
        throw new Error('Apps Script gaf geen geldig antwoord. Staat de toegang op "Iedereen"?');
    }

    if (json.ok) {
        staat = { maand: json.maand, ritten: json.ritten || [], sheetUrl: json.sheetUrl };
        schrijf(OPSLAG.cache, JSON.stringify(staat));
    }
    return json;
}

// ---------- Weergave ----------

function toonView(naam) {
    $('view-koppelen').classList.toggle('hidden', naam !== 'koppelen');
    $('view-app').classList.toggle('hidden', naam !== 'app');
    $('btn-instellingen').classList.toggle('hidden', naam !== 'app');
}

function renderMaand(nieuweDatum) {
    const naam = staat.maand ? hoofdletter(maandNaam(staat.maand)) : 'Deze maand';
    $('maand-titel').textContent = naam;
    $('maand-label').textContent = staat.maand ? 'Sheet staat op ' + maandNaam(staat.maand) : 'Nog geen uren in de sheet';

    let werk = 0, standby = 0;
    staat.ritten.forEach(r => {
        werk += minuten(r.werkStart, r.werkEind);
        standby += minuten(r.standbyStart, r.standbyEind);
    });
    $('stat-werk').textContent = uren(werk);
    $('stat-standby').textContent = uren(standby);
    $('stat-dagen').textContent = staat.ritten.filter(r => r.werkStart && r.werkEind).length;

    const lijst = $('ritten');
    lijst.innerHTML = '';

    if (!staat.ritten.length) {
        lijst.innerHTML = '<li class="leeg">Nog niks ingevuld deze maand.</li>';
    } else {
        // Nieuwste bovenaan
        [...staat.ritten].sort((a, b) => b.datum.localeCompare(a.datum)).forEach((r, i) => {
            const d = new Date(r.datum + 'T12:00:00');
            const li = document.createElement('li');
            const knop = document.createElement('button');
            knop.type = 'button';
            knop.className = 'rit' + (r.datum === nieuweDatum ? ' nieuw' : '');
            knop.style.animationDelay = Math.min(i, 10) * 35 + 'ms';

            const werkMin = minuten(r.werkStart, r.werkEind);
            const tijden = r.werkStart && r.werkEind ? `${r.werkStart} – ${r.werkEind}` : 'Alleen standby';
            const standbyRegel = r.standbyStart && r.standbyEind
                ? `<span class="rit-standby">Standby ${r.standbyStart} – ${r.standbyEind} · ${uren(minuten(r.standbyStart, r.standbyEind))}</span>`
                : '';

            knop.innerHTML = `
                <span class="rit-dag"><b>${d.getDate()}</b><small>${d.toLocaleDateString('nl-NL', { weekday: 'short' })}</small></span>
                <span class="rit-info"><span class="rit-tijden">${tijden}</span>${standbyRegel}</span>
                <span class="rit-duur">${werkMin ? uren(werkMin) : ''}</span>`;
            knop.addEventListener('click', () => openRit(r));
            li.appendChild(knop);
            lijst.appendChild(li);
        });
    }

    $('link-sheet').href = staat.sheetUrl || '#';
    $('link-sheet').classList.toggle('hidden', !staat.sheetUrl);
}

function renderSkeleton() {
    $('ritten').innerHTML = '<li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li>';
}

function updatePreview() {
    const werk = minuten($('werk-start').value, $('werk-eind').value);
    const standby = minuten($('standby-start').value, $('standby-eind').value);
    const delen = [];
    if (werk) delen.push(`<span class="pill">Werk <b>${uren(werk)}</b></span>`);
    if (standby) delen.push(`<span class="pill">Standby <b>${uren(standby)}</b></span>`);
    const html = delen.join('');
    if ($('preview').innerHTML !== html) $('preview').innerHTML = html;
}

function updateChips() {
    const waarde = $('datum').value;
    document.querySelectorAll('.chip').forEach(chip => {
        const d = new Date();
        d.setDate(d.getDate() + Number(chip.dataset.dagen));
        chip.classList.toggle('active', isoDatum(d) === waarde);
    });
}

function zetStandby(open) {
    $('standby-blok').classList.toggle('open', open);
    $('btn-standby').setAttribute('aria-expanded', String(open));
    $('btn-standby').querySelector('span').textContent = open ? 'Standby weghalen' : 'Standby toevoegen';
    $('standby-start').tabIndex = open ? 0 : -1;
    $('standby-eind').tabIndex = open ? 0 : -1;
    if (!open) {
        $('standby-start').value = '';
        $('standby-eind').value = '';
        updatePreview();
    }
}

function resetFormulier() {
    bewerkDatum = null;
    $('werk-start').value = '';
    $('werk-eind').value = '';
    zetStandby(false);
    $('datum').value = isoDatum(new Date());
    $('invoer-titel').textContent = 'Nieuwe dag';
    $('btn-opslaan').querySelector('.btn-label').textContent = 'Zet in urenstaat';
    $('btn-annuleer-bewerken').classList.add('hidden');
    $('card-invoer').classList.remove('bewerken');
    updatePreview();
    updateChips();
}

let toastTimer;
function melding(tekst, fout = false) {
    const t = $('toast');
    t.textContent = tekst;
    t.classList.toggle('fout', fout);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), fout ? 4500 : 2600);
}

function laden(knop, aan) {
    knop.classList.toggle('loading', aan);
    knop.disabled = aan;
}

// Toont een dialog en geeft de gekozen knop-waarde terug
function vraag(dialog) {
    return new Promise(resolve => {
        dialog.returnValue = '';
        dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
        dialog.showModal();
    });
}

async function bevestig(titel, tekst, jaLabel = 'Ja') {
    $('bevestig-titel').textContent = titel;
    $('bevestig-tekst').textContent = tekst;
    $('bevestig-ja').textContent = jaLabel;
    return (await vraag($('dlg-bevestig'))) === 'ja';
}

// ---------- Acties ----------

async function vernieuwen(stil = false) {
    const knop = $('btn-vernieuwen');
    knop.classList.add('spinning');
    if (!staat.ritten.length && !stil) renderSkeleton();
    try {
        const res = await api('status');
        if (!res.ok) throw new Error(res.fout || 'Ophalen mislukt');
        renderMaand();
        if (res.onbekendeMaand) await vraagMaand();
    } catch (err) {
        renderMaand();
        melding(err.message, true);
    } finally {
        knop.classList.remove('spinning');
    }
}

// Eenmalig: bij welke maand horen de uren die al in de sheet stonden?
async function vraagMaand() {
    // Deze maand en de twee maanden ervoor
    const nu = new Date();
    $('maand-keuze').innerHTML = [0, 1, 2].map(terug => {
        const d = new Date(nu.getFullYear(), nu.getMonth() - terug, 1);
        const waarde = isoDatum(d).slice(0, 7);
        return `<option value="${waarde}">${hoofdletter(maandNaam(waarde))}</option>`;
    }).join('');
    if ((await vraag($('dlg-maand'))) !== 'ok') return false;
    const maand = $('maand-keuze').value;
    if (!maand) return false;
    const res = await api('stelMaandIn', { maand });
    if (!res.ok) { melding(res.fout || 'Mislukt', true); return false; }
    renderMaand();
    melding('Sheet staat nu op ' + maandNaam(maand));
    return true;
}

async function opslaan(e) {
    e.preventDefault();
    const rit = {
        datum: $('datum').value,
        werkStart: $('werk-start').value,
        werkEind: $('werk-eind').value,
        standbyStart: $('standby-start').value,
        standbyEind: $('standby-eind').value
    };

    if (!rit.datum) return melding('Kies een datum', true);
    const heeftWerk = rit.werkStart && rit.werkEind;
    const heeftStandby = rit.standbyStart && rit.standbyEind;
    if ((rit.werkStart && !rit.werkEind) || (!rit.werkStart && rit.werkEind)) return melding('Vul begin- én eindtijd in', true);
    if ((rit.standbyStart && !rit.standbyEind) || (!rit.standbyStart && rit.standbyEind)) return melding('Vul standby vanaf én tot in', true);
    if (!heeftWerk && !heeftStandby) return melding('Vul je werktijden in', true);

    // Bij een verplaatste rit (datum aangepast) de oude dag leegmaken
    const verplaatst = bewerkDatum && bewerkDatum !== rit.datum;

    // Niet per ongeluk een bestaande dag overschrijven
    const bestaand = staat.ritten.find(r => r.datum === rit.datum);
    if (bestaand && bewerkDatum !== rit.datum) {
        const ok = await bevestig('Dag overschrijven?',
            `Op ${datumLang(rit.datum)} staat al ${bestaand.werkStart || 'standby'}${bestaand.werkEind ? ' – ' + bestaand.werkEind : ''}.`, 'Overschrijven');
        if (!ok) return;
    }

    const knop = $('btn-opslaan');
    laden(knop, true);
    try {
        let res = await api('opslaan', rit);

        if (!res.ok && res.onbekendeMaand) {
            laden(knop, false);
            if (!(await vraagMaand())) return;
            laden(knop, true);
            res = await api('opslaan', rit);
        }

        if (!res.ok && res.andereMaand) {
            laden(knop, false);
            const nieuw = rit.datum.slice(0, 7);
            const ok = await bevestig(`${hoofdletter(maandNaam(nieuw))} beginnen?`,
                `De sheet staat nog op ${maandNaam(res.maand)}. Die maand wordt bewaard als apart tabblad en Blad1 wordt leeggemaakt voor ${maandNaam(nieuw)}.`,
                'Archiveren en doorgaan');
            if (!ok) return;
            laden(knop, true);
            res = await api('nieuweMaand', { maand: nieuw });
            if (res.ok) res = await api('opslaan', rit);
        }

        if (!res.ok) throw new Error(res.fout || 'Opslaan mislukt');

        if (verplaatst && staat.maand === bewerkDatum.slice(0, 7)) {
            await api('verwijderen', { datum: bewerkDatum });
        }

        laatstOpgeslagen = rit.datum;
        melding(bewerkDatum ? 'Aangepast in je urenstaat' : 'Staat in je urenstaat');
        resetFormulier();
        renderMaand(laatstOpgeslagen);
    } catch (err) {
        melding(err.message, true);
    } finally {
        laden(knop, false);
    }
}

async function openRit(rit) {
    gekozenRit = rit;
    $('rit-titel').textContent = hoofdletter(datumLang(rit.datum));
    const delen = [];
    if (rit.werkStart && rit.werkEind) delen.push(`${rit.werkStart} – ${rit.werkEind} (${uren(minuten(rit.werkStart, rit.werkEind))})`);
    if (rit.standbyStart && rit.standbyEind) delen.push(`standby ${rit.standbyStart} – ${rit.standbyEind}`);
    $('rit-sub').textContent = delen.join(' · ');

    const keuze = await vraag($('dlg-rit'));
    if (keuze === 'bewerken') startBewerken(gekozenRit);
    if (keuze === 'verwijderen') verwijderRit(gekozenRit);
}

function startBewerken(rit) {
    bewerkDatum = rit.datum;
    $('datum').value = rit.datum;
    $('werk-start').value = rit.werkStart;
    $('werk-eind').value = rit.werkEind;
    const metStandby = Boolean(rit.standbyStart || rit.standbyEind);
    zetStandby(metStandby);
    $('standby-start').value = rit.standbyStart;
    $('standby-eind').value = rit.standbyEind;
    $('invoer-titel').textContent = hoofdletter(datumLang(rit.datum));
    $('btn-opslaan').querySelector('.btn-label').textContent = 'Wijziging opslaan';
    $('btn-annuleer-bewerken').classList.remove('hidden');
    $('card-invoer').classList.add('bewerken');
    updatePreview();
    updateChips();
    $('card-invoer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function verwijderRit(rit) {
    const ok = await bevestig('Dag verwijderen?', `${hoofdletter(datumLang(rit.datum))} wordt uit je urenstaat gehaald.`, 'Verwijderen');
    if (!ok) return;
    try {
        const res = await api('verwijderen', { datum: rit.datum });
        if (!res.ok) throw new Error(res.fout || 'Verwijderen mislukt');
        if (bewerkDatum === rit.datum) resetFormulier();
        renderMaand();
        melding('Verwijderd');
    } catch (err) {
        melding(err.message, true);
    }
}

async function nieuweMaandStarten() {
    const nu = isoDatum(new Date()).slice(0, 7);
    // Staat de sheet al op deze maand, dan is de volgende maand bedoeld
    let doel = nu;
    if (staat.maand && staat.maand >= nu) {
        const [j, m] = staat.maand.split('-').map(Number);
        doel = m === 12 ? `${j + 1}-01` : `${j}-${String(m + 1).padStart(2, '0')}`;
    }

    const tekst = staat.ritten.length
        ? `${hoofdletter(maandNaam(staat.maand))} wordt bewaard als apart tabblad en Blad1 wordt leeggemaakt voor ${maandNaam(doel)}.`
        : `Blad1 wordt klaargezet voor ${maandNaam(doel)}.`;
    if (!(await bevestig(`${hoofdletter(maandNaam(doel))} starten?`, tekst, 'Starten'))) return;

    const knop = $('btn-nieuwe-maand');
    knop.disabled = true;
    try {
        let res = await api('nieuweMaand', { maand: doel });
        if (!res.ok && res.onbekendeMaand) {
            if (!(await vraagMaand())) return;
            res = await api('nieuweMaand', { maand: doel });
        }
        if (!res.ok) throw new Error(res.fout || 'Mislukt');
        renderMaand();
        melding(`Klaar voor ${maandNaam(doel)}`);
    } catch (err) {
        melding(err.message, true);
    } finally {
        knop.disabled = false;
    }
}

async function koppelen(e) {
    e.preventDefault();
    const url = $('koppel-url').value.trim();
    const geheim = $('koppel-geheim').value;
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) {
        return melding('Dat lijkt geen Apps Script web-app URL (eindigt op /exec)', true);
    }

    const knop = e.submitter || $('form-koppelen').querySelector('button');
    laden(knop, true);
    schrijf(OPSLAG.url, url);
    schrijf(OPSLAG.geheim, geheim);
    try {
        const res = await api('status');
        if (!res.ok) throw new Error(res.fout || 'Verbinden mislukt');
        $('koppel-geheim').value = '';
        toonView('app');
        resetFormulier();
        renderMaand();
        melding('Gekoppeld met je Google Sheet');
        if (res.onbekendeMaand) await vraagMaand();
    } catch (err) {
        schrijf(OPSLAG.url, null);
        schrijf(OPSLAG.geheim, null);
        melding(err.message, true);
    } finally {
        laden(knop, false);
    }
}

async function instellingen() {
    const url = lees(OPSLAG.url) || '';
    $('instellingen-info').textContent = 'Gekoppeld met …' + url.slice(-28);
    if ((await vraag($('dlg-instellingen'))) !== 'ontkoppel') return;
    if (!(await bevestig('Ontkoppelen?', 'Je Sheet blijft gewoon bestaan. Je moet daarna opnieuw de URL en het wachtwoord invullen.', 'Ontkoppelen'))) return;
    [OPSLAG.url, OPSLAG.geheim, OPSLAG.cache].forEach(k => schrijf(k, null));
    staat = { maand: null, ritten: [], sheetUrl: null };
    $('maand-label').innerHTML = '&nbsp;';
    toonView('koppelen');
}

// ---------- Start ----------

function init() {
    $('form-koppelen').addEventListener('submit', koppelen);
    $('form-invoer').addEventListener('submit', opslaan);
    $('btn-annuleer-bewerken').addEventListener('click', resetFormulier);
    $('btn-standby').addEventListener('click', () => {
        const open = !$('standby-blok').classList.contains('open');
        zetStandby(open);
        if (open) $('standby-start').focus({ preventScroll: true });
    });
    $('btn-vernieuwen').addEventListener('click', () => vernieuwen());
    $('btn-nieuwe-maand').addEventListener('click', nieuweMaandStarten);
    $('btn-instellingen').addEventListener('click', instellingen);
    $('datum').addEventListener('change', updateChips);
    document.querySelectorAll('.tijd').forEach(el => el.addEventListener('input', updatePreview));
    document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
        const d = new Date();
        d.setDate(d.getDate() + Number(chip.dataset.dagen));
        $('datum').value = isoDatum(d);
        updateChips();
    }));

    // Klik op de achtergrond (buiten het kader) sluit een dialog
    document.querySelectorAll('dialog').forEach(dlg => dlg.addEventListener('click', (e) => {
        if (e.target !== dlg) return;
        const r = dlg.getBoundingClientRect();
        const binnen = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!binnen) dlg.close();
    }));

    if (!lees(OPSLAG.url) || !lees(OPSLAG.geheim)) {
        toonView('koppelen');
        return;
    }

    // Direct de laatst bekende stand tonen, daarna verversen
    try {
        const cache = JSON.parse(lees(OPSLAG.cache));
        if (cache) staat = cache;
    } catch { /* geen cache */ }

    toonView('app');
    resetFormulier();
    renderMaand();
    vernieuwen(Boolean(staat.ritten.length));

    // Terug naar de app na een tijdje: even verversen
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && lees(OPSLAG.url)) vernieuwen(true);
    });
}

init();
