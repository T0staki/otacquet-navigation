/* Onglet « Carnet » : liste du carnet de bord, fiche d'une tâche (consigne, photos, note, Fait / Pas possible), ajout depuis le bateau.
   Logique et service en ligne : carnet.js. Tout ce qui est fait part dans la file d'attente (gardée sur le téléphone, photos
   dans IndexedDB « otacquet-carnet ») et s'envoie dès que le réseau revient ; la dernière liste lue reste affichée sans réseau. */
(function (root) {
  const C = root.Carnet;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ' h ' + String(d.getMinutes()).padStart(2, '0'); };
  const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const ICONES = {
    photo: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle>',
    mesure: '<path d="M4 16a8 8 0 0 1 16 0"></path><path d="M12 16l4-5"></path>',
    verifier: '<circle cx="11" cy="11" r="6"></circle><path d="M20 20l-4.5-4.5"></path>',
    idee: '<path d="M9 18h6M10 21h4"></path><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"></path>' };
  const icone = (g, cls) => '<svg class="' + (cls || 'c-ic') + '" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONES[g] || ICONES.idee) + '</svg>';
  const COCHE = '<svg class="c-ok" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Vérifié"><path d="M5 12.5l4.5 4.5L19 7"></path></svg>';
  const ATTENTE = '<svg class="c-att" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" role="img" aria-label="En attente"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path></svg>';

  // photos en attente d'envoi : IndexedDB, sur ce téléphone
  const PDB = (() => {
    let p = null;
    const open = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open('otacquet-carnet', 1); r.onupgradeneeded = () => r.result.createObjectStore('photos'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction('photos', mode), q = fn(t.objectStore('photos')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
    return { put: (id, b) => tx('readwrite', s => s.put(b, id)), get: id => tx('readonly', s => s.get(id)), del: id => tx('readwrite', s => s.delete(id)) };
  })();

  let pret = null, ctx = null, S = null, d = { taches: [], actions: [], verifications: [], le: 0 }, file = [], brouillons = {}, filtre = 'Tout';
  let envoyees = [];   // sorties dont les relevés sont arrivés au carnet (identifiants du journal du téléphone)
  let hors = false, occupe = false, ouverte = null, ajoutGenre = 'idee', ajoutPhotos = [], sansPhoto = null, erreurs = [];
  const qui = () => root.BateauEcran ? { nom: root.BateauEcran.nom(), bateau: root.BateauEcran.bateau() } : {};
  const urls = new Map();   // photo → adresse affichable (locale ou lue sur le service)
  const garderFile = () => LS.set('carnet-file', JSON.stringify(file));
  const garderBrouillons = () => LS.set('carnet-brouillons', JSON.stringify(brouillons));
  const brouillon = id => brouillons[id] || (brouillons[id] = { note: '', photos: [] });

  async function synchro() {
    if (occupe || !S) return; occupe = true;
    await pret;
    try {
      while (file.length) {
        const op = file[0];
        try { await S.envoyer(op, pid => PDB.get(pid)); }
        catch (e) { if (!e.definitif) throw e; erreurs.push(e.message); }
        file.shift(); garderFile(); for (const pid of op.photos) PDB.del(pid).catch(() => {});
        if (op.tripId != null) { envoyees = envoyees.filter(x => x !== op.tripId).concat([op.tripId]).slice(-20); LS.set('carnet-sorties-envoyees', JSON.stringify(envoyees)); if (ctx.surEnvoi) ctx.surEnvoi(); }
      }
      d = await S.lire(!ctx.bord);
      const b = qui().bateau; if (b) d.taches = d.taches.filter(t => !t.bateau || t.bateau === b);   // les tâches du bateau du profil
      LS.set('carnet-cache', JSON.stringify(d)); hors = false;
    } catch (e) { hors = true; }
    finally { occupe = false; dessiner(); }
  }

  /* ---------- Liste ---------- */
  function dessiner() {
    const n = C.resteAFaire(d, file);
    const b = $('t-car-n'); b.textContent = n; b.hidden = !n;
    if (ouverte && $('v-tache').classList.contains('on')) { dessinerTache(); return; }
    ouverte = null;
    const jour = d.le && new Date(d.le).toDateString() === new Date().toDateString();
    $('c-sub').textContent = n + ' à faire' + (!d.le ? '' : jour && !hors ? ' · à jour à ' + hm(d.le) : jour ? ' · liste de ' + hm(d.le) : ' · liste du ' + new Date(d.le).toLocaleDateString('fr-FR') + ' à ' + hm(d.le));
    const band = $('c-band'), k = file.length;
    band.hidden = !(hors || k || erreurs.length);
    band.textContent = erreurs.length ? 'Un envoi a été refusé par le carnet (' + erreurs[erreurs.length - 1] + ') : refais-le, ou préviens Jérémie.'
      : hors ? 'Pas de réseau.' + (k ? ' ' + k + (k > 1 ? ' changements gardés' : ' changement gardé') + ' sur le téléphone, envoyé' + (k > 1 ? 's' : '') + ' au carnet dès le retour du réseau.' : ' Liste gardée sur le téléphone.')
      : 'Envoi au carnet…';
    $('c-filtres').innerHTML = C.filtres(d).map(f => '<button class="c-chip" data-filtre="' + esc(f) + '" aria-pressed="' + (f === filtre) + '">' + esc(f) + '</button>').join('');
    const g = C.grouper(d, file, filtre);
    $('c-liste').innerHTML = g.length ? g.filter(gr => !(ctx.bord && gr.reserve)).map(gr => '<div class="c-grp">' + esc(gr.nom) + '</div>' + (gr.reserve ? '<p class="c-res">Retirées après tri : Bord ne les montre pas. À faire toi-même à bord, ou à remettre dans le carnet.</p>' : '') + gr.items.map(({ t, e }) =>
      '<button class="c-item' + (e.fini ? ' fini' : '') + '" data-tache="' + t.id + '">' + icone(t.genre) +
      '<span class="c-txt"><b>' + esc(t.titre) + '</b><span>' + esc(e.texte) + '</span>' + (!ctx.bord && !e.fini && C.effort(t) ? '<span class="c-diff' + (t.difficulte === 3 ? ' dur' : '') + '">' + esc(C.effort(t)) + '</span>' : '') + (e.statut === 'a_refaire' ? '<em class="c-refaire">Claude : à refaire</em>' : '') + '</span>' +
      (e.statut === 'valide' ? COCHE : e.fini && e.statut !== 'reserve' ? ATTENTE : '') + '</button>').join('')).join('')
      : '<div class="card empty">' + (d.le ? 'Rien à faire pour l’instant. Touche + pour ajouter ce que tu as vu à bord.' : hors ? 'Pas encore de liste : il faut du réseau une première fois.' : 'Chargement du carnet…') + '</div>';
  }

  /* ---------- Une tâche ---------- */
  function ouvrir(id) { ouverte = id; sansPhoto = null; ctx.tab('tache'); dessinerTache(); }
  function photosDe(t) { return d.actions.filter(a => a.tache_id === t.id).flatMap(a => a.photos || []); }
  function dessinerTache() {
    const t = d.taches.find(x => x.id === ouverte); if (!t) { ouverte = null; ctx.tab('car'); dessiner(); return; }
    const e = C.etat(t, d, file), br = brouillon(t.id);
    $('c-tgrp').textContent = t.groupe;
    const v = e.verif;
    let h = '';
    if (v) h += '<div class="c-verdict ' + (v.verdict === 'valide' ? 'bon' : '') + '"><span>' + esc(e.texte) + ' · ' + hm(v.cree_le) + '</span><p><b>' + (v.verdict === 'valide' ? 'Valable.' : v.verdict === 'a_refaire' ? 'À refaire.' : 'À compléter.') + '</b> ' + esc(v.message) + '</p></div>';
    else if (e.statut !== 'a_faire') h += '<p class="note">' + esc(e.texte) + '</p>';
    h += '<h2 class="c-titre">' + esc(t.titre) + '</h2>';
    if (t.cle === C.CLE_SORTIE) h += '<p class="note">Cette tâche se coche toute seule quand tu enregistres ta sortie dans l’onglet Trace.</p>';
    // O'Tacquet : analyse de Claude et prochaines étapes, sous le message court (Bord ne les reçoit pas)
    if (!ctx.bord && v && (v.pour_jeremie || v.prochaines)) h += '<div class="card c-analyse">' +
      (v.pour_jeremie ? '<span class="label">Analyse de Claude</span><p>' + esc(v.pour_jeremie) + '</p>' : '') +
      (v.prochaines ? '<span class="label">Prochaines étapes</span><p>' + esc(v.prochaines) + '</p>' : '') + '</div>';
    if (!ctx.bord && C.effort(t)) h += '<div class="card c-effort"><span class="c-diff' + (t.difficulte === 3 ? ' dur' : '') + '">' + esc(C.effort(t)) + '</span>' + (t.effort ? '<p>' + esc(t.effort) + '</p>' : '') + '</div>';
    if (t.comment || t.quand || t.pourquoi) h += '<div class="card c-consigne">' + (t.comment ? '<p><b>Comment.</b> ' + esc(t.comment) + '</p>' : '') + (t.quand ? '<p><b>Quand.</b> ' + esc(t.quand) + '</p>' : '') + (t.pourquoi ? '<p class="pq"><b>Pourquoi.</b> ' + esc(t.pourquoi) + '</p>' : '') + '</div>';
    const envoyees = photosDe(t).map(ch => ({ cle: 's:' + ch, ch })), locales = br.photos.map(pid => ({ cle: 'l:' + pid, pid }));
    h += '<div class="c-photos">' + envoyees.map(p => '<div class="c-ph"><img data-ph="' + esc(p.cle) + '" alt="Photo envoyée"></div>').join('') +
      locales.map(p => '<div class="c-ph"><img data-ph="' + esc(p.cle) + '" alt="Photo à envoyer"><button class="c-phx" data-retire="' + p.pid + '" aria-label="Retirer cette photo">×</button></div>').join('') +
      '<button class="c-phplus" id="c-phplus">' + icone('photo', 'c-ic2') + (envoyees.length || locales.length ? 'Autre photo' : e.statut === 'a_refaire' ? 'Refaire' : 'Photo') + '</button></div>';
    h += '<label class="note" for="c-note">Note (vent, mer, ce que tu as vu)</label><textarea id="c-note" rows="3" class="c-area">' + esc(br.note) + '</textarea>';
    h += '<p class="note c-pos">La position est retirée des photos avant l’envoi. Le vent et la gîte du B&amp;G sont joints, sans la position. Claude vérifie dès que le téléphone a du réseau.</p>';
    $('c-tache').innerHTML = h;
    $('c-fait').textContent = sansPhoto === t.id && !br.photos.length ? 'Fait, sans photo ?' : 'Fait';
    $('c-fait').hidden = t.cle === C.CLE_SORTIE;   // cette tâche se coche toute seule quand la sortie arrive au carnet
    $('c-note').oninput = ev => { br.note = ev.target.value; garderBrouillons(); };
    $('c-phplus').onclick = () => prendre(pid => { br.photos.push(pid); garderBrouillons(); dessinerTache(); });
    afficherPhotos();
  }
  async function afficherPhotos() {
    for (const img of document.querySelectorAll('img[data-ph]')) {
      const k = img.dataset.ph;
      if (!urls.has(k)) {
        try {
          const blob = k.startsWith('l:') ? await PDB.get(k.slice(2)) : await S.photo(k.slice(2));
          if (blob) urls.set(k, URL.createObjectURL(blob));
        } catch (e) {}
      }
      if (urls.has(k)) img.src = urls.get(k); else img.alt = 'Photo (visible avec du réseau)';
    }
  }
  function agir(genre) {
    const t = d.taches.find(x => x.id === ouverte); if (!t) return;
    const br = brouillon(t.id);
    if (genre === 'fait' && t.genre === 'photo' && !br.photos.length && !photosDe(t).length && sansPhoto !== t.id) { sansPhoto = t.id; dessinerTache(); return; }
    file.push(C.nouvelleAction({ tacheId: t.id, genre, bord: ctx.bord, nom: qui().nom, note: br.note, v: ctx.bg(), photos: br.photos.slice() }));
    garderFile(); delete brouillons[t.id]; garderBrouillons();
    ouverte = null; ctx.tab('car'); dessiner(); synchro();
  }

  /* ---------- Photo : appareil ou photothèque, réduite et sans métadonnées ---------- */
  let apresPhoto = null;
  function prendre(fn) { apresPhoto = fn; $('c-file').value = ''; $('c-file').click(); }
  async function photoChoisie() {
    const f = $('c-file').files && $('c-file').files[0]; if (!f || !apresPhoto) return;
    for (const b of [$('c-phplus'), $('a-photo')]) if (b && b.offsetParent) b.lastChild.textContent = 'Préparation…';
    try { const blob = await C.reduire(f), pid = C.uuid(); await PDB.put(pid, blob); urls.set('l:' + pid, URL.createObjectURL(blob)); apresPhoto(pid); }
    catch (e) { alert('Photo illisible : ' + (e.message || e)); }
  }

  /* ---------- Ajout depuis le bateau ---------- */
  function ouvrirAjout() {
    ajoutGenre = 'idee'; ajoutPhotos = []; $('a-titre').value = ''; $('a-detail').value = '';
    $('a-par').textContent = C.auteur(ctx.bord, qui().nom); dessinerAjout(); ctx.tab('ajout'); setTimeout(() => $('a-titre').focus(), 50);
  }
  function dessinerAjout() {
    $('a-genres').innerHTML = Object.entries(C.GENRES).map(([g, nom]) => '<button class="c-chip" data-genre="' + g + '" aria-pressed="' + (g === ajoutGenre) + '">' + nom + '</button>').join('');
    $('a-photos').innerHTML = ajoutPhotos.map(pid => '<div class="c-ph"><img data-ph="l:' + pid + '" alt="Photo jointe"><button class="c-phx" data-aretire="' + pid + '" aria-label="Retirer cette photo">×</button></div>').join('');
    $('a-ok').disabled = !$('a-titre').value.trim();
    afficherPhotos();
  }
  function ajouter() {
    if (!$('a-titre').value.trim()) return;
    file.push(C.nouvelAjout({ titre: $('a-titre').value, genre: ajoutGenre, detail: $('a-detail').value.trim(), bord: ctx.bord, nom: qui().nom, bateau: qui().bateau, v: ctx.bg(), photos: ajoutPhotos.slice() }));
    // visible tout de suite, même sans réseau
    const op = file[file.length - 1]; d.taches.push(Object.assign({ ordre: 100, cree_le: op.action.fait_le }, op.tache));
    garderFile(); ctx.tab('car'); dessiner(); synchro();
  }

  /* ---------- Démarrage ---------- */
  function start(o) {
    if (!o.config || !o.config.url || !o.config.cle) return false;
    ctx = o;
    // l'identité du téléphone est aussi gardée dans le trousseau de l'iPhone : la page peut perdre ses données, pas le trousseau
    const store = o.secret ? { get: LS.get, set: (k, v) => { LS.set(k, v); if (k === 'carnet-session') o.secret.ecrire(v).catch(() => {}); } } : LS;
    S = new C.Service(o.config, { fetch: (u, x) => fetch(u, x), store });
    pret = o.secret ? o.secret.lire().then(v => { if (v) S.restaurer(v); else if (S.session) o.secret.ecrire(JSON.stringify(S.session)).catch(() => {}); }).catch(() => {}) : Promise.resolve();
    file = C.lireFile(LS.get('carnet-file'));
    try { brouillons = JSON.parse(LS.get('carnet-brouillons') || '{}') || {}; } catch (e) { brouillons = {}; }
    try { envoyees = JSON.parse(LS.get('carnet-sorties-envoyees') || '[]') || []; } catch (e) { envoyees = []; }
    try { const c = JSON.parse(LS.get('carnet-cache') || 'null'); if (c && Array.isArray(c.taches)) d = c; } catch (e) {}
    // les tâches ajoutées encore dans la file restent visibles
    for (const op of file) if (op.tache && !d.taches.some(t => t.id === op.tache.id)) d.taches.push(Object.assign({ ordre: 100, cree_le: op.action.fait_le }, op.tache));
    $('c-liste').addEventListener('click', e => { const b = e.target.closest('[data-tache]'); if (b) ouvrir(b.dataset.tache); });
    $('c-filtres').addEventListener('click', e => { const b = e.target.closest('[data-filtre]'); if (b) { filtre = b.dataset.filtre; dessiner(); } });
    $('c-retour').onclick = () => { ouverte = null; ctx.tab('car'); dessiner(); };
    $('c-fait').onclick = () => agir('fait'); $('c-pas').onclick = () => agir('pas_possible');
    $('c-tache').addEventListener('click', e => { const x = e.target.closest('[data-retire]'); if (!x) return; const br = brouillon(ouverte); br.photos = br.photos.filter(p => p !== x.dataset.retire); PDB.del(x.dataset.retire).catch(() => {}); garderBrouillons(); dessinerTache(); });
    $('c-plus').onclick = ouvrirAjout; $('a-annuler').onclick = () => { ctx.tab('car'); dessiner(); };
    $('a-genres').addEventListener('click', e => { const b = e.target.closest('[data-genre]'); if (b) { ajoutGenre = b.dataset.genre; dessinerAjout(); } });
    $('a-titre').oninput = () => { $('a-ok').disabled = !$('a-titre').value.trim(); };
    $('a-photo').onclick = () => prendre(pid => { ajoutPhotos.push(pid); dessinerAjout(); });
    $('a-photos').addEventListener('click', e => { const x = e.target.closest('[data-aretire]'); if (!x) return; ajoutPhotos = ajoutPhotos.filter(p => p !== x.dataset.aretire); PDB.del(x.dataset.aretire).catch(() => {}); dessinerAjout(); });
    $('a-ok').onclick = ajouter;
    $('c-file').onchange = photoChoisie;
    root.addEventListener('online', synchro);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') synchro(); });
    let tour = 0; setInterval(() => { tour++; if (o.visible() || tour % 4 === 0) synchro(); }, 30000);   // 30 s onglet ouvert, 2 min sinon
    // O'Tacquet : notifications (« Papa a fait… », avec l'avis de Claude) ; un toucher ouvre la tâche
    if (o.natif) {
      o.natif.addListener('jetonNotif', j => { if (j.jeton) S.enregistrerAppareil(j.jeton, j.environnement).catch(() => {}); });
      o.natif.addListener('notifTouchee', n => { synchro().then(() => { if (d.taches.some(t => t.id === n.tache)) ouvrir(n.tache); }); });
      o.natif.notifications().catch(() => {});
    }
    dessiner(); pret.then(synchro);
    return true;
  }
  // appelée à « Enregistrer » une sortie (index.html) : relevés du B&G vers le carnet, tâche « Enregistrer la sortie » cochée
  function ajouterSortie(trip) {
    if (!S || !trip || !trip.ins || !trip.ins.length) return;
    const t = d.taches.find(x => x.cle === 'trace-bg/enregistrement');
    file.push(C.nouvelleSortie({ trip, bord: ctx.bord, nom: qui().nom, bateau: qui().bateau, tacheId: t && t.id }));
    garderFile(); dessiner(); if (ctx.surEnvoi) ctx.surEnvoi(); synchro();
  }
  // où en est l'envoi d'une sortie du journal : « attente » (gardée sur le téléphone), « envoyee », ou null (pas de relevés du B&G)
  const etatSortie = id => file.some(op => op.tripId === id) ? 'attente' : envoyees.includes(id) ? 'envoyee' : null;
  root.CarnetEcran = { service: () => S, pret: () => pret, start, dessiner, synchro, ajouterSortie, etatSortie, etat: () => ({ d, file, hors, brouillons }) };
})(typeof self !== 'undefined' ? self : this);
