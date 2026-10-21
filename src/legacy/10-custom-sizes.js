/* ---------- custom sizes editor ---------- */
var customSig='';
function curProg(){return program(normCfg(ST));}
function customFromPlan(pl){
  var par=pl.par,pr=program(Object.assign({},pl.cfg,{custom:undefined})),lens={};
  pl.rooms.forEach(function(r){
    var k=r.key,inN=pr.N.some(function(x){return x.key===k;}),inS=pr.S.some(function(x){return x.key===k;}),inW=pr.W.some(function(x){return x.key===k;});
    if(inN||inS) lens[k]=r.w;else if(inW) lens[k]=r.h;
  });
  return {on:true,k:par.k,cw:pl.court.w,ch:pl.court.h,tn:par.tn,ts:par.ts,tw:par.tw,te:par.te,lens:lens};
}
function cInput(label,attr,step,min,max){return '<label class="cfld"><span>'+label+'</span><input type="number" '+attr+' step="'+step+'" min="'+min+'" max="'+max+'"></label>';}
function buildCustomEditor(){
  var pr=curProg(),sig=[pr.N,pr.S,pr.W].map(function(l){return l.map(function(r){return r.key;}).join(',');}).join('|')+'|'+(ST.custom.k>0?'c':'p');
  if(sig===customSig) return;
  customSig=sig;
  var h='';
  h+='<div class="cwing">Courtyard and pathway</div>';
  h+=cInput('Pathway width around courtyard (ft, 0 for none)','data-f="k"',0.5,0,8);
  h+='<label class="cfld two"><span>Courtyard width × depth (ft)</span><input type="number" data-f="cw" step="0.5" min="3" max="40"><input type="number" data-f="ch" step="0.5" min="3" max="40"></label>';
  function wing(title,df,dl,list,unit,autoSet){
    h+='<div class="cwing">'+title+'</div>';
    h+=cInput(dl,'data-f="'+df+'"',0.5,6,24);
    list.forEach(function(r,i){
      var auto=autoSet?autoSet.indexOf(r.key)>=0:(i===list.length-1);
      if(!auto) h+=cInput(r.n+' '+unit+' (ft)','data-l="'+r.key+'"',0.5,2,40);
      else h+='<div class="cnote">'+r.n+' takes the rest: <b data-rest="'+r.key+'"></b></div>';
    });
  }
  wing('North rooms (side by side, west to east)','tn','Depth of north rooms (ft)',pr.N,'width');
  var liS=pr.S.map(function(r){return r.key;}).indexOf('lobby'),S2=pr.S.filter(function(r){return r.key!=='lobby';}),autoS=liS>=0?[pr.S[liS-1].key,'kitchen']:['kitchen'];
  wing('South rooms (west to east'+(liS>=0?', the back lobby is fixed at 5 ft':'')+')','ts','Depth of south rooms (ft)',S2,'width',autoS);
  wing('West rooms (north to south)','tw','Depth of west rooms (ft)',pr.W,'length');
  h+='<div class="cwing">East room</div>'+cInput('Depth of east room (ft)','data-f="te"',0.5,6,24)+'<div class="cnote">Dining fills the length between the north and south rooms.</div>';
  h+='<div class="cnote" id="customInfo"></div><div class="cwarn" id="customWarn"></div>';
  h+='<div class="btns"><button type="button" class="b" id="customReset">Start again from the optimised sizes</button></div>';
  $('customBox').innerHTML=h;
  $('customReset').addEventListener('click',function(){
    var base=Object.assign({},ST,{custom:null}),pl=planFor(base);
    ST.custom=customFromPlan(pl);customSig='';update();
  });
}
$('customBox').addEventListener('input',function(e){
  var t=e.target;if(!t||!ST.custom) return;
  var v=parseFloat(t.value);if(isNaN(v)) return;
  var f=t.getAttribute('data-f'),l=t.getAttribute('data-l');
  if(f) ST.custom[f]=v;else if(l){ST.custom.lens=ST.custom.lens||{};ST.custom.lens[l]=v;}
  update();
});
function syncCustom(){
  var on=!!(ST.custom&&ST.custom.on);
  $('customBox').style.display=on?'':'none';
  Array.prototype.forEach.call($('segCustom').children,function(b){b.setAttribute('aria-pressed',String((b.getAttribute('data-v')==='1')===on));});
  $('area').disabled=on;$('segSize').querySelectorAll('button').forEach(function(b){b.disabled=on;});
  $('segCorr').querySelectorAll('button').forEach(function(b){b.disabled=on;});
  if(!on){$('customHint').textContent='The planner picks sizes for your area and room list.';return;}
  buildCustomEditor();
  var pl=planBase(ST),ae=document.activeElement;
  Array.prototype.forEach.call($('customBox').querySelectorAll('input'),function(i){
    if(i===ae) return;
    var f=i.getAttribute('data-f'),l=i.getAttribute('data-l'),v=f?ST.custom[f]:(ST.custom.lens&&ST.custom.lens[l]);
    if(v===undefined){var rr=pl.rooms.filter(function(r){return r.key===l;})[0];if(rr){var pr=curProg(),isW=pr.W.some(function(x){return x.key===l;});v=isW?rr.h:rr.w;}}
    if(v!==undefined) i.value=v;
  });
  Array.prototype.forEach.call($('customBox').querySelectorAll('[data-rest]'),function(b){
    var rr=pl.rooms.filter(function(r){return r.key===b.getAttribute('data-rest');})[0];
    if(rr){var pr=curProg(),isW=pr.W.some(function(x){return x.key===rr.key;});b.textContent=f1(isW?rr.h:rr.w)+' ft';}
  });
  $('customInfo').textContent='Footprint '+pl.W+' × '+pl.D+' ft = '+num(pl.area)+' sq ft. Built-up '+num(pl.builtup)+' sq ft.';
  var wr=pl.warn.slice();
  pl.sched.forEach(function(r){if(r.fit==='small') wr.push(r.n+' is below a usable size ('+f1(r.a)+' sq ft).');});
  if(pl.noDoor.length) wr.push('No door could be placed for '+pl.noDoor.join(', ')+'.');
  $('customWarn').textContent=wr.join(' ');
  $('customHint').textContent='Type your own sizes. The 3D model and the plan change as you type.';
}
segBuild('segCustom',[{v:0,n:'Optimised for me'},{v:1,n:'I enter the sizes'}],'customMode');
Array.prototype.forEach.call($('segCustom').children,function(b){
  b.onclick=function(){
    var want=b.getAttribute('data-v')==='1';
    if(want){
      var pl0=planFor(ST);
      if(!ST.custom) ST.custom=customFromPlan(pl0);else{ST.custom.on=true;}
      if(!ST.custom.lens||Object.keys(ST.custom.lens).length===0) ST.custom=customFromPlan(pl0);
      ST.custom.on=true;
    }else if(ST.custom){ST.custom.on=false;}
    customSig='';update();
  };
});
segBuild('segJag',[{v:0,n:'None'},{v:1,n:'Jagali'}],'jagMode');
Array.prototype.forEach.call($('segJag').children,function(b){b.onclick=function(){ST.jag.on=(b.getAttribute('data-v')==='1');update();};});
$('jagH').addEventListener('change',function(){ST.jag.h=+this.value;update();});
$('jagD').addEventListener('input',function(){var v=parseFloat(this.value);if(!isNaN(v)){ST.jag.d=v;update();}});
$('jagL').firstChild.addEventListener('click',function(){ST.jag.ledges=!ST.jag.ledges;update();});
Array.prototype.forEach.call($('jagSides').children,function(b){b.onclick=function(){var k=b.getAttribute('data-k');ST.jag.sides[k]=!ST.jag.sides[k];update();};});
Array.prototype.forEach.call($('segExit').children,function(b){b.onclick=function(){var k=b.getAttribute('data-k');ST.exits[k]=!ST.exits[k];update();};});
$('backOff').addEventListener('input',function(){ST.backOff=parseFloat(this.value);update();});
function sightText(pl){
  if(!ST.exits.s) return 'Turn on the back exit to choose how the back door lines up with the front door.';
  var sg=pl.sight;
  if(!sg) return 'The back exit does not fit this layout. Try a larger footprint or a narrower pathway.';
  var o=sg.offset,ao=Math.abs(o),t;
  t=ao<0.5?'The back door is in a straight line with the front door. Vastu advises a small shift.':'The back door is '+f1(ao)+' ft '+(o>0?'east':'west')+' of the front door line.';
  t+=sg.visible?' You can see from one door to the other through the courtyard.':' The two doors cannot see each other: a wall blocks the line. Try a smaller shift.';
  if(Math.abs(o-ST.backOff)>0.75) t+=' The layout limits the shift to '+f1(ao)+' ft. A wider entry hall (a larger area) allows more.';
  var miss=[];
  if(ST.jag.on){
    if(ST.exits.s&&!ST.jag.sides.s) miss.push('back');
  }
  return t;
}
Array.prototype.forEach.call($('jagSplit').children,function(b){b.onclick=function(){ST.jag.split.on=(b.getAttribute('data-v')==='1');update();};});
Array.prototype.forEach.call($('splitScope').children,function(b){b.onclick=function(){ST.jag.split.scope=b.getAttribute('data-v');update();};});
Array.prototype.forEach.call($('splitSteps').children,function(b){b.onclick=function(){ST.jag.split.steps=+b.getAttribute('data-v');update();};});
$('splitH').addEventListener('change',function(){ST.jag.split.h=+this.value;update();});
var oldClamp=clampState;
clampState=function(){oldClamp();if(ST.custom&&ST.custom.on){ST.custom.k=cl(ST.custom.k,0,8,3);}};

