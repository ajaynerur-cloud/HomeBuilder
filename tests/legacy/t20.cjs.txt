const fs=require('fs');global.THREE=require('three');global.window={};global.num=n=>Math.round(n).toLocaleString('en-IN');
(0,eval)(fs.readFileSync(__dirname+'/app.js','utf8'));const C=window.__core;
const S0={area:1000,beds:2,att:1,pooja:true,store:true,corr:4,cy:'M',shape:'double',cover:'tile',pitch:22,over:2,sys:'ms',finish:1,region:1,exits:{s:false,e:false,w:false},backOff:-3,jag:{on:false,h:2,d:6,ledges:true,sides:{n:true,s:false,e:false,w:false},split:{on:false,scope:'front',h:1.5,steps:4}},svc:{plumb:false,elec:false,tanks:false}};
// window replace
const b=C.planBase(S0),run=C.wallRuns(b).find(r=>r.cls==='out'&&r.len>=12);
const mid=(run.a0+run.a1)/2,sn=C.snapDoor(b,run.o==='H'?mid:run.pos,run.o==='H'?run.pos:mid,4,'win');
const p=C.planFor(Object.assign({},S0,{edits:{key:b.key,ops:[{t:'dadd',d:{o:sn.o,pos:sn.pos,a0:sn.a0,a1:sn.a1,k:'win'}}]}}));
console.log('window 4ft placed:',!!sn,'wins',C.planBase(S0).units.filter(u=>u.k==='win').length,'->',p.units.filter(u=>u.k==='win').length,'units (8 added, overlapping removed)');
// random op fuzz: random removals, splits, moves, door/window ops; verify invariants
let seed=7;function rnd(){seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;}
let n=0,bad=0,merges=0,splits=0,moves=0;
for(let t=0;t<260;t++){
  const S=Object.assign({},S0,{area:[700,900,1100,1300][t%4],beds:1+(t%3),att:Math.min(1+(t%2),1+(t%3)),corr:[0,3,4,6][t%4],sys:['brick','rcc','ms'][t%3],shape:['inward','double','flat'][t%3],exits:{s:t%5===0,e:t%7===0,w:t%11===0}});
  const base=C.planBase(S);let ops=[];let cur=base;
  for(let k=0;k<5;k++){
    const kind=Math.floor(rnd()*5),runs=C.wallRuns(cur);
    if(kind===0){const r=runs[Math.floor(rnd()*runs.length)];ops.push({t:'rm',o:r.o,p:r.p,i0:r.i0,i1:r.i1});}
    else if(kind===1){const parts=C.planParts(cur),q=parts[Math.floor(rnd()*parts.length)],o=rnd()<0.5?'V':'H';ops.push({t:'sp',o:o,pos:(o==='V'?q.x:q.y)+(o==='V'?q.w:q.h)*(0.3+rnd()*0.4),x:q.x+q.w/2,y:q.y+q.h/2,dw:rnd()<0.5?3:0});}
    else if(kind===2){const r=runs[Math.floor(rnd()*runs.length)],mi=C.runMove(cur,r);if(mi.ok) ops.push({t:'mv',o:r.o,pos:r.pos,a0:mi.a0,a1:mi.a1,d:Math.round((mi.lo+rnd()*(mi.hi-mi.lo))*2)/2});}
    else if(kind===3){const r=runs[Math.floor(rnd()*runs.length)],mid=(r.a0+r.a1)/2,sn=C.snapDoor(cur,r.o==='H'?mid:r.pos,r.o==='H'?r.pos:mid,3,'door');if(sn) ops.push({t:'dadd',d:{o:sn.o,pos:sn.pos,a0:sn.a0,a1:sn.a1,k:'door'}});}
    else{const d=cur.doors.filter(x=>x.k==='door');if(d.length) ops.push({t:'ddel',key:C.doorKey(d[Math.floor(rnd()*d.length)])});}
    if(!ops.length) continue;
    const SE=Object.assign({},S,{edits:{key:base.key,ops:ops}});
    try{
      cur=C.planFor(SE);
      // invariants: visible rooms + hidden parts tile the same total area as base; no overlapping parts; every door/window has live units
      const tot=a=>a.parts?a.parts.reduce((s,q)=>s+q.w*q.h,0):0;
      const baseA=C.planParts(base).reduce((s,q)=>s+q.w*q.h,0),curA=cur.parts.reduce((s,q)=>s+q.w*q.h,0);
      if(Math.abs(baseA-curA)>0.01){bad++;console.log('AREA',baseA,curA,JSON.stringify(ops.slice(-1)));}
      for(let i=0;i<cur.parts.length;i++)for(let j=i+1;j<cur.parts.length;j++){const a=cur.parts[i],c=cur.parts[j];if(Math.min(a.x+a.w,c.x+c.w)-Math.max(a.x,c.x)>0.01&&Math.min(a.y+a.h,c.y+c.h)-Math.max(a.y,c.y)>0.01){bad++;console.log('OVERLAP');}}
      const vis=cur.rooms.filter(r=>!r.hidden&&r.t!=='court'&&r.t!=='corr').reduce((s,r)=>s+C.rArea(r),0);if(Math.abs(vis-baseA)>0.01){bad++;console.log('VISAREA',vis,baseA);}
      C.geoBuild(SE,S.sys);C.costFor(cur,SE,S.sys,1,1);C.structure(cur,SE,S.sys,150);C.designChecks(cur,SE);C.buildDXF(cur,SE);
      if(k===4){const sh=C.buildSheets(SE,S.sys,150,'T');sh.forEach(x=>{if(/NaN|undefined|Infinity/.test(x.svg)){bad++;console.log('BADSVG',x.id);}});}
      n++;
    }catch(e){bad++;console.log('ERR',e.message,(e.stack.split('\n')[1]||'').trim(),JSON.stringify(ops.slice(-1)));ops.pop();}
  }
  merges+=ops.filter(o=>o.t==='rm').length;splits+=ops.filter(o=>o.t==='sp').length;moves+=ops.filter(o=>o.t==='mv').length;
}
console.log('fuzz steps',n,'bad',bad,'| ops used: rm',merges,'sp',splits,'mv',moves);
