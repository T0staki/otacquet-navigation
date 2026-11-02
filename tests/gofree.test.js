// Tests du lecteur du port 2053 du Vulcan : node tests/gofree.test.js (messages fabriqués au format relevé à quai le 01/11/2026)
const { Vulcan, CANAUX } = require('../www/gofree.js');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok    ' : 'ÉCHEC ') + m); if (!c) fail++; };
const v = new Vulcan();
ok(v.demandes().length === 1 && v.demandes()[0].DataInfoReq.length === CANAUX.length, 'connexion : description des canaux demandée');
const info = { DataInfo: CANAUX.map(c => ({ id: c.id, sname: c.sigle, lname: 'nom' })) };
info.DataInfo.find(d => d.id === 77).sname = 'AUTRE';
const abo = v.recevoir(JSON.stringify(info), 0);
ok(abo.length === 1 && abo[0].DataReq.length === CANAUX.length - 1 && !abo[0].DataReq.some(x => x.id === 77), 'abonnement : seulement les canaux dont le sigle correspond');
ok(abo[0].DataReq.every(x => x.repeat === true), 'abonnement continu');
v.recevoir(JSON.stringify({ Data: [{ id: 140, val: 343.4, valid: true }, { id: 141, val: 90, valid: true }, { id: 37, val: 226, valid: true }, { id: 125, val: 0.9, valid: true },
  { id: 154, valid: false }, { id: 203, val: 90.1, valid: true }, { id: 42, val: 5.9, valid: true }, { id: 77, val: 5.3, valid: true }, { id: 124, val: -13.4, valid: true }] }), 1000);
let n = v.now(2000, 1500);
ok(Math.abs(n.awa + 16.6) < 1e-9 && n.twa === 90, 'angles signés : 343,4° → −16,6° (bâbord), 90° tribord');
ok(Math.abs(n.heading - 226.9) < 1e-9 && n.headingMag === 226 && n.variation === undefined, 'cap vrai = magnétique + variation');
ok(n.pilot === 0 && n.pilot_wind === undefined, 'pilote en veille : angle de vent demandé ignoré');
ok(n.stw === 5.9 && n.xdr_heel === -13.4 && n.depth === undefined, 'vitesse surface, gîte ; canal écarté non lu');
v.recevoir(JSON.stringify({ Data: [{ id: 154, val: 4, valid: true }, { id: 203, val: 90.1, valid: true }] }), 2000);
n = v.now(2000, 2500);
ok(n.pilot === 1 && n.pilot_wind === 90.1, 'pilote embrayé en mode vent : 1 et 90,1°');
ok(Object.keys(v.now(2000, 9000)).length === 0, 'valeurs de plus de 2 s écartées');
v.recevoir(JSON.stringify({ Data: [{ id: 42, valid: false }] }), 3000);
ok(v.now(2000, 3100).stw === undefined, 'valeur devenue invalide : effacée');
ok(v.recevoir('pas du json', 0).length === 0 && v.recevoir('{"Data":"x"}', 0).length === 0, 'message illisible ignoré');
ok(Vulcan.permis({ DataReq: [] }) && Vulcan.permis({ UnsubscribeData: [] }) && Vulcan.permis({ DataInfoReq: [1] }), 'lecture permise');
ok(!Vulcan.permis({ DeviceListReq: {} }) && !Vulcan.permis({ Setting: [] }) && !Vulcan.permis({ EventSet: [] }) && !Vulcan.permis({ DataReq: [], Setting: [] }), 'écriture et liste des appareils refusées');
console.log(fail ? fail + ' échec(s)' : 'tous les tests passent'); process.exit(fail ? 1 : 0);
