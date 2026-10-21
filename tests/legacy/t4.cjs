const fs=require('fs');
global.THREE=require('three');global.window={};
global.num=n=>Math.round(n).toLocaleString('en-IN');
(0,eval)(fs.readFileSync(__dirname+'/app.js','utf8'));
const C=window.__core;let n=0,bad=0;const t0=Date.now();
for(const area of [600,800,1100,1200])for(const beds of [1,2,3])for(const corr of [0,3,4])for(const shape of ['inward','outward','double','flat'])for(const sys of ['brick','rcc','ms']){
  const S={area,beds,att:Math.min(beds,2),pooja:true,store:beds<3,corr,shape,cover:'sheet',pitch:shape==='flat'?22:30,over:3,sys,finish:1,region:1};
  try{const sh=C.buildSheets(S,sys,180,'T');n++;sh.forEach(x=>{if(/NaN|undefined|Infinity/.test(x.svg)){bad++;if(bad<6)console.log('bad svg',area,beds,corr,shape,sys,x.id,(x.svg.match(/.{20}(NaN|undefined|Infinity).{20}/)||[''])[0]);}});}
  catch(e){bad++;if(bad<6)console.log('ERR',JSON.stringify(S),e.message);}
}
console.log('combos',n,'bad',bad,Date.now()-t0,'ms');
