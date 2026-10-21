const fs=require('fs');global.THREE=require('three');global.window={};global.num=n=>Math.round(n).toLocaleString('en-IN');
(0,eval)(fs.readFileSync(__dirname+'/app.js','utf8'));const C=window.__core;
const S={area:1100,beds:2,att:1,pooja:true,store:true,corr:4,cy:'M',shape:'double',cover:'tile',pitch:22,over:2,sys:'ms',finish:1,region:1,exits:{s:false,e:false,w:false},backOff:-3,jag:{on:false,h:2.5,d:7,ledges:true,sides:{n:true,s:false,e:false,w:false},split:{on:false,scope:'front',h:1.5,steps:4}},svc:{plumb:false,elec:false,tanks:false}};
const base=C.planBase(S);
const vis=pl=>pl.rooms.filter(r=>!r.hidden&&r.t!=='court'&&r.t!=='corr');
console.log('base rooms',vis(base).map(r=>r.n+' '+C.rArea(r)).join(' | '));
// 1. merge master bedroom + att bath by removing the wall between
const runs=C.wallRuns(base);
const master=base.rooms.find(r=>r.key==='master'),att=base.rooms.find(r=>r.key==='att1');
const between=runs.find(r=>{const rr=C.runRooms(base,r);return rr.A.concat(rr.B).includes(master)&&rr.A.concat(rr.B).includes(att);});
console.log('wall between master and att bath:',between&&between.id,'doors on it',between&&between.hasDoor);
const ed1={key:base.key,ops:[{t:'rm',o:between.o,p:between.p,i0:between.i0,i1:between.i1}]};
const S1=Object.assign({},S,{edits:ed1}),p1=C.planFor(S1);
const m1=p1.rooms.find(r=>r.key==='master');
console.log('after removing: master parts',m1.parts.length,'area',Math.round(C.rArea(m1)),'merged',JSON.stringify(m1.merged),'| att hidden:',p1.rooms.find(r=>r.key==='att1').hidden,'into',p1.rooms.find(r=>r.key==='att1').into,'| sched:',p1.sched.filter(r=>/Master/.test(r.n)).map(r=>r.n+' '+r.a).join(''),'| noDoor',JSON.stringify(p1.noDoor));
// 2. add the wall back = split along the boundary -> rooms separate again
const ap=p1.rooms.find(r=>r.key==='att1');const q=ap.parts[0];
const sp={t:'sp',o:between.o,pos:between.pos,x:q.x+q.w/2,y:q.y+q.h/2};
// boundary split is not interior of a part -> should not split; instead re-adding wall = clear gone (UI uses 'add' op)
// 3. split a bedroom with a new wall
const b2=base.rooms.find(r=>r.key==='bed2');
const op2={t:'sp',o:'V',pos:b2.x+b2.w/2,x:b2.x+1,y:b2.y+1,dw:3};
const p2=C.planFor(Object.assign({},S,{edits:{key:base.key,ops:[op2]}}));
console.log('split bed2:',p2.rooms.filter(r=>/^bed2/.test(r.key)).map(r=>r.key+' "'+r.n+'" '+r.w+'x'+r.h+' '+Math.round(C.rArea(r))).join(' | '),'| doors',base.doors.length,'->',p2.doors.length,'| units',base.units.length,'->',p2.units.length,'| noDoor',JSON.stringify(p2.noDoor));
// 4. move a wall: find movable run between two rooms
let mv=null;runs.forEach(r=>{const mi=C.runMove(base,r);if(mi.ok&&!mv&&r.cls==='in'&&(mi.hi>=1||mi.lo<=-1)) mv={r:r,mi:mi};});
console.log('movable run',mv&&mv.r.id,mv&&JSON.stringify({lo:mv.mi.lo,hi:mv.mi.hi,a0:mv.mi.a0,a1:mv.mi.a1}),'rooms',mv&&(C.runRooms(base,mv.r).A.map(r=>r.n)+' | '+C.runRooms(base,mv.r).B.map(r=>r.n)));
const d=mv.mi.hi>=1?1:-1;
const p4=C.planFor(Object.assign({},S,{edits:{key:base.key,ops:[{t:'mv',o:mv.r.o,pos:mv.r.pos,a0:mv.mi.a0,a1:mv.mi.a1,d:d}]}}));
const ch=vis(base).map((r,i)=>{const r2=p4.rooms.find(x=>x.key===r.key);return (r2.w!==r.w||r2.h!==r.h)?r.n+' '+r.w+'x'+r.h+' -> '+r2.w+'x'+r2.h:null;}).filter(Boolean);
console.log('move by',d,'changed rooms:',ch.join(' ; '),'| total area same:',Math.round(vis(base).reduce((a,r)=>a+C.rArea(r),0)),Math.round(vis(p4).reduce((a,r)=>a+C.rArea(r),0)),'| units',base.units.length,p4.units.length);
// 5. non-movable runs report messages
const outer=runs.find(r=>r.cls==='out');console.log('outer wall move:',C.runMove(base,outer).msg);
// 6. checks
const ck=C.designChecks(p1,S1);console.log('checks (merged master):',ck.map(c=>c.lvl+': '+c.msg).join('\n  '));
console.log('base checks:',C.designChecks(base,S).length);
// 7. dxf
const dx=C.buildDXF(p2,S);console.log('dxf bytes',dx.length,'entities',(dx.match(/\nLINE\n/g)||[]).length,'texts',(dx.match(/\nTEXT\n/g)||[]).length,'ends ok',dx.trim().endsWith('EOF'));fs.writeFileSync('test.dxf',dx);
// 8. downstream
for(const P of [p1,p2,p4]){const SS=Object.assign({},S,{edits:P===p1?ed1:P===p2?{key:base.key,ops:[op2]}:{key:base.key,ops:[{t:'mv',o:mv.r.o,pos:mv.r.pos,a0:mv.mi.a0,a1:mv.mi.a1,d:d}]}});
  const g=C.geoBuild(SS,'ms');C.costFor(P,SS,'ms',1,1);const sh=C.buildSheets(SS,'ms',150,'T');let bad=0;sh.forEach(x=>{if(/NaN|undefined|Infinity/.test(x.svg))bad++;});console.log('downstream ok, sheets',sh.length,'bad',bad,'structure cols',C.structure(P,SS,'ms',150).cols.length);}
