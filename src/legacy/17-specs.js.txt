/* ---------- finishes, fittings and add-ons controls ---------- */
function specSeg(id,k){
  var el=$(id);if(!el) return;var sp=SPECS.filter(function(x){return x.k===k;})[0];
  if(!el.children.length){el.innerHTML=sp.o.map(function(o){return '<button type="button" data-sv="'+o[0]+'">'+esc(o[1])+'</button>';}).join('');Array.prototype.forEach.call(el.children,function(b){b.addEventListener('click',function(){ST.spec[k]=b.getAttribute('data-sv');update();});});}
  var cur=specOf(ST,k).v;Array.prototype.forEach.call(el.children,function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-sv')===cur));});
}
function renderWinDoor(){
  specSeg('segWinF','winFrame');specSeg('segWood','woodT');specSeg('segMainD','mainDoor');
  var wf=specOf(ST,'winFrame').v,idr=specOf(ST,'inDoor').v,md=specOf(ST,'mainDoor').v,woodUsed=wf==='wood'||idr==='panel'||idr==='flush';
  if($('woodRow')) $('woodRow').style.display=woodUsed?'':'none';
  if($('winHint')) $('winHint').textContent={wood:'Wooden frames and shutters: traditional, repairable, need polish every few years.',upvc:'uPVC frames: no painting, termite-proof, good seals against dust and rain, and quieter. Choose white or wood-grain finish.',alu:'Aluminium sliding windows: slim and low cost, but they let in more heat and noise.',steel:'MS steel windows: the lowest cost and strong, but they need painting against rust.'}[wf]+(woodUsed?' Wood below sets the timber for '+[wf==='wood'?'window frames':'',idr==='panel'?'panel doors':idr==='flush'?'door frames':''].filter(Boolean).join(' and ')+'.':'')+(md==='teak'||md==='sal'?' Main door: solid '+md+'.':'');
}
function renderSpecs(){
  try{renderWinDoor();}catch(e){}
  var g=$('specGrid'),a=$('specAdd');if(!g||!a) return;
  if(!g.children.length){g.innerHTML=SPECS.map(function(sp){return '<label class="spec-f"><span>'+esc(sp.n)+'</span><select class="mat-in" data-spec="'+sp.k+'">'+sp.o.map(function(o){return '<option value="'+o[0]+'">'+esc(o[1])+'</option>';}).join('')+'</select></label>';}).join('');
    Array.prototype.forEach.call(g.querySelectorAll('select[data-spec]'),function(s2){s2.addEventListener('change',function(){ST.spec[s2.getAttribute('data-spec')]=s2.value;update();});});
    a.innerHTML=ADDONS.map(function(ad){return '<label class="spec-c"><input type="checkbox" data-add="'+ad[0]+'"> '+esc(ad[1])+(ad[0]==='compound'?' <input id="compFt" class="mat-in s" type="number" min="0" step="10" style="width:80px"> running ft':'')+'</label>';}).join('');
    Array.prototype.forEach.call(a.querySelectorAll('input[data-add]'),function(c){c.addEventListener('change',function(){ST.addons[c.getAttribute('data-add')]=c.checked;update(true);});});
    $('compFt').addEventListener('change',function(){ST.compoundFt=+this.value||0;if(ST.compoundFt>0) ST.addons.compound=true;update(true);});}
  Array.prototype.forEach.call(g.querySelectorAll('select[data-spec]'),function(s2){s2.value=specOf(ST,s2.getAttribute('data-spec')).v;});
  Array.prototype.forEach.call(a.querySelectorAll('input[data-add]'),function(c){c.checked=!!ST.addons[c.getAttribute('data-add')];});if(document.activeElement!==$('compFt')) $('compFt').value=ST.compoundFt;
  var cur=$('specGrid').querySelector('select[data-spec="curtains"]');if(cur) cur.parentNode.title=wallSel(ST).out==='glass'?'Full-height curtains along the glass walls':'Curtains on the windows';
}
