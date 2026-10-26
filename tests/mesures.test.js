// Tests des mesures de l'écran Trace : node tests/mesures.test.js
const M = require('../www/mesures.js');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok    ' : 'ÉCHEC ') + m); if (!c) fail++; };

ok(M.charger(null).join() === M.DEFAUT.join(), 'rien de gardé : ordre de départ');
ok(M.charger('pas du json').join() === M.DEFAUT.join(), 'liste illisible : ordre de départ');
ok(M.charger('["tws","inconnue","tws","stw"]').join() === 'tws,stw', 'clés inconnues et doublons écartés');
ok(M.charger('[]').length === 0, 'liste vide gardée vide (tout retiré)');
const l = M.charger(M.garder(['stw', 'sog', 'tws']));
ok(M.deplacer(l, 'tws', 'stw').join() === 'tws,stw,sog', 'déplacer avant une autre');
ok(M.deplacer(l, 'stw', null).join() === 'sog,tws,stw', 'déplacer à la fin');
ok(M.retirer(l, 'sog').join() === 'stw,tws', 'retirer');
ok(M.ajouter(l, 'baro').join() === 'stw,sog,tws,baro' && M.ajouter(l, 'stw').length === 3 && M.ajouter(l, 'xx').length === 3, 'ajouter une fois, à la fin, seulement si connue');
ok(M.disponibles(l).every(m => !l.includes(m.k)) && M.disponibles(l).length === M.CATALOGUE.length - 3, 'liste des mesures à ajouter');
ok(M.CATALOGUE.every(m => m.nom && m.leg && ['trace', 'gps', 'bg'].includes(m.src)), 'chaque mesure a un nom, une légende et une source');
ok(M.DEFAUT.every(k => M.PAR_K[k]), 'ordre de départ fait de mesures connues');
// valeurs
const v = { stw: 5.43, tws: 12.6, twa: -45, heading: 7, xdr_heel: 6.3, xdr_trim: -1.2, xdr_baro: 1.0132, waterTemp: 14.25, depth: 8.04, logTrip: 3.26 };
ok(M.valeur('stw', { v }) === '5,4 <small>nds</small>', 'STW en nœuds');
ok(M.valeur('twa', { v }) === '45° <small>bâbord</small>', 'TWA avec le bord');
ok(M.valeur('hdg', { v }) === '007°', 'cap sur trois chiffres');
ok(M.valeur('baro', { v }) === '1013 <small>hPa</small>' && M.valeur('baro', { v: { xdr_baro: 101320 } }) === '1013 <small>hPa</small>', 'pression en hPa (bar ou Pa)');
ok(M.valeur('trim', { v }) === '-1,2°' && M.valeur('trim', { v: { xdr_trim: 2 } }) === '+2,0°', 'assiette signée');
ok(M.valeur('tws', { v: {} }) === '– <small>nds</small>' && M.valeur('hdg', {}) === '–', 'sans donnée : tiret');
ok(M.valeur('dur', { start: 0, now: 3 * 3600e3 + 5 * 60e3, stats: null }) === '0:00' && M.valeur('dur', { start: 1, now: 1 + 65 * 60e3 }) === '1:05', 'durée');
ok(M.valeur('dist', { stats: { distanceNM: 1.234 } }) === '1,23 <small>M</small>', 'distance en milles');
console.log(fail ? fail + ' échec(s)' : 'tous les tests passent'); process.exit(fail ? 1 : 0);
