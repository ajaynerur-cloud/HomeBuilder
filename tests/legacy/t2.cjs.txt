const fs=require('fs');
global.THREE=require('three');global.window={};
(0,eval)(fs.readFileSync(__dirname+'/app.js','utf8'));
const C=window.__core;
function overlap(a,b){return a.x<b.x+b.w-1e-6&&b.x<a.x+a.w-1e-6&&a.y<b.y+b.h-1e-6&&b.y<a.y+a.h-1e-6;}
let fails=0;const t0=Date.now();
const cfgs=[];
for(const area of [500,600,800,1100,1200,1500])for(const beds of [1,2,3])for(const att of [0,1,beds])for(const pooja of [true,false])for(const store of [true,false])for(const corr of [0,3,4])cfgs.push({area,beds,att:Math.min(att,beds),pooja,store,corr});
console.log('configs',cfgs.length);
let slow=0,dropped=0,bad=0;
const seen=new Set();
for(const S of cfgs){
  const key=JSON.stringify(S);if(seen.has(key))continue;seen.add(key);
  const t1=Date.now();
  const pl=C.planFor(S);
  const dt=Date.now()-t1;if(dt>800)slow++;
  if(pl.dropped)dropped++;
  const rs=pl.rooms.filter(r=>r.t!=='court'&&r.t!=='corr');
  let sum=rs.reduce((a,r)=>a+r.w*r.h,0)+(pl.corr?pl.center.w*pl.center.h:pl.court.w*pl.court.h);
  if(pl.corr) sum=rs.reduce((a,r)=>a+r.w*r.h,0)+pl.center.w*pl.center.h;
  let msg=[];
  if(Math.abs(sum-pl.area)>0.01)msg.push('area '+sum+' vs '+pl.area);
  for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++)if(overlap(rs[i],rs[j]))msg.push('overlap '+rs[i].n+'/'+rs[j].n);
  if(pl.noDoor.length)msg.push('nodoor '+pl.noDoor.join(','));
  const miss=pl.doors.filter(d=>{const p=Math.round(d.pos*2);for(let i=Math.round(d.a0*2);i<Math.round(d.a1*2);i++){if(!pl.units.find(u=>u.o===d.o&&u.p===p&&u.i===i))return true;}return false;});
  if(miss.length)msg.push('doormiss '+miss.length);
  const small=pl.sched.filter(r=>r.fit==='small').map(r=>r.n);
  if(msg.length&&S.area>=600){bad++;if(bad<=14)console.log(JSON.stringify(S),msg.join('; '),'ms',dt);}
}
console.log('done',Date.now()-t0,'ms; slow',slow,'dropped',dropped,'bad',bad);
// sample outputs
for(const S of [{area:800,beds:2,att:1,pooja:true,store:true,corr:0},{area:1100,beds:3,att:2,pooja:true,store:true,corr:4},{area:600,beds:2,att:1,pooja:true,store:false,corr:3},{area:1200,beds:2,att:2,pooja:false,store:false,corr:4}]){
  const pl=C.planFor(S);
  console.log(JSON.stringify(S),pl.W+'x'+pl.D,'court',pl.court.w+'x'+pl.court.h,'dropped',pl.dropped,'eff',pl.eff.toFixed(2),'min',pl.minArea);
  console.log('  '+pl.sched.map(r=>r.n+' '+r.w+'x'+r.h+'='+r.a+'('+r.fit+')').join(' | '));
  for(const sh of ['inward','double','flat']){const g=C.geoBuild(Object.assign({shape:sh,cover:'tile',pitch:22,over:2,sys:'ms'},S),'ms');let bad=0;Object.values(g.banks).concat(Object.values(g.roofBanks)).forEach(b=>b.p.forEach(v=>{if(!isFinite(v))bad++;}));const c=C.costFor(pl,Object.assign({shape:sh,cover:'tile',pitch:22,over:2},S),'ms',1,1);console.log('   ',sh,'bad',bad,Math.round(c.total/1000)+'k',Math.round(c.perSqft));}
}
