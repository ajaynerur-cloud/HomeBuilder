/* ---------- compare materials and cost: your design (A) against an option you set up (B) ---------- */
var CMP_KEYS=['wallOut','wallIn','sys','cover','finish','brick','tube','studSp','wpcT','wetOut'];
function cmpRates(){if(!ST.matRates||typeof ST.matRates!=='object') ST.matRates={};MATRATES.forEach(function(m){if(!(+ST.matRates[m[0]]>=0)) ST.matRates[m[0]]=m[3];});return ST.matRates;}
var CMP_SPECS=['winFrame','winGlass','woodT','mainDoor','inDoor','floorF'];
function cmpB(){if(!ST.cmpB||typeof ST.cmpB!=='object'){ST.cmpB={};CMP_KEYS.forEach(function(k){ST.cmpB[k]=ST[k];});}if(!ST.cmpB.spec||typeof ST.cmpB.spec!=='object'){ST.cmpB.spec={};CMP_SPECS.forEach(function(k){ST.cmpB.spec[k]=specOf(ST,k).v;});}if(ST.cmpB.wallOut==='glass'&&ST.cmpB.sys==='brick') ST.cmpB.sys='ms';return ST.cmpB;}
function cmpState(B){var S=Object.assign({},ST,B);S.spec=Object.assign({},ST.spec,B.spec||{});if(S.wetOut) S.att=0;return S;}
function cmpCalc(S){var pl=planFor(S),r=costFor(pl,S,S.sys,S.finish,S.region),rates=cmpRates(),rows={},mc=0;
  (r.mat?r.mat.rows:[]).forEach(function(x){var k=x[0];if(!rows[k]) rows[k]={item:x[0],unit:x[2],qty:0,key:x[4]};rows[k].qty+=+x[1]||0;});
  Object.keys(rows).forEach(function(k){var w=rows[k];w.cost=w.key&&rates[w.key]!=null?w.qty*rates[w.key]:null;if(w.cost!=null) mc+=w.cost;});
  return {rows:rows,matCost:mc,total:r.total,months:r.months,pl:pl};}
function renderCompare(){
  var el=$('cmpCard');if(!el) return;var B=cmpB(),rates=cmpRates(),A=cmpCalc(ST),Bc=cmpCalc(cmpState(B));
  var opt=function(k,label,list){return '<label>'+label+'<select class="mat-in" data-ck="'+k+'">'+list.map(function(o){return '<option value="'+o[0]+'"'+(String(o[0])===String(B[k])?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')+'</select></label>';};
  var finName=function(f){return f<0.9?'Basic':f<1.1?'Standard':'Premium';};
  var h='<p class="hint">Option A is your design. Set up Option B and compare quantities and cost. Unit prices are editable and apply to both.</p><div class="cmp-set">';
  h+=opt('wallOut','Outer walls',WALL_OUT.map(function(w){return [w.v,w.n];}))+opt('wallIn','Inner walls',WALL_IN.map(function(w){return [w.v,w.n];}))+opt('sys','Structure',SYSTEMS.map(function(s2){return [s2.v,s2.n];}).filter(function(o){return !(o[0]==='brick'&&B.wallOut==='glass');}));
  if(ST.shape!=='flat') h+=opt('cover','Roof cover',COVERS.map(function(c){return [c.v,c.n];}));
  h+=opt('finish','Finish',[[0.85,'Basic'],[1,'Standard'],[1.3,'Premium']])+opt('brick','Clay brick size',BRICKS.filter(function(b){return b.v!=='fly';}).map(function(b){return [b.v,b.n];}));
  if(B.wallIn==='gyp'||B.wallIn==='wpc') h+=opt('tube','MS tube',MS_TUBES.map(function(t){return [t.v,t.a+' × '+t.a+' × '+t.t.toFixed(1)+' mm'];}))+opt('studSp','Stud spacing',[[400,'400 mm'],[600,'600 mm']]);
  if(B.wallIn==='wpc') h+=opt('wpcT','WPC board',WPC_T.map(function(t){return [t,t+' mm'];}));
  h+=opt('wetOut','Bath and WC',[['false','Inside the house'],['true','Separate block outside']]);
  CMP_SPECS.forEach(function(k){var sp=SPECS.filter(function(x){return x.k===k;})[0];h+='<label>'+esc(sp.n)+'<select class="mat-in" data-cs="'+k+'">'+sp.o.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===B.spec[k]?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')+'</select></label>';});
  h+='</div>';
  h+='<div class="bud-row"><button class="b" type="button" id="cmpCopy">Copy my design to B</button><button class="b pri" type="button" id="cmpUse">Use Option B for my design</button></div>';
  var keys=[];Object.keys(A.rows).concat(Object.keys(Bc.rows)).forEach(function(k){if(keys.indexOf(k)<0) keys.push(k);});
  var money=function(v){return v==null?'—':'₹'+num(Math.round(v));},dq=function(v){return (v>0?'+':'')+num(Math.round(v*10)/10);},cls=function(v){return Math.abs(v)<0.5?'':v<0?' cmp-less':' cmp-more';};
  h+='<div class="cmp-wrap"><table class="mat-tab cmp-tab"><tr><th>Material</th><th>Unit</th><th class="num">A</th><th class="num">B</th><th class="num">Difference</th><th class="num">Unit price ₹</th><th class="num">Cost A</th><th class="num">Cost B</th><th class="num">Difference</th></tr>';
  keys.forEach(function(k){var a=A.rows[k]||{qty:0,cost:0},b=Bc.rows[k]||{qty:0,cost:0},ref=A.rows[k]||Bc.rows[k],dQ=b.qty-a.qty,ca=a.cost||0,cb=b.cost||0,hasRate=!!ref.key&&rates[ref.key]!=null;
    h+='<tr><td>'+esc(ref.item)+'</td><td>'+esc(ref.unit)+'</td><td class="num">'+num(a.qty)+'</td><td class="num">'+num(b.qty)+'</td><td class="num'+cls(dQ)+'">'+(Math.abs(dQ)<0.05?'·':dq(dQ))+'</td><td class="num">'+(hasRate?'<input class="cmp-rate" type="number" min="0" step="0.5" data-rk="'+ref.key+'" value="'+rates[ref.key]+'">':'')+'</td><td class="num">'+(hasRate?money(ca):'')+'</td><td class="num">'+(hasRate?money(cb):'')+'</td><td class="num'+cls(cb-ca)+'">'+(hasRate?(Math.abs(cb-ca)<0.5?'·':(cb>ca?'+':'−')+money(Math.abs(cb-ca)).slice(0)):'')+'</td></tr>';});
  var d1=Bc.matCost-A.matCost,d2=Bc.total-A.total,d3=Bc.months-A.months;
  h+='<tr class="cmp-sum"><td colspan="6"><b>Materials listed</b></td><td class="num"><b>'+money(A.matCost)+'</b></td><td class="num"><b>'+money(Bc.matCost)+'</b></td><td class="num'+cls(d1)+'"><b>'+(d1>=0?'+':'−')+money(Math.abs(d1))+'</b></td></tr>';
  h+='<tr class="cmp-sum"><td colspan="6"><b>Whole estimate</b> (labour, structure, services and everything else)</td><td class="num"><b>'+lakh(A.total)+'</b></td><td class="num"><b>'+lakh(Bc.total)+'</b></td><td class="num'+cls(d2)+'"><b>'+(d2>=0?'+':'−')+lakh(Math.abs(d2))+'</b></td></tr>';
  h+='<tr class="cmp-sum"><td colspan="6">Build time</td><td class="num">'+A.months.toFixed(1)+' months</td><td class="num">'+Bc.months.toFixed(1)+' months</td><td class="num'+cls(d3*100)+'">'+(Math.abs(d3)<0.05?'·':(d3>0?'+':'−')+Math.abs(d3).toFixed(1))+'</td></tr></table></div>';
  h+='<p class="hint">Materials listed are the walls, roof covering, flooring, windows, doors and wood, with mortar and plaster. The whole estimate also covers foundations, structure, doors, windows, services and labour. Prices vary by town and season; type your local prices in.</p>';
  el.innerHTML=h;
  Array.prototype.forEach.call(el.querySelectorAll('select[data-ck]'),function(s2){s2.addEventListener('change',function(){var k=s2.getAttribute('data-ck'),v=s2.value;B[k]=k==='finish'||k==='studSp'||k==='wpcT'?+v:k==='wetOut'?v==='true':v;save();renderCompare();});});
  Array.prototype.forEach.call(el.querySelectorAll('select[data-cs]'),function(s2){s2.addEventListener('change',function(){B.spec[s2.getAttribute('data-cs')]=s2.value;save();renderCompare();});});
  Array.prototype.forEach.call(el.querySelectorAll('input[data-rk]'),function(i2){i2.addEventListener('change',function(){rates[i2.getAttribute('data-rk')]=Math.max(0,+i2.value||0);save();renderCompare();});});
  $('cmpCopy').addEventListener('click',function(){CMP_KEYS.forEach(function(k){B[k]=ST[k];});CMP_SPECS.forEach(function(k){B.spec[k]=specOf(ST,k).v;});save();renderCompare();});
  $('cmpUse').addEventListener('click',function(){CMP_KEYS.forEach(function(k){ST[k]=B[k];});CMP_SPECS.forEach(function(k){ST.spec[k]=B.spec[k];});if(ST.wetOut) ST.att=0;update();});
}
