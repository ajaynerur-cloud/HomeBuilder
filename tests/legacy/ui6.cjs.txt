const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
let html=fs.readFileSync('../../dist/courtyard_house_planner.html','utf8').replace(/<script src="[^"]*three[^"]*"><\/script>/,'');
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>{if(!/navigation/.test(e.message))errs.push(e.message);});vc.on('error',e=>errs.push(String(e)));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/',virtualConsole:vc,beforeParse(w){w.TextEncoder=globalThis.TextEncoder;w.TextDecoder=globalThis.TextDecoder;w.THREE=require('three');w.print=()=>{};w.URL.createObjectURL=()=>'blob:x';w.URL.revokeObjectURL=()=>{};}});
const w=dom.window,d=w.document;const tick=ms=>new Promise(r=>setTimeout(r,ms));const t=id=>d.getElementById(id).textContent;
(async()=>{
 await tick(500);
 d.querySelector('#segJag button[data-v="1"]').click();await tick(250);
 console.log('split box hidden before:',d.getElementById('splitBox').style.display);
 const hs=d.getElementById('jagH');hs.value='3';hs.dispatchEvent(new w.Event('change'));await tick(150);
 const c0=t('tot');
 d.querySelector('#jagSplit button[data-v="1"]').click();await tick(250);
 console.log('split on: box',d.getElementById('splitBox').style.display,'| cost',c0,'->',t('tot'));
 console.log('plan levels:',(t('plan').match(/\+\d+′-\d+″/g)||[]).join(' '));
 console.log('seg count in plan svg rect with f-jag2:',(d.getElementById('plan').innerHTML.match(/f-jag2/g)||[]).length);
 const sh=d.getElementById('splitH');sh.value='1';sh.dispatchEvent(new w.Event('change'));await tick(200);
 console.log('lower 1.0 ->',(t('plan').match(/\+\d+′-\d+″/g)||[]).join(' '));
 for(const k of ['s','e','w']){d.querySelector('#jagSides button[data-k="'+k+'"]').click();await tick(120);}
 d.querySelector('#splitScope button[data-v="all"]').click();await tick(250);
 console.log('scope all pressed:',d.querySelector('#splitScope button[data-v="all"]').getAttribute('aria-pressed'),'| levels:',(t('plan').match(/\+\d+′-\d+″/g)||[]).join(' '));
 console.log('ledges button pressed (ledges ignored in split):',d.getElementById('jagL').firstChild.getAttribute('aria-pressed'));
 console.log('diy split step:',[...d.querySelectorAll('#diyBody ol li')].map(l=>l.textContent).filter(x=>/Split platform/.test(x)).map(x=>x.slice(0,120)).join(''));
 d.getElementById('bGen').click();await tick(500);console.log('sheets',d.querySelectorAll('#sheetPrev svg').length,(t('sheetPrev').match(/SPLIT JAGALI[^×]*/)||['no label'])[0].slice(0,50));
 d.querySelector('#jagSplit button[data-v="0"]').click();await tick(200);console.log('single again box',d.getElementById('splitBox').style.display);
 console.log('errors',errs);process.exit(0);
})();
