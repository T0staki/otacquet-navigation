// Tests du lecteur NMEA : node tests/nmea.test.js
// tests/trames.txt : phrases relevées sur O'Tacquet le 25/10/2026, positions remplacées par une position fictive (48° N, 3° O) ;
// les deux phrases MWV « R » (vent apparent) sont fabriquées pour le test (le relevé n'en montrait pas).
const fs = require('fs'), path = require('path');
const { parse, checksumOk, Bord } = require('../nmea.js');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok    ' : 'ÉCHEC ') + m); if (!c) fail++; };
const L = fs.readFileSync(path.join(__dirname, 'trames.txt'), 'utf8').trim().split('\n');
ok(L.every(checksumOk), `${L.length} phrases, sommes de contrôle justes`);
ok(!checksumOk('$IIHDG,219.4,,,0.8,E*25'), 'somme de contrôle fausse refusée');
const by = t => L.map(parse).find(p => p && p.type === t);
const hdg = by('HDG'); ok(Math.abs(hdg.headingTrue - 220.2) < 1e-9 && hdg.headingMag === 219.4, `cap magnétique 219,4°, vrai ${hdg.headingTrue.toFixed(1)}° (déclinaison 0,8° E)`);
const mw = L.map(parse).filter(p => p && p.type === 'MWV');
ok(mw[0].ref === 'reel' && mw[0].angle === 57.1 && mw[0].speed === 12.6, 'MWV T : vent réel 57,1° tribord, 12,6 nds');
ok(mw[1].ref === 'apparent' && mw[1].angle === 40 && mw[2].angle === -40, 'MWV R : 40° tribord, 320° → −40° (bâbord)');
ok(by('VHW').stw === 0, 'loch (VHW) 0,0 nd à quai');
ok(Math.abs(by('DPT').depth - 10.4) < 1e-9, 'profondeur 10,4 m');
ok(by('MWD').dirTrue === 277.5, 'vent réel du 277,5° vrai');
const v = by('VLW'); ok(v.waterTrip === 1822.4 && v.groundTrip === 1889.6, 'VLW : loch 1822,4 M, GPS 1889,6 M');
const x = by('XDR').values; ok(x.heel.value === -3.1 && x.trim.value === 6.3 && x.airtemp.value === null, 'XDR : gîte −3,1°, assiette 6,3°, température d\'air vide');
const r = by('RMC'); ok(Math.abs(r.lat - 48) < 1e-9 && Math.abs(r.lon + 3) < 1e-9 && r.sog === 0.2, 'RMC : position et vitesse fond');
ok(by('GGA').sats === 12, 'GGA : 12 satellites');
const b = new Bord().feed(L.join('\r\n'), 1000).now(5000, 2000);
ok(b.heading > 220 && b.tws === 12.6 && b.twd === 277.5 && b.awa === -40 && b.depth > 10 && b.xdr_heel === -3.1, 'état du bord rempli depuis le flux');
ok(Object.keys(new Bord().feed(L.join('\n'), 0).now(5000, 10000)).length === 0, 'valeurs de plus de 5 s écartées');
console.log(fail ? `${fail} échec(s)` : 'tous les tests passent'); process.exit(fail ? 1 : 0);
