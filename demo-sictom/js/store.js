/* Couche données 100% navigateur — IndexedDB */
'use strict';

const DemoDB = (() => {
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('sictom-mad-demo', 1);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        ['users', 'communes', 'bac_types', 'bacs', 'rfid_tags', 'conventions', 'convention_lignes', 'audit_log', 'kv'].forEach((s) => {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) { return db.transaction(store, mode).objectStore(store); }
  const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const getAll = (s) => req2p(tx(s, 'readonly').getAll());
  const get = (s, id) => req2p(tx(s, 'readonly').get(id));
  function put(s, obj) {
    return new Promise((res, rej) => {
      const t = db.transaction(s, 'readwrite');
      const oc = t.objectStore(s);
      const norm = (o) => { if (o && Object.prototype.hasOwnProperty.call(o, 'id') && o.id === undefined) { const c = { ...o }; delete c.id; return c; } return o; };
      const reqs = [];
      if (Array.isArray(obj)) obj.forEach((o) => reqs.push(oc.put(norm(o))));
      else reqs.push(oc.put(norm(obj)));
      t.oncomplete = () => res(Array.isArray(obj) ? reqs.map((r) => r.result) : reqs[0].result);
      t.onerror = () => rej(t.error);
    });
  }
  const del = (s, id) => req2p(tx(s, 'readwrite').delete(id));

  async function hashPwd(pwd, salt) {
    const data = new TextEncoder().encode(salt + ':' + pwd);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const now = () => new Date().toISOString();
  async function audit(user, action, entity, entityId, details) {
    await put('audit_log', { id: undefined, user_id: user ? user.id : null, user_name: user ? user.name : 'Système', action, entity, entity_id: String(entityId || ''), details: details || null, created_at: now() });
  }

  async function seed() {
    const users0 = await getAll('users');
    if (users0.length) return;
    const ids = {};
    const ins = async (s, obj) => { const copy = { ...obj, id: undefined }; await put(s, copy); const all = await getAll(s); return all[all.length - 1].id; };
    wait: {
      const c1 = await ins('communes', { name: 'Saint-Martin-du-Néant', code_insee: '12345', siret: '12345678901234', adresse: '1 place de la Mairie, 42300', contact_name: 'Julie Lefèvre', email: 'j.lefevre@saint-martin-neant.fr', phone: '0477001101', created_at: now() });
      const c2 = await ins('communes', { name: 'Les Bruyères-sur-Loire', code_insee: '12346', siret: '22345678901234', adresse: '5 rue de la Gare, 42300', contact_name: 'Marc Boyer', email: 'm.boyer@lesbruyeres.fr', phone: '0477001102', created_at: now() });
      const c3 = await ins('communes', { name: 'Val-Clair', code_insee: '12347', siret: '32345678901234', adresse: '12 avenue du Val, 42100', contact_name: 'Nadia Roux', email: 'n.roux@valclair.fr', phone: '0477001103', created_at: now() });
      const c4 = await ins('communes', { name: 'Montreval', code_insee: '12348', siret: '42345678901234', adresse: '8 boulevard des Écoles, 42100', contact_name: 'Pierre Fabre', email: 'p.fabre@montreval.fr', phone: '0477001104', created_at: now() });
      ids.c1 = c1; ids.c2 = c2; ids.c3 = c3; ids.c4 = c4;
    }
    const mkUser = async (email, pwd, name, role, commune_id, phone) => {
      const salt = Math.random().toString(36).slice(2);
      const password_hash = await hashPwd(pwd, salt);
      return ins('users', { email: email, password_hash: salt + ':' + password_hash, name: name, role: role, commune_id: commune_id, phone: phone, active: 1, created_at: now() });
    };
    const admin = await mkUser('admin@sictom.fr', 'admin123', 'Sophie Marchand', 'admin', null, '0477002001');
    const prep = await mkUser('prep@sictom.fr', 'prep123', 'Karim Benali', 'prepareur', null, '0477002002');
    const cm1 = await mkUser('commune@saint-martin.fr', 'commune123', 'Julie Lefèvre', 'commune', ids.c1, '0477002003');
    await mkUser('usager@boyer.fr', 'usager123', 'Marc Boyer', 'usager', ids.c2, '0477002004');

    const t140 = await ins('bac_types', { code: 'B140', label: 'Bac roulant 140 L', volume_l: 140, couleur: '#4a7c59' });
    const t240 = await ins('bac_types', { code: 'B240', label: 'Bac roulant 240 L', volume_l: 240, couleur: '#3b6ea5' });
    const t340 = await ins('bac_types', { code: 'B340', label: 'Bac roulant 340 L', volume_l: 340, couleur: '#b3701e' });
    const t660 = await ins('bac_types', { code: 'B660', label: 'Conteneur enterré 660 L', volume_l: 660, couleur: '#5a5a6e' });

    const rfidUids = [];
    for (let i = 1; i <= 30; i++) {
      const uid = 'E280-1105-A200-' + String(i).padStart(9, '0');
      rfidUids.push(uid);
    }
    const tagRows = rfidUids.map((u) => ({ id: undefined, uid: u, etat: 'libre', bac_id: null, note: null, created_at: now() }));
    await put('rfid_tags', tagRows);
    const tags = await getAll('rfid_tags');

    const bacRows = [];
    for (let i = 1; i <= 26; i++) {
      const rfid = i <= 22 ? tags[i - 1].uid : null;
      bacRows.push({
        id: undefined, serial: 'BAC-2024-' + String(i).padStart(3, '0'),
        type_id: [t140, t240, t340, t660][i % 4], rfid: rfid,
        etat: i <= 22 ? 'stock' : 'hs', commune_id: null, convention_id: null,
        adresse: null, notes: null, created_at: now(),
      });
    }
    await put('bacs', bacRows);
    const bacsAll = await getAll('bacs');
    const convRows = [
      { reference: 'MAD-2025-001', commune_id: ids.c1, objet: 'Mise à disposition de conteneurs — marché hebdomadaire', lieu: 'Place du marché, Saint-Martin-du-Néant', parcours: 'Collecte des déchets ménagers', date_debut: '2025-01-15', date_fin: '2026-01-15', statut: 'active', contact_name: 'Julie Lefèvre', contact_email: 'j.lefevre@saint-martin-neant.fr', created_by: prep, validated_by: admin, validation_date: '2024-12-20T10:30:00', motif_rejet: null, signature_name: 'Julie Lefèvre', signature_role: 'Maire de Saint-Martin-du-Néant', signature_png: null, signature_date: '2024-12-22T09:15:00', created_at: now(), updated_at: now(), lignes: [[t240, 4], [t140, 2]] },
      { reference: 'MAD-2025-002', commune_id: ids.c2, objet: 'Équipement des boulangeries associatives', lieu: 'Rue des Bruyères, Les Bruyères-sur-Loire', parcours: 'Apport volontaire artisans', date_debut: '2025-03-01', date_fin: '2026-03-01', statut: 'validee', contact_name: 'Marc Boyer', contact_email: 'usager@boyer.fr', created_by: prep, validated_by: admin, validation_date: '2025-01-10T14:00:00', motif_rejet: null, signature_name: null, signature_role: null, signature_png: null, signature_date: null, created_at: now(), updated_at: now(), lignes: [[t140, 3]] },
      { reference: 'MAD-2025-003', commune_id: ids.c3, objet: "Demande commune — points d'apport quartier Val-Clair", lieu: 'Parking de la salle des fêtes, Val-Clair', parcours: 'Collecte déchèterie', date_debut: '2025-05-01', date_fin: '2026-05-01', statut: 'soumise', contact_name: 'Nadia Roux', contact_email: 'n.roux@valclair.fr', created_by: prep, validated_by: null, validation_date: null, motif_rejet: null, signature_name: null, signature_role: null, signature_png: null, signature_date: null, created_at: now(), updated_at: now(), lignes: [[t340, 2], [t660, 1]] },
      { reference: 'MAD-2025-004', commune_id: ids.c4, objet: 'Brouillon — renouvellement écoles de Montreval', lieu: 'Écoles publiques de Montreval', parcours: 'Collecte municipale', date_debut: '2025-09-01', date_fin: '2026-09-01', statut: 'brouillon', contact_name: 'Pierre Fabre', contact_email: 'p.fabre@montreval.fr', created_by: prep, validated_by: null, validation_date: null, motif_rejet: null, signature_name: null, signature_role: null, signature_png: null, signature_date: null, created_at: now(), updated_at: now(), lignes: [[t140, 5]] },
      { reference: 'MAD-2024-011', commune_id: ids.c1, objet: 'Convention événementielle — vide-greniers (2024)', lieu: 'Parc municipal de Saint-Martin-du-Néant', parcours: 'Collecte municipale', date_debut: '2024-06-10', date_fin: '2024-06-30', statut: 'cloturee', contact_name: 'Julie Lefèvre', contact_email: 'j.lefevre@saint-martin-neant.fr', created_by: prep, validated_by: admin, validation_date: '2024-06-01T09:00:00', motif_rejet: null, signature_name: 'Julie Lefèvre', signature_role: 'Maire de Saint-Martin-du-Néant', signature_png: null, signature_date: '2024-06-02T11:00:00', created_at: now(), updated_at: now(), lignes: [[t660, 2]] },
    ];
    for (const cv of convRows) {
      const lignes = cv.lignes; delete cv.lignes;
      const cvid = await ins('conventions', cv);
      await put('convention_lignes', lignes.map(([t, q]) => ({ id: undefined, convention_id: cvid, type_id: t, quantite: q })));
    }
    await audit({ id: null, name: 'Système' }, 'seed', 'app', null, 'Jeu de données initial créé');
    await put('kv', { id: undefined, key: 'seeded', value: Date.now() });
  }

  async function resetAll() {
    const stores = ['users', 'communes', 'bac_types', 'bacs', 'rfid_tags', 'conventions', 'convention_lignes', 'audit_log', 'kv'];
    for (const s of stores) {
      await new Promise((res) => { const t = db.transaction(s, 'readwrite'); t.objectStore(s).clear(); t.oncomplete = t.onerror = () => res(); });
    }
    await seed();
  }

  return {
    init() { return open().then((d) => { db = d; return seed(); }); },
    init_ts: null,
    get db(){ return db; }, tx, get, put, del, getAll, audit, resetAll, hashPwd,
  };
})();

const Store = (() => {
  let me = null;
  const now = () => new Date().toISOString();

  function requireAuth() { if (!me) throw new Error('Authentification requise'); return me; }
  function requireRole(...roles) { const u = requireAuth(); if (!roles.includes(u.role)) throw new Error('Accès refusé pour votre rôle'); return u; }
  function canSeeConv(u, c) {
    if (u.role === 'admin' || u.role === 'prepareur') return true;
    return u.commune_id && c.commune_id === u.commune_id;
  }

  async function find(s, pred) { const all = await DemoDB.getAll(s); return all.find(pred) || null; }

  // ---- Auth ----
  async function login(email, password) {
    email = String(email || '').toLowerCase().trim();
    const u = await find('users', (x) => x.email === email);
    if (!u || !u.active) throw new Error('Identifiants incorrects');
    const h = await DemoDB.hashPwd(String(password || ''), u.password_hash.split(':')[0]);
    if (h !== u.password_hash.split(':')[1]) throw new Error('Identifiants incorrects');
    me = { id: u.id, email: u.email, name: u.name, role: u.role, commune_id: u.commune_id, phone: u.phone };
    await DemoDB.audit(me, 'login', 'user', u.id, u.email);
    return me;
  }
  const logout = () => { me = null; return Promise.resolve(); };
  const currentUser = () => me;

  async function loginById(id) {
    const u = await DemoDB.get('users', Number(id));
    if (!u || !u.active) return null;
    me = { id: u.id, email: u.email, name: u.name, role: u.role, commune_id: u.commune_id, phone: u.phone };
    return me;
  }

  // ---- Dashboard ----
  async function dashboard() {
    const u = requireAuth();
    const scope = (u.role === 'commune' || u.role === 'usager') ? u.commune_id : null;
    const convs = (await DemoDB.getAll('conventions')).filter((c) => !scope || c.commune_id === scope);
    const bacs = (await DemoDB.getAll('bacs')).filter((b) => !scope || b.commune_id === scope);
    const byStatut = {}; convs.forEach((c) => byStatut[c.statut] = (byStatut[c.statut] || 0) + 1);
    const byEtat = {}; bacs.forEach((b) => byEtat[b.etat] = (byEtat[b.etat] || 0) + 1);
    let prochaines = [];
    if (!scope) {
      prochaines = convs.filter((c) => c.statut === 'active' && c.date_fin).sort((a, b) => a.date_fin.localeCompare(b.date_fin)).slice(0, 5)
        .map((c) => ({ id: c.id, reference: c.reference, commune_id: c.commune_id, date_fin: c.date_fin }));
    }
    return {
      conventions_par_statut: Object.keys(byStatut).map((k) => ({ statut: k, c: byStatut[k] })),
      total_bacs: bacs.length,
      bacs_par_etat: Object.keys(byEtat).map((k) => ({ etat: k, c: byEtat[k] })),
      total_communes: scope ? null : (await DemoDB.getAll('communes')).length,
      rfid_libres: scope ? null : (await DemoDB.getAll('rfid_tags')).filter((t) => t.etat === 'libre').length,
      prochaines_echeances: prochaines,
    };
  }

  // ---- Conventions ----
  async function nextRef() {
    const year = new Date().getFullYear();
    const all = await DemoDB.getAll('conventions');
    const n = all.filter((c) => c.reference.startsWith('MAD-' + year + '-')).length + 1;
    return 'MAD-' + year + '-' + String(n).padStart(3, '0');
  }

  async function listConventions() {
    const u = requireAuth();
    const [convs, comms, users, lignes] = await Promise.all([DemoDB.getAll('conventions'), DemoDB.getAll('communes'), DemoDB.getAll('users'), DemoDB.getAll('convention_lignes')]);
    return convs.filter((c) => canSeeConv(u, c))
      .map((c) => ({
        ...c,
        commune_name: (comms.find((x) => x.id === c.commune_id) || {}).name || '—',
        created_by_name: (users.find((x) => x.id === c.created_by) || {}).name || '—',
        nb_conteneurs: lignes.filter((l) => l.convention_id === c.id).reduce((s, l) => s + l.quantite, 0),
      }))
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }

  async function getConvention(id) {
    const u = requireAuth();
    const c = await DemoDB.get('conventions', id);
    if (!c || !canSeeConv(u, c)) throw new Error('Convention introuvable');
    const comm = await DemoDB.get('communes', c.commune_id);
    const lignes = (await DemoDB.getAll('convention_lignes')).filter((l) => l.convention_id === c.id);
    const bacs = (await DemoDB.getAll('bacs')).filter((b) => b.convention_id === c.id);
    const types = await DemoDB.getAll('bac_types');
    return {
      ...c, commune_name: comm.name, commune_adresse: comm.adresse,
      lignes: lignes.map((l) => { const t = types.find((x) => x.id === l.type_id); return { ...l, label: t.label, volume_l: t.volume_l, code: t.code }; }),
      bacs: bacs.map((b) => { const t = types.find((x) => x.id === b.type_id); return { ...b, type_label: t.label, volume_l: t.volume_l, couleur: t.couleur }; }),
    };
  }

  async function saveConvention(id, body) {
    const u = requireRole('admin', 'prepareur', 'commune');
    const c = await DemoDB.get('conventions', id);
    if (!c) throw new Error('Convention introuvable');
    if (!canSeeConv(u, c)) throw new Error('Accès refusé');
    if (u.role === 'commune' && c.statut !== 'brouillon') throw new Error('Seules les demandes en brouillon sont modifiables');
    if (['active', 'cloturee'].includes(c.statut) && u.role !== 'admin') throw new Error('Convention active/clôturée : modifiable seulement par un administrateur');
    Object.assign(c, {
      objet: body.objet ?? c.objet, lieu: body.lieu ?? c.lieu, parcours: body.parcours ?? c.parcours,
      date_debut: body.date_debut ?? c.date_debut, date_fin: body.date_fin ?? c.date_fin,
      contact_name: body.contact_name ?? c.contact_name, contact_email: body.contact_email ?? c.contact_email,
      updated_at: now(),
    });
    if (body.commune_id && u.role !== 'commune') c.commune_id = Number(body.commune_id);
    await DemoDB.put('conventions', c);
    if (Array.isArray(body.lignes)) {
      const olds = (await DemoDB.getAll('convention_lignes')).filter((l) => l.convention_id === c.id);
      for (const o of olds) await DemoDB.del('convention_lignes', o.id);
      for (const l of body.lignes) if (l.type_id && l.quantite > 0) await DemoDB.put('convention_lignes', { id: undefined, convention_id: c.id, type_id: Number(l.type_id), quantite: Number(l.quantite) });
    }
    await DemoDB.audit(u, 'update', 'convention', c.id, c.reference);
    return { ok: true };
  }

  async function createConvention(body) {
    const u = requireRole('admin', 'prepareur', 'commune');
    const commune_id = u.role === 'commune' ? u.commune_id : Number(body.commune_id);
    if (!commune_id || !body.objet) throw new Error('Commune et objet requis');
    const ref = await nextRef();
    const id = await DemoDB.put('conventions', {
      id: undefined, reference: ref, commune_id: commune_id, objet: body.objet,
      lieu: body.lieu || null, parcours: body.parcours || null, date_debut: body.date_debut || null, date_fin: body.date_fin || null,
      statut: 'brouillon', contact_name: body.contact_name || u.name, contact_email: body.contact_email || u.email,
      created_by: u.id, validated_by: null, validation_date: null, motif_rejet: null,
      signature_name: null, signature_role: null, signature_png: null, signature_date: null,
      created_at: now(), updated_at: now(),
    });
    for (const l of (body.lignes || [])) if (l.type_id && l.quantite > 0) await DemoDB.put('convention_lignes', { id: undefined, convention_id: id, type_id: Number(l.type_id), quantite: Number(l.quantite) });
    await DemoDB.audit(u, 'create', 'convention', id, ref);
    return { id: id, reference: ref };
  }

  async function transitionConvention(id, action, extra) {
    extra = extra || {};
    const u = requireAuth();
    const c = await DemoDB.get('conventions', id);
    if (!c) throw new Error('Convention introuvable');
    if (!canSeeConv(u, c)) throw new Error('Accès refusé');
    if (action === 'submit' && ['brouillon', 'rejetee'].includes(c.statut)) {
      if (!['prepareur', 'admin', 'commune'].includes(u.role)) throw new Error('Accès refusé');
      c.statut = 'soumise';
    } else if (action === 'validate' && c.statut === 'soumise') {
      if (u.role !== 'admin') throw new Error('Accès refusé');
      c.statut = 'validee'; c.validated_by = u.id; c.validation_date = now();
    } else if (action === 'reject' && c.statut === 'soumise') {
      if (u.role !== 'admin') throw new Error('Accès refusé');
      c.statut = 'rejetee'; c.motif_rejet = extra.motif || 'Non précisé';
    } else if (action === 'rework' && c.statut === 'rejetee') {
      if (!['prepareur', 'admin'].includes(u.role)) throw new Error('Accès refusé');
      c.statut = 'brouillon'; c.motif_rejet = null;
    } else if (action === 'cloturer' && c.statut === 'active') {
      if (!['admin', 'prepareur'].includes(u.role)) throw new Error('Accès refusé');
      c.statut = 'cloturee';
      for (const b of (await DemoDB.getAll('bacs')).filter((b) => b.convention_id === c.id)) {
        b.etat = 'stock'; b.convention_id = null; b.commune_id = null; await DemoDB.put('bacs', b);
        if (b.rfid) { const t = await find('rfid_tags', (x) => x.uid === b.rfid); if (t) { t.etat = 'libre'; await DemoDB.put('rfid_tags', t); } }
      }
    } else if (action === 'sign') {
      if (c.statut !== 'validee') throw new Error('Seule une convention validée peut être signée');
      if (!['commune', 'usager', 'admin'].includes(u.role)) throw new Error('Seul le titulaire (ou un admin) peut signer');
      if ((u.role === 'commune' || u.role === 'usager') && (!u.commune_id || u.commune_id !== c.commune_id)) throw new Error('Cette convention concerne une autre collectivité');
      if (!extra.signature_name || !extra.signature_png) throw new Error('Nom du signataire et signature manuscrite requis');
      c.statut = 'active';
      c.signature_name = extra.signature_name; c.signature_role = extra.signature_role || 'Représentant';
      c.signature_png = extra.signature_png; c.signature_date = now();
    } else {
      throw new Error('Transition impossible depuis le statut ' + c.statut);
    }
    c.updated_at = now();
    await DemoDB.put('conventions', c);
    await DemoDB.audit(u, 'transition:' + action, 'convention', c.id, c.reference + ' → ' + c.statut);
    return { statut: c.statut };
  }

  async function deleteConvention(id) {
    const u = requireRole('admin', 'prepareur');
    const c = await DemoDB.get('conventions', id);
    if (!c) throw new Error('Convention introuvable');
    if (c.statut !== 'brouillon') throw new Error('Seule une convention brouillon peut être supprimée');
    for (const l of (await DemoDB.getAll('convention_lignes')).filter((l) => l.convention_id === c.id)) await DemoDB.del('convention_lignes', l.id);
    await DemoDB.del('conventions', c.id);
    await DemoDB.audit(u, 'delete', 'convention', c.id, c.reference);
  }

  async function assignBacsToConvention(id, bacIds) {
    const u = requireRole('admin', 'prepareur');
    const c = await DemoDB.get('conventions', id);
    if (!c) throw new Error('Convention introuvable');
    for (const b of (await DemoDB.getAll('bacs')).filter((b) => b.convention_id === c.id)) {
      if (!bacIds.includes(b.id)) { b.etat = 'stock'; b.convention_id = null; b.commune_id = null; await DemoDB.put('bacs', b); }
    }
    for (const bid of bacIds) {
      const b = await DemoDB.get('bacs', bid);
      if (!b || (b.convention_id && b.convention_id !== c.id)) continue;
      b.convention_id = c.id; b.commune_id = c.commune_id; b.etat = 'affecte';
      await DemoDB.put('bacs', b);
    }
    await DemoDB.audit(u, 'assign-bacs', 'convention', c.id, c.reference);
    return { ok: true };
  }

  // ---- Bacs ----
  async function listBacs(filter) {
    filter = filter || {};
    const u = requireAuth();
    const [bacs, types, comms, convs] = await Promise.all([DemoDB.getAll('bacs'), DemoDB.getAll('bac_types'), DemoDB.getAll('communes'), DemoDB.getAll('conventions')]);
    return bacs.filter((b) => {
      if ((['commune', 'usager'].includes(u.role)) && b.commune_id !== u.commune_id) return false;
      if (filter.etat && b.etat !== filter.etat) return false;
      if (filter.commune_id && b.commune_id !== Number(filter.commune_id)) return false;
      if (filter.q) { const q = String(filter.q).toLowerCase(); if (![b.serial, b.rfid, b.adresse].join(' ').toLowerCase().includes(q)) return false; }
      return true;
    }).map((b) => {
      const t = types.find((x) => x.id === b.type_id) || {};
      const c = comms.find((x) => x.id === b.commune_id) || {};
      const cv = convs.find((x) => x.id === b.convention_id) || {};
      return { ...b, type_label: t.label, volume_l: t.volume_l, couleur: t.couleur, commune_name: c.name || null, convention_ref: cv.reference || null };
    }).sort((a, b) => a.serial.localeCompare(b.serial));
  }

  async function createBac(body) {
    const u = requireRole('admin', 'prepareur');
    if (!body.serial || !body.type_id) throw new Error('Numéro de série et type requis');
    if (await find('bacs', (b) => b.serial === body.serial)) throw new Error('Numéro de série déjà utilisé');
    const id = await DemoDB.put('bacs', { id: undefined, serial: body.serial, type_id: Number(body.type_id), rfid: body.rfid || null, etat: ['stock', 'affecte', 'hs'].includes(body.etat) ? body.etat : 'stock', commune_id: null, convention_id: null, adresse: body.adresse || null, notes: body.notes || null, created_at: now() });
    if (body.rfid) { const t = await find('rfid_tags', (x) => x.uid === body.rfid); if (t) { t.etat = 'affecte'; t.bac_id = id; await DemoDB.put('rfid_tags', t); } }
    await DemoDB.audit(u, 'create', 'bac', id, body.serial);
    return { id: id };
  }

  async function updateBac(id, body) {
    const u = requireRole('admin', 'prepareur');
    const b = await DemoDB.get('bacs', id);
    if (!b) throw new Error('Bac introuvable');
    const etat = ['stock', 'affecte', 'hs'].includes(body.etat) ? body.etat : b.etat;
    if (etat === 'stock' && b.convention_id) {
      b.convention_id = null; b.commune_id = null;
      if (b.rfid) { const t = await find('rfid_tags', (x) => x.uid === b.rfid); if (t) { t.etat = 'libre'; await DemoDB.put('rfid_tags', t); } }
    }
    b.type_id = body.type_id !== undefined ? Number(body.type_id) : b.type_id;
    b.etat = etat; b.adresse = body.adresse ?? b.adresse; b.notes = body.notes ?? b.notes;
    await DemoDB.put('bacs', b);
    await DemoDB.audit(u, 'update', 'bac', b.id, b.serial);
  }

  async function attachRfid(bacId, uid) {
    const u = requireRole('admin', 'prepareur');
    uid = String(uid || '').trim();
    const b = await DemoDB.get('bacs', bacId);
    if (!b) throw new Error('Bac introuvable');
    const tag = await find('rfid_tags', (x) => x.uid === uid);
    if (!tag) throw new Error('Étiquette RFID inconnue');
    if (tag.bac_id && tag.bac_id !== b.id) throw new Error('Étiquette déjà affectée à un autre bac');
    if (b.rfid && b.rfid !== uid) { const old = await find('rfid_tags', (x) => x.uid === b.rfid); if (old) { old.etat = 'libre'; old.bac_id = null; await DemoDB.put('rfid_tags', old); } }
    b.rfid = uid; await DemoDB.put('bacs', b);
    tag.etat = 'affecte'; tag.bac_id = b.id; await DemoDB.put('rfid_tags', tag);
    await DemoDB.audit(u, 'rfid-affect', 'bac', b.id, b.serial + ' ← ' + uid);
  }

  // ---- RFID ----
  async function listRfid(filter) {
    filter = filter || {};
    requireRole('admin', 'prepareur');
    const [tags, bacs] = await Promise.all([DemoDB.getAll('rfid_tags'), DemoDB.getAll('bacs')]);
    return tags.filter((t) => {
      if (filter.etat && t.etat !== filter.etat) return false;
      if (filter.q) { const q = String(filter.q).toLowerCase(); if (![t.uid, (bacs.find((b) => b.id === t.bac_id) || {}).serial].join(' ').toLowerCase().includes(q)) return false; }
      return true;
    }).map((t) => ({ ...t, bac_serial: t.bac_id ? ((bacs.find((b) => b.id === t.bac_id) || {}).serial || null) : null }))
      .sort((a, b) => a.uid.localeCompare(b.uid));
  }

  async function addRfids(uids) {
    const u = requireRole('admin', 'prepareur');
    let created = 0;
    for (const raw of uids) {
      const uid = String(raw || '').trim();
      if (!uid) continue;
      if (await find('rfid_tags', (x) => x.uid === uid)) continue;
      await DemoDB.put('rfid_tags', { id: undefined, uid: uid, etat: 'libre', bac_id: null, note: null, created_at: now() });
      created++;
    }
    await DemoDB.audit(u, 'create', 'rfid', null, created + ' étiquette(s)');
    return { created: created };
  }

  async function scanRfid(uid) {
    requireRole('admin', 'prepareur');
    uid = String(uid || '').trim();
    const tag = await find('rfid_tags', (x) => x.uid === uid);
    if (!tag) return { trouve: false, uid: uid };
    const b = tag.bac_id ? await DemoDB.get('bacs', tag.bac_id) : null;
    const result = { trouve: true, uid: uid, etat_tag: tag.etat, bac: null };
    if (b) {
      const t = await DemoDB.get('bac_types', b.type_id);
      const c = b.commune_id ? await DemoDB.get('communes', b.commune_id) : null;
      result.bac = Object.assign(b, { type_label: t.label, volume_l: t.volume_l, commune_name: c ? c.name : null });
    }
    return result;
  }

  // ---- Types / Communes / Users ----
  const listTypes = () => DemoDB.getAll('bac_types').then((a) => a.sort((x, y) => x.volume_l - y.volume_l));
  async function createType(b) { const u = requireRole('admin'); if (!b.code || !b.label || !b.volume_l) throw new Error('Champs invalides'); const id = await DemoDB.put('bac_types', { id: undefined, code: b.code, label: b.label, volume_l: Number(b.volume_l), couleur: b.couleur || '#334455' }); await DemoDB.audit(u, 'create', 'bac_type', id, b.code); return { id: id }; }
  async function updateType(id, b) { const u = requireRole('admin'); const t = await DemoDB.get('bac_types', id); if (!t) throw new Error('Type introuvable'); Object.assign(t, { code: b.code ?? t.code, label: b.label ?? t.label, volume_l: b.volume_l !== undefined ? Number(b.volume_l) : t.volume_l, couleur: b.couleur ?? t.couleur }); await DemoDB.put('bac_types', t); await DemoDB.audit(u, 'update', 'bac_type', id, t.code); }

  const listCommunes = () => DemoDB.getAll('communes').then((a) => a.sort((x, y) => x.name.localeCompare(y.name)));
  async function createCommune(b) { const u = requireRole('admin'); if (!b.name) throw new Error('Nom requis'); const id = await DemoDB.put('communes', { id: undefined, name: b.name, code_insee: b.code_insee || null, siret: b.siret || null, adresse: b.adresse || null, contact_name: b.contact_name || null, email: b.email || null, phone: b.phone || null, created_at: now() }); await DemoDB.audit(u, 'create', 'commune', id, b.name); return { id: id }; }
  async function updateCommune(id, b) { const u = requireRole('admin'); const c = await DemoDB.get('communes', id); if (!c) throw new Error('Collectivité introuvable'); Object.assign(c, { name: b.name ?? c.name, code_insee: b.code_insee ?? c.code_insee, siret: b.siret ?? c.siret, adresse: b.adresse ?? c.adresse, contact_name: b.contact_name ?? c.contact_name, email: b.email ?? c.email, phone: b.phone ?? c.phone }); await DemoDB.put('communes', c); await DemoDB.audit(u, 'update', 'commune', id, c.name); }

  async function listUsers() {
    requireRole('admin');
    const [users, comms] = await Promise.all([DemoDB.getAll('users'), DemoDB.getAll('communes')]);
    return users.map((u) => ({ ...u, password_hash: undefined, commune_name: u.commune_id ? ((comms.find((c) => c.id === u.commune_id) || {}).name || null) : null }));
  }
  async function createUser(b) {
    const u = requireRole('admin');
    if (!b.email || !b.password || !b.name || !['admin', 'prepareur', 'commune', 'usager'].includes(b.role)) throw new Error('Champs invalides');
    b.email = String(b.email).toLowerCase().trim();
    if (await find('users', (x) => x.email === b.email)) throw new Error('Cet email existe déjà');
    const salt = Math.random().toString(36).slice(2);
    const id = await DemoDB.put('users', { id: undefined, email: b.email, password_hash: salt + ':' + (await DemoDB.hashPwd(b.password, salt)), name: b.name, role: b.role, commune_id: b.commune_id || null, phone: b.phone || null, active: 1, created_at: now() });
    await DemoDB.audit(u, 'create', 'user', id, b.email);
    return { id: id };
  }
  async function updateUser(id, b) {
    const u = requireRole('admin');
    const t = await DemoDB.get('users', id);
    if (!t) throw new Error('Utilisateur introuvable');
    t.name = b.name ?? t.name; t.role = b.role ?? t.role; t.commune_id = b.commune_id !== undefined ? (b.commune_id || null) : t.commune_id;
    t.phone = b.phone ?? t.phone; t.active = b.active === undefined ? t.active : (b.active ? 1 : 0);
    await DemoDB.put('users', t);
    if (b.password) { const salt = Math.random().toString(36).slice(2); t.password_hash = salt + ':' + (await DemoDB.hashPwd(b.password, salt)); await DemoDB.put('users', t); }
    await DemoDB.audit(u, 'update', 'user', t.id, t.email);
  }

  // ---- Audit ----
  const listAudit = async () => { requireRole('admin'); return (await DemoDB.getAll('audit_log')).sort((a, b) => b.id - a.id).slice(0, 200); };

  // ---- Excel exports/imports (SheetJS) ----
  async function exportConventionsXlsx() {
    requireRole('admin', 'prepareur');
    const [convs, comms, lignes, types] = await Promise.all([DemoDB.getAll('conventions'), DemoDB.getAll('communes'), DemoDB.getAll('convention_lignes'), DemoDB.getAll('bac_types')]);
    const convRows = convs.map((c) => ({ id: c.id, reference: c.reference, commune: (comms.find((x) => x.id === c.commune_id) || {}).name, objet: c.objet, lieu: c.lieu, statut: c.statut, date_debut: c.date_debut, date_fin: c.date_fin, contact_name: c.contact_name, contact_email: c.contact_email, signature_name: c.signature_name, signature_date: c.signature_date }));
    const ligneRows = lignes.map((l) => ({ id: l.id, reference: (convs.find((x) => x.id === l.convention_id) || {}).reference, type_code: (types.find((x) => x.id === l.type_id) || {}).code, type_id: l.type_id, type_label: (types.find((x) => x.id === l.type_id) || {}).label, quantite: l.quantite }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(convRows), 'Conventions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ligneRows), 'Lignes');
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  }
  async function exportBacsXlsx() {
    requireRole('admin', 'prepareur');
    const bacs = await listBacs();
const types = await listTypes();
    const rows = bacs.map((b) => ({ serial: b.serial, type_code: (types.find((x) => x.id === b.type_id) || {}).code, rfid: b.rfid, etat: b.etat, commune: b.commune_name, adresse: b.adresse, convention: b.convention_ref }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Bacs');
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  }

  async function importBacs(dataBase64, filename) {
    const u = requireRole('admin', 'prepareur');
    const wb = XLSX.read(dataBase64, { type: 'base64' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const types = await DemoDB.getAll('bac_types');
    let imported = 0; const errors = [];
    for (const r of rows) {
      const serial = String(r.serial || r['numéro de série'] || r['Numero de serie'] || '').trim();
      if (!serial) { errors.push({ row: r, error: 'Numéro de série manquant' }); continue; }
      const codeType = String(r.type_code || r.type || '').trim();
      const t = types.find((x) => x.code === codeType) || types.find((x) => x.label === codeType);
      if (!t) { errors.push({ row: r, error: 'Type inconnu : ' + codeType }); continue; }
      const rfid = String(r.rfid || '').trim() || null;
      const existing = await find('bacs', (b) => b.serial === serial);
      try {
        if (existing) { existing.type_id = t.id; existing.rfid = rfid; await DemoDB.put('bacs', existing); }
        else { await DemoDB.put('bacs', { id: undefined, serial: serial, type_id: t.id, rfid: rfid, etat: 'stock', commune_id: null, convention_id: null, adresse: null, notes: null, created_at: now() }); }
        imported++;
      } catch (e) { errors.push({ row: r, error: e.message }); }
    }
    await DemoDB.audit(u, 'import', 'bacs', null, imported + ' importés, ' + errors.length + ' erreurs');
    return { imported: imported, errors: errors };
  }
  async function importConventions(dataBase64) {
    const u = requireRole('admin', 'prepareur');
    const wb = XLSX.read(dataBase64, { type: 'base64' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const [comms, types] = await Promise.all([DemoDB.getAll('communes'), DemoDB.getAll('bac_types')]);
    let imported = 0; const errors = [];
    for (const r of rows) {
      const communeName = String(r.commune || '').trim();
      const cm = comms.find((x) => x.name.toLowerCase() === communeName.toLowerCase());
      if (!cm) { errors.push({ row: r, error: 'Commune inconnue : ' + communeName }); continue; }
      const objet = String(r.objet || '').trim();
      if (!objet) { errors.push({ row: r, error: 'Objet manquant' }); continue; }
      const ref = await nextRef();
      const id = await DemoDB.put('conventions', { id: undefined, reference: ref, commune_id: cm.id, objet: objet, lieu: r.lieu || null, parcours: r.parcours || null, date_debut: r.date_debut || null, date_fin: r.date_fin || null, statut: 'brouillon', contact_name: r.contact_name || u.name, contact_email: r.contact_email || null, created_by: u.id, validated_by: null, validation_date: null, motif_rejet: null, signature_name: null, signature_role: null, signature_png: null, signature_date: null, created_at: now(), updated_at: now() });
      const t = types.find((x) => x.code === String(r.type_code || r.type || '').trim());
      if (t) await DemoDB.put('convention_lignes', { id: undefined, convention_id: id, type_id: t.id, quantite: Number(r.quantite || 1) });
      imported++;
    }
    await DemoDB.audit(u, 'import', 'conventions', null, imported + ' importées, ' + errors.length + ' erreurs');
    return { imported: imported, errors: errors };
  }

  // ---- Sauvegardes (JSON) ----
  const BACKUPS_KEY = 'sictom-backups';
  const listBackups = async () => { const kv = await find('kv', (x) => x.key === BACKUPS_KEY); return kv ? kv.value : []; };
  async function createBackup() {
    const u = requireRole('admin');
    const stores = ['users', 'communes', 'bac_types', 'bacs', 'rfid_tags', 'conventions', 'convention_lignes', 'audit_log'];
    const dump = { created_at: now(), data: {} };
    for (const s of stores) dump.data[s] = await DemoDB.getAll(s);
    const list = await listBackups();
    const entry = { name: 'backup-' + now().replace(/[:.]/g, '-').slice(0, 19) + '.json', created_at: now(), size: JSON.stringify(dump).length };
    list.unshift(entry);
    await DemoDB.put('kv', { id: undefined, key: BACKUPS_KEY, value: list.slice(0, 20) });
    await DemoDB.audit(u, 'backup', 'app', null, entry.name);
    return { entry: entry, json: JSON.stringify(dump) };
  }
  async function restoreBackupJson(text) {
    const u = requireRole('admin');
    const dump = JSON.parse(text);
    if (!dump.data) throw new Error('Fichier de sauvegarde invalide');
    for (const s of Object.keys(dump.data)) {
      await new Promise((res) => { const t = DemoDB.db.transaction(s, 'readwrite'); t.objectStore(s).clear(); t.oncomplete = t.onerror = () => res(); });
      if (dump.data[s].length) await DemoDB.put(s, dump.data[s]);
    }
    await DemoDB.audit(u, 'restore', 'app', null, 'fichier importé');
  }
  async function resetDemo() {
    requireRole('admin');
    await DemoDB.resetAll();
  }

  return {
    login, loginById, logout, currentUser,
    dashboard, listConventions, getConvention, createConvention, saveConvention, transitionConvention, deleteConvention, assignBacsToConvention,
    listBacs, createBac, updateBac, attachRfid,
    listRfid, addRfids, scanRfid,
    listTypes, createType, updateType,
    listCommunes, createCommune, updateCommune,
    listUsers, createUser, updateUser,
    listAudit,
    exportConventionsXlsx, exportBacsXlsx, importBacs, importConventions,
    listBackups, createBackup, restoreBackupJson, resetDemo,
  };
})();
