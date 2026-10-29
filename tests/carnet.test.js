// Tests du carnet de bord : node tests/carnet.test.js (service en ligne simulé, aucun appel réseau)
const C = require('../www/carnet.js');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok    ' : 'ÉCHEC ') + m); if (!c) fail++; };

// mesures jointes : jamais de position
const m = C.mesuresBG({ tws: 14.26, twa: -42.04, xdr_heel: 12.35, lat: 48, lon: -3, stw: NaN });
ok(m.tws === 14.3 && m.twa === -42 && m.xdr_heel === 12.4 && !('lat' in m) && !('lon' in m) && !('stw' in m), 'mesures du B&G arrondies, sans position ni valeur illisible');
ok(C.mesuresBG({}) === null && C.mesuresBG(null) === null, 'sans B&G : pas de mesures');
ok(C.auteur(true) === 'Papa (Bord)' && C.auteur(false) === "Jérémie (O'Tacquet)", 'auteur selon l’appli');

// actions et ajouts
const a = C.nouvelleAction({ tacheId: 't1', genre: 'fait', bord: true, note: 'x'.repeat(2500), v: { tws: 10 }, photos: ['p1'], now: 0 });
ok(a.id === a.action.id && a.action.id_client === a.id && a.action.appli === 'bord' && a.action.auteur === 'Papa (Bord)', 'action : identifiant créé sur le téléphone, auteur Bord');
ok(a.action.note.length === 2000 && a.photos[0] === 'p1' && a.action.mesures.tws === 10 && a.action.fait_le === '1970-01-01T00:00:00.000Z', 'action : note bornée, photos et mesures, heure à bord');
const aj = C.nouvelAjout({ titre: '  Le pilote décroche  ', genre: 'zz', detail: 'mer de l’arrière', bord: false });
ok(aj.tache.statut === 'propose' && aj.tache.origine === 'otacquet' && aj.tache.titre === 'Le pilote décroche' && aj.tache.genre === 'idee' && aj.action.tache_id === aj.tache.id && aj.action.genre === 'note', 'ajout : tâche proposée et note liée');
ok(C.lireFile('pas du json').length === 0 && C.lireFile(JSON.stringify([a, { id: 'z' }])).length === 1, 'file d’attente illisible ou incomplète écartée');

// état et groupes
const d = { taches: [
  { id: 't1', titre: 'Photo bordé', groupe: 'Au près', statut: 'a_faire', ordre: 30, cree_le: '1' },
  { id: 't2', titre: 'Photo choqué', groupe: 'Au près', statut: 'a_refaire', ordre: 40, cree_le: '1' },
  { id: 't3', titre: 'Étalonnage', groupe: 'À quai, avant de partir', statut: 'valide', ordre: 10, cree_le: '1' },
  { id: 't4', titre: 'Idée', groupe: 'Mouillage', statut: 'propose', ordre: 100, cree_le: '2' }],
  actions: [{ id: 'a2', tache_id: 't2', genre: 'fait', auteur: 'Papa (Bord)', fait_le: '2026-11-07T15:42:00Z' }, { id: 'a3', tache_id: 't3', genre: 'fait', auteur: 'Papa (Bord)', fait_le: '2026-11-07T10:00:00Z' }],
  verifications: [{ id: 'v1', action_id: 'a2', verdict: 'a_refaire', message: 'tête coupée', cree_le: '2026-11-07T15:51:00Z' }, { id: 'v2', action_id: 'a3', verdict: 'valide', message: 'bon', cree_le: '2' }] };
const e2 = C.etat(d.taches[1], d, []);
ok(e2.statut === 'a_refaire' && e2.verif.message === 'tête coupée' && !e2.fini && /Claude : à refaire/.test(e2.texte), 'à refaire : consigne de Claude, reste à faire');
ok(C.etat(d.taches[2], d, []).fini && /vérifié par Claude/.test(C.etat(d.taches[2], d, []).texte), 'vérifiée : finie');
ok(C.resteAFaire(d, []) === 2, 'deux tâches restent à faire');
const f = [C.nouvelleAction({ tacheId: 't1', genre: 'fait', bord: false })];
const e1 = C.etat(d.taches[0], d, f);
ok(e1.attente && e1.fini && e1.statut === 'envoye' && /Gardé sur le téléphone/.test(e1.texte), 'faite hors réseau : gardée sur le téléphone, comptée comme faite');
ok(C.resteAFaire(d, f) === 1, 'une seule reste à faire après l’action hors réseau');
ok(!C.etat(d.taches[1], d, [C.nouvelleAction({ tacheId: 't2', genre: 'pas_possible', bord: true })]).fini, 'pas possible : reste à faire');
const g = C.grouper(d, [], 'Tout');
ok(g.map(x => x.nom).join('|') === 'À quai, avant de partir|Au près|Mouillage', 'groupes dans l’ordre du bord, groupe inconnu à la fin');
ok(C.grouper(d, f, 'Au près')[0].items.map(x => x.t.id).join() === 't2,t1', 'filtre, tâches finies en bas');
ok(C.filtres(d).join('|') === 'Tout|À quai, avant de partir|Au près|Mouillage', 'filtres d’après les tâches');

// service simulé : connexion anonyme, relance du jeton, envoi, doublon
(async () => {
  const appels = [], mem = {};
  const store = { get: k => mem[k], set: (k, v) => { mem[k] = v; } };
  const rep = (status, corps) => ({ ok: status < 300, status, json: async () => corps, text: async () => JSON.stringify(corps), blob: async () => corps });
  let reponses = [];
  const fetch = async (url, o) => { appels.push([url.replace('https://x.supabase.co', ''), o && o.method || 'GET', o && o.headers]); return reponses.shift() || rep(201, {}); };
  const S = new C.Service({ url: 'https://x.supabase.co/', cle: 'cle' }, { fetch, store });
  reponses = [rep(200, { access_token: 'A', refresh_token: 'R', expires_in: 3600, user: { id: 'u1' } }), rep(200, []), rep(200, []), rep(200, [])];
  const lu = await S.lire();
  ok(appels[0][0] === '/auth/v1/signup' && appels[1][2].Authorization === 'Bearer A' && S.session.uid === 'u1' && JSON.parse(mem['carnet-session']).refresh === 'R', 'première fois : connexion anonyme, session gardée');
  ok(Array.isArray(lu.taches) && appels.length === 4, 'lecture des trois tables');
  ok(!appels[3][0].includes('pour_jeremie'), 'Bord : l’analyse de Claude n’est pas lue');
  appels.length = 0; reponses = [rep(200, []), rep(200, []), rep(200, [])]; await S.lire(true);
  ok(appels[2][0].includes('pour_jeremie,prochaines'), 'O’Tacquet : analyse et prochaines étapes lues');
  S.session.exp = 0; appels.length = 0;
  reponses = [rep(200, { access_token: 'B', refresh_token: 'R2', expires_in: 3600, user: { id: 'u1' } }), rep(201, {}), rep(201, {})];
  const op = C.nouvelleAction({ tacheId: 't1', genre: 'fait', bord: true, photos: ['p9'] });
  await S.envoyer(op, async () => 'blob');
  ok(appels[0][0].startsWith('/auth/v1/token') && appels[1][0] === '/storage/v1/object/photos/u1/' + op.id + '-p9.jpg' && appels[2][0] === '/rest/v1/actions', 'jeton expiré : relancé ; photo dans le dossier du téléphone, puis l’action');
  reponses = [rep(409, {})];
  let err = null; try { await S.envoyer(C.nouvelleAction({ tacheId: 't1', genre: 'fait', bord: true }), async () => null); } catch (e) { err = e; }
  ok(!err, 'doublon d’un envoi interrompu : compté comme envoyé');
  reponses = [rep(403, {})];
  try { await S.envoyer(C.nouvelleAction({ tacheId: 't1', genre: 'fait', bord: true }), async () => null); } catch (e) { err = e; }
  ok(err && err.definitif, 'refus du service : erreur définitive (retirée de la file)');
  reponses = [rep(503, {})]; err = null;
  try { await S.envoyer(C.nouvelleAction({ tacheId: 't1', genre: 'fait', bord: true }), async () => null); } catch (e) { err = e; }
  ok(err && !err.definitif, 'service indisponible : on réessaiera');
  console.log(fail ? fail + ' échec(s)' : 'tous les tests passent'); process.exit(fail ? 1 : 0);
})();
