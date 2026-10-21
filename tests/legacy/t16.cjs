const fs=require('fs');global.THREE=require('three');global.window={};global.num=n=>Math.round(n).toLocaleString('en-IN');
(0,eval)(fs.readFileSync(__dirname+'/app.js','utf8'));const C=window.__core;
const S={area:1100,beds:2,att:1,pooja:true,store:true,corr:4,cy:'M',shape:'double',cover:'tile',pitch:22,over:2,sys:'ms',finish:1,region:1,soil:'medium',sbc:150,exits:{s:false,e:false,w:false},backOff:-3,jag:{on:false,h:2.5,d:7,ledges:true,sides:{n:true,s:false,e:false,w:false},split:{on:false,scope:'front',h:1.5,steps:4}}};
const base=C.planFor(S);
const runs=C.wallRuns(base);
console.log('plan',base.W+'x'+base.D,'units',base.units.length,'wall runs',runs.length,'outer runs',runs.filter(r=>r.cls==='out').length);
// pick an inner wall run between two rooms (class in) with no door
const inner=runs.filter(r=>r.cls==='in'&&!r.hasDoor&&r.len>=4).sort((a,b)=>b.len-a.len)[0];
console.log('removing run',inner.id,'len',inner.len);
const ed={key:base.key,rm:[{o:inner.o,p:inner.p,i0:inner.i0,i1:inner.i1}],doors:[],del:[]};
const S2=Object.assign({},S,{edits:ed});
const pl2=C.planFor(S2);
console.log('edited?',!!pl2.edited,'gone units',pl2.units.filter(u=>u.k==='gone').length,'runs after',C.wallRuns(pl2).length);
const c1=C.costFor(base,S,'ms',1,1),c2=C.costFor(pl2,S2,'ms',1,1);
console.log('cost',Math.round(c1.total),'->',Math.round(c2.total),'(lower?',c2.total<c1.total,')');
const st1=C.structure(base,S,'ms',150),st2=C.structure(pl2,S2,'ms',150);
console.log('wall length ft',Math.round(st1.wallLenFt),'->',Math.round(st2.wallLenFt),'| columns',st1.cols.length,'->',st2.cols.length);
// doors: snap near a wall
const r2=runs.filter(r=>r.cls==='in'&&r.len>=6)[0];
const px=r2.o==='H'?(r2.a0+r2.a1)/2:r2.pos+0.3,py=r2.o==='H'?r2.pos+0.4:(r2.a0+r2.a1)/2;
const sn=C.snapDoor(base,px,py,3,'door');console.log('snap',JSON.stringify(sn));
const ed3={key:base.key,rm:[],doors:[{o:sn.o,pos:sn.pos,a0:sn.a0,a1:sn.a1,k:'door'}],del:[]};
const pl3=C.planFor(Object.assign({},S,{edits:ed3}));
console.log('door added: doors',base.doors.length,'->',pl3.doors.length,'nDoor',base.nDoor,'->',pl3.nDoor,'units door',pl3.units.filter(u=>u.k==='door').length-base.units.filter(u=>u.k==='door').length);
// delete original internal door
const od=base.doors.find(d=>d.k==='door'&&!d.exit);const ed4={key:base.key,rm:[],doors:[],del:[C.doorKey(od)]};
const pl4=C.planFor(Object.assign({},S,{edits:ed4}));console.log('door deleted: doors',base.doors.length,'->',pl4.doors.length);
// main door cannot be deleted
const md=base.doors.find(d=>d.k==='main');const pl5=C.planFor(Object.assign({},S,{edits:{key:base.key,rm:[],doors:[],del:[C.doorKey(md)]}}));console.log('main door kept:',pl5.doors.some(d=>d.k==='main'));
// removing an outer wall run
const out=runs.find(r=>r.cls==='out'&&!r.hasDoor&&r.len>4);const pl6=C.planFor(Object.assign({},S,{edits:{key:base.key,rm:[{o:out.o,p:out.p,i0:out.i0,i1:out.i1}],doors:[],del:[]}}));
const g6=C.geoBuild(Object.assign({},S,{edits:{key:base.key,rm:[{o:out.o,p:out.p,i0:out.i0,i1:out.i1}],doors:[],del:[]}}),'ms');console.log('outer wall removed ok, geo',Object.keys(g6.banks).length,'gone',pl6.units.filter(u=>u.k==='gone').length);
// stale key ignored
const pl7=C.planFor(Object.assign({},S,{edits:{key:'other',rm:[{o:inner.o,p:inner.p,i0:inner.i0,i1:inner.i1}],doors:[],del:[]}}));console.log('stale edits ignored:',!pl7.edited);
// sheets with edits
const shs=C.buildSheets(S2,'ms',150,'Edited');let bad=0;shs.forEach(x=>{if(/NaN|undefined|Infinity/.test(x.svg))bad++;});console.log('sheets',shs.length,'bad',bad);
// picking
const picks=C.buildPickMeshes(pl2,S2);console.log('pick meshes',picks.length,'(walls',picks.filter(m=>m.userData.wall).length,'doors',picks.filter(m=>m.userData.door).length+')');
picks.forEach(m=>m.updateMatrixWorld());
const target=picks.find(m=>m.userData.wall&&m.userData.o==='H'&&m.userData.sx>5);
const cam=new THREE.PerspectiveCamera(40,1,0.5,500);cam.position.set(target.position.x,target.position.y+10,target.position.z+40);cam.lookAt(target.position);cam.updateMatrixWorld();
const rc=new THREE.Raycaster();rc.setFromCamera({x:0,y:0},cam);const hits=rc.intersectObjects(picks,false);
console.log('ray hit',hits.length?JSON.stringify({wall:hits[0].object.userData.wall||null,door:hits[0].object.userData.door||null}):'none','target',target.userData.wall);
// all-combination stress with random edits
let n=0,bad2=0;for(const sys of ['brick','rcc','ms'])for(const shape of ['inward','double','flat'])for(const jag of [false,true]){
  const SS=Object.assign({},S,{sys,shape,jag:Object.assign({},S.jag,{on:jag,sides:{n:true,s:true,e:true,w:true},split:{on:jag,scope:'all',h:1,steps:2}}),exits:{s:true,e:true,w:true}});
  const b=C.planFor(SS);const rr=C.wallRuns(b);const rm=rr.filter((r,i)=>i%5===0).map(r=>({o:r.o,p:r.p,i0:r.i0,i1:r.i1}));
  const SE=Object.assign({},SS,{edits:{key:b.key,rm:rm,doors:[],del:[]}});
  try{const pe=C.planFor(SE);C.geoBuild(SE,sys);C.costFor(pe,SE,sys,1,1);C.buildSheets(SE,sys,150,'x');C.diyPlan(pe,SE,sys,'medium',150);n++;}catch(e){bad2++;console.log('ERR',e.message,e.stack.split('\n')[1]);}
}
console.log('stress',n,'bad',bad2);
