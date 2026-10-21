/* Tête 3D interactive pour localiser la douleur (three.js r128, chargé avant ce fichier).
   Convention : la tête regarde vers +z. Le côté gauche de la personne est en +x. */
(function(){
'use strict';

const ZONES=[
  {id:'front-g',l:'Front gauche'},{id:'front-d',l:'Front droit'},
  {id:'oeil-g',l:"Derrière l'œil gauche"},{id:'oeil-d',l:"Derrière l'œil droit"},
  {id:'tempe-g',l:'Tempe gauche'},{id:'tempe-d',l:'Tempe droite'},
  {id:'sommet',l:'Sommet du crâne'},
  {id:'arriere-g',l:'Arrière du crâne gauche'},{id:'arriere-d',l:'Arrière du crâne droit'},
  {id:'nuque-g',l:'Nuque gauche'},{id:'nuque-d',l:'Nuque droite'},
  {id:'machoire-g',l:'Mâchoire gauche'},{id:'machoire-d',l:'Mâchoire droite'},
  {id:'visage',l:'Visage, sinus'}
];
const ALL='Toute la tête';
const BY_ID={}, BY_LABEL={};
ZONES.forEach((z,i)=>{z.i=i;BY_ID[z.id]=z;BY_LABEL[z.l]=z;});

function idsFromLabels(labels){
  if(!labels) return [];
  if(labels.includes(ALL)) return ZONES.map(z=>z.id);
  return labels.map(l=>BY_LABEL[l]&&BY_LABEL[l].id).filter(Boolean);
}

/* Zone d'un point, à partir de sa direction sur la sphère d'origine (avant déformation). */
function classify(n){
  const s=n.x>=0?'g':'d', ax=Math.abs(n.x);
  if(n.y>0.8) return 'sommet';
  if(n.z>0.5&&n.y>-0.2&&n.y<0.2&&ax>0.12&&ax<0.62) return 'oeil-'+s;
  if(n.z>0.4&&n.y>=0.2) return 'front-'+s;
  if(ax>0.6&&n.y>-0.25&&n.z>-0.3) return 'tempe-'+s;
  if(n.z<=-0.3&&n.y>-0.6) return 'arriere-'+s;
  if(n.y<-0.25&&n.z>-0.3&&ax>0.33) return 'machoire-'+s;
  if(n.z>0.2) return n.y>=0.2?'front-'+s:'visage';
  if(n.z<0) return n.y>0.35?'sommet':'arriere-'+s;
  if(n.y>0.35) return 'sommet';
  return n.y<-0.25?'machoire-'+s:'tempe-'+s;
}

/* Déforme une sphère en forme de tête : crâne plus étroit, visage plus plat, mâchoire et menton. */
function shape(n){
  let x=n.x*0.8, y=n.y, z=n.z*0.92;
  if(n.y<0){
    const t=-n.y;
    x*=1-0.34*t*t;
    if(n.z>0) y*=1+0.18*n.z*t;
    else z*=1-0.28*t;
  }
  if(n.z<0){ const t=Math.min(1,Math.max(0,(n.y+0.5)/0.5)); z*=1+0.06*t*t*(3-2*t); }
  if(n.z>0.6) z=0.6*0.92+(n.z-0.6)*0.92*0.55;
  return [x,y,z];
}

function css(name,fallback){
  const v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v||fallback;
}

function makeLabelSprite(text){
  const c=document.createElement('canvas'); c.width=c.height=128;
  const g=c.getContext('2d');
  g.fillStyle=css('--accent','#6a4f8f'); g.beginPath(); g.arc(64,64,54,0,Math.PI*2); g.fill();
  g.fillStyle=css('--accent-fg','#ffffff'); g.font='bold 64px -apple-system, system-ui, sans-serif';
  g.textAlign='center'; g.textBaseline='middle'; g.fillText(text,64,68);
  const tex=new THREE.CanvasTexture(c);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:true,transparent:true}));
  sp.scale.set(0.2,0.2,0.2);
  return sp;
}

const VIEWS={
  face:{yaw:0,pitch:0.08}, gauche:{yaw:-Math.PI/2,pitch:0.08}, droite:{yaw:Math.PI/2,pitch:0.08},
  dos:{yaw:Math.PI,pitch:0.08}, dessus:{yaw:0,pitch:1.15}
};

function bestView(ids){
  if(!ids.length) return {yaw:-0.55,pitch:0.12};
  let g=0,d=0,back=0,top=0;
  ids.forEach(id=>{ if(id.endsWith('-g'))g++; if(id.endsWith('-d'))d++; if(/arriere|nuque/.test(id))back++; if(id==='sommet')top++; });
  if(top===ids.length) return VIEWS.dessus;
  const side=g>d?-1:d>g?1:0;
  if(back>ids.length/2) return {yaw:Math.PI+side*-0.6,pitch:0.1};
  return {yaw:side*0.7||-0.0001,pitch:0.1};
}

function HeadView(host,opts){
  this.host=host; this.opts=opts||{}; this.mode=this.opts.mode||'edit';
  this.sel=new Set(); this.heat=null; this.ok=false;
  this.yaw=-0.55; this.pitch=0.12; this.ty=this.yaw; this.tp=this.pitch;
  if(!window.THREE){ this.fail(); return; }
  try{
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  }catch(e){ this.fail(); return; }
  this.ok=true;
  const r=this.renderer;
  r.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  r.setClearColor(0x000000,0);
  host.appendChild(r.domElement);

  this.scene=new THREE.Scene();
  this.camera=new THREE.PerspectiveCamera(32,1,0.1,20);
  this.camera.position.set(0,-0.05,4.4);
  this.camera.lookAt(0,-0.18,0);
  this.scene.add(new THREE.HemisphereLight(0xffffff,0x6a6080,0.75));
  const key=new THREE.DirectionalLight(0xffffff,0.55); key.position.set(1.5,2,3); this.scene.add(key);
  const rim=new THREE.DirectionalLight(0xffffff,0.25); rim.position.set(-2,0.5,-2); this.scene.add(rim);

  const group=this.group=new THREE.Group(); this.scene.add(group);
  const mat=this.mat=new THREE.MeshLambertMaterial({vertexColors:true});

  // crâne + visage
  const hg=new THREE.SphereGeometry(1,96,72);
  const p=hg.attributes.position, zones=[];
  const v=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i).normalize();
    zones.push(classify(v));
    const s=shape(v); p.setXYZ(i,s[0],s[1],s[2]);
  }
  hg.computeVertexNormals();
  hg.setAttribute('color',new THREE.BufferAttribute(new Float32Array(p.count*3),3));
  const head=new THREE.Mesh(hg,mat); head.userData.zones=zones; group.add(head);

  // cou
  const ng=new THREE.CylinderGeometry(0.33,0.4,0.75,48,6,true);
  const np=ng.attributes.position, nz=[];
  for(let i=0;i<np.count;i++){
    const x=np.getX(i), z=np.getZ(i), y=np.getY(i);
    nz.push(z<0.05&&y>-0.36?(x>=0?'nuque-g':'nuque-d'):null);
  }
  ng.setAttribute('color',new THREE.BufferAttribute(new Float32Array(np.count*3),3));
  const neck=new THREE.Mesh(ng,mat); neck.position.set(0,-0.98,-0.12); neck.userData.zones=nz; group.add(neck);
  this.meshes=[head,neck];

  // repères du visage (non cliquables)
  const featMat=this.featMat=new THREE.MeshLambertMaterial({color:new THREE.Color(css('--head-feat','#4a4458'))});
  const skinMat=this.skinMat=new THREE.MeshLambertMaterial({color:new THREE.Color(css('--head2','#cbc4da'))});
  const earMat=this.earMat=new THREE.MeshLambertMaterial({color:new THREE.Color(css('--head','#d8d2e4'))});
  const eyeG=new THREE.SphereGeometry(0.065,20,14);
  [-1,1].forEach(sx=>{
    const e=new THREE.Mesh(eyeG,featMat); e.position.set(sx*0.25,0.02,0.7); e.scale.set(1.2,0.75,0.6); group.add(e);
    const ear=new THREE.Mesh(new THREE.SphereGeometry(1,20,16),earMat); ear.position.set(sx*0.79,-0.06,-0.04); ear.scale.set(0.06,0.17,0.11); group.add(ear);
  });
  const nose=new THREE.Mesh(new THREE.SphereGeometry(1,20,16),skinMat); nose.position.set(0,-0.11,0.79); nose.scale.set(0.085,0.17,0.15); group.add(nose);
  const mouth=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.018,0.04),featMat); mouth.position.set(0,-0.42,0.715); group.add(mouth);
  this.extras=[eyeG,nose.geometry,mouth.geometry];

  // repères G / D (gauche et droite de la personne)
  const sg=makeLabelSprite('G'), sd=makeLabelSprite('D');
  sg.position.set(1.0,0.3,0); sd.position.set(-1.0,0.3,0); group.add(sg); group.add(sd);
  this.sprites=[sg,sd];

  this.ray=new THREE.Raycaster(); this.ndc=new THREE.Vector2();
  this.bind(); this.recolor(); this.resize();
  if(window.ResizeObserver){ this.ro=new ResizeObserver(()=>this.resize()); this.ro.observe(host); }
}

HeadView.prototype.fail=function(){
  this.host.classList.add('head-off');
  this.host.innerHTML='<p>La vue 3D ne peut pas s’afficher sur cet appareil. Utilise la liste ci-dessous.</p>';
};

HeadView.prototype.resize=function(){
  if(!this.ok) return;
  const w=this.host.clientWidth, h=this.host.clientHeight;
  if(!w||!h) return;
  if(w===this._w&&h===this._h){ this.draw(); return; }
  this._w=w; this._h=h;
  this.renderer.setSize(w,h,false);
  this.renderer.domElement.style.width='100%'; this.renderer.domElement.style.height='100%';
  this.camera.aspect=w/h;
  // garde toute la tête visible sur un écran étroit
  this.camera.fov=w/h<0.85?38:32;
  this.camera.updateProjectionMatrix();
  this.draw();
};

HeadView.prototype.recolor=function(){
  if(!this.ok) return;
  const base=[new THREE.Color(css('--head','#d8d2e4')),new THREE.Color(css('--head2','#cbc4da'))];
  const hot=new THREE.Color(css('--hot','#d2553f'));
  const neutral=new THREE.Color(css('--head','#d8d2e4'));
  let max=0; if(this.heat) Object.values(this.heat).forEach(n=>{if(n>max)max=n;});
  const tmp=new THREE.Color();
  this.meshes.forEach(m=>{
    const col=m.geometry.attributes.color, zs=m.userData.zones;
    for(let i=0;i<col.count;i++){
      const id=zs[i];
      if(!id){ col.setXYZ(i,neutral.r,neutral.g,neutral.b); continue; }
      const b=base[0];
      if(this.heat){
        const n=this.heat[id]||0;
        if(n){ tmp.copy(b).lerp(hot,0.3+0.7*n/max); col.setXYZ(i,tmp.r,tmp.g,tmp.b); }
        else col.setXYZ(i,b.r,b.g,b.b);
      } else if(this.sel.has(id)) col.setXYZ(i,hot.r,hot.g,hot.b);
      else col.setXYZ(i,b.r,b.g,b.b);
    }
    col.needsUpdate=true;
  });
  this.skinMat.color.set(css('--head','#d8d2e4')); this.earMat.color.set(css('--head','#d8d2e4'));
  this.featMat.color.set(css('--head-feat','#4a4458'));
  this.draw();
};

HeadView.prototype.setSelection=function(ids,orient){
  this.sel=new Set(ids); this.heat=null;
  if(orient){ const v=bestView(ids); this.yaw=this.ty=v.yaw; this.pitch=this.tp=v.pitch; }
  this.recolor();
};
HeadView.prototype.setHeat=function(counts){
  this.heat=counts||{}; this.sel=new Set();
  const ids=Object.keys(this.heat).sort((a,b)=>this.heat[b]-this.heat[a]);
  const v=bestView(ids.slice(0,1)); this.yaw=this.ty=v.yaw; this.pitch=this.tp=v.pitch;
  this.recolor();
};
HeadView.prototype.view=function(name){
  const v=VIEWS[name]; if(!v||!this.ok) return;
  // chemin le plus court pour tourner
  let d=v.yaw-this.yaw; d=Math.atan2(Math.sin(d),Math.cos(d));
  this.ty=this.yaw+d; this.tp=v.pitch; this.draw();
};

HeadView.prototype.draw=function(){
  if(!this.ok||this._raf) return;
  this._raf=requestAnimationFrame(()=>{
    this._raf=0;
    const dy=this.ty-this.yaw, dp=this.tp-this.pitch;
    const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce||Math.abs(dy)+Math.abs(dp)<0.002){ this.yaw=this.ty; this.pitch=this.tp; }
    else { this.yaw+=dy*0.18; this.pitch+=dp*0.18; }
    this.group.rotation.set(this.pitch,this.yaw,0,'XYZ');
    this.renderer.render(this.scene,this.camera);
    if(this.yaw!==this.ty||this.pitch!==this.tp) this.draw();
  });
};

HeadView.prototype.bind=function(){
  const el=this.renderer.domElement;
  let sx=0,sy=0,lx=0,ly=0,moved=false,down=false;
  el.addEventListener('pointerdown',e=>{
    down=true; moved=false; sx=lx=e.clientX; sy=ly=e.clientY;
    try{el.setPointerCapture(e.pointerId);}catch(_){}
  });
  el.addEventListener('pointermove',e=>{
    if(!down) return;
    if(Math.hypot(e.clientX-sx,e.clientY-sy)>7) moved=true;
    if(moved){
      this.ty+= (e.clientX-lx)*0.011; this.yaw=this.ty;
      this.tp=Math.max(-0.5,Math.min(1.3,this.tp+(e.clientY-ly)*0.008)); this.pitch=this.tp;
      this.draw();
    }
    lx=e.clientX; ly=e.clientY;
  });
  const up=e=>{
    if(!down) return; down=false;
    if(!moved&&this.mode==='edit') this.pick(e);
  };
  el.addEventListener('pointerup',up);
  el.addEventListener('pointercancel',()=>{down=false;});
};

HeadView.prototype.pick=function(e){
  const r=this.renderer.domElement.getBoundingClientRect();
  this.ndc.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
  this.ray.setFromCamera(this.ndc,this.camera);
  const hit=this.ray.intersectObjects(this.meshes,false)[0];
  if(!hit||!hit.face) return;
  const zs=hit.object.userData.zones;
  const id=zs[hit.face.a]||zs[hit.face.b]||zs[hit.face.c];
  if(!id) return;
  if(this.opts.onToggle) this.opts.onToggle(BY_ID[id]);
};

window.Head3D={ZONES,ALL,BY_ID,BY_LABEL,idsFromLabels,HeadView,available:()=>!!window.THREE};
})();
