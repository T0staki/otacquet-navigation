/* Carnet de bord : choses à faire, vérifier, photographier pendant les sorties (onglet « Carnet », O'Tacquet et Bord).
   Les tâches viennent du service en ligne du carnet (Supabase) ; la liste reste lisible sans réseau (copie gardée sur le téléphone).
   Ce qu'on fait à bord (fait, pas possible, note, photos, ajout) part dans une file d'attente, envoyée dès que le réseau revient.
   Le téléphone se connecte sans compte (connexion anonyme) : son identifiant sert à attribuer les actions quand le profil existera.
   Jamais de position : les photos sont redessinées (ce qui efface leurs métadonnées, position comprise) et seules les mesures
   du B&G listées dans MESURES partent avec une action. Adresse et clé du service : www/moteur/carnet-config.js, écrit à la
   compilation par outillage/moteur.sh (jamais dans ce dépôt public) ; sans lui, l'onglet n'existe pas. */
(function (root) {
  const GROUPES = ['À quai, avant de partir', 'Au près', 'Génois enroulé', 'Toute la sortie'];
  const GENRES = { photo: 'Photo à faire', mesure: 'Mesure à faire', verifier: 'À vérifier', idee: 'Idée ou remarque' };
  const MESURES = ['tws', 'twa', 'twd', 'aws', 'awa', 'stw', 'sog', 'heading', 'xdr_heel', 'xdr_trim', 'depth', 'waterTemp'];   // jamais lat, lon
  const auteur = bord => bord ? 'Papa (Bord)' : "Jérémie (O'Tacquet)";
  const uuid = () => (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

  // mesures du B&G jointes à une action : valeurs fraîches seulement, arrondies au dixième, sans position
  function mesuresBG(v) {
    const o = {}; if (!v) return null;
    for (const k of MESURES) if (typeof v[k] === 'number' && isFinite(v[k])) o[k] = Math.round(v[k] * 10) / 10;
    return Object.keys(o).length ? o : null;
  }

  // file d'attente (gardée sur le téléphone) : { id, tache?: {...}, action: {...}, photos: [identifiants locaux] }
  const lireFile = txt => { try { const f = JSON.parse(txt); return Array.isArray(f) ? f.filter(x => x && x.id && x.action) : []; } catch (e) { return []; } };

  function nouvelleAction(o) {
    const id = uuid();
    return { id, action: { id, id_client: id, tache_id: o.tacheId, genre: o.genre, appli: o.bord ? 'bord' : 'otacquet', auteur: auteur(o.bord),
      note: o.note ? String(o.note).slice(0, 2000) : null, mesures: mesuresBG(o.v), fait_le: new Date(o.now != null ? o.now : Date.now()).toISOString() }, photos: o.photos || [] };
  }
  // un ajout depuis l'appli : une tâche « proposée » et une note qui porte l'auteur, le B&G et les photos
  function nouvelAjout(o) {
    const tid = uuid(), op = nouvelleAction({ tacheId: tid, genre: 'note', bord: o.bord, note: o.detail, v: o.v, photos: o.photos, now: o.now });
    op.tache = { id: tid, titre: String(o.titre || '').trim().slice(0, 200) || 'Sans titre', genre: GENRES[o.genre] ? o.genre : 'idee',
      groupe: o.groupe || 'Toute la sortie', comment: o.detail || null, statut: 'propose', origine: o.bord ? 'bord' : 'otacquet' };
    return op;
  }

  // état d'une tâche vu du téléphone : statut du service, corrigé par ce qui attend dans la file
  function etat(t, d, file) {
    const acts = d.actions.filter(a => a.tache_id === t.id).sort((x, y) => x.fait_le < y.fait_le ? -1 : 1);
    const der = acts.filter(a => a.genre === 'fait' || a.genre === 'pas_possible' || a.genre === 'note').pop();
    const ver = der ? d.verifications.filter(v => v.action_id === der.id).sort((x, y) => x.cree_le < y.cree_le ? -1 : 1).pop() : null;
    const att = (file || []).filter(op => op.action.tache_id === t.id && op.action.genre !== 'photo').pop();
    const e = { statut: t.statut, par: der ? der.auteur : null, verif: ver || null, attente: !!att };
    if (att) { e.statut = att.action.genre === 'pas_possible' ? 'pas_possible' : att.tache ? 'propose' : 'envoye'; e.par = att.action.auteur; e.verif = null; }
    const par = e.par ? 'par ' + e.par : '';
    e.texte = e.attente ? 'Gardé sur le téléphone, envoyé au retour du réseau'
      : { a_faire: t.quand || '', envoye: 'Fait ' + par + ' · en attente de Claude', valide: 'Fait ' + par + ' · vérifié par Claude',
          a_refaire: 'Fait ' + par + ' · Claude : à refaire', pas_possible: 'Pas possible ' + par + ' · reste à faire',
          propose: 'Ajouté ' + par + ' · en attente de Claude' }[e.statut] || '';
    e.fini = e.statut === 'valide' || e.statut === 'envoye' || e.statut === 'propose';   // plus rien à faire à bord (Claude vérifie)
    return e;
  }
  const resteAFaire = (d, file) => d.taches.filter(t => !etat(t, d, file).fini).length;

  // groupes dans l'ordre du bord (à quai, au près…), tâches finies en bas de leur groupe
  function grouper(d, file, filtre) {
    const out = [], noms = GROUPES.concat([...new Set(d.taches.map(t => t.groupe))].filter(g => !GROUPES.includes(g)));
    for (const nom of noms) {
      if (filtre && filtre !== 'Tout' && filtre !== nom) continue;
      const items = d.taches.filter(t => t.groupe === nom).map(t => ({ t, e: etat(t, d, file) }))
        .sort((a, b) => (a.e.fini - b.e.fini) || (a.t.ordre - b.t.ordre) || (a.t.cree_le < b.t.cree_le ? -1 : 1));
      if (items.length) out.push({ nom, items });
    }
    return out;
  }
  const filtres = d => ['Tout'].concat(GROUPES.filter(g => d.taches.some(t => t.groupe === g)), [...new Set(d.taches.map(t => t.groupe))].filter(g => !GROUPES.includes(g)));

  /* Service en ligne (Supabase, par son interface web) : fetch et stockage fournis, pour tourner aussi dans les tests. */
  class Service {
    constructor(cfg, o) {
      this.url = cfg.url.replace(/\/$/, ''); this.cle = cfg.cle; this.fetch = o.fetch; this.store = o.store;
      this.session = null; try { this.session = JSON.parse(this.store.get('carnet-session') || 'null'); } catch (e) {}
    }
    garder(s) { this.session = s; this.store.set('carnet-session', JSON.stringify(s)); }
    // un seul renouvellement à la fois : les lectures simultanées attendent le même jeton
    jeton() {
      const s = this.session;
      if (s && s.exp - 60 > Date.now() / 1000) return Promise.resolve(s.access);
      if (!this.enCours) this.enCours = this.renouveler().finally(() => { this.enCours = null; });
      return this.enCours;
    }
    async renouveler() {
      const s = this.session, now = Date.now() / 1000;
      const r = s && s.refresh
        ? await this.fetch(this.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: this.cle, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh }) })
        : null;
      let j = r && r.ok ? await r.json() : null;
      if (!j) {   // première fois, ou session perdue : nouvelle connexion anonyme
        const r2 = await this.fetch(this.url + '/auth/v1/signup', { method: 'POST', headers: { apikey: this.cle, 'Content-Type': 'application/json' }, body: '{}' });
        if (!r2.ok) throw new Error('connexion refusée (' + r2.status + ')');
        j = await r2.json();
      }
      this.garder({ access: j.access_token, refresh: j.refresh_token, exp: j.expires_at || (now + (j.expires_in || 3600)), uid: j.user && j.user.id });
      return j.access_token;
    }
    async appel(chemin, o) {
      o = o || {}; const h = Object.assign({ apikey: this.cle, Authorization: 'Bearer ' + await this.jeton() }, o.headers || {});
      return this.fetch(this.url + chemin, Object.assign({}, o, { headers: h }));
    }
    // analyse : l'analyse de Claude et les prochaines étapes, lues seulement par O'Tacquet (Bord n'a que le message court)
    async lire(analyse) {
      const get = async q => { const r = await this.appel('/rest/v1/' + q); if (!r.ok) throw new Error('lecture refusée (' + r.status + ')'); return r.json(); };
      const [taches, actions, verifications] = await Promise.all([
        get('taches?select=id,cle,chantier,titre,groupe,genre,comment,quand,pourquoi,statut,origine,ordre,cree_le&order=ordre,cree_le'),
        get('actions?select=id,tache_id,genre,auteur,appli,note,photos,mesures,fait_le&order=fait_le'),
        get('verifications?select=id,action_id,verdict,message,' + (analyse ? 'pour_jeremie,prochaines,' : '') + 'cree_le&order=cree_le')]);
      return { taches, actions, verifications, le: Date.now() };
    }
    // envoie une opération de la file ; « dejà là » (doublon d'un envoi interrompu) compte comme réussi
    async envoyer(op, photo) {
      const ok = r => r.ok || r.status === 409;
      const uid = this.session && this.session.uid || (await this.jeton(), this.session.uid);
      const chemins = [];
      for (const pid of op.photos) {
        const blob = await photo(pid); if (!blob) continue;
        const chemin = uid + '/' + op.id + '-' + pid + '.jpg';
        const r = await this.appel('/storage/v1/object/photos/' + chemin, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
        if (!ok(r) && !(r.status === 400 && /exist|Duplicate/i.test(await r.text()))) throw Object.assign(new Error('photo refusée (' + r.status + ')'), { definitif: r.status === 403 || r.status === 413 });
        chemins.push(chemin);
      }
      const poster = async (table, corps) => {
        const r = await this.appel('/rest/v1/' + table, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(corps) });
        if (!ok(r)) throw Object.assign(new Error(table + ' refusé (' + r.status + ')'), { definitif: r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 408 && r.status !== 429 });
      };
      if (op.tache) await poster('taches', op.tache);
      await poster('actions', Object.assign({}, op.action, { photos: chemins }));
    }
    // O'Tacquet : adresse de cet iPhone pour les notifications ; déjà connue, l'envoi est ignoré
    async enregistrerAppareil(jeton, environnement) {
      const r = await this.appel('/rest/v1/appareils_notif?on_conflict=jeton', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ jeton, environnement, appli: 'otacquet' }) });
      if (!r.ok && r.status !== 409) throw new Error('adresse refusée (' + r.status + ')');
    }
    async photo(chemin) {
      const r = await this.appel('/storage/v1/object/authenticated/photos/' + chemin);
      return r.ok ? r.blob() : null;
    }
  }

  // photo prise ou choisie → JPEG redessiné (2048 px au plus) : la position et toutes les métadonnées disparaissent
  async function reduire(fichier, max) {
    max = max || 2048;
    const img = await createImageBitmap(fichier), k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); if (img.close) img.close();
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('photo illisible')), 'image/jpeg', 0.85));
  }

  const api = { GROUPES, GENRES, MESURES, auteur, uuid, mesuresBG, lireFile, nouvelleAction, nouvelAjout, etat, resteAFaire, grouper, filtres, Service, reduire };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Carnet = api;
})(typeof self !== 'undefined' ? self : this);
