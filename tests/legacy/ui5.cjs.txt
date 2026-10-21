const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
let html=fs.readFileSync('../../dist/courtyard_house_planner.html','utf8').replace(/<script src="[^"]*three[^"]*"><\/script>/,'');
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>{if(!/navigation/.test(e.message))errs.push(e.message);});vc.on('error',e=>errs.push(String(e)));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/',virtualConsole:vc,beforeParse(w){w.TextEncoder=globalThis.TextEncoder;w.TextDecoder=globalThis.TextDecoder;w.THREE=require('three');w.print=()=>{};w.URL.createObjectURL=()=>'blob:x';w.URL.revokeObjectURL=()=>{};}});
const w=dom.window,d=w.document;const tick=ms=>new Promise(r=>setTimeout(r,ms));const t=id=>d.getElementById(id).textContent;
(async()=>{
 await tick(500);
 console.log('start:',t('areaLine'));
 console.log('sight hint (no exit):',t('sightHint'));
 const tbl=d.getElementById('sched').querySelector('table');
 console.log('sched header:',[...tbl.rows[0].cells].map(c=>c.textContent).join(' | '));
 console.log('vastu col:',[...tbl.rows].slice(1,6).map(r=>r.cells[0].textContent+'='+r.cells[5].textContent).join(' ; '));
 console.log('notes:',[...d.querySelectorAll('#schedNote p')].map(p=>p.textContent).filter(x=>/Vastu/.test(x)).join(' ').slice(0,200));
 // exits
 d.querySelector('#segExit button[data-k="s"]').click();await tick(250);
 console.log('back exit on: slider shown',d.getElementById('exitBox').style.display!=='none','|',t('sightHint'));
 const bo=d.getElementById('backOff');bo.value='-5';bo.dispatchEvent(new w.Event('input'));await tick(250);console.log('shift -5:',t('sightHint'));
 bo.value='0';bo.dispatchEvent(new w.Event('input'));await tick(250);console.log('shift 0:',t('sightHint'));
 d.querySelector('#segExit button[data-k="e"]').click();d.querySelector('#segExit button[data-k="w"]').click();await tick(250);
 console.log('rooms now:',[...d.getElementById('sched').querySelector('table').rows].slice(1).map(r=>r.cells[0].textContent).join(', '));
 // jagali on all sides
 d.querySelector('#segJag button[data-v="1"]').click();await tick(250);
 for(const k of ['s','e','w']){d.querySelector('#jagSides button[data-k="'+k+'"]').click();await tick(120);}
 console.log('jag sides pressed:',[...d.getElementById('jagSides').children].map(b=>b.getAttribute('data-k')+':'+b.getAttribute('aria-pressed')).join(' '));
 console.log('area line:',t('areaLine'));
 console.log('plan has west/south/east labels:',/Jagali south/.test(t('plan')),/Jagali east/.test(t('plan')),/Jagali west/.test(t('plan')));
 console.log('cost',t('tot'),'| jag item:',[...d.querySelectorAll('#bars .bar span:first-child')].map(x=>x.textContent).filter(x=>/Jagali/.test(x)).join(','));
 d.getElementById('bGen').click();await tick(500);console.log('sheets',d.querySelectorAll('#sheetPrev svg').length);
 // custom mode with exits
 d.querySelector('#segCustom button[data-v="1"]').click();await tick(300);
 console.log('custom inputs',d.querySelectorAll('#customBox input').length,'info:',t('customInfo'),'| warn:',t('customWarn').slice(0,80));
 console.log('errors',errs);process.exit(0);
})();
