# Prépare la vue 3D plein écran de l'appli à partir du simulateur (dépôt privé) : www/moteur/bateau.html, ignoré par Git.
# - Three.js chargé depuis l'appli (www/moteur/three/), pas depuis internet : la vue marche au large, sans réseau ;
# - interface du simulateur masquée, seule la vue 3D reste ;
# - la page parente envoie le vent (TWS, TWD), l'angle à tenir au pilote en mode vent (TWA signée, + = tribord)
#   et le ris ou le génois choisis à la main ; les réglages automatiques du simulateur font le reste.
# Usage : python3 outillage/bateau.py <simulateur.html> <sortie.html>
import sys
src, out = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (a[:70], s.count(a)); s = s.replace(a, b)
rep("https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js", "./three/three.module.js")
rep("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js", "./three/three.min.js")
rep("</head>", "<style>/* appli O'Tacquet : vue seule */ .hud,.keyhelp,#mathp,#mathlbl,.toast,#b-show,.intro{display:none!important}</style>\n</head>")
hook = r"""
/* Appli O'Tacquet : la page parente pilote la vue (vent mesuré ou prévu, angle au vent, ris et génois choisis) */
window.addEventListener('message',e=>{const d=e.data;if(!d||d.ot!=='bateau')return;
  if(d.tws!=null)$('i-tws').value=Math.max(3,Math.min(60,Math.round(d.tws)));
  if(d.twd!=null)$('i-twd').value=((Math.round(d.twd/5)*5)%360+360)%360;
  readConds();
  if(d.twa!=null&&Math.abs(d.twa)>=30&&!window.__otCap){B.h=((S.twd-d.twa)*D2R);window.__otCap=1;}   // premier message : bateau posé au cap TWD − TWA, sur la bonne amure
  if(d.twa!=null&&Math.abs(d.twa)>=30){if(!AP.on)apEngage(true);if(AP.mode!=='vent')setApMode('vent');AP.twa=clamp(Math.round(Math.abs(d.twa)),30,175);AP.side=d.twa>=0?1:-1;}
  if(!AT.on)atEngage(true);
  if(d.reef!=null)setReef(d.reef,true);else if(FINE.man.reef)setFineMan('reef',false);
  if(d.furl!=null){FINE.furl=d.furl;setFineMan('furl',true);}else if(FINE.man.furl)setFineMan('furl',false);
});
try{parent.postMessage({ot:'bateau-pret'},'*');}catch(e){}
"""
k = 'requestAnimationFrame(frame);\n};\n</script>'
i = s.rfind(k); assert i > 0
s = s[:i] + hook + s[i:]
open(out, 'w', encoding='utf-8').write(s)
