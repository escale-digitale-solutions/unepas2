/* SICTOM Conventions — démo 100% navigateur (IndexedDB) */
'use strict';

let state = { user: null, online: navigator.onLine, deferredInstall: null };

class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data || {}; }
}

const ROUTES_API = [
  ['GET', /^\/auth\/me$/, () => {
    const user = Store.currentUser();
    if (!user) throw new ApiError('Non authentifié', 401, {});
    return { user: user };
  }],
  ['POST', /^\/auth\/login$/, (b) => Store.login(b.email, b.password).then((user) => {
    try { localStorage.setItem('sictom-demo-session', String(user.id)); } catch (e) {}
    return { user: user };
  })],
  ['POST', /^\/auth\/logout$/, () => {
    try { localStorage.removeItem('sictom-demo-session'); } catch (e) {}
    return Store.logout().then(() => ({ ok: true }));
  }],
  ['GET', /^\/dashboard$/, () => Store.dashboard()],
  ['GET', /^\/conventions$/, () => Store.listConventions()],
  ['POST', /^\/conventions$/, (b) => Store.createConvention(b)],
  ['GET', /^\/conventions\/(\d+)$/, (b, m) => Store.getConvention(Number(m[1]))],
  ['PUT', /^\/conventions\/(\d+)$/, (b, m) => Store.saveConvention(Number(m[1]), b)],
  ['DELETE', /^\/conventions\/(\d+)$/, (b, m) => Store.deleteConvention(Number(m[1])).then(() => ({ ok: true }))],
  ['POST', /^\/conventions\/(\d+)\/transition$/, (b, m) => Store.transitionConvention(Number(m[1]), b.action, b)],
  ['PUT', /^\/conventions\/(\d+)\/bacs$/, (b, m) => Store.assignBacsToConvention(Number(m[1]), b.bacIds)],
  ['GET', /^\/bacs$/, () => Store.listBacs()],
  ['POST', /^\/bacs$/, (b) => Store.createBac(b)],
  ['PUT', /^\/bacs\/(\d+)$/, (b, m) => Store.updateBac(Number(m[1]), b).then(() => ({ ok: true }))],
  ['GET', /^\/rfid$/, () => Store.listRfid()],
  ['POST', /^\/rfid$/, (b) => Store.addRfids(b.uids)],
  ['POST', /^\/rfid\/scan$/, (b) => Store.scanRfid(b.uid)],
  ['GET', /^\/bac-types$/, () => Store.listTypes()],
  ['POST', /^\/bac-types$/, (b) => Store.createType(b)],
  ['PUT', /^\/bac-types\/(\d+)$/, (b, m) => Store.updateType(Number(m[1]), b).then(() => ({ ok: true }))],
  ['GET', /^\/communes$/, () => Store.listCommunes()],
  ['POST', /^\/communes$/, (b) => Store.createCommune(b)],
  ['PUT', /^\/communes\/(\d+)$/, (b, m) => Store.updateCommune(Number(m[1]), b).then(() => ({ ok: true }))],
  ['GET', /^\/users$/, () => Store.listUsers()],
  ['POST', /^\/users$/, (b) => Store.createUser(b)],
  ['PUT', /^\/users\/(\d+)$/, (b, m) => Store.updateUser(Number(m[1]), b).then(() => ({ ok: true }))],
  ['GET', /^\/audit$/, () => Store.listAudit()],
  ['POST', /^\/import\/bacs$/, (b) => Store.importBacs(b.data)],
  ['POST', /^\/import\/conventions$/, (b) => Store.importConventions(b.data)],
];

async function routeApi(method, url, body) {
  for (const [mm, re, fn] of ROUTES_API) {
    const m = url.match(re);
    if (m && mm === method) return await fn(body || {}, m);
  }
  throw new Error('Fonction non disponible : ' + method + ' ' + url);
}

async function api(method, url, body, opts) {
  try {
    return await routeApi(method, url, body);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const msg = String((err && err.message) || 'Erreur inattendue');
    const status = /Authentification requise/.test(msg) ? 401 : 400;
    throw new ApiError(msg, status, {});
  }
}

// ============ Utilitaires UI ============
function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('fr-FR');
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('fr-FR');
}

function modal(html, opts) {
  opts = opts || {};
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = '<div class="modal ' + (opts.wide ? 'wide' : '') + '">' + html + '</div>';
  root.appendChild(backdrop);
  backdrop.close = () => backdrop.remove();
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeAndResolve(); });
  backdrop.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeAndResolve));
  let resolver = null;
  function closeAndResolve() { backdrop.close(); if (resolver) resolver(); resolver = null; }
  return backdrop;
}

function confirmDialog(message) {
  return new Promise((resolve) => {
    const m = modal(
      '<h3>Confirmation</h3><p>' + esc(message) + '</p>' +
      '<div class="modal-actions"><button class="btn btn-secondary" data-close>Annuler</button>' +
      '<button class="btn btn-danger" id="cf-yes">Confirmer</button></div>'
    );
    m.querySelector('#cf-yes').onclick = () => { m.close(); resolve(true); };
    m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => resolve(false)));
    m.addEventListener('mousedown', (e) => { if (e.target === m) resolve(false); });
  });
}

const STATUTS = {
  brouillon: { label: 'Brouillon', order: 0 },
  soumise: { label: 'Soumise', order: 1 },
  validee: { label: 'Validée (à signer)', order: 2 },
  active: { label: 'Active (signée)', order: 3 },
  cloturee: { label: 'Clôturée', order: 4 },
  rejetee: { label: 'Rejetée', order: 5 },
};
function badgeStatut(s) { return '<span class="badge badge-' + esc(s) + '">' + esc(STATUTS[s] ? STATUTS[s].label : s) + '</span>'; }
function badgeEtatBac(e) {
  const map = { stock: 'En stock', affecte: 'Affecté', hs: 'Hors service' };
  return '<span class="badge badge-' + esc(e) + '">' + (map[e] || e) + '</span>';
}
function badgeRfid(e) {
  const map = { libre: 'Libre', affecte: 'Affectée' };
  return '<span class="badge badge-' + esc(e) + '">' + (map[e] || e) + '</span>';
}

async function apiGet(url) { return api('GET', url); }

// ============ Navigation ============
const NAV = {
  admin: [
    { section: 'Pilotage' },
    { hash: 'dashboard', label: 'Tableau de bord', icon: '📊' },
    { hash: 'conventions', label: 'Conventions', icon: '📁' },
    { section: 'Parc' },
    { hash: 'bacs', label: 'Conteneurs', icon: '🗑️' },
    { hash: 'rfid', label: 'RFID', icon: '📡' },
    { hash: 'bac-types', label: 'Types de conteneurs', icon: '🏷️' },
    { section: 'Administration' },
    { hash: 'communes', label: 'Collectivités', icon: '🏛️' },
    { hash: 'users', label: 'Utilisateurs', icon: '👥' },
    { hash: 'data', label: 'Imports / Exports', icon: '📦' },
    { hash: 'backups', label: 'Sauvegardes', icon: '💾' },
    { hash: 'audit', label: "Journal d'audit", icon: '🧾' },
  ],
  prepareur: [
    { section: 'Pilotage' },
    { hash: 'dashboard', label: 'Tableau de bord', icon: '📊' },
    { hash: 'conventions', label: 'Conventions', icon: '📁' },
    { section: 'Parc' },
    { hash: 'bacs', label: 'Conteneurs', icon: '🗑️' },
    { hash: 'rfid', label: 'RFID', icon: '📡' },
    { hash: 'bac-types', label: 'Types de conteneurs', icon: '🏷️' },
    { section: 'Données' },
    { hash: 'communes', label: 'Collectivités', icon: '🏛️' },
    { hash: 'data', label: 'Imports / Exports', icon: '📦' },
  ],
  commune: [
    { section: 'Mon espace' },
    { hash: 'dashboard', label: 'Tableau de bord', icon: '📊' },
    { hash: 'conventions', label: 'Mes conventions', icon: '📁' },
    { hash: 'bacs', label: 'Mes conteneurs', icon: '🗑️' },
  ],
  usager: [
    { section: 'Mon espace' },
    { hash: 'dashboard', label: 'Tableau de bord', icon: '📊' },
    { hash: 'conventions', label: 'Mes conventions', icon: '📁' },
    { hash: 'bacs', label: 'Mes conteneurs', icon: '🗑️' },
  ],
};

function renderNav() {
  const items = NAV[state.user.role] || [];
  const sb = document.getElementById('sidebar');
  sb.innerHTML = items.map((i) => i.section
    ? '<div class="nav-section">' + esc(i.section) + '</div>'
    : '<a href="#/' + i.hash + '" data-nav="' + i.hash + '">' + i.icon + ' ' + esc(i.label) + '</a>'
  ).join('');
}

function activeNav(hash) {
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === hash));
}

function go(hash) { location.hash = '#/' + hash; }

// ============ Router ============
const ROUTES = {
  dashboard: viewDashboard,
  conventions: viewConventions,
  convention: viewConventionDetail,
  bacs: viewBacs,
  rfid: viewRfid,
  'bac-types': viewBacTypes,
  communes: viewCommunes,
  users: viewUsers,
  data: viewData,
  backups: viewBackups,
  audit: viewAudit,
};

async function router() {
  if (!state.user) return;
  const hash = location.hash.replace(/^#\//, '') || 'dashboard';
  const parts = hash.split('/');
  const name = parts[0], param = parts[1];
  document.getElementById('sidebar').classList.remove('open');
  activeNav(name);
  const fn = ROUTES[name] || viewDashboard;
  try {
    await fn(param);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return logoutAndShowLogin();
    document.getElementById('main').innerHTML = '<div class="card"><h3>Erreur</h3><p>' + esc(e.message) + '</p></div>';
  }
}
window.addEventListener('hashchange', router);

// ============ Auth / boot ============
function logoutAndShowLogin() {
  state.user = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('login-error');
  errBox.classList.add('hidden');
  try {
    const d = await api('POST', '/auth/login', {
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value,
      });
      state.user = d.user;
      enterApp();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  }
});

document.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
  const creds = b.dataset.demo.split('|');
  document.getElementById('login-email').value = creds[0];
  document.getElementById('login-password').value = creds[1];
  document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
}));

document.getElementById('btn-logout').addEventListener('click', async () => {
  await api('POST', '/auth/logout', null, { queueOffline: false }).catch(() => {});
  logoutAndShowLogin();
});

document.getElementById('btn-menu').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

async function enterApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const initials = state.user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const roleLabel = { admin: 'Administrateur', prepareur: 'Préparateur', commune: 'Collectivité', usager: 'Usager' }[state.user.role];
  document.getElementById('user-chip').innerHTML =
    '<span class="avatar">' + esc(initials) + '</span><span class="who"><strong>' + esc(state.user.name) + '</strong><br><small>' + esc(roleLabel) + '</small></span>';
  renderNav();
  goDashboardOrRoute();
}

function goDashboardOrRoute() {
  if (location.hash.startsWith('#/')) router();
  else go('dashboard');
}

(async function boot() {
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('./sw.js').catch(() => {}); } catch (e) {}
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstall = e;
    document.getElementById('btn-install').classList.remove('hidden');
  });
  document.getElementById('btn-install').addEventListener('click', async () => {
    if (!state.deferredInstall) return;
    state.deferredInstall.prompt();
    await state.deferredInstall.userChoice;
    state.deferredInstall = null;
    document.getElementById('btn-install').classList.add('hidden');
  });
  try {
    await DemoDB.init();
  } catch (e) {
    document.getElementById('login-error').textContent = 'Cet environnement ne supporte pas IndexedDB.';
    document.getElementById('login-error').classList.remove('hidden');
    return;
  }
  let saved = null;
  try { saved = localStorage.getItem('sictom-demo-session'); } catch (e) {}
  if (saved) {
    try {
      const u = await Store.loginById(saved);
      if (u) { state.user = u; enterApp(); return; }
    } catch (e) {}
  }
  logoutAndShowLogin();
})();

// ============ Vue : Tableau de bord ============
async function viewDashboard() {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="card">Chargement…</div>';
  const s = await apiGet('/dashboard');
  const statutCards = s.conventions_par_statut.map((x) =>
    '<div class="stat"><div class="ico" style="background:#eef6f0">📁</div>' +
    '<div><div class="val">' + x.c + '</div><div class="lbl">' + esc(STATUTS[x.statut] ? STATUTS[x.statut].label : x.statut) + '</div></div></div>'
  ).join('');
  const etatsBacs = s.bacs_par_etat.map((x) =>
    '<div class="stat"><div class="ico" style="background:#eef2f6">🗑️</div>' +
    '<div><div class="val">' + x.c + '</div><div class="lbl">' + (({ stock: 'En stock', affecte: 'Affectés', hs: 'Hors service' })[x.etat] || x.etat) + '</div></div></div>'
  ).join('');
  const roleActions = ['admin', 'prepareur'].includes(state.user.role)
    ? '<a class="btn btn-primary" href="#/conventions">Voir les conventions</a>'
    : '<a class="btn btn-primary" href="#/conventions">Voir mes conventions</a>';

  main.innerHTML =
    '<div class="page-title"><h2>Bonjour, ' + esc(state.user.name) + ' 👋</h2><span class="spacer"></span>' + roleActions + '</div>' +
    '<h3 style="margin:0 0 10px">Conventions par statut</h3>' +
    '<div class="stat-grid">' + (statutCards || '<p class="muted">Aucune convention</p>') + '</div>' +
    '<h3 style="margin:18px 0 10px">Parc de conteneurs</h3>' +
    '<div class="stat-grid">' +
      '<div class="stat"><div class="ico" style="background:#eef2f6">🗂️</div><div><div class="val">' + s.total_bacs + '</div><div class="lbl">Conteneurs au total</div></div></div>' +
      etatsBacs +
      (['admin', 'prepareur'].includes(state.user.role)
        ? '<div class="stat"><div class="ico" style="background:#eef2f6">📡</div><div><div class="val">' + s.rfid_libres + '</div><div class="lbl">Étiquettes RFID libres</div></div></div>' +
          '<div class="stat"><div class="ico" style="background:#eef2f6">🏛️</div><div><div class="val">' + s.total_communes + '</div><div class="lbl">Collectivités</div></div></div>'
        : '') +
    '</div>' +
    (s.prochaines_echeances.length
      ? '<div class="card"><h3 style="margin-top:0">Prochaines échéances de convention</h3><div class="table-scroll"><table class="data">' +
        '<thead><tr><th>Référence</th><th>Échéance</th></tr></thead><tbody>' +
        s.prochaines_echeances.map((x) =>
          '<tr><td><a class="link" href="#/convention/' + x.id + '">' + esc(x.reference) + '</a></td><td>' + fmtDate(x.date_fin) + '</td></tr>').join('') +
        '</tbody></table></div></div>' : '');
}

// ============ Vue : liste des conventions ============
async function viewConventions() {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="card">Chargement…</div>';
  const convs = await apiGet('/conventions');
  const canCreate = ['admin', 'prepareur', 'commune'].includes(state.user.role);
  const mine = ['commune', 'usager'].includes(state.user.role);

  main.innerHTML =
    '<div class="page-title"><h2>' + (mine ? 'Mes conventions' : 'Conventions') + '</h2><span class="spacer"></span>' +
    (canCreate ? '<button class="btn btn-primary" id="btn-new-conv">＋ Nouvelle convention</button>' : '') + '</div>' +
    '<div class="toolbar"><input id="conv-search" type="search" placeholder="Rechercher (réf., objet, commune)…" />' +
    '<select id="conv-filter-statut"><option value="">Tous statuts</option>' +
    Object.keys(STATUTS).map((k) => '<option value="' + k + '">' + esc(STATUTS[k].label) + '</option>').join('') +
    '</select></div>' +
    '<div class="card"><div class="table-scroll"><table class="data" id="conv-table">' +
    '<thead><tr><th>Référence</th><th>Commune</th><th>Objet</th><th>Cont.</th><th>Période</th><th>Statut</th><th></th></tr></thead><tbody></tbody></table></div></div>';

  const tbody = main.querySelector('#conv-table tbody');
  function fill() {
    const q = main.querySelector('#conv-search').value.toLowerCase();
    const st = main.querySelector('#conv-filter-statut').value;
    const rows = convs.filter((c) =>
      (!q || [c.reference, c.objet, c.commune_name].join(' ').toLowerCase().includes(q)) &&
      (!st || c.statut === st));
    tbody.innerHTML = rows.map((c) =>
      '<tr data-id="' + c.id + '" style="cursor:pointer">' +
      '<td><strong>' + esc(c.reference) + '</strong></td>' +
      '<td>' + esc(c.commune_name) + '</td>' +
      '<td>' + esc(c.objet) + '</td>' +
      '<td>' + c.nb_conteneurs + '</td>' +
      '<td>' + fmtDate(c.date_debut) + ' → ' + fmtDate(c.date_fin) + '</td>' +
      '<td>' + badgeStatut(c.statut) + '</td><td>›</td></tr>').join('') ||
      '<tr><td colspan="7" class="muted">Aucune convention</td></tr>';
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => go('convention/' + tr.dataset.id); });
  }
  main.querySelector('#conv-search').oninput = fill;
  main.querySelector('#conv-filter-statut').onchange = fill;
  fill();
  if (canCreate) main.querySelector('#btn-new-conv').onclick = () => openConventionForm(null);
}

// ---------- Formulaire convention (création / édition) ----------
async function openConventionForm(existing) {
  const [communes, types] = await Promise.all([api('GET', '/communes'), api('GET', '/bac-types')]);
  const lignes = (existing && existing.lignes) || [];
  const isCommune = state.user.role === 'commune';
  const m = modal(
    '<h3>' + (existing ? 'Modifier ' + esc(existing.reference) : 'Nouvelle convention') + '</h3>' +
    '<form id="conv-form">' +
    (isCommune ? '' :
      '<label>Collectivité titulaire<select required name="commune_id"><option value="">— Choisir —</option>' +
      communes.map((c) => '<option value="' + c.id + '"' + (existing && existing.commune_id == c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
      '</select></label>') +
    '<label>Objet de la convention<input name="objet" required placeholder="Ex. Marché hebdomadaire" value="' + esc(existing ? existing.objet : '') + '" /></label>' +
    '<div class="grid2">' +
    '<label>Lieu de mise à disposition<input name="lieu" placeholder="Adresse / place" value="' + esc(existing ? existing.lieu || '' : '') + '" /></label>' +
    '<label>Parcours / service concerné<input name="parcours" placeholder="Ex. Collecte des déchets ménagers" value="' + esc(existing ? existing.parcours || '' : '') + '" /></label>' +
    '<label>Date de début<input type="date" name="date_debut" value="' + esc(existing ? existing.date_debut || '' : '') + '" /></label>' +
    '<label>Date de fin<input type="date" name="date_fin" value="' + esc(existing ? existing.date_fin || '' : '') + '" /></label>' +
    '<label>Nom du contact<input name="contact_name" value="' + esc(existing ? existing.contact_name || '' : '') + '" /></label>' +
    '<label>Email du contact<input type="email" name="contact_email" value="' + esc(existing ? existing.contact_email || '' : '') + '" /></label>' +
    '</div>' +
    '<h4 style="margin:12px 0 6px">Conteneurs souhaités</h4>' +
    '<div id="lignes"></div>' +
    '<button type="button" class="btn btn-secondary btn-sm" id="add-ligne">＋ Ajouter une ligne</button>' +
    '<div class="modal-actions"><button type="button" class="btn btn-secondary" data-close>Annuler</button>' +
    '<button type="submit" class="btn btn-primary">' + (existing ? 'Enregistrer' : 'Créer la convention') + '</button></div>' +
    '</form>', { wide: true });

  const lignesDiv = m.querySelector('#lignes');
  function addLigne(l) {
    l = l || {};
    const div = document.createElement('div');
    div.className = 'grid2';
    div.innerHTML =
      '<label>Type de conteneur<select name="type_id">' +
      types.map((t) => '<option value="' + t.id + '"' + (l.type_id == t.id ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') +
      '</select></label>' +
      '<label>Quantité<input type="number" min="1" name="quantite" value="' + (l.quantite || 1) + '" /></label>';
    lignesDiv.appendChild(div);
  }
  addLigne(lignes[0]);
  for (let i = 1; i < lignes.length; i++) addLigne(lignes[i]);
  m.querySelector('#add-ligne').onclick = () => addLigne();

  m.querySelector('#conv-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      commune_id: fd.get('commune_id'),
      objet: fd.get('objet'),
      lieu: fd.get('lieu'),
      parcours: fd.get('parcours'),
      date_debut: fd.get('date_debut'),
      date_fin: fd.get('date_fin'),
      contact_name: fd.get('contact_name'),
      contact_email: fd.get('contact_email'),
      lignes: Array.from(lignesDiv.querySelectorAll('.grid2')).map((g) => ({
        type_id: g.querySelector('[name=type_id]').value,
        quantite: Number(g.querySelector('[name=quantite]').value),
      })),
    };
    try {
      if (existing && existing.id) {
        await api('PUT', '/conventions/' + existing.id, body);
        toast('Convention mise à jour ✔');
        m.close();
        router();
      } else {
        const res = await api('POST', '/conventions', body);
        toast('Convention ' + res.reference + ' créée ✔');
        m.close();
        go('convention/' + res.id);
      }
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ============ Vue : Détail convention ============
async function viewConventionDetail(id) {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="card">Chargement…</div>';
  const c = await apiGet('/conventions/' + id);
  const role = state.user.role;
  const canEdit = (role === 'commune' && c.statut === 'brouillon') ||
    (['admin', 'prepareur'].includes(role) && c.statut !== 'cloturee');
  const canSubmit = ['prepareur', 'admin', 'commune'].includes(role) && ['brouillon', 'rejetee'].includes(c.statut);
  const canValidate = role === 'admin' && c.statut === 'soumise';
  const canReject = role === 'admin' && c.statut === 'soumise';
  const canSign = c.statut === 'validee' && (role === 'admin' ||
    ((role === 'commune' || role === 'usager') && state.user.commune_id === c.commune_id));
  const canCloturer = ['admin', 'prepareur'].includes(role) && c.statut === 'active';
  const canAssignBacs = ['admin', 'prepareur'].includes(role) && ['validee', 'active'].includes(c.statut);
  const canDelete = ['admin', 'prepareur'].includes(role) && c.statut === 'brouillon';

  const flowSteps = [['brouillon', 'Brouillon'], ['soumise', 'Soumise'], ['validee', 'Validée'], ['active', 'Signée / Active'], ['cloturee', 'Clôturée']];
  const curOrder = STATUTS[c.statut] ? STATUTS[c.statut].order : 0;
  const flow = c.statut === 'rejetee'
    ? '<div class="flow"><span class="step done">Brouillon</span><span class="sep">→</span>' +
      '<span class="step">Soumise</span><span class="sep">→</span>' +
      '<span class="step" style="background:#fee2e2;color:#b91c1c">Rejetée</span></div>'
    : '<div class="flow">' + flowSteps.map((s, i) => {
        const order = STATUTS[s[0]].order;
        const cls = c.statut === s[0] ? 'current' : (curOrder >= order ? 'done' : '');
        return (i ? '<span class="sep">→</span>' : '') + '<span class="step ' + cls + '">' + s[1] + '</span>';
      }).join('') + '</div>';

  main.innerHTML =
    '<div class="page-title"><a href="#/conventions" class="btn btn-secondary btn-sm">← Retour</a>' +
    '<h2>' + esc(c.reference) + '</h2> ' + badgeStatut(c.statut) +
    '<span class="spacer"></span>' +
    (['admin', 'prepareur'].includes(role) ? '<button class="btn btn-secondary" id="btn-pdf">📄 PDF</button>' : '') +
    '</div>' + flow +
    (c.statut === 'rejetee'
      ? '<div class="card" style="border-left:4px solid var(--danger)"><strong>Motif du rejet :</strong> ' + esc(c.motif_rejet || '—') + '</div>' : '') +
    '<div class="detail-actions">' +
    (canEdit ? '<button class="btn btn-secondary" id="btn-edit">✏️ Modifier</button>' : '') +
    (canSubmit ? '<button class="btn btn-primary" id="btn-submit">📤 Soumettre à validation</button>' : '') +
    (canValidate ? '<button class="btn btn-primary" id="btn-validate">✅ Valider</button>' : '') +
    (canReject ? '<button class="btn btn-danger" id="btn-reject">✖️ Rejeter</button>' : '') +
    (canSign ? '<button class="btn btn-primary" id="btn-sign">✍️ Signer électroniquement</button>' : '') +
    (canCloturer ? '<button class="btn btn-secondary" id="btn-cloturer">📁 Clôturer</button>' : '') +
    (canDelete ? '<button class="btn btn-danger" id="btn-delete">🗑️ Effacer le brouillon</button>' : '') +
    '</div>' +
    '<div class="card"><h3 style="margin-top:0">Informations</h3><div class="grid2">' +
    '<p><strong>Collectivité :</strong> ' + esc(c.commune_name) + '</p>' +
    '<p><strong>Objet :</strong> ' + esc(c.objet) + '</p>' +
    '<p><strong>Lieu :</strong> ' + esc(c.lieu || '—') + '</p>' +
    '<p><strong>Parcours :</strong> ' + esc(c.parcours || '—') + '</p>' +
    '<p><strong>Période :</strong> ' + fmtDate(c.date_debut) + ' → ' + fmtDate(c.date_fin) + '</p>' +
    '<p><strong>Contact :</strong> ' + esc(c.contact_name || '—') + ' ' + esc(c.contact_email || '') + '</p>' +
    '<p><strong>Statut :</strong> ' + badgeStatut(c.statut) + '</p>' +
    '<p><strong>Signature :</strong> ' + (c.signature_date ? esc(c.signature_name) + ' — ' + fmtDateTime(c.signature_date) : 'En attente') + '</p>' +
    '</div></div>' +
    '<div class="card"><h3 style="margin-top:0">Conteneurs souhaités</h3><div class="table-scroll"><table class="data">' +
    '<thead><tr><th>Type</th><th>Volume</th><th>Quantité</th></tr></thead><tbody>' +
    c.lignes.map((l) => '<tr><td>' + esc(l.label) + '</td><td>' + l.volume_l + ' L</td><td>' + l.quantite + '</td></tr>').join('') +
    '</tbody></table></div></div>' +
    '<div class="card"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
    '<h3 style="margin:0 flex">Conteneurs affectés (' + c.bacs.length + ')</h3>' +
    '<span class="spacer" style="flex:1"></span>' +
    (canAssignBacs ? '<button class="btn btn-secondary btn-sm" id="btn-assign">🧷 Affecter des conteneurs</button>' : '') +
    '</div>' +
    (c.bacs.length
      ? '<div class="table-scroll"><table class="data"><thead><tr><th>N° série</th><th>Type</th><th>RFID</th><th>Adresse</th></tr></thead><tbody>' +
        c.bacs.map((b) =>
          '<tr><td><strong>' + esc(b.serial) + '</strong></td><td>' + esc(b.type_label) + '</td>' +
          '<td>' + (b.rfid ? '📡 ' + esc(b.rfid) : '<span class="muted">non affectée</span>') + '</td>' +
          '<td>' + esc(b.adresse || '—') + '</td></tr>').join('') +
        '</tbody></table></div>'
      : '<p class="muted">Aucun conteneur affecté pour le moment.</p>') +
    '</div>';

  const on = (sel, fn) => { const el = main.querySelector(sel); if (el) el.onclick = fn; };
  on('#btn-pdf', async () => {
    try {
      const bytes = await buildConventionPdf(Number(c.id));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = c.reference + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      toast('PDF généré ✔');
    } catch (e) { toast(e.message, 'error'); }
  });
  on('#btn-edit', () => openConventionForm(c));
  on('#btn-submit', async () => {
    try {
      await api('POST', '/conventions/' + c.id + '/transition', { action: 'submit' });
      toast('Convention soumise à validation ✔');
      viewConventionDetail(id);
    } catch (e) { toast(e.message, 'error'); }
  });
  on('#btn-validate', async () => {
    try {
      await api('POST', '/conventions/' + c.id + '/transition', { action: 'validate' });
      toast('Convention validée ✔');
      viewConventionDetail(id);
    } catch (e) { toast(e.message, 'error'); }
  });
  on('#btn-reject', async () => {
    const motif = window.prompt('Motif du rejet :');
    if (motif === null) return;
    try {
      await api('POST', '/conventions/' + c.id + '/transition', { action: 'reject', motif });
      toast('Convention rejetée', 'warn');
      viewConventionDetail(id);
    } catch (e) { toast(e.message, 'error'); }
  });
  on('#btn-cloturer', async () => {
    if (!(await confirmDialog('Clôturer cette convention ? Les conteneurs seront libérés.'))) return;
    try {
      await api('POST', '/conventions/' + c.id + '/transition', { action: 'cloturer' });
      toast('Convention clôturée, conteneurs libérés ✔');
      viewConventionDetail(id);
    } catch (e) { toast(e.message, 'error'); }
  });
  on('#btn-delete', async () => {
    if (!(await confirmDialog('Supprimer définitivement ce brouillon ?'))) return;
    try {
      await api('DELETE', '/conventions/' + c.id);
      toast('Brouillon supprimé ✔');
      go('conventions');
    } catch (e) { toast(e.message, 'error'); }
  });
  on('#btn-sign', () => openSignature(c));
  on('#btn-assign', () => openBacAssignment(c));
}

// ---------- Signature électronique ----------
function openSignature(conv) {
  const role = state.user.role;
  let name = '', roleText = '';
  if (role === 'commune' || role === 'usager') {
    name = state.user.name;
    roleText = 'Titulaire de la convention';
  }
  const m = modal(
    '<h3>✍️ Signature électronique — ' + esc(conv.reference) + '</h3>' +
    '<div class="grid2">' +
    '<label>Nom du signataire<input id="sig-name" required value="' + esc(name) + '" /></label>' +
    '<label>Qualité<input id="sig-role" placeholder="Ex. Maire, Représentant…" value="' + esc(roleText) + '" /></label>' +
    '</div>' +
    '<div class="sig-wrap"><canvas id="sig-canvas" class="sig-canvas" width="520" height="200"></canvas>' +
    '<div style="margin-top:8px;display:flex;gap:8px;justify-content:center">' +
    '<button type="button" class="btn btn-secondary btn-sm" id="sig-clear">Effacer</button></div></div>' +
    '<div class="modal-actions"><button type="button" class="btn btn-secondary" data-close>Annuler</button>' +
    '<button class="btn btn-primary" id="sig-sign">Signer la convention</button></div>', { wide: true });

  const canvas = m.querySelector('#sig-canvas');
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#0f2c2f';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  let drawing = false, hasDrawn = false;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) };
  };
  const start = (e) => { drawing = true; hasDrawn = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
  const move = (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
  const stop = () => { drawing = false; };
  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointerleave', stop);
  m.querySelector('#sig-clear').onclick = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); hasDrawn = false; };

  m.querySelector('#sig-sign').onclick = async () => {
    const nom = m.querySelector('#sig-name').value.trim();
    if (!nom) return toast('Indiquez le nom du signataire', 'error');
    if (!hasDrawn) return toast('Dessinez la signature manuscrite', 'error');
    const png = canvas.toDataURL('image/png');
    try {
      await api('POST', '/conventions/' + conv.id + '/transition', {
        action: 'sign', signature_name: nom,
        signature_role: m.querySelector('#sig-role').value, signature_png: png,
      });
      toast('Convention signée électroniquement ✔');
      m.close();
      viewConventionDetail(conv.id);
    } catch (e) { toast(e.message, 'error'); }
  };
}

// ---------- Affectation des bacs ----------
async function openBacAssignment(conv) {
  const bacs = await api('GET', '/bacs');
  const affectables = bacs.filter((b) => b.etat === 'stock' || b.convention_id === conv.id);
  const selected = new Set(bacs.filter((b) => b.convention_id === conv.id).map((b) => b.id));
  const m = modal(
    '<h3>🧷 Affectation de conteneurs — ' + esc(conv.reference) + '</h3>' +
    '<p class="muted">Sélectionnez les conteneurs à mettre à disposition. Ceux non cochés seront libérés.</p>' +
    '<div class="table-scroll" style="max-height:320px;overflow-y:auto;border:1px solid var(--line);border-radius:10px">' +
    '<table class="data"><thead><tr><th></th><th>N° série</th><th>Type</th><th>RFID</th><th>État</th></tr></thead><tbody id="bac-list"></tbody></table></div>' +
    '<div class="modal-actions"><button type="button" class="btn btn-secondary" data-close>Annuler</button>' +
    '<button class="btn btn-primary" id="bac-ok">Enregistrer l\'affectation</button></div>', { wide: true });

  const tbody = m.querySelector('#bac-list');
  tbody.innerHTML = affectables.map((b) =>
    '<tr><td><input type="checkbox" data-id="' + b.id + '"' + (selected.has(b.id) ? ' checked' : '') + ' /></td>' +
    '<td><strong>' + esc(b.serial) + '</strong></td><td>' + esc(b.type_label) + '</td>' +
    '<td>' + (b.rfid ? '📡 ' + esc(b.rfid) : '<span class="muted">—</span>') + '</td>' +
    '<td>' + badgeEtatBac(b.etat) + '</td></tr>').join('') ||
    '<tr><td colspan="5" class="muted">Aucun conteneur disponible en stock</td></tr>';

  m.querySelector('#bac-ok').onclick = async () => {
    const ids = Array.from(tbody.querySelectorAll('input[type=checkbox]:checked')).map((i) => Number(i.dataset.id));
    try {
      await api('PUT', '/conventions/' + conv.id + '/bacs', { bacIds: ids });
      toast('Affectation enregistrée ✔');
      m.close();
      viewConventionDetail(conv.id);
    } catch (e) { toast(e.message, 'error'); }
  };
}

// ============ Vue : Conteneurs ============
async function viewBacs() {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="card">Chargement…</div>';
  const bacs = await apiGet('/bacs');
  const canManage = ['admin', 'prepareur'].includes(state.user.role);
  const communes = canManage ? await api('GET', '/communes') : [];
  const mine = ['commune', 'usager'].includes(state.user.role);

  main.innerHTML =
    '<div class="page-title"><h2>' + (mine ? 'Mes conteneurs' : 'Parc de conteneurs') + '</h2><span class="spacer"></span>' +
    (canManage ? '<button class="btn btn-primary" id="btn-new-bac">＋ Nouveau conteneur</button>' : '') + '</div>' +
    '<div class="toolbar"><input id="bac-search" type="search" placeholder="Rechercher (n° série, RFID, adresse)…" />' +
    '<select id="bac-filter-etat"><option value="">Tous états</option>' +
    '<option value="stock">En stock</option><option value="affecte">Affecté</option><option value="hs">Hors service</option></select></div>' +
    '<div class="card"><div class="table-scroll"><table class="data" id="bac-table">' +
    '<thead><tr><th>N° série</th><th>Type</th><th>RFID</th><th>État</th>' +
    (mine ? '' : '<th>Collectivité</th><th>Convention</th>') +
    '<th>Adresse</th>' + (canManage ? '<th></th>' : '') + '</tr></thead><tbody></tbody></table></div></div>';

  const tbody = main.querySelector('#bac-table tbody');
  function fill() {
    const q = main.querySelector('#bac-search').value.toLowerCase();
    const etat = main.querySelector('#bac-filter-etat').value;
    const rows = bacs.filter((b) =>
      (!q || [b.serial, b.rfid, b.adresse].join(' ').toLowerCase().includes(q)) &&
      (!etat || b.etat === etat));
    tbody.innerHTML = rows.map((b) =>
      '<tr><td><strong>' + esc(b.serial) + '</strong></td>' +
      '<td>' + esc(b.type_label) + ' <span class="muted">(' + b.volume_l + ' L)</span></td>' +
      '<td>' + (b.rfid ? '📡 ' + esc(b.rfid) : '<span class="muted">—</span>') + '</td>' +
      '<td>' + badgeEtatBac(b.etat) + '</td>' +
      (mine ? '' : '<td>' + esc(b.commune_name || '—') + '</td><td>' + esc(b.convention_ref || '—') + '</td>') +
      '<td>' + esc(b.adresse || '—') + '</td>' +
      (canManage
        ? '<td style="white-space:nowrap">' +
          '<button class="btn btn-secondary btn-sm" data-edit="' + b.id + '">✏️</button> ' +
          (b.etat !== 'hs' ? '<button class="btn btn-danger btn-sm" data-hs="' + b.id + '" title="Mettre hors service">🛠️</button>' : '') +
          '</td>' : '') +
      '</tr>').join('') || '<tr><td colspan="8" class="muted">Aucun conteneur</td></tr>';

    if (canManage) {
      tbody.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openBacForm(bacs.find((x) => x.id == b.dataset.edit)));
      tbody.querySelectorAll('[data-hs]').forEach((b) => b.onclick = async () => {
        if (!(await confirmDialog('Mettre ce conteneur hors service ?'))) return;
        try {
          await api('PUT', '/bacs/' + b.dataset.hs, { etat: 'hs' });
          toast('Conteneur mis hors service', 'warn');
          viewBacs();
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  }
  main.querySelector('#bac-search').oninput = fill;
  main.querySelector('#bac-filter-etat').onchange = fill;
  fill();
  if (canManage) main.querySelector('#btn-new-bac').onclick = () => openBacForm(null);
}

async function openBacForm(bac) {
  const types = await api('GET', '/bac-types');
  const m = modal(
    '<h3>' + (bac ? 'Modifier ' + esc(bac.serial) : 'Nouveau conteneur') + '</h3>' +
    '<form id="bac-form">' +
    (bac ? '' : '<label>Numéro de série <input name="serial" required placeholder="BAC-2025-001" /></label>') +
    '<div class="grid2">' +
    '<label>Type de conteneur<select name="type_id">' +
    types.map((t) => '<option value="' + t.id + '"' + (bac && bac.type_id == t.id ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') +
    '</select></label>' +
    '<label>État<select name="etat">' +
    '<option value="stock"' + (bac && bac.etat === 'stock' ? ' selected' : '') + '>En stock</option>' +
    '<option value="affecte"' + (bac && bac.etat === 'affecte' ? ' selected' : '') + '>Affecté</option>' +
    '<option value="hs"' + (bac && bac.etat === 'hs' ? ' selected' : '') + '>Hors service</option>' +
    '</select></label>' +
    (bac ? '<label>Adresse<input name="adresse" value="' + esc(bac.adresse || '') + '" /></label>' :
      '<label>Adresse <input name="adresse" placeholder="Adresse d\'implantation" /></label>') +
    '</div>' +
    '<label>Notes<textarea name="notes" rows="2">' + esc(bac ? bac.notes || '' : '') + '</textarea></label>' +
    '<div class="modal-actions"><button type="button" class="btn btn-secondary" data-close>Annuler</button>' +
    '<button type="submit" class="btn btn-primary">Enregistrer</button></div></form>');
  m.querySelector('#bac-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = { type_id: fd.get('type_id'), etat: fd.get('etat'), adresse: fd.get('adresse'), notes: fd.get('notes') };
    try {
      if (bac && bac.id) {
        await api('PUT', '/bacs/' + bac.id, body);
      } else {
        body.serial = fd.get('serial');
        await api('POST', '/bacs', body);
      }
      toast('Conteneur enregistré ✔');
      m.close();
      viewBacs();
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ============ Vue : RFID ============
async function viewRfid() {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="card">Chargement…</div>';
  const tags = await apiGet('/rfid');
  main.innerHTML =
    '<div class="page-title"><h2>Étiquettes RFID</h2><span class="spacer"></span>' +
    '<button class="btn btn-secondary" id="btn-scan">🔍 Scanner un UID</button>' +
    '<button class="btn btn-primary" id="btn-add-rfid">＋ Ajouter des UIDs</button></div>' +
    '<div class="toolbar"><input id="rfid-search" type="search" placeholder="Rechercher (UID ou n° de série)…" />' +
    '<select id="rfid-filter"><option value="">Tous</option><option value="libre">Libres</option><option value="affecte">Affectées</option></select></div>' +
    '<div class="card"><div class="table-scroll"><table class="data" id="rfid-table">' +
    '<thead><tr><th>UID</th><th>État</th><th>Conteneur lié</th><th>Créée le</th></tr></thead><tbody></tbody></table></div></div>';

  const tbody = main.querySelector('#rfid-table tbody');
  function fill() {
    const q = main.querySelector('#rfid-search').value.toLowerCase();
    const etat = main.querySelector('#rfid-filter').value;
    tbody.innerHTML = tags.filter((t) =>
      (!q || [t.uid, t.bac_serial].join(' ').toLowerCase().includes(q)) && (!etat || t.etat === etat))
      .map((t) =>
        '<tr><td><strong>📡 ' + esc(t.uid) + '</strong></td>' +
        '<td>' + badgeRfid(t.etat) + '</td>' +
        '<td>' + esc(t.bac_serial || '—') + '</td>' +
        '<td>' + fmtDate(t.created_at) + '</td></tr>').join('') ||
      '<tr><td colspan="4" class="muted">Aucune étiquette</td></tr>';
  }
  main.querySelector('#rfid-search').oninput = fill;
  main.querySelector('#rfid-filter').onchange = fill;
  fill();

  main.querySelector('#btn-add-rfid').onclick = () => {
    const m = modal(
      '<h3>Nouvelles étiquettes RFID</h3>' +
      '<p class="muted">Saisissez ou scannez les UIDs, un par ligne.</p>' +
      '<textarea id="uid-list" rows="7" placeholder="E280-1105-A200-000000031&#10;E280-1105-A200-000000032"></textarea>' +
      '<div class="modal-actions"><button class="btn btn-secondary" data-close>Annuler</button>' +
      '<button class="btn btn-primary" id="uid-ok">Ajouter</button></div>');
    m.querySelector('#uid-ok').onclick = async () => {
      const uids = m.querySelector('#uid-list').value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!uids.length) return toast('Aucun UID saisi', 'error');
      try {
        const r = await api('POST', '/rfid', { uids });
        toast(r.created + ' étiquette(s) ajoutée(s) ✔');
        m.close();
        viewRfid();
      } catch (e) { toast(e.message, 'error'); }
    };
  };

  main.querySelector('#btn-scan').onclick = () => {
    const m = modal(
      '<h3>🔍 Scanner / saisir un UID RFID</h3>' +
      '<p class="muted">Utilisez votre lecteur (mode clavier) puis validez avec Entrée.</p>' +
      '<input id="scan-uid" placeholder="E280-1105-A200-…" />' +
      '<div id="scan-result" style="margin-top:12px"></div>' +
      '<div class="modal-actions"><button class="btn btn-secondary" data-close>Fermer</button></div>');
    const input = m.querySelector('#scan-uid');
    const result = m.querySelector('#scan-result');
    const run = async () => {
      const uid = input.value.trim();
      if (!uid) return;
      try {
        const r = await api('POST', '/rfid/scan', { uid });
        if (!r.trouve) { result.innerHTML = '<div class="form-error">UID inconnu dans le parc.</div>'; return; }
        const b = r.bac;
        result.innerHTML = b
          ? '<div class="card" style="margin:0"><p style="margin:0 0 6px">' + badgeEtatBac(b.etat) + ' <strong>' + esc(b.serial) +
            '</strong> — ' + esc(b.type_label) + '</p><p class="muted" style="margin:0">' +
            (b.commune_name ? 'Collectivité : ' + esc(b.commune_name) + ' · ' : '') + esc(b.adresse || 'sans adresse') + '</p></div>'
          : '<p>Cette étiquette n\'est rattachée à aucun conteneur.</p>';
      } catch (e) { result.innerHTML = '<div class="form-error">' + esc(e.message) + '</div>'; }
      input.focus();
    };
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  };
}

// ============ Vue : Types ============
async function viewBacTypes() {
  const main = document.getElementById('main');
  const types = await apiGet('/bac-types');
  const isAdmin = state.user.role === 'admin';
  main.innerHTML =
    '<div class="page-title"><h2>Types de conteneurs</h2><span class="spacer"></span>' +
    (isAdmin ? '<button class="btn btn-primary" id="btn-new-type">＋ Nouveau type</button>' : '') + '</div>' +
    '<div class="card"><div class="table-scroll"><table class="data">' +
    '<thead><tr><th>Code</th><th>Libellé</th><th>Volume</th><th>Couleur</th>' + (isAdmin ? '<th></th>' : '') + '</tr></thead><tbody>' +
    types.map((t) =>
      '<tr><td><strong>' + esc(t.code) + '</strong></td><td>' + esc(t.label) + '</td><td>' + t.volume_l + ' L</td>' +
      '<td><span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:' + esc(t.couleur) + ';vertical-align:middle"></span></td>' +
      (isAdmin ? '<td><button class="btn btn-secondary btn-sm" data-edit="' + t.id + '">✏️</button></td>' : '') + '</tr>').join('') +
    '</tbody></table></div></div>';
  if (!isAdmin) return;
  main.querySelector('#btn-new-type').onclick = () => openTypeForm(null);
  main.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openTypeForm(types.find((t) => t.id == b.dataset.edit)));
}

function openTypeForm(t) {
  const m = modal(
    '<h3>' + (t ? 'Modifier le type' : 'Nouveau type de conteneur') + '</h3>' +
    '<form id="type-form"><label>Code <input name="code" required value="' + esc(t ? t.code : '') + '" placeholder="B360" /></label>' +
    '<label>Libellé <input name="label" required value="' + esc(t ? t.label : '') + '" /></label>' +
    '<div class="grid2"><label>Volume (litres) <input type="number" name="volume_l" required value="' + (t ? t.volume_l : 240) + '" /></label>' +
    '<label>Couleur <input type="color" name="couleur" value="' + esc(t ? t.couleur : '#334455') + '" style="height:42px" /></label></div>' +
    '<div class="modal-actions"><button type="button" class="btn btn-secondary" data-close>Annuler</button>' +
    '<button type="submit" class="btn btn-primary">Enregistrer</button></div></form>');
  m.querySelector('#type-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      if (t) await api('PUT', '/bac-types/' + t.id, body);
      else await api('POST', '/bac-types', body);
      toast('Type enregistré ✔'); m.close(); viewBacTypes();
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ============ Vue : Collectivités ============
async function viewCommunes() {
  const main = document.getElementById('main');
  const communes = await apiGet('/communes');
  const isAdmin = state.user.role === 'admin';
  main.innerHTML =
    '<div class="page-title"><h2>Collectivités</h2><span class="spacer"></span>' +
    (isAdmin ? '<button class="btn btn-primary" id="btn-new-commune">＋ Nouvelle collectivité</button>' : '') + '</div>' +
    '<div class="card"><div class="table-scroll"><table class="data">' +
    '<thead><tr><th>Nom</th><th>Code INSEE</th><th>Contact</th><th>Email</th><th>Téléphone</th>' + (isAdmin ? '<th></th>' : '') + '</tr></thead><tbody>' +
    communes.map((c) =>
      '<tr><td><strong>' + esc(c.name) + '</strong></td><td>' + esc(c.code_insee || '—') + '</td>' +
      '<td>' + esc(c.contact_name || '—') + '</td><td>' + esc(c.email || '—') + '</td><td>' + esc(c.phone || '—') + '</td>' +
      (isAdmin ? '<td><button class="btn btn-secondary btn-sm" data-edit="' + c.id + '">✏️</button></td>' : '') + '</tr>').join('') +
    '</tbody></table></div></div>';
  if (!isAdmin) return;
  main.querySelector('#btn-new-commune').onclick = () => openCommuneForm(null);
  main.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openCommuneForm(communes.find((c) => c.id == b.dataset.edit)));
}

function openCommuneForm(c) {
  const m = modal(
    '<h3>' + (c ? 'Modifier ' + esc(c.name) : 'Nouvelle collectivité') + '</h3>' +
    '<form id="com-form">' +
    '<label>Nom <input name="name" required value="' + esc(c ? c.name : '') + '" /></label>' +
    '<div class="grid2">' +
    '<label>Code INSEE <input name="code_insee" value="' + esc(c ? c.code_insee || '' : '') + '" /></label>' +
    '<label>SIRET <input name="siret" value="' + esc(c ? c.siret || '' : '') + '" /></label>' +
    '<label>Contact <input name="contact_name" value="' + esc(c ? c.contact_name || '' : '') + '" /></label>' +
    '<label>Téléphone <input name="phone" value="' + esc(c ? c.phone || '' : '') + '" /></label>' +
    '</div>' +
    '<label>Email <input type="email" name="email" value="' + esc(c ? c.email || '' : '') + '" /></label>' +
    '<label>Adresse <input name="adresse" value="' + esc(c ? c.adresse || '' : '') + '" /></label>' +
    '<div class="modal-actions"><button type="button" class="btn btn-secondary" data-close>Annuler</button>' +
    '<button type="submit" class="btn btn-primary">Enregistrer</button></div></form>');
  m.querySelector('#com-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      if (c) await api('PUT', '/communes/' + c.id, body);
      else await api('POST', '/communes', body);
      toast('Collectivité enregistrée ✔'); m.close(); viewCommunes();
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ============ Vue : Utilisateurs ============
const ROLE_LABELS = { admin: '🛡️ Administrateur', prepareur: '📋 Préparateur', commune: '🏛️ Collectivité', usager: '👤 Usager' };

async function viewUsers() {
  const main = document.getElementById('main');
  const users = await apiGet('/users');
  const communes = await api('GET', '/communes');
  main.innerHTML =
    '<div class="page-title"><h2>Utilisateurs</h2><span class="spacer"></span>' +
    '<button class="btn btn-primary" id="btn-new-user">＋ Nouvel utilisateur</button></div>' +
    '<div class="card"><div class="table-scroll"><table class="data">' +
    '<thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Collectivité</th><th>Statut</th><th></th></tr></thead><tbody>' +
    users.map((u) =>
      '<tr><td><strong>' + esc(u.name) + '</strong></td>' +
      '<td>' + esc(u.email) + '</td>' +
      '<td>' + (ROLE_LABELS[u.role] || u.role) + '</td>' +
      '<td>' + esc(u.commune_name || '—') + '</td>' +
      '<td>' + (u.active ? '<span class="badge badge-active">Actif</span>' : '<span class="badge badge-rejetee">Désactivé</span>') + '</td>' +
      '<td style="white-space:nowrap">' +
      '<button class="btn btn-secondary btn-sm" data-edit="' + u.id + '">✏️</button> ' +
      '<button class="btn ' + (u.active ? 'btn-danger' : 'btn-secondary') + ' btn-sm" data-toggle="' + u.id + '">' + (u.active ? '🚫' : '✅') + '</button>' +
      '</td></tr>').join('') +
    '</tbody></table></div></div>';

  main.querySelector('#btn-new-user').onclick = () => openUserForm(null, communes);
  main.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openUserForm(users.find((u) => u.id == b.dataset.edit), communes));
  main.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => {
    const u = users.find((x) => x.id == b.dataset.toggle);
    try {
      await api('PUT', '/users/' + u.id, { active: !u.active });
      toast('Statut modifié ✔');
      viewUsers();
    } catch (e) { toast(e.message, 'error'); }
  });
}

function openUserForm(u, communes) {
  const m = modal(
    '<h3>' + (u ? 'Modifier ' + esc(u.name) : 'Nouvel utilisateur') + '</h3>' +
    '<form id="user-form">' +
    '<label>Nom complet <input name="name" required value="' + esc(u ? u.name : '') + '" /></label>' +
    '<label>Email <input type="email" name="email" required value="' + esc(u ? u.email : '') + '" ' + (u ? 'disabled' : '') + ' /></label>' +
    '<div class="grid2">' +
    '<label>Rôle<select name="role">' +
    Object.keys(ROLE_LABELS).map((r) => '<option value="' + r + '"' + (u && u.role === r ? ' selected' : '') + '>' + ROLE_LABELS[r] + '</option>').join('') +
    '</select></label>' +
    '<label>Collectivité liée<select name="commune_id"><option value="">—</option>' +
    communes.map((c) => '<option value="' + c.id + '"' + (u && u.commune_id == c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
    '</select></label>' +
    '<label>Téléphone <input name="phone" value="' + esc(u ? u.phone || '' : '') + '" /></label>' +
    '<label>Mot de passe' + (u ? ' <small class="muted">(vide = inchangé)</small>' : '') +
    '<input type="password" name="password" ' + (u ? '' : 'required') + ' placeholder="••••••" /></label>' +
    '</div>' +
    '<div class="modal-actions"><button type="button" class="btn btn-secondary" data-close>Annuler</button>' +
    '<button type="submit" class="btn btn-primary">Enregistrer</button></div></form>');
  m.querySelector('#user-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    try {
      if (u) {
        delete body.email;
        if (!body.password) delete body.password;
        await api('PUT', '/users/' + u.id, body);
      } else {
        await api('POST', '/users', body);
      }
      toast('Utilisateur enregistré ✔'); m.close(); viewUsers();
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ============ Vue : Imports / Exports (démo) ============
async function viewData() {
  const main = document.getElementById('main');
  function download(bytes, filename, mime) {
    const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  function readAsBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  main.innerHTML =
    '<div class="page-title"><h2>Imports / Exports Excel</h2></div>' +
    '<div class="card"><h3 style="margin-top:0">Exports</h3>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
    '<button class="btn btn-primary" id="exp-conv">\u2b07\ufe0f Conventions (.xlsx)</button>' +
    '<button class="btn btn-primary" id="exp-bacs">\u2b07\ufe0f Conteneurs (.xlsx)</button>' +
    '</div></div>' +
    '<div class="card"><h3 style="margin-top:0">Import de conteneurs</h3>' +
    '<p class="muted">Colonnes reconnues : <code>serial</code>, <code>type_code</code>, <code>rfid</code>. Les conteneurs existants sont mis à jour.</p>' +
    '<input type="file" id="file-bacs" accept=".xlsx,.xls,.csv" /></div>' +
    '<div class="card"><h3 style="margin-top:0">Import de conventions</h3>' +
    '<p class="muted">Colonnes reconnues : <code>commune</code>, <code>objet</code>, <code>lieu</code>, <code>date_debut</code>, <code>date_fin</code>, <code>type_code</code>, <code>quantite</code>.</p>' +
    '<input type="file" id="file-conv" accept=".xlsx,.xls,.csv" /></div>' +
    '<div id="import-result"></div>';

  main.querySelector('#exp-conv').onclick = async () => {
    try {
      const r = await Store.exportConventionsXlsx();
      download(r, 'conventions.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast('Export généré ✔');
    } catch (e) { toast(e.message, 'error'); }
  };
  main.querySelector('#exp-bacs').onclick = async () => {
    try {
      const r = await Store.exportBacsXlsx();
      download(r, 'conteneurs.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast('Export généré ✔');
    } catch (e) { toast(e.message, 'error'); }
  };

  async function doImport(inputId, endpoint) {
    const input = main.querySelector(inputId);
    const file = input.files[0];
    if (!file) return toast('Choisissez un fichier', 'error');
    try {
      const data = await readAsBase64(file);
      const r = await api('POST', endpoint, { data: data });
      const box = main.querySelector('#import-result');
      box.innerHTML =
        '<div class="card" style="border-left:4px solid var(--ok)">' +
        '<strong>' + r.imported + ' ligne(s) importée(s).</strong>' +
        (r.errors.length
          ? '<p style="margin:10px 0 4px;color:var(--danger)">' + r.errors.length + ' erreur(s) :</p>' +
            '<ul style="margin:0 0 0 18px">' + r.errors.slice(0, 20).map((e) =>
              '<li>' + esc(JSON.stringify(e.row)) + ' — ' + esc(e.error) + '</li>').join('') + '</ul>'
          : '') + '</div>';
      toast('Import terminé ✔');
    } catch (e) { toast(e.message, 'error'); }
  }
  main.querySelector('#file-bacs').onchange = () => doImport('#file-bacs', '/import/bacs');
  main.querySelector('#file-conv').onchange = () => doImport('#file-conv', '/import/conventions');
}

// ============ Vue : Sauvegardes (démo) ============
async function viewBackups() {
  const main = document.getElementById('main');
  const backups = await Store.listBackups();
  const rows = backups.map((b) =>
    '<tr><td>' + esc(b.name) + '</td><td>' + (b.size / 1024).toFixed(1) + ' Ko</td><td>' + fmtDateTime(b.created_at) + '</td></tr>').join('') ||
    '<tr><td colspan="3" class="muted">Aucune sauvegarde</td></tr>';
  main.innerHTML =
    '<div class="page-title"><h2>Sauvegardes</h2><span class="spacer"></span>' +
    '<button class="btn btn-secondary" id="btn-reset">\u267b\ufe0f Réinitialiser la démo</button>' +
    '<button class="btn btn-primary" id="btn-backup">\ud83d\udcbe Créer une sauvegarde</button></div>' +
    '<div class="card"><h3 style="margin-top:0">Sauvegardes en mémoire (20 dernières)</h3>' +
    '<div class="table-scroll"><table class="data">' +
    '<thead><tr><th>Nom</th><th>Taille</th><th>Date</th></tr></thead><tbody>' + rows +
    '</tbody></table></div></div>' +
    '<div class="card"><h3 style="margin-top:0">Restaurer depuis un fichier</h3>' +
    '<p class="muted">Sélectionnez un fichier de sauvegarde JSON exporté précédemment. Attention : les données actuelles seront entièrement écrasées.</p>' +
    '<input type="file" id="file-restore" accept=".json,application/json" /></div>';

  main.querySelector('#btn-backup').onclick = async () => {
    try {
      const r = await Store.createBackup();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r.json], { type: 'application/json' }));
      a.download = r.entry.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      toast('Sauvegarde créée et téléchargée ✔');
      viewBackups();
    } catch (e) { toast(e.message, 'error'); }
  };
  main.querySelector('#btn-reset').onclick = async () => {
    if (!(await confirmDialog('Réinitialiser la démo ? Toutes les modifications seront perdues et les données de démonstration seront régénérées.'))) return;
    try { localStorage.removeItem('sictom-demo-session'); } catch (e) {}
    await Store.resetDemo();
    logoutAndShowLogin();
    toast('Démo réinitialisée ✔');
  };
  main.querySelector('#file-restore').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!(await confirmDialog('Restaurer depuis ' + file.name + ' ? Les données actuelles seront écrasées.'))) { e.target.value = ''; return; }
    try {
      const text = await file.text();
      await Store.restoreBackupJson(text);
      try { localStorage.removeItem('sictom-demo-session'); } catch (er) {}
      logoutAndShowLogin();
      toast('Restauration terminée : reconnectez-vous ✔');
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ============ Vue : Audit ============
async function viewAudit() {
  const main = document.getElementById('main');
  const logs = await apiGet('/audit');
  main.innerHTML =
    '<div class="page-title"><h2>Journal d\'audit</h2></div>' +
    '<div class="card"><div class="table-scroll"><table class="data">' +
    '<thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Entité</th><th>Détails</th></tr></thead><tbody>' +
    logs.map((l) =>
      '<tr><td class="muted">' + fmtDateTime(l.created_at) + '</td>' +
      '<td><strong>' + esc(l.user_name || '—') + '</strong></td>' +
      '<td><code>' + esc(l.action) + '</code></td>' +
      '<td>' + esc(l.entity || '—') + ' ' + esc(l.entity_id || '') + '</td>' +
      '<td>' + esc(l.details || '') + '</td></tr>').join('') +
    '</tbody></table></div></div>';
}
