const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
let html=fs.readFileSync('../../dist/courtyard_house_planner.html','utf8').replace(/<script src="[^"]*three[^"]*"><\/script>/,'');
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>{if(!/navigation/.test(e.message))errs.push(e.message);});vc.on('error',e=>errs.push(String(e)));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/',virtualConsole:vc,beforeParse(w){w.TextEncoder=globalThis.TextEncoder;w.TextDecoder=globalThis.TextDecoder;w.THREE=require('three');w.print=()=>{};w.URL.createObjectURL=()=>'blob:x';w.URL.revokeObjectURL=()=>{};}});
const w=dom.window,d=w.document;const tick=ms=>new Promise(r=>setTimeout(r,ms));
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
const vb=()=>d.querySelector('#plan svg').getAttribute('viewBox');
(async()=>{
 await tick(800);
 console.log('buttons',['pFit','pIn','pOut','pPan','bFit3'].map(i=>!!d.getElementById(i)).join(','));
 const v0=vb();click(d.getElementById('pIn'));click(d.getElementById('pIn'));await tick(100);const v1=vb();
 console.log('zoom in: viewBox',v0,'->',v1);
 click(d.getElementById('pOut'));await tick(100);console.log('zoom out ->',vb());
 click(d.getElementById('pPan'));console.log('pan pressed',d.getElementById('pPan').getAttribute('aria-pressed'));
 click(d.getElementById('pPan'));
 // keep zoom after an edit redraw
 click(d.getElementById('pIn'));await tick(50);
 click(d.querySelector('#segEdit button[data-v="select"]'));await tick(300);
 console.log('zoom kept after mode change:',vb());
 click(d.getElementById('pFit'));await tick(100);console.log('fit ->',vb(),'| equals initial:',vb()===v0);
 // services widen the view box and fit still works
 click(d.querySelector('#segSvc [data-k="tanks"]'));await tick(400);click(d.getElementById('pFit'));console.log('with tanks full view:',vb());
 click(d.getElementById('bFit3'));await tick(100);console.log('3D fit clicked ok');
 console.log('errors',errs);process.exit(0);
})();
