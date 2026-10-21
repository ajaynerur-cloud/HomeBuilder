const fs=require('fs');global.THREE=require('three');global.window={};global.num=n=>Math.round(n).toLocaleString('en-IN');
(0,eval)(fs.readFileSync(__dirname+'/app.js','utf8'));const C=window.__core;let n=0,bad=0;const t0=Date.now();
const sideSets=[{n:true,s:false,e:false,w:false},{n:true,s:true,e:false,w:false},{n:true,s:true,e:true,w:true},{n:false,s:false,e:true,w:false},{n:false,s:false,e:false,w:false},{n:true,s:false,e:true,w:true}];
for(const area of [600,800,1100,1200])for(const corr of [0,3,4])for(const sys of ['brick','ms'])for(const jagOn of [false,true])for(const sides of sideSets)for(const ex of [{s:false,e:false,w:false},{s:true,e:true,w:true}]){
  if(!jagOn&&sides!==sideSets[0])continue;
  const S={area,beds:2,att:1,pooja:true,store:true,corr,shape:'double',cover:'sheet',pitch:25,over:2,sys,finish:1,region:1,soil:'medium',sbc:150,exits:ex,backOff:3,jag:{on:jagOn,h:2.5,d:7,ledges:true,sides}};
  try{const sh=C.buildSheets(S,sys,150,'T');n++;sh.forEach(x=>{if(/NaN|undefined|Infinity/.test(x.svg)){bad++;if(bad<5)console.log('bad',area,corr,sys,jagOn,JSON.stringify(sides),x.id);}});
    C.geoBuild(S,sys);const pl=C.planFor(S);C.costFor(pl,S,sys,1,1);C.diyPlan(pl,S,sys,'medium',150);}
  catch(e){bad++;if(bad<5)console.log('ERR',e.message,e.stack.split('\n')[1]);}
}
console.log('combos',n,'bad',bad,Date.now()-t0,'ms');
const S={area:1100,beds:2,att:2,pooja:true,store:true,corr:4,shape:'double',cover:'tile',pitch:22,over:2,sys:'ms',finish:1,region:1,soil:'medium',sbc:150,exits:{s:true,e:true,w:true},backOff:3,jag:{on:true,h:2.5,d:7,ledges:true,sides:{n:true,s:true,e:true,w:true}}};
const sh=C.buildSheets(S,'ms',150,'All around');sh.forEach(x=>fs.writeFileSync('/tmp/Z_'+x.id+'.svg',x.svg));
console.log(JSON.stringify(C.planFor(S).sight));
