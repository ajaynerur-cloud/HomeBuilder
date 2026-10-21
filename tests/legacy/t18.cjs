const fs=require('fs');global.THREE=require('three');global.window={};global.num=n=>Math.round(n).toLocaleString('en-IN');
(0,eval)(fs.readFileSync(__dirname+'/app.js','utf8'));const C=window.__core;
let n=0,bad=0,sheets=0;
for(const sys of ['brick','rcc','ms'])for(const shape of ['inward','double','flat'])for(const corr of [0,4,6])for(const sept of ['W','N'])for(const pc of ['turned','square','masonry']){
  const S={area:1000,beds:2,att:1,pooja:true,store:true,corr,cy:'M',shape,cover:'tile',pitch:22,over:2,sys,finish:1,region:1,exits:{s:n%2===0,e:n%3===0,w:n%4===0},backOff:-3,sept,users:n%5===0?9:0,pillarC:pc,pillarV:['masonry','turned','square'][n%3],svc:{plumb:true,elec:n%2===0||true,tanks:true},jag:{on:n%2===0,h:2,d:6,ledges:true,sides:{n:true,s:n%2===0,e:false,w:false},split:{on:false,scope:'front',h:1.5,steps:4}}};
  try{
    const pl=C.planFor(S);const g=C.geoBuild(S,sys);C.costFor(pl,S,sys,1,1);
    const sh=C.buildSheets(S,sys,150,'T');sheets=sh.length;
    sh.forEach(x=>{if(/NaN|undefined|Infinity/.test(x.svg)){bad++;console.log('BAD',x.id,sys,shape,corr,sept,pc);}});
    n++;
  }catch(e){bad++;console.log('ERR',e.message,(e.stack.split('\n')[1]||'').trim());}
}
console.log('combos',n,'bad',bad,'sheets per set',sheets);
// off => 7 sheets
const S0={area:1000,beds:2,att:1,pooja:true,store:true,corr:4,cy:'M',shape:'double',cover:'tile',pitch:22,over:2,sys:'ms',exits:{s:false,e:false,w:false},backOff:-3,jag:{on:false,h:2,d:6,ledges:true,sides:{n:true,s:false,e:false,w:false},split:{on:false,scope:'front',h:1.5,steps:4}},svc:{plumb:false,elec:false,tanks:false}};
console.log('off sheets',C.buildSheets(S0,'ms',150,'T').length);
const S1=Object.assign({},S0,{svc:{plumb:true,elec:true,tanks:true},users:0,sept:'W'});
const sh=C.buildSheets(S1,'ms',150,'Services test');fs.writeFileSync('/tmp/P-1.svg',sh[7].svg);fs.writeFileSync('/tmp/E-1.svg',sh[8].svg);console.log(sh.map(x=>x.id).join(' '));
const g=C.geoBuild(Object.assign({},S1,{pillarC:'square',pillarV:'masonry'}),'ms');fs.writeFileSync('cfgS.json',JSON.stringify(Object.assign({},S1,{pillarC:'square',pillarV:'masonry',xray:true})));
