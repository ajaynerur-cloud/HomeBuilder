const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
let html=fs.readFileSync('../../dist/courtyard_house_planner.html','utf8').replace(/<script src="[^"]*three[^"]*"><\/script>/,'');
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>{if(!/navigation/.test(e.message))errs.push(e.message);});vc.on('error',e=>errs.push(String(e)));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/',virtualConsole:vc,beforeParse(w){w.TextEncoder=globalThis.TextEncoder;w.TextDecoder=globalThis.TextDecoder;w.THREE=require('three');w.print=()=>{};w.URL.createObjectURL=()=>'blob:x';w.URL.revokeObjectURL=()=>{};}});
const w=dom.window,d=w.document;const tick=ms=>new Promise(r=>setTimeout(r,ms));const t=id=>d.getElementById(id).textContent;
(async()=>{
 await tick(600);
 d.querySelector('#segJag button[data-v="1"]').click();await tick(250);
 const hs=d.getElementById('jagH');hs.value='3.5';hs.dispatchEvent(new w.Event('change'));await tick(150);
 d.querySelector('#jagSplit button[data-v="1"]').click();await tick(300);
 console.log('4 steps note:',t('splitNote'));
 console.log('plan:',(t('plan').match(/up \d steps/g)||[]).join(','),'| floor line:',/FLOOR LEVEL/.test(t('areaLine'))?'':'' ,(t('plan').match(/\+\d+′-\d+″/g)||[]).join(' '));
 d.querySelector('#splitSteps button[data-v="2"]').click();await tick(300);
 console.log('2 steps note:',t('splitNote'));
 console.log('plan:',(t('plan').match(/up \d steps/g)||[]).join(','));
 const dstep=[...d.querySelectorAll('#diyBody ol li')].map(l=>l.textContent).filter(x=>/Steps to the door/.test(x))[0]||'none';console.log('diy:',dstep.slice(0,170));
 d.querySelector('#splitScope button[data-v="all"]').click();
 d.querySelector('#segExit button[data-k="s"]').click();d.querySelector('#segExit button[data-k="e"]').click();
 for(const k of ['s','e','w']){d.querySelector('#jagSides button[data-k="'+k+'"]').click();await tick(100);}
 await tick(400);console.log('all sides plan steps labels:',(t('plan').match(/up \d steps/g)||[]).join(','));
 d.getElementById('bGen').click();await tick(500);console.log('sheets',d.querySelectorAll('#sheetPrev svg').length);
 console.log('errors',errs);process.exit(0);
})();
