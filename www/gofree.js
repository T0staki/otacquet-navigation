/* Lecture du B&G Vulcan par son port 2053 (échange de données « navico-nav-ws », websocket, protocole non officiel décrit par
   GoFreeWebSocketTest et node-red-contrib-bg-hercules). Deux valeurs par seconde pour le vent, la gîte, la barre et le cap, contre une
   par seconde en NMEA 0183 : sert à l'affichage et aux relevés, jamais à l'écran Réglages, qui reste sur le NMEA 0183.
   Lecture seule : seules les demandes DataInfoReq, DataReq et UnsubscribeData partent vers le Vulcan (la liste des appareils n'est
   jamais demandée : elle contient le mot de passe du Wi-Fi). Le module natif refuse aussi tout autre message.
   Angles signés comme le lecteur NMEA : positif = vent venant de tribord. */
(function (root) {
  'use strict';
  // canal du Vulcan → clé de l'appli. sigle : celui que le Vulcan annonce pour ce canal, vérifié avant usage (logiciel 22.3, 01/11/2026)
  const CANAUX = [
    { id: 42, sigle: 'EAU', k: 'stw' }, { id: 41, sigle: 'SOG', k: 'sog' }, { id: 9, sigle: 'COG', k: 'cog' },
    { id: 37, sigle: 'HDG', k: 'headingMag' }, { id: 125, sigle: 'VAR MAG', k: 'variation' },
    { id: 46, sigle: 'AWS', k: 'aws' }, { id: 140, sigle: 'AWA', k: 'awa', signe: true }, { id: 47, sigle: 'TWS', k: 'tws' },
    { id: 141, sigle: 'TWA', k: 'twa', signe: true }, { id: 142, sigle: 'TWD', k: 'twd' },
    { id: 124, sigle: 'GITE', k: 'xdr_heel' }, { id: 123, sigle: 'TRIM', k: 'xdr_trim' }, { id: 146, sigle: 'BARRE', k: 'rudder' },
    { id: 121, sigle: 'TURN RATE', k: 'turn_rate' }, { id: 77, sigle: 'PROF', k: 'depth' },
    // pilote : 154 n'a pas de sigle ; il n'est valide que pilote embrayé (essais du 01/11). 203 : angle de vent demandé, en mode vent
    { id: 154, sigle: '', k: 'pilot', etat: true }, { id: 203, sigle: 'SET ANGLE', k: 'pilot_wind' }
  ];
  const PERMIS = ['DataInfoReq', 'DataReq', 'UnsubscribeData'];
  const signe = a => a > 180 ? a - 360 : a;

  class Vulcan {
    constructor() { this.v = {}; this.ids = {}; this.verifie = false; this.n = 0; this.ecartes = []; }
    // messages à envoyer à la connexion : d'abord la description des canaux, l'abonnement suit la réponse
    demandes() { return [{ DataInfoReq: CANAUX.map(c => c.id) }]; }
    static permis(o) { return o && typeof o === 'object' && Object.keys(o).length === 1 && PERMIS.includes(Object.keys(o)[0]); }
    // traite un message reçu ; renvoie les messages à envoyer en retour (abonnement après vérification des sigles)
    recevoir(texte, now) {
      now = now == null ? Date.now() : now;
      let m; try { m = JSON.parse(texte); } catch (e) { return []; }
      if (!m || typeof m !== 'object') return [];
      if (Array.isArray(m.DataInfo)) {
        for (const d of m.DataInfo) {
          const c = CANAUX.find(x => x.id === d.id); if (!c) continue;
          if ((d.sname || '').trim() === c.sigle) this.ids[c.id] = c; else this.ecartes.push(c.id + ':' + d.sname);
        }
        this.verifie = true;
        const ids = Object.keys(this.ids).map(Number);
        return ids.length ? [{ DataReq: ids.map(id => ({ id, repeat: true })) }] : [];
      }
      if (Array.isArray(m.Data)) {
        for (const e of m.Data) {
          const c = this.ids[e.id]; if (!c) continue;
          this.n++;
          if (c.etat) { this.v[c.k] = { val: e.valid ? 1 : 0, t: now }; continue; }
          if (!e.valid || typeof e.val !== 'number' || !isFinite(e.val)) { delete this.v[c.k]; continue; }
          this.v[c.k] = { val: c.signe ? signe(e.val) : e.val, t: now };
        }
      }
      return [];
    }
    // valeurs encore fraîches, mêmes clés que le lecteur NMEA ; cap vrai = cap magnétique + variation
    now(maxAge, at) {
      at = at == null ? Date.now() : at; const o = {};
      for (const k in this.v) if (at - this.v[k].t <= (maxAge || 2000)) o[k] = this.v[k].val;
      if (o.headingMag != null && o.variation != null) o.heading = (o.headingMag + o.variation + 360) % 360;
      delete o.variation;
      if (o.pilot_wind != null && !o.pilot) delete o.pilot_wind;
      return o;
    }
    fin() { return { UnsubscribeData: Object.keys(this.ids).map(id => ({ id: Number(id) })) }; }
  }

  const api = { Vulcan, CANAUX, PERMIS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Gofree = api;
})(typeof self !== 'undefined' ? self : this);
