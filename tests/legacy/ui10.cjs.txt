const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
let html=fs.readFileSync('../../dist/courtyard_house_planner.html','utf8').replace(/<script src="[^"]*three[^"]*"><\/script>/,'');
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>{if(!/navigation/.test(e.message))errs.push(e.message);});vc.on('error',e=>errs.push(String(e)));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/',virtualConsole:vc,beforeParse(w){w.TextEncoder=globalThis.TextEncoder;w.TextDecoder=globalThis.TextDecoder;w.THREE=require('three');w.print=()=>{};w.URL.createObjectURL=()=>'blob:x';w.URL.revokeObjectURL=()=>{};}});
const w=dom.window,d=w.document;const tick=ms=>new Promise(r=>setTimeout(r,ms));const t=id=>d.getElementById(id).textContent;
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
(async()=>{
 await tick(700);
 const ed=w.__ed,ST=ed.ST;
 const vb0=d.querySelector('#plan svg').getAttribute('viewBox');
 console.log('svc buttons',d.getElementById('segSvc').children.length,'| pillar seg',d.getElementById('segPilC').children.length,d.getElementById('segPilV').children.length,'| svcBox hidden:',d.getElementById('svcBox').style.display);
 const cost0=t('tot');
 const btn=k=>d.querySelector('#segSvc [data-k="'+k+'"]');
 click(btn('plumb'));await tick(300);
 console.log('plumb on:',ST.svc.plumb,'xray auto:',ST.xray,'| plan has blue lines:',/#2F7BD9/.test(d.getElementById('plan').innerHTML),'| box shown:',d.getElementById('svcBox').style.display,'| cost',cost0,'->',t('tot'));
 click(btn('elec'));click(btn('tanks'));await tick(400);
 const vb1=d.querySelector('#plan svg').getAttribute('viewBox');
 console.log('all on. viewBox',vb0,'->',vb1,'| hint:',t('svcHint').slice(0,95));
 console.log('cost lines:',['Plumbing pipework','Electrical wiring','Septic tank','Water tanks','Courtyard pillars','Veranda pillars'].map(k=>k+':'+t('costCard').includes(k)).join(' '));
 // sheets
 d.getElementById('bGen').click();await tick(900);
 console.log('sheets',d.querySelectorAll('#sheetPrev svg').length,'| P-1',/PLUMBING, DRAINAGE/.test(t('sheetPrev')),'| E-1',/ELECTRICAL LAYOUT/.test(t('sheetPrev')));
 // pillars
 click(d.querySelector('#segPilC [data-v="square"]'));click(d.querySelector('#segPilV [data-v="masonry"]'));await tick(400);
 console.log('pillars',ST.pillarC,ST.pillarV,'| cost',t('tot'));
 // septic north + users
 click(d.querySelector('#segSept [data-v="N"]'));await tick(300);
 const u=d.getElementById('users');u.value='12';u.dispatchEvent(new w.Event('input',{bubbles:true}));await tick(300);
 console.log('sept',ST.sept,'users',ST.users,'| label',t('usersV'),'| hint:',t('svcHint').slice(0,70));
 // x-ray toggle
 click(d.getElementById('bXray'));await tick(200);console.log('xray now',ST.xray,'| btn',t('bXray'));
 // edit mode together with services
 click(d.querySelector('#segEdit button[data-v="select"]'));await tick(200);console.log('wall hits with services',d.querySelectorAll('#plan [data-wall]').length);
 click(d.querySelector('#segEdit button[data-v="off"]'));
 // persistence
 const saved=JSON.parse(w.localStorage.getItem('chp_state_v7'));console.log('saved',JSON.stringify({svc:saved.svc,sept:saved.sept,users:saved.users,pc:saved.pillarC,pv:saved.pillarV,x:saved.xray}));
 // turn all off
 ['plumb','elec','tanks'].forEach(k=>click(btn(k)));await tick(300);console.log('all off -> xray',ST.xray,'box',d.getElementById('svcBox').style.display,'viewBox',d.querySelector('#plan svg').getAttribute('viewBox'));
 console.log('errors',errs);process.exit(0);
})();
