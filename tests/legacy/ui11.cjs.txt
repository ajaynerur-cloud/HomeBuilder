const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
let html=fs.readFileSync('../../dist/courtyard_house_planner.html','utf8').replace(/<script src="[^"]*three[^"]*"><\/script>/,'');
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>{if(!/navigation/.test(e.message))errs.push(e.message);});vc.on('error',e=>errs.push(String(e)));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/',virtualConsole:vc,beforeParse(w){w.TextEncoder=globalThis.TextEncoder;w.TextDecoder=globalThis.TextDecoder;w.THREE=require('three');w.print=()=>{};w.URL.createObjectURL=()=>'blob:x';w.URL.revokeObjectURL=()=>{};}});
const w=dom.window,d=w.document;const tick=ms=>new Promise(r=>setTimeout(r,ms));const t=id=>d.getElementById(id).textContent;
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
const chg=(el,v)=>{el.value=String(v);el.dispatchEvent(new w.Event('change',{bubbles:true}));};
(async()=>{
 await tick(800);
 const ed=w.__ed,ST=ed.ST,C=w.__core;
 const mode=m=>click(d.querySelector('#segEdit button[data-v="'+m+'"]'));
 const vis=pl=>pl.rooms.filter(r=>!r.hidden&&r.t!=='court'&&r.t!=='corr');
 console.log('modes',d.getElementById('segEdit').children.length,'| hint:',t('editHint').slice(0,50));
 mode('select');await tick(200);
 console.log('select: room hits',d.querySelectorAll('#plan [data-room]').length,'wall hits',d.querySelectorAll('#plan [data-wall]').length,'checks visible',d.getElementById('edChecks').style.display,'|',t('edChecks').slice(0,40));
 // --- merge master + att bath
 const base=ed.planFor(ST);
 const master=base.rooms.find(r=>r.key==='master'),att=base.rooms.find(r=>r.key==='att1');
 const run=C.wallRuns(base).find(r=>{const rr=C.runRooms(base,r);const all=rr.A.concat(rr.B);return all.includes(master)&&all.includes(att);});
 click(d.querySelector('#plan [data-wall="'+run.id+'"]'));await tick(200);
 console.log('wall selected, props:',t('edProps').replace(/\s+/g,' ').slice(0,150));
 console.log('remove button text:',[...d.querySelectorAll('#edProps button')].map(b=>b.textContent).join(' | '));
 click(d.querySelector('#edProps [data-act="rmwall"]'));await tick(500);
 let pl=ed.planFor(ST);const m1=pl.rooms.find(r=>r.key==='master');
 console.log('merged:',m1.parts.length,'parts, area',Math.round(C.rArea(m1)),'| sched shows incl:',/incl\./.test(t('sched')),'| checks:',t('edChecks').replace(/\s+/g,' ').slice(0,170));
 console.log('ghost lines now:',d.querySelectorAll('#plan [data-ghost]').length);
 // undo / redo
 click(d.getElementById('edUndo'));await tick(300);console.log('undo -> edits',ST.edits,'| redo enabled',!d.getElementById('edRedo').disabled);
 click(d.getElementById('edRedo'));await tick(300);console.log('redo -> ops',ST.edits&&ST.edits.ops.length);
 // restore wall by tapping ghost
 click(d.querySelector('#plan [data-ghost]'));await tick(400);
 pl=ed.planFor(ST);console.log('restored: master parts',pl.rooms.find(r=>r.key==='master').parts&&pl.rooms.find(r=>r.key==='master').parts.length,'| att hidden?',!!pl.rooms.find(r=>r.key==='att1').hidden,'| ops',ST.edits&&ST.edits.ops.map(o=>o.t).join(','));
 click(d.getElementById('edReset'));await tick(300);
 // --- move a wall
 const b2=ed.planFor(ST);let mv=null;C.wallRuns(b2).forEach(r=>{const mi=C.runMove(b2,r);if(!mv&&mi.ok&&r.cls==='in'&&mi.hi>=2) mv={r,mi};});
 click(d.querySelector('#plan [data-wall="'+mv.r.id+'"]'));await tick(200);
 console.log('move props has input:',!!d.getElementById('edMv'),'| range text:',[...d.querySelectorAll('#edProps .hint')].map(x=>x.textContent).join('').slice(0,70));
 const rr0=C.runRooms(b2,mv.r),wA=(mv.r.o==='V'?rr0.A[0].w:rr0.A[0].h);
 chg(d.getElementById('edMv'),1.5);await tick(500);
 pl=ed.planFor(ST);const nA=pl.rooms.find(r=>r.key===rr0.A[0].key);console.log('moved 1.5 ft:',rr0.A[0].n,wA,'->',mv.r.o==='V'?nA.w:nA.h,'| wall still selected:',!!ed.EDIT.sel,'| units',b2.units.length,'->',pl.units.length);
 // keyboard nudge
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:mv.r.o==='V'?'ArrowLeft':'ArrowUp',bubbles:true}));await tick(400);
 pl=ed.planFor(ST);const nA2=pl.rooms.find(r=>r.key===rr0.A[0].key);console.log('arrow nudge back 0.5:',mv.r.o==='V'?nA2.w:nA2.h);
 // blocked move message
 const outer=C.wallRuns(ed.planFor(ST)).find(r=>r.cls==='out');click(d.querySelector('#plan [data-wall="'+outer.id+'"]'));await tick(200);
 console.log('outer wall props:',t('edProps').replace(/\s+/g,' ').slice(-110));
 click(d.getElementById('edReset'));await tick(300);
 // --- add wall (tap) splitting bedroom 2, vertical
 mode('addwall');await tick(200);click(d.querySelector('#segOrient button[data-v="V"]'));
 console.log('add mode: row visible',d.getElementById('edAdd').style.display,'room hits',d.querySelectorAll('#plan [data-room]').length,'wall hits',d.querySelectorAll('#plan [data-wall]').length);
 click(d.querySelector('#plan [data-room="bed2"]'));await tick(500);
 pl=ed.planFor(ST);console.log('split:',pl.rooms.filter(r=>/^bed2/.test(r.key)).map(r=>r.n+' '+r.w+'x'+r.h).join(' | '),'| doors',base.doors.length,'->',pl.doors.length);
 console.log('checks:',[...d.querySelectorAll('#edChecks li')].map(l=>l.textContent.slice(0,70)).slice(0,3).join(' || '));
 // --- select room, rename
 mode('select');await tick(200);click(d.querySelector('#plan [data-room="bed2_b"]'));await tick(200);
 console.log('room props:',t('edProps').replace(/\s+/g,' ').slice(0,140));
 chg(d.getElementById('edName'),'Study');await tick(500);
 console.log('renamed:',ed.planFor(ST).rooms.filter(r=>/^bed2/.test(r.key)).map(r=>r.n).join(' | '),'| sched has Study:',/Study/.test(t('sched')));
 // --- door width
 mode('door');await tick(200);
 const dh=[...d.querySelectorAll('#plan [data-door]')].find(h=>h.getAttribute('data-main')==='0'&&h.getAttribute('data-k')==='door');click(dh);await tick(200);
 console.log('door props:',t('edProps').replace(/\s+/g,' ').slice(0,90));
 chg(d.getElementById('edW'),4);await tick(500);console.log('door widened ->',ed.planFor(ST).doors.filter(x=>x.k==='door').map(x=>x.a1-x.a0).join(','));
 // window chip placement on an outer wall by tap
 click(d.querySelector('#doorPal [data-d="win4"]'));
 const ow=C.wallRuns(ed.planFor(ST)).find(r=>r.cls==='out'&&r.len>=8&&!r.hasDoor);
 const wc=ed.planFor(ST);const nw0=C.runRooms?wc.nWin:0;
 click(d.querySelector('#plan [data-wall="'+ow.id+'"]'));await tick(500);console.log('window chips: nWin',nw0,'->',ed.planFor(ST).nWin);
 // services + sheets + dxf with edits
 click(d.querySelector('#segSvc [data-k="plumb"]'));click(d.querySelector('#segSvc [data-k="elec"]'));await tick(500);
 d.getElementById('bGen').click();await tick(900);console.log('sheets',d.querySelectorAll('#sheetPrev svg').length,'| cost',t('tot'));
 click(d.getElementById('edDxf'));await tick(200);
 mode('off');await tick(200);console.log('off: hits',d.querySelectorAll('#plan [data-wall]').length,'checks',d.getElementById('edChecks').style.display);
 const sv=JSON.parse(w.localStorage.getItem('chp_state_v7'));console.log('saved ops',sv.edits&&sv.edits.ops.map(o=>o.t).join(','));
 console.log('errors',errs);process.exit(0);
})();
