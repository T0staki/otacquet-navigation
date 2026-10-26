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
/* Appli O'Tacquet : la page parente pilote la vue (vent mesuré ou prévu, angle au vent, et chaque réglage passé en manuel dans l'écran Réglages) */
window.__otSheet={main:null,jib:null};
{const auto0=autoStep;autoStep=function(dt,a){auto0(dt,a);if(window.__otSheet.main!=null)B.main=window.__otSheet.main;if(window.__otSheet.jib!=null)B.jib=window.__otSheet.jib;};}   // écoute réglée à la main dans l'appli : elle reste là où on l'a mise
window.addEventListener('message',e=>{const d=e.data;if(!d||d.ot!=='bateau')return;
  const tws0=$('i-tws').value,twd0=$('i-twd').value,gust0=$('i-gust').value;
  if(d.gust!=null)$('i-gust').value=Math.max(0,Math.min(40,Math.round(d.gust/5)*5));   // rafales annoncées (± %), sans B&G
  if(d.tws!=null)$('i-tws').value=Math.max(3,Math.min(60,Math.round(d.tws)));
  if(d.twd!=null)$('i-twd').value=((Math.round(d.twd/5)*5)%360+360)%360;
  if(!window.__otCond||$('i-tws').value!==tws0||$('i-twd').value!==twd0||$('i-gust').value!==gust0){readConds();window.__otCond=1;}   // la mer ne se recalcule que si le vent change (un curseur qu'on glisse envoie beaucoup de messages)
  if(d.twa!=null&&Math.abs(d.twa)>=30&&!window.__otCap){B.h=((S.twd-d.twa)*D2R);window.__otCap=1;}   // premier message : bateau posé au cap TWD − TWA, sur la bonne amure
  if(d.twa!=null&&Math.abs(d.twa)>=30){if(!AP.on)apEngage(true);if(AP.mode!=='vent')setApMode('vent');AP.twa=clamp(Math.round(Math.abs(d.twa)),30,175);AP.side=d.twa>=0?1:-1;}
  if(!AT.on)atEngage(true);
  if(d.reef!=null)setReef(d.reef,true);else if(FINE.man.reef)setFineMan('reef',false);
  if(d.furl!=null){FINE.furl=d.furl;setFineMan('furl',true);}else if(FINE.man.furl)setFineMan('furl',false);
  for(const k of ['bs','car','trav','vang']){if(d[k]!=null){FINE[k]=d[k];setFineMan(k,true);}else if(FINE.man[k])setFineMan(k,false);}   // pataras, chariots de génois, chariot de GV, hale-bas
  window.__otSheet.main=d.main!=null?Math.max(0,Math.min(100,d.main)):null;window.__otSheet.jib=d.jib!=null?Math.max(0,Math.min(100,d.jib)):null;   // écoutes : même échelle que l'appli (0 bordée, 100 choquée)
});
try{parent.postMessage({ot:'bateau-pret'},'*');}catch(e){}
/* Caméra : glisser tourne autour du bateau, pincer rapproche (gestes du simulateur, vue poursuite) ; un appui court sans bouger affiche ou masque les informations de l'appli */
{let t0=0,x0=0,y0=0,n=0;canvas.addEventListener('pointerdown',e=>{n++;if(n===1){t0=performance.now();x0=e.clientX;y0=e.clientY;}});
 const fin=e=>{if(n===1&&performance.now()-t0<300&&Math.hypot(e.clientX-x0,e.clientY-y0)<10){try{parent.postMessage({ot:'appui'},'*');}catch(_){}}n=Math.max(0,n-1);};
 canvas.addEventListener('pointerup',fin);canvas.addEventListener('pointercancel',()=>{n=Math.max(0,n-1);t0=0;});}
/* Diagnostic du rendu (#diag=1, version de mesure de l'appli) : chronomètre chaque étape d'une image et enchaîne des essais de 8 s
   (ombres, transparence de l'eau, interface masquée, résolution). Ne change ni les calculs ni le dessin en dehors des essais. */
if(HASH.diag==='1'){(()=>{
  const T={},add=(k,t)=>{T[k]=(T[k]||0)+t;};
  const wrap=(nom,get,set)=>{const f=get();set(function(...a){const t=performance.now();try{return f.apply(this,a);}finally{add(nom,performance.now()-t);}});};
  let sansUI=false;const muet=(get,set)=>{const f=get();set(function(...a){if(!sansUI)return f.apply(this,a);});};
  muet(()=>ui,f=>ui=f);muet(()=>drawCompass,f=>drawCompass=f);muet(()=>MATH.render,f=>MATH.render=f);
  wrap('image',()=>frame,f=>frame=f);wrap('physique',()=>step,f=>step=f);wrap('réglages',()=>updateFine,f=>updateFine=f);
  wrap('voiles',()=>updateSail,f=>updateSail=f);wrap('bouts',()=>updateRopes,f=>updateRopes=f);wrap('gréement',()=>updateRigging,f=>updateRigging=f);
  wrap('étai et mât',()=>updateStay,f=>updateStay=f);wrap('écume',()=>stepFoam,f=>stepFoam=f);wrap('eau sur le pont',()=>DW.render,f=>DW.render=f);
  wrap('interface',()=>ui,f=>ui=f);wrap('compas',()=>drawCompass,f=>drawCompass=f);wrap('équations',()=>MATH.render,f=>MATH.render=f);
  wrap('reflet',()=>renderReflection,f=>renderReflection=f);wrap('sous l’eau',()=>uwPass,f=>uwPass=f);wrap('embruns',()=>sprayUpdate,f=>sprayUpdate=f);
  const rr=renderer.render.bind(renderer);renderer.render=function(sc,c){const t=performance.now();rr(sc,c);add(renderer.getRenderTarget()?'rendus en texture':'rendu principal (ombres comprises)',performance.now()-t);};
  // diagnostic n° 2 : la physique découpée en ses parties
  for(const k of ['aero','hydro','setup','rawOf','skAt','helmFor','heelFor'])wrap('physique · '+k,()=>PHY[k],f=>PHY[k]=f);
  wrap('physique · vagues (waterH)',()=>waterH,f=>waterH=f);wrap('physique · placement',()=>placeBoat,f=>placeBoat=f);
  wrap('physique · réglages auto',()=>autoStep,f=>autoStep=f);wrap('physique · rafales',()=>gustNoise,f=>gustNoise=f);wrap('physique · eau sur le pont',()=>DW.update,f=>DW.update=f);
  const box=document.createElement('pre');box.style.cssText='position:fixed;left:6px;right:6px;top:100px;margin:0;padding:5px 7px;background:rgba(0,0,0,.65);color:#fff;font:9px/1.25 ui-monospace,Menlo,monospace;z-index:99;white-space:pre-wrap;pointer-events:none';document.body.appendChild(box);
  const ratio0=renderer.getPixelRatio(),pr=r=>{renderer.setPixelRatio(r);window.dispatchEvent(new Event('resize'));};
  const raz=()=>{renderer.shadowMap.autoUpdate=true;UW.ok=true;sansUI=false;ocean.visible=true;boat.visible=true;if(renderer.getPixelRatio()!==ratio0)pr(ratio0);};
  // la référence revient entre chaque essai : l'échauffement du téléphone se lit sur elle, l'effet d'un essai se compare à la référence qui l'entoure
  const R=['référence',()=>{}],E=[['sans ombres',()=>{renderer.shadowMap.autoUpdate=false;}],['sans transparence de l’eau',()=>{UW.ok=false;U.uUWOn.value=0;}],
    ['sans interface masquée',()=>{sansUI=true;}],['mer masquée',()=>{ocean.visible=false;}],['bateau masqué',()=>{boat.visible=false;}],['résolution ×2',()=>{pr(2);}]];
  const ESSAIS=[R];for(const e of E)ESSAIS.push(e,R);
  const res=[];let i=-1;
  const mesurer=(nom,suite)=>{for(const k in T)delete T[k];renderer.info.autoReset=false;renderer.info.reset();let n=0,t0=performance.now();
    const tick=()=>{n++;if(performance.now()-t0<5000)requestAnimationFrame(tick);else{const ms=(performance.now()-t0)/n,o={essai:nom,ips:+(1000/ms).toFixed(1),ms_image:+ms.toFixed(1),appels:Math.round(renderer.info.render.calls/n),pixels:renderer.getPixelRatio()+' × '+innerWidth+'×'+innerHeight,etapes_ms:{}};
      for(const k of Object.keys(T).sort((a,b)=>T[b]-T[a]))o.etapes_ms[k]=+(T[k]/n).toFixed(2);renderer.info.autoReset=true;suite(o);}};requestAnimationFrame(tick);};
  const ligne=o=>o.essai+' : '+o.ips+' i/s, '+o.ms_image+' ms, '+o.appels+' appels';
  const suivant=()=>{raz();i++;if(i>=ESSAIS.length){
      const phys=res.filter(o=>o.essai==='référence').map(o=>Object.entries(o.etapes_ms).filter(([k])=>k.startsWith('physique')).slice(0,5).map(([k,v])=>k.replace('physique · ','')+' '+v).join(' · '));
      box.textContent='Diagnostic n° 2 terminé (fais une capture)\n'+res.map(ligne).join('\n')+'\nPhysique (ms), 1re et dernière référence :\n '+phys[0]+'\n '+phys[phys.length-1];
      try{parent.postMessage({ot:'diag',fin:true,res},'*');}catch(e){}return;}
    const [nom,f]=ESSAIS[i];f();box.textContent='Diagnostic n° 2 · '+(i+1)+'/'+ESSAIS.length+' : '+nom+'…\n'+res.map(ligne).join('\n');
    setTimeout(()=>mesurer(nom,o=>{res.push(o);try{parent.postMessage({ot:'diag',o},'*');}catch(e){}suivant();}),1500);};
  setTimeout(suivant,8000);   // laisser le bateau prendre son allure et la mer se former
})();}
"""
k = 'requestAnimationFrame(frame);\n};\n</script>'
i = s.rfind(k); assert i > 0
s = s[:i] + hook + s[i:]
open(out, 'w', encoding='utf-8').write(s)
