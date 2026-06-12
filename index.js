const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = "";
let selectedRecord = null;
let isEditing = false;

window.onload = function() {
    // 1. DIRECT de chauffeurs laden uit Supabase
    loadDrivers();

    const months = ["Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli", "Augustus", "September", "Oktober", "November", "December"];
    const mSelect = document.getElementById('month-select');
    const adminMSelect = document.getElementById('admin-month-select');

    months.forEach((m, i) => {
        let opt = document.createElement('option');
        opt.value = i; opt.innerHTML = m;
        if(mSelect) mSelect.appendChild(opt);
        if(adminMSelect) adminMSelect.appendChild(opt.cloneNode(true));
    });

    // 2. URL Check voor wachtwoord reset
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'reset') {
        const userToReset = urlParams.get('user');
        showPage('reset');
        document.getElementById('reset-user-text').innerText = `Hoi ${userToReset}, kies een nieuw wachtwoord voor Maatexpress.`;
        window.resetTargetUser = userToReset;
        return;
    }

    // 3. Standaard waarden
    const curMonth = new Date().getMonth();
    if(mSelect) mSelect.value = curMonth;
    if(adminMSelect) adminMSelect.value = curMonth;
    if(document.getElementById('datum_input')) document.getElementById('datum_input').valueAsDate = new Date();

    // 4. Auto-login check
    const savedUser = localStorage.getItem('mx_user');
    if (savedUser) {
        currentUser = savedUser;
        applyUserView(currentUser);
    }

    // 5. Listeners
    document.querySelectorAll('.time-input').forEach(el => el.addEventListener('change', calculatePreview));
    document.getElementById('password-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') login(); });
};

function applyUserView(user) {
    document.getElementById('welcome-msg').innerText = "Hoi " + user.split(' ')[0];
    document.getElementById('navbar').classList.remove('hidden');
    document.getElementById('export-user-select').value = user;

    if (user === "Stephan van Deurse") {
        // Stephan ziet Admin én Export, maar geen invoer
        document.getElementById('nav-input').classList.add('hidden');
        document.getElementById('nav-admin').classList.remove('hidden');
        document.getElementById('nav-export').classList.remove('hidden');
        showPage('admin');
    } else {
        // Chauffeurs zien ALLEEN Invoer
        document.getElementById('nav-input').classList.remove('hidden');
        document.getElementById('nav-admin').classList.add('hidden');
        document.getElementById('nav-export').classList.add('hidden'); // Verberg export voor chauffeurs
        showPage('input');
        fetchHistory();
    }
}

async function login() {
    const user = document.getElementById('user-select').value;
    const passInput = document.getElementById('password-input').value;
    const spinner = document.getElementById('login-spinner');

    if (!passInput) return notify("Vul een wachtwoord in", "error");
    spinner.style.display = "block";

    try {
        let correctPassword = null;

        // A. Hardcoded check voor de baas
        if (user === "Stephan van Deurse") {
            correctPassword = "baas";
        } else {
            // B. Check eerst of er een NIEUW wachtwoord is in 'wachtwoord_requests'
            const { data: customPass } = await supabaseClient
                .from('wachtwoord_requests')
                .select('nieuw_wachtwoord')
                .eq('user_name', user)
                .order('datum', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (customPass) {
                correctPassword = customPass.nieuw_wachtwoord;
            } else {
                // C. Geen nieuw wachtwoord? Haal het standaard wachtwoord uit de chauffeurs tabel
                const { data: driver } = await supabaseClient
                    .from('chauffeurs')
                    .select('standaard_wachtwoord')
                    .eq('naam', user)
                    .maybeSingle();

                correctPassword = driver ? driver.standaard_wachtwoord : null;
            }
        }

        // De uiteindelijke controle
        if (correctPassword && passInput === correctPassword) {
            currentUser = user;
            localStorage.setItem('mx_user', user);
            applyUserView(user);
            notify("Welkom " + user.split(' ')[0]);
            document.getElementById('password-input').value = "";
        } else {
            notify("Wachtwoord onjuist", "error");
        }
    } catch (err) {
        console.error("Login Error:", err);
        notify("Fout bij inloggen", "error");
    } finally {
        spinner.style.display = "none";
    }
}
async function saveData() {
    let wStart = document.getElementById('w_start').value;
    let wEind = document.getElementById('w_eind').value;
    const sStart = document.getElementById('s_start').value;
    const sEind = document.getElementById('s_eind').value;

    // Als werk leeg is maar standby wel gevuld, zet werk op 00:00
    if ((!wStart || !wEind) && (sStart && sEind)) {
        wStart = "00:00";
        wEind = "00:00";
    }

    const data = {
        user_name: currentUser,
        datum: document.getElementById('datum_input').value,
        werk_start: wStart,
        werk_eind: wEind,
        stby_start: sStart || null,
        stby_eind: sEind || null
    };

    if(!data.werk_start || !data.werk_eind) return notify("Vul werktijden in", "error");

    const spinner = document.getElementById('save-spinner');
    spinner.style.display = "block";

    const { data: existing } = await supabaseClient.from('uren_registratie').select('id').eq('user_name', currentUser).eq('datum', data.datum).maybeSingle();

    let res = existing
        ? await supabaseClient.from('uren_registratie').update(data).eq('id', existing.id)
        : await supabaseClient.from('uren_registratie').insert([data]);

    if (!res.error) {
        notify("Opgeslagen!");
        resetForm();
        fetchHistory();
    } else {
        notify("Fout: " + res.error.message, "error");
    }
    spinner.style.display = "none";
}

async function adminAction(actionType) {
    const mIdx = document.getElementById('admin-month-select').value;
    const mName = document.getElementById('admin-month-select').options[mIdx].text;
    if (!confirm(`${actionType === 'sync' ? 'Synchroniseren' : 'Wissen'} voor IEDEREEN in ${mName}?`)) return;

    notify("Bezig met verwerken...");

    // NIEUW: Haal álle chauffeurs rechtstreeks uit de database
    const { data: chauffeurs } = await supabaseClient.from('chauffeurs').select('*');

    for (const chauffeur of chauffeurs) {
        const url = chauffeur.sheet_url;
        if (!url || url.includes("DE_")) continue; // Sla over als URL leeg is

        try {
            if (actionType === 'sync') {
                const { data } = await supabaseClient.from('uren_registratie').select('*').eq('user_name', chauffeur.naam);
                const filtered = data.filter(d => new Date(d.datum).getMonth() == mIdx);
                if (filtered.length > 0) {
                    const rijen = filtered.map(d => ({
                        maandNaam: mName, datum: d.datum,
                        dag: new Date(d.datum).toLocaleDateString('nl-NL', {weekday: 'long'}),
                        werk_start: d.werk_start, werk_eind: d.werk_eind,
                        wTotaal: "", sStart: d.stby_start || "", sEind: d.stby_eind || "", sTotaal: ""
                    }));
                    await fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify(rijen) });
                }
            } else {
                await fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: "clear", maandNaam: mName }) });
            }
        } catch (e) { console.error("Fout bij " + chauffeur.naam, e); }
    }
    notify("Klaar!");
}

async function syncToGoogleSheets(btn) {
    const targetUser = document.getElementById('export-user-select').value;
    const mIdx = document.getElementById('month-select').value;
    const spinner = document.getElementById('sync-spinner');

    // NIEUW: Haal de Sheet URL uit de database
    const { data: driver } = await supabaseClient.from('chauffeurs').select('sheet_url').eq('naam', targetUser).maybeSingle();
    const scriptUrl = driver ? driver.sheet_url : null;

    if(!scriptUrl) return notify("Geen Google Sheet URL ingesteld voor " + targetUser, "error");

    btn.disabled = true;
    spinner.style.display = "block";
    notify("Bezig met synchroniseren...");

    const { data, error } = await supabaseClient.from('uren_registratie').select('*').eq('user_name', targetUser);
    if (error) { spinner.style.display = "none"; btn.disabled = false; return notify("Fout: " + error.message, "error"); }

    const filtered = data.filter(d => new Date(d.datum).getMonth() == mIdx);

    const rijen = filtered.sort((a,b) => new Date(a.datum) - new Date(b.datum)).map(d => ({
        maandNaam: document.getElementById('month-select').options[mIdx].text,
        datum: d.datum,
        dag: new Date(d.datum).toLocaleDateString('nl-NL', {weekday: 'long'}),
        werk_start: d.werk_start, werk_eind: d.werk_eind, wTotaal: "",
        sStart: d.stby_start || "", sEind: d.stby_eind || "", sTotaal: ""
    }));

    try {
        await fetch(scriptUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(rijen) });
        notify("Gesynchroniseerd!");
    } catch (e) { notify("Sync mislukt", "error"); }

    btn.disabled = false;
    spinner.style.display = "none";
}

async function clearSheet(btn) {
    const targetUser = document.getElementById('export-user-select').value;
    const mName = document.getElementById('month-select').options[document.getElementById('month-select').value].text;

    if(!confirm("Sheet van " + targetUser + " voor " + mName + " wissen?")) return;

    // NIEUW: Haal URL uit de database
    const { data: driver } = await supabaseClient.from('chauffeurs').select('sheet_url').eq('naam', targetUser).maybeSingle();
    const scriptUrl = driver ? driver.sheet_url : null;

    if(!scriptUrl) return notify("Geen URL ingesteld voor " + targetUser, "error");

    try {
        await fetch(scriptUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: "clear", maandNaam: mName }) });
        notify("Google Sheet is leeg.");
    } catch (e) { notify("Wissen mislukt", "error"); }
}

function calculatePreview() {
    const ws = document.getElementById('w_start').value;
    const we = document.getElementById('w_eind').value;
    const ss = document.getElementById('s_start').value;
    const se = document.getElementById('s_eind').value;
    const badge = document.getElementById('hours-preview');

    const getDiff = (s, e) => {
        if(!s || !e) return 0;
        let d = (new Date(`1970-01-01T${e}`) - new Date(`1970-01-01T${s}`)) / 3600000;
        return d < 0 ? d + 24 : d;
    };

    // Nieuwe helper om decimalen (5.5) om te zetten naar tijd (5:30u)
    const formatTime = (decimalHours) => {
        const hours = Math.floor(decimalHours);
        const minutes = Math.round((decimalHours - hours) * 60);
        return `${hours}:${minutes < 10 ? '0' : ''}${minutes}u`;
    };

    const wU = getDiff(ws, we);
    const sU = getDiff(ss, se);

    if(wU > 0 || sU > 0 || (ss && se)) {
        badge.innerHTML = `Werk: ${formatTime(wU)}` + (sU > 0 ? ` | Standby: ${formatTime(sU)}` : '');
        badge.classList.remove('hidden');
    } else badge.classList.add('hidden');
}

async function fetchHistory() {
    const list = document.getElementById('history-list');
    const { data } = await supabaseClient.from('uren_registratie').select('*').eq('user_name', currentUser).order('datum', { ascending: false }).limit(5);
    list.innerHTML = data && data.length ? data.map(d => `
        <div class="history-item" onclick='openEditOverlay(${JSON.stringify(d)})' style="cursor:pointer;">
            <div><strong>${d.datum.split('-').reverse().join('-')}</strong><br><small>${d.werk_start}-${d.werk_eind}</small></div>
            <span style="color:var(--mx-blue)">➔</span>
        </div>`).join('') : "Geen ritten gevonden.";
}

function resetForm() {
    isEditing = false;
    ['w_start', 'w_eind', 's_start', 's_eind'].forEach(id => document.getElementById(id).value = "");
    document.getElementById('hours-preview').classList.add('hidden');
    document.getElementById('save-btn').querySelector('span').innerText = "💾 Zet in urenstaat";
}

function showPage(id) {
    document.querySelectorAll('.container').forEach(c => c.classList.add('hidden'));
    document.getElementById('view-' + id).classList.remove('hidden');
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('nav-' + id)?.classList.add('active');
}

function notify(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.innerText = msg; t.style.background = type === 'error' ? 'var(--mx-red)' : '#1e293b';
    t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
}

function logout() { localStorage.removeItem('mx_user'); location.reload(); }
function openEditOverlay(r) { selectedRecord = r; document.getElementById('edit-details').innerText = "Rit op " + r.datum; document.getElementById('edit-overlay').classList.remove('hidden'); }
function closeOverlay() { document.getElementById('edit-overlay').classList.add('hidden'); }
function prepareEdit() {
    isEditing = true;
    document.getElementById('datum_input').value = selectedRecord.datum;
    document.getElementById('w_start').value = selectedRecord.werk_start;
    document.getElementById('w_eind').value = selectedRecord.werk_eind;
    document.getElementById('s_start').value = selectedRecord.stby_start || "";
    document.getElementById('s_eind').value = selectedRecord.stby_eind || "";
    document.getElementById('save-btn').querySelector('span').innerText = "Update Rit";
    calculatePreview(); closeOverlay();
}
async function deleteRecord() {
    if(!confirm("Wissen?")) return;
    await supabaseClient.from('uren_registratie').delete().eq('id', selectedRecord.id);
    fetchHistory(); closeOverlay(); notify("Gewist");
}

async function forgotPassword() {
    const user = document.getElementById('user-select').value;

    // De baas check
    if (user === "Stephan van Deurse") return notify("Stephan, je wachtwoord is 'baas'", "info");

    notify("E-mailadres opzoeken in database...");

    // NIEUW: Haal email direct uit de Supabase database!
    const { data: driver } = await supabaseClient
        .from('chauffeurs')
        .select('email')
        .eq('naam', user)
        .maybeSingle();

    if (!driver || !driver.email) return notify("Geen e-mailadres bekend voor " + user, "error");

    const email = driver.email;
    notify("E-mail wordt verstuurd...");

    // URL token ophalen
    const urlParams = new URLSearchParams(window.location.search);
    const webstormToken = urlParams.get('_ijt');
    let baseLink = window.location.href.split('?')[0];
    let resetLink = baseLink + "?mode=reset&user=" + encodeURIComponent(user);
    if (webstormToken) resetLink += "&_ijt=" + webstormToken;

    const templateParams = {
        to_name: user,
        to_email: email,
        time: new Date().toLocaleString('nl-NL'),
        reset_link: resetLink
    };

    emailjs.send("service_qh526zx", "template_cff4eva", templateParams)
        .then(() => notify("Check je inbox! Mail gestuurd naar " + email))
        .catch((err) => notify("Fout: " + JSON.stringify(err), "error"));
}
async function confirmNewPassword() {
    const newPass = document.getElementById('new-password-input').value;
    const user = window.resetTargetUser; // De naam die we uit de URL hebben gevist

    if (!user) return notify("Sessie verlopen, vraag opnieuw aan", "error");
    if (newPass.length < 3) return notify("Wachtwoord is te kort!", "error");

    notify("Bezig met opslaan...");

    const { error } = await supabaseClient.from('wachtwoord_requests').insert([
        {
            user_name: user,
            nieuw_wachtwoord: newPass,
            datum: new Date().toISOString()
        }
    ]);

    if (!error) {
        notify("Wachtwoord succesvol gewijzigd!");
        // Na 2 seconden terug naar de normale inlogpagina (zonder mode=reset in de URL)
        setTimeout(() => {
            window.location.href = window.location.pathname;
        }, 2000);
    } else {
        notify("Fout: " + error.message, "error");
    }
}
// 1. Chauffeurs ophalen uit de database
async function loadDrivers() {
    const { data: chauffeurs, error } = await supabaseClient.from('chauffeurs').select('*').order('naam', { ascending: true });
    if (error) return console.error(error);

    // Update de dropdowns
    const selects = ['user-select', 'export-user-select'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = (id === 'user-select' ? '<option value="Stephan van Deurse">Stephan van Deurse</option>' : '');
        chauffeurs.forEach(c => {
            el.innerHTML += `<option value="${c.naam}">${c.naam}</option>`;
        });
    });

    // Update de admin lijst met de nieuwe compacte rode knop
    const listEl = document.getElementById('admin-driver-list');
    if (listEl) {
        listEl.innerHTML = chauffeurs.map(c => `
            <div class="driver-list-item">
                <span>
                    <strong>${c.naam}</strong><br>
                    <small style="color: #666;">${c.email}</small>
                </span>
                <button class="btn-delete-small" onclick="deleteDriver(${c.id}, '${c.naam}')">
                    🗑️
                </button>
            </div>
        `).join('');
    }
}
// 2. Nieuwe chauffeur opslaan
async function addDriver() {
    const naam = document.getElementById('new-driver-name').value;
    const email = document.getElementById('new-driver-email').value;
    const sheet = document.getElementById('new-driver-sheet').value;

    if (!naam || !email || !sheet) return notify("Vul alle velden in!", "error");

    const { error } = await supabaseClient.from('chauffeurs').insert([{ naam, email, sheet_url: sheet }]);

    if (!error) {
        notify(naam + " is toegevoegd!");
        document.getElementById('new-driver-name').value = "";
        document.getElementById('new-driver-email').value = "";
        document.getElementById('new-driver-sheet').value = "";
        loadDrivers();
    } else {
        notify("Fout: " + error.message, "error");
    }
}

// 3. Chauffeur verwijderen
async function deleteDriver(id, naam) {
    if (!confirm("Weet je zeker dat je " + naam + " wilt verwijderen?")) return;

    const { error } = await supabaseClient.from('chauffeurs').delete().eq('id', id);
    if (!error) {
        notify(naam + " verwijderd.");
        loadDrivers();
    }
}