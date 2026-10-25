# O'Tacquet en mer

Appli web de navigation et journal de bord pour O'Tacquet (Bavaria 31 Cruiser), pensée pour l'iPhone, tenu à la main.

- **En mer** : enregistrement de la trace GPS, carte littorale SHOM/IGN (OpenStreetMap hors de sa couverture), distance en milles, durée, vitesse, moyenne, pointe sur 30 s, route fond.
- **Journal** : sorties enregistrées sur le téléphone, cumul de la saison, détail de chaque sortie, export GPX.

Les traces restent sur le téléphone (IndexedDB) : ce dépôt ne contient que le code.

Installation sur iPhone : ouvrir le site dans Safari, puis Partager › Sur l'écran d'accueil. Pendant l'enregistrement, garder l'écran allumé : Safari coupe le GPS quand l'écran se verrouille.

Tests : `node tests/trace.test.js`.

À venir : réglages et plein écran du bateau (moteur du simulateur), données du B&G, partage avec les proches.

## Appli iPhone (Capacitor)

Sur le Mac, une fois :
1. `git clone https://github.com/T0staki/otacquet-navigation && cd otacquet-navigation`
2. `npm install`
3. `npx cap sync ios && npx cap open ios`
4. Dans Xcode : cible **App** › **Signing & Capabilities** › **Team** : ton identifiant Apple (équipe personnelle).
5. iPhone branché, mode développeur activé (Réglages › Confidentialité et sécurité › Mode développeur), choisis l'iPhone en haut de Xcode, puis ▶︎.
6. Au premier lancement, sur l'iPhone : Réglages › Général › VPN et gestion de l'appareil › faire confiance au développeur.

Avec un identifiant Apple gratuit, l'appli reste installée 7 jours : relancer ▶︎ depuis Xcode pour la renouveler.
