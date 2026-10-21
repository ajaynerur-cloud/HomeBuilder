/* ---------- cost sheet: your own prices for materials, labour, transport and extras, in a window of its own ---------- */
var CS={open:false,tab:'mat',marks:new Map()};
function csPrices(){var r=cmpRates();return r;}
function csLab(){if(!ST.labRates||typeof ST.labRates!=='object') ST.labRates={};LABOUR.forEach(function(l){if(!(+ST.labRates[l[0]]>=0)) ST.labRates[l[0]]=l[3];});return ST.labRates;}
function csTrans(){if(!ST.trans||typeof ST.trans!=='object') ST.trans={rate:3500,n:{}};if(!(+ST.trans.rate>=0)) ST.trans.rate=3500;if(!ST.trans.n) ST.trans.n={};return ST.trans;}
function csExtras(){if(!Array.isArray(ST.extraLines)) ST.extraLines=[['Building approval and permits',25000],['Electricity and water connection',18000]];return ST.extraLines;}
// quantities for the sheet, from the model
function csData(S){
  S=S||ST;var pl=planFor(S),sys=S.sys,r=costFor(pl,S,sys,S.finish,S.region),q=quant(pl,S),ws=wallSel(S),bu=pl.builtup||pl.area,mat=[],prices=csPrices();
  (r.mat?r.mat.rows:[]).forEach(function(x){mat.push({item:x[0],qty:+x[1]||0,unit:x[2],note:x[3]||'',key:x[4]||null});});
  // structure: footings, plinth beams, bands, lintels and columns
  var conc=bu*({rcc:0.045,ms:0.03,brick:0.028}[sys]||0.03)*FT2M2/0.0929,steel=sys==='rcc'?conc*95:conc*60;
  mat.push({item:'Concrete for foundations, beams and bands',qty:+conc.toFixed(1),unit:'m³',note:'mixed on site: cement, sand and aggregate below',key:null});
  mat.push({item:'Cement for concrete (50 kg bags)',qty:Math.ceil(conc*8),unit:'bags',note:'M20, about 8 bags a cubic metre',key:'cement'});
  mat.push({item:'Sand for concrete',qty:+(conc*0.42).toFixed(1),unit:'m³',note:'',key:'sand'});
  mat.push({item:'Aggregate 20 mm',qty:+(conc*0.84).toFixed(1),unit:'m³',note:'',key:'aggregate'});
  mat.push({item:'Steel bars (TMT) for concrete',qty:Math.round(steel),unit:'kg',note:'',key:'rebar'});
  if(sys==='ms') mat.push({item:'MS sections for columns and beams',qty:Math.round(bu*2.6),unit:'kg',note:'about 2.6 kg a sq ft of built-up area',key:'mssec'});
  // roof framework for tiles and sheets
  var cov=S.shape==='flat'?'flat':S.cover,roofKg=cov==='tile'?q.roofArea*2.2:cov==='sheet'?q.roofArea*1.6:0;
  if(roofKg>0) mat.push({item:'MS sections for the roof (rafters and purlins)',qty:Math.round(roofKg),unit:'kg',note:'about '+(cov==='tile'?'2.2':'1.6')+' kg a sq ft of roof',key:'mssec'});
  // finishes
  var gA=(ws.out==='glass'?q.A.out+q.A.ct:0)+(ws.inn==='glass'?q.A.in:0),faces=(ws.out==='glass'?0:2*(q.A.out+q.A.ct))+((ws.inn==='glass'||ws.inn==='wpc')?0:2*q.A.in),fm2=faces*FT2M2;
  if(fm2>0){mat.push({item:'Paint: '+specOf(S,'paintG').n.toLowerCase(),qty:Math.ceil(fm2*2/10),unit:'litres',note:'two coats, about 10 m² a litre',key:'paint'});mat.push({item:'Wall putty',qty:Math.ceil(fm2*0.5),unit:'kg',note:'',key:'putty'});}
  var nD=pl.nDoor||0,nW=(pl.nWin||0)+(pl.nVent||0),wArea=(pl.nWin||0)*16+(pl.nVent||0)*4;
  mat.push({item:'Main door: '+specOf(S,'mainDoor').n,qty:1,unit:'nos',note:'',key:'door_main',f:specOf(S,'mainDoor').f});
  mat.push({item:'Inside doors: '+specOf(S,'inDoor').n.toLowerCase(),qty:nD,unit:'nos',note:'',key:'door_in',f:specOf(S,'inDoor').f});
  mat.push({item:'Windows: '+specOf(S,'winFrame').n+', '+specOf(S,'winGlass').n.toLowerCase(),qty:wArea,unit:'sq ft',note:nW+' windows and vents',key:'window',f:specOf(S,'winFrame').f*specOf(S,'winGlass').f});
  var cu=specOf(S,'curtains');if(cu.f>0){var cA=gA>0?gA:(pl.nWin||0)*28,cL=gA>0?gA/9:(pl.nWin||0)*5;mat.push({item:'Curtains: '+cu.n.toLowerCase(),qty:Math.round(cA),unit:'sq ft',note:gA>0?'along the glass walls':'on the windows',key:'curtain',f:cu.f});mat.push({item:'Curtain track',qty:Math.round(cL),unit:'running ft',note:'',key:'ctrack'});}
  // items priced as a lump from the estimate: type a quote to replace them
  var line=function(re){return r.items.filter(function(i){return re.test(i[0]);}).reduce(function(s3,i){return s3+i[1];},0);};
  [['lump_fit','Sanitaryware, taps and kitchen fittings',line(/^Kitchen, bath and WC/)*0.85],['lump_svc','Plumbing and electrical materials (pipes, wires, DB, fittings)',(line(/^Plumbing pipework/)+line(/^Electrical wiring/)+line(/^Electrical and water/))*0.7],['lump_site','Site works, septic tank and drains',line(/^Site works/)*0.6],['lump_pil','Courtyard pillars, beams and jagali',(line(/^Courtyard pillars/)+line(/^Jagali/))*0.7],['lump_out','Bath and WC block outside (materials)',line(/^Bath and WC block outside/)*0.65],['lump_misc','Waterproofing, grills, hardware, sundries',bu*45]].forEach(function(x){if(x[2]>0) mat.push({item:x[1],qty:1,unit:'lot',note:'from the estimate; type a quote to replace it',key:x[0],lump:x[2]});});
  mat.forEach(function(m){m.price=m.key&&prices[m.key]!=null?prices[m.key]*(m.f||1):(m.lump!=null?m.lump:null);m.amt=m.price!=null?m.qty*m.price:0;});
  // labour
  var masA=(ws.out==='glass'?0:q.A.out+q.A.ct)+((ws.inn==='brick'||ws.inn==='fly'||ws.inn==='aac')?q.A.in:0),sv=svcOn(S)?null:null,pts={plumb:pl.rooms.filter(function(r2){return r2.t==='wet';}).length*5+(S.wetOut?10:0)+3,elec:Math.round(bu/12)};
  var lq={masonry:masA,plaster:faces,concrete:conc+((S.shape==='flat'||S.cover==='rcctile')?q.roofArea*FT2M2*0.125:0),barbend:steel,fabric:(sys==='ms'?bu*2.6:0)+roofKg+((r.mat&&r.mat.dry&&r.mat.dry.kg)||0),roofing:q.roofArea,tiling:bu,painting:faces,carpentry:1+nD+nW,glazing:gA,drywall:(ws.inn==='gyp'||ws.inn==='wpc')?q.A.in:0,plumbing:pts.plumb,electrical:pts.elec,supervise:r.months};
  var lr=csLab(),lab=LABOUR.map(function(l){var qty=+(lq[l[0]]||0);return {key:l[0],item:l[1],unit:l[2],qty:l[0]==='concrete'||l[0]==='supervise'?+qty.toFixed(1):Math.round(qty),rate:lr[l[0]],amt:qty*lr[l[0]]};}).filter(function(l){return l.qty>0;});
  // transport: lorry trips from the quantities
  var find=function(re){return mat.filter(function(m){return re.test(m.item);}).reduce(function(s3,m){return s3+m.qty;},0);},T=csTrans();
  var auto={sand:Math.ceil((find(/^Sand/)+find(/^Aggregate/))/5),masonry:Math.ceil(find(/^(Fly-ash bricks|Bricks)/)/4000+find(/^AAC blocks/)/500),cement:Math.ceil((find(/^Cement/)*50+find(/^Steel bars|^MS (sections|square)/))/9000),finish:2+Math.ceil(bu/600)};
  var trans=TRANSPORT.map(function(t){var n=T.n[t[0]]!=null&&T.n[t[0]]!==''?+T.n[t[0]]:auto[t[0]];return {key:t[0],item:t[1],unit:t[2],auto:auto[t[0]],n:n,amt:n*T.rate};});
  var ext=csExtras().map(function(e){return {item:e[0],amt:+e[1]||0};});
  var sum=function(a){return a.reduce(function(s3,x){return s3+x.amt;},0);},tot={mat:sum(mat),lab:sum(lab),trans:sum(trans),ext:sum(ext)};tot.all=tot.mat+tot.lab+tot.trans+tot.ext;
  return {mat:mat,lab:lab,trans:trans,ext:ext,tot:tot,estimate:r.total,months:r.months};
}
(function(){
  var ov=document.createElement('div');ov.className='pw cs-win';ov.hidden=true;ov.setAttribute('role','dialog');ov.setAttribute('aria-label','Cost sheet');
  ov.innerHTML='<div class="pw-top"><b>Cost sheet</b><div class="seg pw-seg" id="csTabs"><button type="button" data-t="mat">Materials</button><button type="button" data-t="lab">Labour</button><button type="button" data-t="trans">Transport</button><button type="button" data-t="ext">Extras</button><button type="button" data-t="cmp">Compare options</button></div><span class="pw-grow"></span><button type="button" class="b pw-close" id="csClose">Close (Esc)</button></div><div class="cs-sum" id="csSum"></div><div class="cs-body" id="csBody"></div><div class="cs-cmp" id="csCmp" hidden></div>';
  document.body.appendChild(ov);
  Array.prototype.forEach.call(ov.querySelectorAll('#csTabs button'),function(b){b.addEventListener('click',function(){csTab(b.getAttribute('data-t'));});});
  $('csClose').addEventListener('click',function(){csClose();});
  document.addEventListener('keydown',function(e){if(CS.open&&e.key==='Escape'&&!/INPUT|SELECT|TEXTAREA/.test((e.target&&e.target.tagName)||'')) csClose();});
  var host=$('costCard');if(host){var bar=document.createElement('div');bar.className='pw-entry';bar.innerHTML='<button type="button" class="b pri" id="csOpen">Open cost sheet: materials, labour, transport</button>';var h2=host.querySelector('h2');(h2||host.firstChild).insertAdjacentElement(h2?'afterend':'beforebegin',bar);$('csOpen').addEventListener('click',function(){csOpen();});}
})();
function csOpen(t){CS.open=true;var ov=document.querySelector('.cs-win');ov.hidden=false;document.body.classList.add('planfocus');var c=$('cmpCard');if(c&&!CS.marks.has(c)){var m=document.createComment('cs');c.parentNode.insertBefore(m,c);CS.marks.set(c,m);$('csCmp').appendChild(c);}csTab(t||CS.tab);}
function csClose(){CS.open=false;var ov=document.querySelector('.cs-win');ov.hidden=true;document.body.classList.remove('planfocus');CS.marks.forEach(function(m,c){m.parentNode.insertBefore(c,m);m.remove();});CS.marks.clear();}
function csTab(t){CS.tab=t;Array.prototype.forEach.call(document.querySelectorAll('#csTabs button'),function(b){b.classList.toggle('on',b.getAttribute('data-t')===t);});$('csBody').hidden=t==='cmp';$('csCmp').hidden=t!=='cmp';if(t==='cmp'){try{renderCompare();}catch(e){}}csRender();}
function csRender(){
  if(!CS.open) return;var D=csData(),money=function(v){return '₹'+num(Math.round(v));},t=D.tot;
  $('csSum').innerHTML='<span>Materials <b>'+money(t.mat)+'</b></span><span>Labour <b>'+money(t.lab)+'</b></span><span>Transport <b>'+money(t.trans)+'</b></span><span>Extras <b>'+money(t.ext)+'</b></span><span class="cs-tot">Your total <b>'+lakh(t.all)+'</b></span><span class="hint">Quick estimate '+lakh(D.estimate)+' ('+(t.all>=D.estimate?'+':'−')+lakh(Math.abs(t.all-D.estimate))+')</span>';
  if(CS.tab==='cmp') return;var h='';
  if(CS.tab==='mat'){h='<table class="mat-tab cs-tab"><tr><th>Material</th><th class="num">Quantity</th><th>Unit</th><th class="num">Price ₹</th><th class="num">Amount</th></tr>'+D.mat.map(function(m){return '<tr><td>'+esc(m.item)+(m.note?'<div class="hint">'+esc(m.note)+'</div>':'')+'</td><td class="num">'+num(m.qty)+'</td><td>'+esc(m.unit)+'</td><td class="num">'+(m.key?'<input class="cmp-rate'+(m.lump!=null?' cs-lump':'')+'" type="number" min="0" step="'+(m.lump!=null?'500':'0.5')+'" data-pk="'+m.key+'" data-f="'+(m.f||1)+'" value="'+(Math.round(m.price*100)/100)+'">':'')+'</td><td class="num">'+(m.key?money(m.amt):'')+'</td></tr>';}).join('')+'</table><p class="hint">Quantities come from the model. Prices start at typical 2026 rates; type your local prices. For doors, windows and curtains the price already includes the chosen finish.</p>';}
  if(CS.tab==='lab'){h='<table class="mat-tab cs-tab"><tr><th>Work</th><th class="num">Quantity</th><th>Unit</th><th class="num">Rate ₹</th><th class="num">Amount</th></tr>'+D.lab.map(function(l){return '<tr><td>'+esc(l.item)+'</td><td class="num">'+num(l.qty)+'</td><td>'+esc(l.unit)+'</td><td class="num"><input class="cmp-rate" type="number" min="0" step="0.5" data-lk="'+l.key+'" value="'+l.rate+'"></td><td class="num">'+money(l.amt)+'</td></tr>';}).join('')+'</table><p class="hint">Labour-only rates by trade. If your contractor quotes one rate per sq ft, set the trades to zero and add that as an extra.</p>';}
  if(CS.tab==='trans'){h='<div class="bud-row"><label>Price per trip, loading and unloading included ₹ <input class="cmp-rate" id="csTripRate" type="number" min="0" step="100" value="'+csTrans().rate+'"></label></div><table class="mat-tab cs-tab"><tr><th>Load</th><th>Vehicle</th><th class="num">Worked out</th><th class="num">Trips</th><th class="num">Amount</th></tr>'+D.trans.map(function(x){return '<tr><td>'+esc(x.item)+'</td><td>'+esc(x.unit)+'</td><td class="num">'+x.auto+'</td><td class="num"><input class="cmp-rate" type="number" min="0" step="1" data-tk="'+x.key+'" value="'+x.n+'"></td><td class="num">'+money(x.amt)+'</td></tr>';}).join('')+'</table><p class="hint">Trips are worked out from the quantities; change any count to match your supplier. Clear a box to go back to the worked-out number.</p>';}
  if(CS.tab==='ext'){h='<table class="mat-tab cs-tab"><tr><th>Item</th><th class="num">Amount ₹</th><th></th></tr>'+csExtras().map(function(e,i){return '<tr><td><input class="cs-name" data-en="'+i+'" value="'+esc(e[0])+'"></td><td class="num"><input class="cmp-rate" type="number" min="0" step="500" data-ea="'+i+'" value="'+(+e[1]||0)+'"></td><td><button class="b sm" type="button" data-ed="'+i+'">Delete</button></td></tr>';}).join('')+'</table><button class="b" type="button" id="csAddLine">Add a line</button><p class="hint">Anything else: approvals, architect or engineer fees, connections, a lump-sum contractor quote, furniture.</p>';}
  $('csBody').innerHTML=h;var body=$('csBody'),re=function(){save();csRender();};
  Array.prototype.forEach.call(body.querySelectorAll('input[data-pk]'),function(i2){i2.addEventListener('change',function(){csPrices()[i2.getAttribute('data-pk')]=Math.max(0,+i2.value||0)/(+i2.getAttribute('data-f')||1);re();});});
  Array.prototype.forEach.call(body.querySelectorAll('input[data-lk]'),function(i2){i2.addEventListener('change',function(){csLab()[i2.getAttribute('data-lk')]=Math.max(0,+i2.value||0);re();});});
  Array.prototype.forEach.call(body.querySelectorAll('input[data-tk]'),function(i2){i2.addEventListener('change',function(){var T=csTrans();if(i2.value==='') delete T.n[i2.getAttribute('data-tk')];else T.n[i2.getAttribute('data-tk')]=Math.max(0,Math.round(+i2.value||0));re();});});
  if($('csTripRate')) $('csTripRate').addEventListener('change',function(){csTrans().rate=Math.max(0,+this.value||0);re();});
  Array.prototype.forEach.call(body.querySelectorAll('input[data-en]'),function(i2){i2.addEventListener('change',function(){csExtras()[+i2.getAttribute('data-en')][0]=i2.value;re();});});
  Array.prototype.forEach.call(body.querySelectorAll('input[data-ea]'),function(i2){i2.addEventListener('change',function(){csExtras()[+i2.getAttribute('data-ea')][1]=Math.max(0,+i2.value||0);re();});});
  Array.prototype.forEach.call(body.querySelectorAll('button[data-ed]'),function(b){b.addEventListener('click',function(){csExtras().splice(+b.getAttribute('data-ed'),1);re();});});
  if($('csAddLine')) $('csAddLine').addEventListener('click',function(){csExtras().push(['New item',0]);re();});
}
var _csCost=renderCost;renderCost=function(){_csCost.apply(this,arguments);if(CS.open) csRender();};
if(window.__ed){window.__ed.csData=csData;window.__ed.csOpen=csOpen;window.__ed.csClose=csClose;}
