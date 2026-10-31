/* Mesures de l'écran Trace : catalogue (trace et GPS de l'iPhone, instruments du B&G), ordre choisi par l'utilisateur, affichage des valeurs.
   L'ordre se garde sur le téléphone (localStorage « mesures-trace ») ; l'édition se fait comme l'écran d'accueil de l'iPhone (voir index.html). */
(function (root) {
  const fr = (n, d) => n.toFixed(d).replace('.', ',');
  const durTxt = s => { const mm = Math.round(Math.max(0, s) / 60), h = Math.floor(mm / 60), m = mm % 60; return h + ':' + String(m).padStart(2, '0'); };
  const deg = a => Math.round(Math.abs(a)) + '°', cap = a => String(Math.round(a) % 360).padStart(3, '0') + '°';
  const cote = a => ' <small>' + (a >= 0 ? 'tribord' : 'bâbord') + '</small>';
  const u = (txt, unite) => txt + ' <small>' + unite + '</small>';
  const nds = (x, d) => x == null ? u('–', 'nds') : u(fr(x, d), 'nds');
  const b = (v, k) => v && v[k] != null ? v[k] : null;   // valeur du B&G encore fraîche

  // src : « trace » (enregistrement en cours), « gps » (GPS de l'iPhone), « bg » (instruments du B&G, lus par le Wi-Fi)
  const CATALOGUE = [
    { k: 'stw', nom: 'STW', src: 'bg', leg: "Speed Through Water, vitesse surface : vitesse du bateau par rapport à l'eau, mesurée par le loch du B&G. Sans courant, elle est égale à la vitesse fond.", val: d => nds(b(d.v, 'stw'), 1) },
    { k: 'sog', nom: 'SOG', src: 'gps', leg: "Speed Over Ground, vitesse fond donnée par le GPS de l'iPhone : vitesse par rapport au fond, courant compris.", val: d => nds(d.sog, 1) },
    { k: 'hdg', nom: 'Cap', src: 'bg', leg: "Direction vers laquelle pointe l'étrave, donnée par le compas du B&G et corrigée de la déclinaison : cap vrai, comparable à la route fond.", val: d => b(d.v, 'heading') != null ? cap(d.v.heading) : '–' },
    { k: 'tws', nom: 'TWS', src: 'bg', leg: "True Wind Speed, force du vent réel : le vent qui souffle vraiment, calculé par le B&G à partir du vent apparent et de la vitesse du bateau, en nœuds.", val: d => nds(b(d.v, 'tws'), 0) },
    { k: 'twa', nom: 'TWA', src: 'bg', leg: "True Wind Angle, angle du vent réel : compté depuis l'étrave, côté tribord ou bâbord.", val: d => b(d.v, 'twa') != null ? deg(d.v.twa) + cote(d.v.twa) : '–' },
    { k: 'twd', nom: 'TWD', src: 'bg', leg: "True Wind Direction, direction du vent réel : d'où il vient, en degrés vrais (par rapport au nord), quel que soit le cap du bateau.", val: d => b(d.v, 'twd') != null ? cap(d.v.twd) : '–' },
    { k: 'aws', nom: 'AWS', src: 'bg', leg: "Apparent Wind Speed, force du vent apparent : vent mesuré en tête de mât, celui que reçoivent les voiles, en nœuds.", val: d => nds(b(d.v, 'aws'), 0) },
    { k: 'awa', nom: 'AWA', src: 'bg', leg: "Apparent Wind Angle, angle du vent apparent : compté depuis l'étrave, côté tribord ou bâbord.", val: d => b(d.v, 'awa') != null ? deg(d.v.awa) + cote(d.v.awa) : '–' },
    { k: 'rudder', nom: 'Barre', src: 'bg', leg: "Angle du safran transmis par le B&G, côté tribord ou bâbord. Le Vulcan l'envoie avec les mesures de gîte et d'assiette.", val: d => b(d.v, 'rudder') != null ? deg(d.v.rudder) + cote(d.v.rudder) : '–' },
    { k: 'heel', nom: 'Gîte', src: 'bg', leg: "Inclinaison du bateau sur le côté, mesurée par le B&G. À quai, elle indique déjà 3 à 4° : étalonnage à faire sur le Vulcan.", val: d => b(d.v, 'xdr_heel') != null ? deg(d.v.xdr_heel) + cote(d.v.xdr_heel) : '–' },
    { k: 'depth', nom: 'Profondeur', src: 'bg', leg: "Hauteur d'eau sous la sonde du sondeur, sans correction (aucun décalage réglé sur le Vulcan). Sous la quille, avec 1,87 m de tirant d'eau, il y en a moins.", val: d => b(d.v, 'depth') != null ? u(fr(d.v.depth, 1), 'm') : '–' },
    { k: 'dist', nom: 'Distance', src: 'trace', leg: "Milles parcourus depuis le début de l'enregistrement, mesurés sur la trace GPS lissée : le bruit des positions à l'arrêt n'est pas compté.", val: d => u(fr(d.stats ? d.stats.distanceNM : 0, 2), 'M') },
    { k: 'dur', nom: 'Durée', src: 'trace', leg: "Temps écoulé depuis le début de l'enregistrement, pauses comprises.", val: d => durTxt(d.start ? Math.max((d.now - d.start) / 1000, d.stats ? d.stats.durationS : 0) : 0) },
    { k: 'avg', nom: 'Moyenne', src: 'trace', leg: "Distance divisée par le temps passé en mouvement (au-dessus de 0,5 nœud) : les arrêts ne la font pas baisser.", val: d => nds(d.stats && d.stats.avgKn ? d.stats.avgKn : null, 1) },
    { k: 'peak', nom: 'Pointe', src: 'trace', leg: "Meilleure vitesse fond moyenne sur 30 secondes depuis le début de l'enregistrement. Elle s'affiche après 30 secondes en mouvement.", val: d => nds(d.stats && d.stats.peakKn && d.stats.movingS > 30 ? d.stats.peakKn : null, 1) },
    // en plus, à ajouter depuis la liste
    { k: 'cog', nom: 'COG', src: 'gps', leg: "Course Over Ground, route fond donnée par le GPS de l'iPhone : direction dans laquelle le bateau avance sur le fond, dérive et courant compris.", val: d => d.cog != null ? cap(d.cog) : '–' },
    { k: 'sogbg', nom: 'SOG du B&G', src: 'bg', leg: "Vitesse fond donnée par le GPS du B&G.", val: d => nds(b(d.v, 'sog'), 1) },
    { k: 'cogbg', nom: 'COG du B&G', src: 'bg', leg: "Route fond donnée par le GPS du B&G.", val: d => b(d.v, 'cog') != null ? cap(d.v.cog) : '–' },
    { k: 'trim', nom: 'Assiette', src: 'bg', leg: "Inclinaison du bateau dans le sens de la longueur, mesurée par le B&G. À quai elle indique +6,3° : étalonnage à faire sur le Vulcan.", val: d => b(d.v, 'xdr_trim') != null ? fr(d.v.xdr_trim, 1).replace(/^(?!-)/, '+') + '°' : '–' },
    { k: 'wtemp', nom: 'Température de l’eau', src: 'bg', leg: "Température de l'eau mesurée par la sonde du B&G. À quai elle indiquait 37,1 °C : étalonnage à faire.", val: d => b(d.v, 'waterTemp') != null ? u(fr(d.v.waterTemp, 1), '°C') : '–' },
    { k: 'atemp', nom: 'Température de l’air', src: 'bg', leg: "Température de l'air transmise par le B&G.", val: d => b(d.v, 'xdr_airtemp') != null ? u(fr(d.v.xdr_airtemp, 1), '°C') : '–' },
    { k: 'baro', nom: 'Pression', src: 'bg', leg: "Pression atmosphérique transmise par le B&G, en hectopascals : sa baisse rapide annonce du vent.", val: d => { const p = b(d.v, 'xdr_baro'); return p == null ? '–' : u(String(Math.round(p < 2 ? p * 1000 : p > 2000 ? p / 100 : p)), 'hPa'); } },
    { k: 'logtrip', nom: 'Loch journalier', src: 'bg', leg: "Distance parcourue sur l'eau depuis la remise à zéro du loch journalier du B&G, en milles.", val: d => b(d.v, 'logTrip') != null ? u(fr(d.v.logTrip, 1), 'M') : '–' }
  ];
  const PAR_K = Object.fromEntries(CATALOGUE.map(m => [m.k, m]));
  // ordre de départ : vitesse et cap, puis le vent, puis le bateau, puis la sortie
  const DEFAUT = ['stw', 'sog', 'hdg', 'tws', 'twa', 'twd', 'aws', 'awa', 'heel', 'depth', 'dist', 'dur', 'avg', 'peak', 'rudder'];

  // liste gardée → liste propre : clés connues, sans doublon ; rien de gardé ou illisible → ordre de départ
  function charger(texte) {
    let l = null; try { l = JSON.parse(texte); } catch (e) {}
    if (!Array.isArray(l)) return DEFAUT.slice();
    const vu = new Set(); return l.filter(k => PAR_K[k] && !vu.has(k) && vu.add(k));
  }
  const garder = l => JSON.stringify(l);
  function deplacer(l, k, avant) {   // place k juste avant « avant » (null : à la fin)
    const r = l.filter(x => x !== k); const i = avant == null ? -1 : r.indexOf(avant);
    if (i < 0) r.push(k); else r.splice(i, 0, k); return r;
  }
  const retirer = (l, k) => l.filter(x => x !== k);
  const ajouter = (l, k) => PAR_K[k] && !l.includes(k) ? l.concat(k) : l.slice();
  const disponibles = l => CATALOGUE.filter(m => !l.includes(m.k));
  const valeur = (k, d) => PAR_K[k] ? PAR_K[k].val(d) : '–';

  const api = { CATALOGUE, PAR_K, DEFAUT, charger, garder, deplacer, retirer, ajouter, disponibles, valeur };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Mesures = api;
})(typeof self !== 'undefined' ? self : this);
