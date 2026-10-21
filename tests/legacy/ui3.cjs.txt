const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
let html=fs.readFileSync('../../dist/courtyard_house_planner.html','utf8').replace(/<script src="[^"]*three[^"]*"><\/script>/,'');
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>{if(!/navigation/.test(e.message))errs.push(e.message);});vc.on('error',e=>errs.push(String(e)));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/',virtualConsole:vc,beforeParse(w){w.TextEncoder=globalThis.TextEncoder;w.TextDecoder=globalThis.TextDecoder;w.THREE=require('three');w.print=()=>{};w.URL.createObjectURL=()=>'blob:x';w.URL.revokeObjectURL=()=>{};}});
const w=dom.window,d=w.document;const tick=ms=>new Promise(r=>setTimeout(r,ms));
const t=id=>d.getElementById(id).textContent;
(async()=>{
 await tick(400);
 console.log('start:',t('areaLine'));
 console.log('sug  :',t('minLine'));
 console.log('diy  :',d.querySelectorAll('#diyBody table').length,'tables,',d.querySelectorAll('#diyBody ol li').length,'steps');
 console.log('diy key row:',d.querySelector('#diyBody table').rows[1].textContent.replace(/\s+/g,' '));
 // custom mode on
 d.querySelector('#segCustom button[data-v="1"]').click();await tick(250);
 const inputs=d.querySelectorAll('#customBox input');
 console.log('custom inputs',inputs.length,'visible',d.getElementById('customBox').style.display!=='none','area slider disabled',d.getElementById('area').disabled);
 console.log('info:',t('customInfo'));
 function setF(f,v){const i=d.querySelector('#customBox input[data-f="'+f+'"]');i.value=v;i.dispatchEvent(new w.Event('input',{bubbles:true}));}
 function setL(l,v){const i=d.querySelector('#customBox input[data-l="'+l+'"]');i.value=v;i.dispatchEvent(new w.Event('input',{bubbles:true}));}
 setF('cw',10);await tick(150);console.log('court 10 ->',t('customInfo'));
 setF('k',4);await tick(150);console.log('path 4 ->',t('customInfo'));
 setL('bed2',16);await tick(150);console.log('bed2 16 ->',t('customInfo'),'| warn:',t('customWarn'));
 const planTxt=d.getElementById('plan').textContent;console.log('plan has Bedroom 2 16 × ?', /Bedroom 2/.test(planTxt), (planTxt.match(/Bedroom 2[^A-Z]{0,30}/)||[''])[0]);
 setL('bed2',60);await tick(150);console.log('overflow warn:',t('customWarn').slice(0,90));
 console.log('cost:',t('tot'),'| corr compare:',t('cmpCorr').slice(0,60));
 // back to optimised
 d.querySelector('#segCustom button[data-v="0"]').click();await tick(200);
 console.log('back:',t('areaLine'),'| area slider disabled',d.getElementById('area').disabled);
 // use suggestion
 const b=d.getElementById('useMin');console.log('use btn',b.style.display,b.textContent);if(b.style.display!=='none'){b.click();await tick(250);console.log('after use:',t('areaLine'));}
 // soil change
 const so=d.getElementById('soil');so.value='bc';so.dispatchEvent(new w.Event('change'));await tick(150);
 console.log('bc soil sbc',d.getElementById('sbc').value,'|',d.querySelector('#diyBody table').rows[1].textContent.replace(/\s+/g,' '));
 d.getElementById('bGen').click();await tick(400);console.log('sheets',d.querySelectorAll('#sheetPrev svg').length,t('drawStatus'));
 console.log('errors',errs);process.exit(0);
})();
