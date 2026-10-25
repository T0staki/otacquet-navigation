# O'Tacquet en mer — consignes pour Claude

Appli de navigation et journal de bord d'O'Tacquet (Bavaria 31 Cruiser de Jérémie, Saint-Cast). Web (GitHub Pages) et iPhone (Capacitor 8.5.2).

## Langue et manière
- Tout en français : interface, commentaires, commits, documents. Tutoiement avec Jérémie ; Claude parle au féminin ; niveau de confiance en % en tête de réponse.
- Dépôt public : jamais de position réelle du bateau, de numéro de série, d'adresse MAC ni de donnée personnelle dans le code, les tests ou les commits. Les traces restent sur le téléphone.

## Structure
- `www/` : l'appli (une page `index.html`, `trace.js` moteur de trace, `nmea.js` lecteur NMEA 0183, `vendor/leaflet`). Publiée telle quelle sur https://t0staki.github.io/otacquet-navigation/ par `.github/workflows/pages.yml` après les tests.
- `ios/` : projet Xcode généré par Capacitor. Le module natif « Bord » est à la fin de `ios/App/App/AppDelegate.swift` (TCP vers le B&G, GPS écran verrouillé, partage de fichier) ; le contrôleur `OTViewController` l'enregistre (Main.storyboard pointe dessus). Autorisations dans `Info.plist` (localisation, réseau local, mode d'arrière-plan « location »).
- `tests/` : `node tests/trace.test.js && node tests/nmea.test.js` (ou `npm test`). `tests/trames.txt` : phrases réelles du Vulcan, positions remplacées par 48° N 3° O.

## Commandes
- Tests : `npm test`.
- iPhone : `npm install`, puis `npx cap sync ios` après chaque modification de `www/`, puis `npx cap open ios` (ou `xcodebuild`). Signature : équipe personnelle de Jérémie (identifiant Apple gratuit, profil valable 7 jours).

## Le bord
- B&G Vulcan 7R, logiciel 22.3. NMEA 0183 via le Wi-Fi : point d'accès du Vulcan 192.168.76.1, TCP 10110 (vérifié avec NMEAconnect le 25/10/2026). Phrases : RMC GGA GLL VTG HDG VHW VLW DPT DBT MTW MWD MWV(T) XDR(heel, trim, airtemp, baro) ZDA, AIS. Pas de RSA (angle de barre) ni de MWV « R » vus.
- À quai : eau 37,1 °C, assiette +6,3° et gîte −3,1° suspectes (étalonnages à faire sur le Vulcan) ; loch 3,6 % sous le GPS en cumul.
- Connecté au point d'accès du Vulcan, l'iPhone perd internet : piste = le Vulcan rejoint le partage de connexion de l'iPhone (adresse 172.20.10.x), à essayer.

## Où en est le projet (25/10/2026)
- V0.1 web : trace GPS, carte OSM + OpenSeaMap, journal, cumul de saison, GPX.
- V0.2 : appli iPhone (Capacitor) avec lecture du B&G, instruments, échantillon toutes les 5 s pendant l'enregistrement, export CSV. Swift non compilé à la création (pas de Mac) : première compilation à faire dans Xcode.
- Suite, dans l'ordre validé par Jérémie : écran Réglages (maquette 3 « O'Tacquet en navigation », artifact Design) branché sur le B&G et sur le moteur du simulateur (dépôt `T0staki/simulateur-voile_v0`, objet `PHY`) ; plein écran 3D ; journal enrichi ; partage avec les proches (Supabase envisagé ; Anne-Laure sur Android suit en web).
- Documents de conception : `docs/notes/version-navigation.md` du dépôt du simulateur.
