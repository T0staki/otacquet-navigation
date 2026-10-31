/* Lecture des phrases NMEA 0183 envoyées par le B&G Vulcan 7R (Wi-Fi, TCP 192.168.76.1:10110), V0.1, 25/10/2026.
   Sans dépendance : utilisable dans l'appli (window.Nmea) et sous node pour les tests.
   Phrases relevées sur O'Tacquet le 25/10/2026 (NMEAconnect) : AAM APB BOD DBT DPT GGA GLC GLL GSA GSV HDG MTW MWD MWV RMB RMC VHW VLW VTG XDR XTE ZDA, et !AIVDM (AIS).
   Unités rendues : nœuds, degrés, mètres, °C ; angles de vent signés (+ tribord, − bâbord). */
(function (root) {
  'use strict';
  const num = s => (s === undefined || s === '' ? null : (isFinite(+s) ? +s : null));
  const checksumOk = line => {
    const m = /^[$!]([^*]*)\*([0-9A-Fa-f]{2})\s*$/.exec(line);
    if (!m) return false;
    let c = 0; for (const ch of m[1]) c ^= ch.charCodeAt(0);
    return c === parseInt(m[2], 16);
  };
  const latlon = (v, h, deg) => { if (!v) return null; const d = parseInt(v.slice(0, deg), 10), m = parseFloat(v.slice(deg)); const x = d + m / 60; return (h === 'S' || h === 'W') ? -x : x; };
  const hms = v => v && v.length >= 6 ? { h: +v.slice(0, 2), m: +v.slice(2, 4), s: parseFloat(v.slice(4)) } : null;
  const signedAngle = a => (a > 180 ? a - 360 : a);   // 0-360 relatif à l'étrave → −180..180 (− bâbord)

  /* Une phrase → { type, talker, ... } ou null (somme de contrôle fausse, phrase inconnue ou vide). */
  function parse(line) {
    line = String(line).trim();
    if (!checksumOk(line)) return null;
    if (line[0] === '!') return { type: 'AIS', raw: line };
    const f = line.slice(1, line.indexOf('*')).split(','), id = f[0], talker = id.slice(0, 2), t = id.slice(2);
    const r = { type: t, talker };
    switch (t) {
      case 'RMC': if (f[2] !== 'A') return null;
        return Object.assign(r, { time: hms(f[1]), lat: latlon(f[3], f[4], 2), lon: latlon(f[5], f[6], 3), sog: num(f[7]), cog: num(f[8]),
          date: f[9] ? { d: +f[9].slice(0, 2), mo: +f[9].slice(2, 4), y: 2000 + +f[9].slice(4, 6) } : null });
      case 'GGA': return f[6] === '0' ? null : Object.assign(r, { time: hms(f[1]), lat: latlon(f[2], f[3], 2), lon: latlon(f[4], f[5], 3), sats: num(f[7]), hdop: num(f[8]) });
      case 'VTG': return Object.assign(r, { cog: num(f[1]), sog: num(f[5]) });
      case 'HDG': { const h = num(f[1]), v = num(f[4]) == null ? null : num(f[4]) * (f[5] === 'W' ? -1 : 1);
        return h == null ? null : Object.assign(r, { headingMag: h, variation: v, headingTrue: v == null ? null : (h + v + 360) % 360 }); }
      case 'VHW': return Object.assign(r, { headingTrue: num(f[1]), headingMag: num(f[3]), stw: num(f[5]) });   // vitesse surface (loch)
      case 'MWV': { const a = num(f[1]), s = num(f[3]); if (a == null || s == null || f[5] !== 'A') return null;
        const k = f[4] === 'K' ? 1 / 1.852 : f[4] === 'M' ? 3600 / 1852 : 1;
        return Object.assign(r, { ref: f[2] === 'R' ? 'apparent' : 'reel', angle: signedAngle(a), speed: s * k }); }
      case 'MWD': return Object.assign(r, { dirTrue: num(f[1]), dirMag: num(f[3]), speed: num(f[5]) });   // vent réel : direction d'où il vient
      case 'DPT': return Object.assign(r, { depth: num(f[1]) == null ? null : num(f[1]) + (num(f[2]) || 0), offset: num(f[2]) });
      case 'DBT': return Object.assign(r, { depthBelowTransducer: num(f[3]) });
      case 'MTW': return Object.assign(r, { waterTemp: num(f[1]) });
      case 'VLW': return Object.assign(r, { waterTotal: num(f[1]), waterTrip: num(f[3]), groundTotal: num(f[5]), groundTrip: num(f[7]) });
      case 'XDR': { const out = {}; for (let i = 1; i + 3 < f.length + 1; i += 4) { const name = f[i + 3]; if (name) out[name.toLowerCase()] = { type: f[i], value: num(f[i + 1]), unit: f[i + 2] }; }
        return Object.assign(r, { values: out }); }
      case 'RSA': return Object.assign(r, { rudder: f[2] === 'A' ? num(f[1]) : null });
      case 'ZDA': return Object.assign(r, { time: hms(f[1]), date: { d: num(f[2]), mo: num(f[3]), y: num(f[4]) } });
      default: return null;
    }
  }

  /* État du bord tenu à jour phrase après phrase (chaque valeur garde l'heure de sa dernière mise à jour, en ms). */
  class Bord {
    constructor() { this.v = {}; this.n = 0; this.bad = 0; this.ignorees = 0; this.types = {}; }
    set(k, val, t) { if (val != null && isFinite(val)) this.v[k] = { val, t }; }
    feed(text, now) {
      now = now == null ? Date.now() : now;
      for (const line of String(text).split(/\r?\n/)) {
        if (!line.trim()) continue;
        const p = parse(line), ok = !!p || checksumOk(line.trim()), m = ok && /^[$!].{0,2}([A-Z]{3})/.exec(line.trim()); if (m) this.types[m[1]] = (this.types[m[1]] || 0) + 1;
        if (!p) { if (ok) this.ignorees++; else this.bad++; continue; } this.n++;   // phrase valide que l'appli n'utilise pas : ce n'est pas un rejet
        switch (p.type) {
          case 'RMC': this.set('lat', p.lat, now); this.set('lon', p.lon, now); this.set('sog', p.sog, now); this.set('cog', p.cog, now); break;
          case 'VTG': this.set('sog', p.sog, now); this.set('cog', p.cog, now); break;
          case 'HDG': this.set('heading', p.headingTrue != null ? p.headingTrue : p.headingMag, now); this.set('headingMag', p.headingMag, now); break;
          case 'VHW': this.set('stw', p.stw, now); break;
          case 'MWV': if (p.ref === 'apparent') { this.set('awa', p.angle, now); this.set('aws', p.speed, now); } else { this.set('twa', p.angle, now); this.set('tws', p.speed, now); } break;
          case 'MWD': this.set('twd', p.dirTrue, now); this.set('tws', p.speed, now); break;
          case 'DPT': this.set('depth', p.depth, now); break;
          case 'MTW': this.set('waterTemp', p.waterTemp, now); break;
          case 'VLW': this.set('logTrip', p.waterTrip, now); this.set('gpsTrip', p.groundTrip, now); break;
          case 'XDR': for (const k in p.values) this.set('xdr_' + k, p.values[k].value, now); if (p.values.rudder) this.set('rudder', p.values.rudder.value, now); break;   // le Vulcan envoie la barre dans XDR (RUDDER), pas en RSA
          case 'RSA': this.set('rudder', p.rudder, now); break;
        }
      }
      return this;
    }
    /* Valeurs encore fraîches (moins de maxAge ms). */
    now(maxAge, at) { at = at == null ? Date.now() : at; const o = {}; for (const k in this.v) if (at - this.v[k].t <= (maxAge || 5000)) o[k] = this.v[k].val; return o; }
  }

  const api = { parse, checksumOk, Bord };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Nmea = api;
})(typeof self !== 'undefined' ? self : this);
