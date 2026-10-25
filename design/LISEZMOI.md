# Maquettes

Sources de l'artifact « O'Tacquet en navigation » (canvas Design de claude.ai, maquette 3 du 25/10/2026) : https://claude.ai/artifact/31W781jHnJFjk4sohCGyV7

- `maquette/Main.dc.html` : écran Réglages (cadran du vent, allures, vitesses, réglages avec curseurs, mode expert).
- `Reglages-nuit`, `Bateau` (plein écran portrait), `Bateau-paysage`, `Journal-trace`, `Journal-historique`, `Journal-proches`.
- `canvas.json` : disposition. Les images de fond (`nav_land.jpg`, `nav_port.jpg`) sont des rendus du simulateur.

Format .dc.html propre à l'éditeur Design de claude.ai : à lire comme référence visuelle et de données (valeurs du moteur V9.8 par 15 nds, eau plate), pas à servir tel quel.

## Icône
`icone/icone.svg` (source) et `icone/icone-1024.png` (copiée dans `ios/App/App/Assets.xcassets/AppIcon.appiconset/`) : polaire d’O’Tacquet calculée par le moteur du simulateur (14 nds en orange, 8 nds en bleu-vert), lissée, voilier vu de dessus à l’origine, grille du diagramme polaire.
