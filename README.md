# O'Tacquet en mer

Appli web de navigation et journal de bord pour O'Tacquet (Bavaria 31 Cruiser), pensée pour l'iPhone, tenu à la main.

- **En mer** : enregistrement de la trace GPS, carte OpenStreetMap avec le balisage OpenSeaMap, distance en milles, durée, vitesse, moyenne, pointe sur 30 s, route fond.
- **Journal** : sorties enregistrées sur le téléphone, cumul de la saison, détail de chaque sortie, export GPX.

Les traces restent sur le téléphone (IndexedDB) : ce dépôt ne contient que le code.

Installation sur iPhone : ouvrir le site dans Safari, puis Partager › Sur l'écran d'accueil. Pendant l'enregistrement, garder l'écran allumé : Safari coupe le GPS quand l'écran se verrouille.

Tests : `node tests/trace.test.js`.

À venir : réglages et plein écran du bateau (moteur du simulateur), données du B&G, partage avec les proches.
