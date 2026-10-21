/* ---------- drawing tools: draw a wall to a set length, measure, and construction marker points ---------- */
var DT={start:null,hover:null,measures:[],mStart:null,selMk:null,dragMk:null,lockO:null};
function dtParse(t){
  t=String(t||'').trim().toLowerCase().replace(/\s+/g,'');if(!t) return NaN;
  var m;
  if((m=t.match(/^(-?\d+(?:\.\d+)?)mm$/))) return +m[1]/304.8;
  if((m=t.match(/^(-?\d+(?:\.\d+)?)cm$/))) return +m[1]/30.48;
  if((m=t.match(/^(-?\d+(?:\.\d+)?)m$/))) return +m[1]/0.3048;
  if((m=t.match(/^(-?\d+(?:\.\d+)?)(?:'|ft)(?:(\d+(?:\.\d+)?)(?:"|in)?)?$/))) return +m[1]+(m[2]?+m[2]/12:0);
  if((m=t.match(/^(\d+(?:\.\d+)?)(?:"|in)$/))) return +m[1]/12;
  if((m=t.match(/^-?\d+(?:\.\d+)?$/))) return +t;
  return NaN;
}
function dtFt(v){var neg=v<0;v=Math.abs(v);var f=Math.floor(v+1e-9),i=Math.round((v-f)*12);if(i===12){f++;i=0;}return (neg?'-':'')+f+"' "+i+'"';}
function dtM(v){return (v*0.3048).toFixed(2)+' m';}
function dtMarkers(){if(!Array.isArray(ST.markers)) ST.markers=[];return ST.markers;}
function dtNextLabel(){var used={};dtMarkers().forEach(function(m){used[m.n]=1;});for(var i=0;i<52;i++){var n=i<26?String.fromCharCode(65+i):String.fromCharCode(65+i-26)+'2';if(!used[n]) return n;}return 'M'+(dtMarkers().length+1);}
// snap a plan point to markers, wall ends and corners, then the grid; r is the snap radius in feet
function dtSnap(pt,r){
  var pl=planFor(ST),best=null,bd=r,cand=[];
  dtMarkers().forEach(function(m){cand.push({x:m.x,y:m.y,why:'marker '+m.n});});
  try{wallRuns(pl).forEach(function(w){var a=w.o==='H'?[w.a0,w.pos]:[w.pos,w.a0],b=w.o==='H'?[w.a1,w.pos]:[w.pos,w.a1];cand.push({x:a[0],y:a[1],why:'wall end'},{x:b[0],y:b[1],why:'wall end'});});}catch(e){}
  cand.push({x:0,y:0,why:'corner'},{x:pl.W,y:0,why:'corner'},{x:0,y:pl.D,why:'corner'},{x:pl.W,y:pl.D,why:'corner'});
  cand.forEach(function(c){var d=Math.hypot(c.x-pt.x,c.y-pt.y);if(d<bd){bd=d;best=c;}});
  if(best) return {x:best.x,y:best.y,why:best.why};
  var g=EDIT.snap||0.5;return {x:Math.round(pt.x/g)*g,y:Math.round(pt.y/g)*g,why:''};
}
function dtRadius(){var svg=$('plan').querySelector('svg'),m=svg&&svg.getScreenCTM&&svg.getScreenCTM(),pxPerUnit=m?Math.hypot(m.a,m.b):1;return 12/((PV&&PV.s?PV.s:1)*(pxPerUnit||1));}
// the wall the user is drawing: horizontal or vertical from the start, to the pointer or to a typed length
function dtSegment(a,b,len){
  var dx=b.x-a.x,dy=b.y-a.y,o=DT.lockO||(Math.abs(dx)>=Math.abs(dy)?'H':'V'),sign=o==='H'?(dx<0?-1:1):(dy<0?-1:1),L=len!=null?len:Math.abs(o==='H'?dx:dy);
  L=Math.round(L*2)/2;var e=o==='H'?{x:a.x+sign*L,y:a.y}:{x:a.x,y:a.y+sign*L};return {o:o,a:a,b:e,len:L};
}
function dtCommitWall(sg){
  var pl=planFor(ST),o=sg.o,pos=Math.round((o==='H'?sg.a.y:sg.a.x)*2)/2,lim=o==='H'?pl.W:pl.D,a0=Math.round(Math.min(o==='H'?sg.a.x:sg.a.y,o==='H'?sg.b.x:sg.b.y)*2)/2,a1=Math.round(Math.max(o==='H'?sg.a.x:sg.a.y,o==='H'?sg.b.x:sg.b.y)*2)/2;
  a0=Math.max(0,a0);a1=Math.min(lim,a1);if(pos<0||pos>(o==='H'?pl.D:pl.W)||a1-a0<1){edMsg('Walls need to be at least 1 ft long and inside the footprint.');return false;}
  // a wall drawn right across one room splits it, so the rooms follow; anything shorter is a partial wall
  var mid=(a0+a1)/2,cx=o==='H'?mid:pos,cy=o==='H'?pos:mid,part=(pl.parts||pl.rooms.filter(function(r){return r.t!=='court'&&r.t!=='corr'&&!r.hidden;})).filter(function(q){return cx>q.x+EPS&&cx<q.x+q.w-EPS&&cy>q.y+EPS&&cy<q.y+q.h-EPS;})[0];
  if(part){var s0=o==='H'?part.x:part.y,s1=o==='H'?part.x+part.w:part.y+part.h;if(Math.abs(a0-s0)<0.3&&Math.abs(a1-s1)<0.3){var ok=edSplit(o,pos,cx,cy);if(ok){edMsg('Wall drawn across the room: the room is now two rooms.');return true;}}}
  edPush([{t:'fw',o:o,pos:pos,a0:a0,a1:a1}]);edMsg('Wall drawn: '+dtFt(a1-a0)+' long. Walls follow the 6 inch grid of the house.');return true;
}
/* overlay drawn on top of the plan */
function dtOverlay(){
  var svg=$('plan').querySelector('svg');if(!svg||!PV) return;var old=document.getElementById('dtools');if(old&&old.parentNode) old.parentNode.removeChild(old);
  var X=function(x){return (PV.mx+x*PV.s).toFixed(1);},Y=function(y){return (PV.mt+y*PV.s).toFixed(1);},h='';
  var lbl=function(x,y,t,col){return '<text x="'+X(x)+'" y="'+Y(y)+'" font-size="11" font-weight="600" text-anchor="middle" style="fill:'+(col||'var(--ink)')+';paint-order:stroke;stroke:var(--card);stroke-width:4px;stroke-linejoin:round">'+esc(t)+'</text>';};
  DT.measures.forEach(function(ms){var mx=(ms.a.x+ms.b.x)/2,my=(ms.a.y+ms.b.y)/2,d=Math.hypot(ms.b.x-ms.a.x,ms.b.y-ms.a.y);h+='<line x1="'+X(ms.a.x)+'" y1="'+Y(ms.a.y)+'" x2="'+X(ms.b.x)+'" y2="'+Y(ms.b.y)+'" stroke="#1E88E5" stroke-width="1.6" stroke-dasharray="5 3"/><circle cx="'+X(ms.a.x)+'" cy="'+Y(ms.a.y)+'" r="3" fill="#1E88E5"/><circle cx="'+X(ms.b.x)+'" cy="'+Y(ms.b.y)+'" r="3" fill="#1E88E5"/>'+lbl(mx,my-0.4,dtFt(d)+'  ('+dtM(d)+')','#0d5ea8');});
  dtMarkers().forEach(function(m){var sel=DT.selMk===m.id,x=X(m.x),y=Y(m.y);h+='<g data-mk="'+m.id+'" style="cursor:move"><circle cx="'+x+'" cy="'+y+'" r="9" fill="'+(sel?'#ff7a1a':'#7b3fa0')+'" fill-opacity="0.18" stroke="'+(sel?'#ff7a1a':'#7b3fa0')+'" stroke-width="1.6"/><path d="M'+(x-6)+' '+y+'H'+(+x+6)+'M'+x+' '+(y-6)+'V'+(+y+6)+'" stroke="'+(sel?'#ff7a1a':'#7b3fa0')+'" stroke-width="1.6"/><text x="'+(+x+11)+'" y="'+(+y-9)+'" font-size="11" font-weight="700" style="fill:'+(sel?'#c45a10':'#5e2d80')+';paint-order:stroke;stroke:var(--card);stroke-width:4px">'+esc(m.n)+'</text></g>';});
  if(EDIT.mode==='draw'&&DT.start){var a=DT.start,len=dtLenFixed(),b=DT.hover||a,sg=dtSegment(a,b,len);h+='<circle cx="'+X(a.x)+'" cy="'+Y(a.y)+'" r="4" fill="#2851A3"/>';if(sg.len>0){h+='<line x1="'+X(sg.a.x)+'" y1="'+Y(sg.a.y)+'" x2="'+X(sg.b.x)+'" y2="'+Y(sg.b.y)+'" stroke="#2851A3" stroke-width="6" stroke-opacity="0.55" stroke-linecap="round"/>'+lbl((sg.a.x+sg.b.x)/2,(sg.a.y+sg.b.y)/2-0.5,dtFt(sg.len),'#1f3f80');}}
  if(EDIT.mode==='measure'&&DT.mStart){var b2=DT.hover||DT.mStart,d2=Math.hypot(b2.x-DT.mStart.x,b2.y-DT.mStart.y);h+='<line x1="'+X(DT.mStart.x)+'" y1="'+Y(DT.mStart.y)+'" x2="'+X(b2.x)+'" y2="'+Y(b2.y)+'" stroke="#1E88E5" stroke-width="1.6"/>'+lbl((DT.mStart.x+b2.x)/2,(DT.mStart.y+b2.y)/2-0.4,dtFt(d2)+'  ('+dtM(d2)+')','#0d5ea8');}
  if(DT.hover&&(EDIT.mode==='draw'||EDIT.mode==='measure'||EDIT.mode==='marker')) h+='<circle cx="'+X(DT.hover.x)+'" cy="'+Y(DT.hover.y)+'" r="5" fill="none" stroke="'+(DT.hover.why?'#ff7a1a':'#888')+'" stroke-width="1.5"/>'+(DT.hover.why?lbl(DT.hover.x,DT.hover.y+1.3,DT.hover.why,'#c45a10'):'');
  if(!h) return;var g=document.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('id','dtools');g.innerHTML=h;svg.appendChild(g);
}
function dtLenFixed(){var el=$('dtLen');if(!el||!$('dtFix')||!$('dtFix').checked) return null;var v=dtParse(el.value);return isFinite(v)&&v>0?v:null;}
/* options row under the editor's mode buttons */
(function(){
  var seg=$('segEdit');[['draw','Draw wall'],['measure','Measure'],['marker','Marker points']].forEach(function(d){var b=document.createElement('button');b.type='button';b.setAttribute('data-v',d[0]);b.textContent=d[1];b.addEventListener('click',function(){EDIT.mode=d[0];EDIT.sel=null;DT.start=null;DT.mStart=null;edMsg('');redrawPlan();sel3d();edRender();});seg.appendChild(b);});
  var row=document.createElement('div');row.id='dtRow';row.className='edrow dt-row';row.style.display='none';$('edAdd').parentNode.insertBefore(row,$('edAdd').nextSibling);
})();
function dtRenderRow(){
  var row=$('dtRow'),m=EDIT.mode;if(!row) return;row.style.display=(m==='draw'||m==='measure'||m==='marker')?'flex':'none';if(row.style.display==='none') return;
  var keep=document.activeElement&&row.contains(document.activeElement)?document.activeElement.id:null,h='';
  if(m==='draw') h='<label class="dt-f">Length <input id="dtLen" class="dt-in" placeholder="e.g. 10\' 6&quot; or 3.2 m" value="'+esc(DT.len||'')+'"></label><label class="dt-c"><input type="checkbox" id="dtFix"'+(DT.fix?' checked':'')+'> Use this length</label><span class="seg" id="dtOr"><button type="button" data-o="">Auto</button><button type="button" data-o="H">Horizontal</button><button type="button" data-o="V">Vertical</button></span><span class="hint">Click a start point, then click the end or type a length and press Enter. Snaps to markers and wall ends.</span>';
  if(m==='measure') h='<span class="hint">Click two points to measure. Snaps to markers, wall ends and the grid.</span>'+(DT.measures.length?'<button class="b" type="button" id="dtClr">Clear measurements</button>':'')+DT.measures.slice(-4).map(function(ms){var dx=Math.abs(ms.b.x-ms.a.x),dy=Math.abs(ms.b.y-ms.a.y);return '<span class="dt-chip">'+dtFt(Math.hypot(dx,dy))+' · across '+dtFt(dx)+' · along '+dtFt(dy)+'</span>';}).join('');
  if(m==='marker'){var mk=dtMarkers(),sel=mk.filter(function(x){return x.id===DT.selMk;})[0];
    h='<span class="hint">Click the plan to place a marker, drag to move it. Coordinates are measured from the north-west corner.</span><span class="dt-f">Place at <input id="dtMx" class="dt-in s" placeholder="east"> <input id="dtMy" class="dt-in s" placeholder="south"> <button class="b" type="button" id="dtAddXY">Add</button></span>';
    if(mk.length) h+='<span class="dt-f">From <select id="dtFrom" class="dt-in s">'+mk.map(function(x){return '<option value="'+x.id+'"'+(x.id===DT.selMk?' selected':'')+'>'+esc(x.n)+'</option>';}).join('')+'</select> go <input id="dtDist" class="dt-in s" placeholder="10\'"> <select id="dtDir" class="dt-in s"><option value="E">east</option><option value="W">west</option><option value="N">north</option><option value="S">south</option></select> <button class="b" type="button" id="dtAddOff">Add marker</button></span>';
    h+='<div class="dt-list">'+mk.map(function(x){return '<span class="dt-chip'+(x.id===DT.selMk?' on':'')+'" data-sel="'+x.id+'"><b>'+esc(x.n)+'</b> '+dtFt(x.x)+' E, '+dtFt(x.y)+' S <button type="button" class="dt-x" data-del="'+x.id+'" title="Delete">×</button></span>';}).join('')+'</div>';
    if(sel) h+='<span class="hint">Selected '+esc(sel.n)+'. Delete removes it.</span>';}
  row.innerHTML=h;
  if(m==='draw'){var L=$('dtLen');L.addEventListener('input',function(){DT.len=L.value;dtOverlay();});L.addEventListener('keydown',function(e){if(e.key==='Enter'&&DT.start){var v=dtParse(L.value);if(isFinite(v)&&v>0){var sg=dtSegment(DT.start,DT.hover||{x:DT.start.x+1,y:DT.start.y},v);if(dtCommitWall(sg)) DT.start=null;dtOverlay();}else edMsg('Type a length such as 10\' 6", 10.5 or 3.2 m.');}});
    $('dtFix').addEventListener('change',function(){DT.fix=this.checked;dtOverlay();});
    Array.prototype.forEach.call($('dtOr').children,function(b){b.setAttribute('aria-pressed',String((DT.lockO||'')===b.getAttribute('data-o')));b.addEventListener('click',function(){DT.lockO=b.getAttribute('data-o')||null;dtRenderRow();dtOverlay();});});}
  if(m==='measure'&&$('dtClr')) $('dtClr').addEventListener('click',function(){DT.measures=[];dtRenderRow();dtOverlay();});
  if(m==='marker'){
    $('dtAddXY').addEventListener('click',function(){var x=dtParse($('dtMx').value),y=dtParse($('dtMy').value);if(!isFinite(x)||!isFinite(y)){edMsg('Type both distances, for example 12\' and 8\' 6".');return;}dtAddMarker(x,y);});
    if($('dtAddOff')) $('dtAddOff').addEventListener('click',function(){var f=dtMarkers().filter(function(x){return x.id===$('dtFrom').value;})[0],d=dtParse($('dtDist').value),dir=$('dtDir').value;if(!f||!isFinite(d)){edMsg('Pick a marker and type a distance.');return;}dtAddMarker(f.x+(dir==='E'?d:dir==='W'?-d:0),f.y+(dir==='S'?d:dir==='N'?-d:0));});
    Array.prototype.forEach.call(row.querySelectorAll('[data-del]'),function(b){b.addEventListener('click',function(e){e.stopPropagation();dtDelMarker(b.getAttribute('data-del'));});});
    Array.prototype.forEach.call(row.querySelectorAll('[data-sel]'),function(c){c.addEventListener('click',function(){DT.selMk=c.getAttribute('data-sel');dtRenderRow();dtOverlay();});});
  }
  if(keep&&$(keep)) $(keep).focus();
}
function dtAddMarker(x,y){var pl=planFor(ST);x=Math.max(-20,Math.min(pl.W+20,x));y=Math.max(-20,Math.min(pl.D+20,y));var m={id:'mk'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),n:dtNextLabel(),x:+x.toFixed(4),y:+y.toFixed(4)};dtMarkers().push(m);DT.selMk=m.id;save();dtRenderRow();dtOverlay();edMsg('Marker '+m.n+' placed at '+dtFt(m.x)+' east, '+dtFt(m.y)+' south of the north-west corner.');return m;}
function dtDelMarker(id){ST.markers=dtMarkers().filter(function(x){return x.id!==id;});if(DT.selMk===id) DT.selMk=null;save();dtRenderRow();dtOverlay();}
/* pointer and keys */
$('plan').addEventListener('pointerdown',function(ev){
  var m=EDIT.mode;if((m!=='draw'&&m!=='measure'&&m!=='marker')||ev.button>0||PANMODE) return;
  var raw=planPt(ev);if(!raw) return;var pt=dtSnap(raw,dtRadius());
  if(m==='marker'){var g=ev.target.closest&&ev.target.closest('[data-mk]');if(g){DT.selMk=g.getAttribute('data-mk');DT.dragMk={id:DT.selMk,moved:false};dtRenderRow();dtOverlay();return;}dtAddMarker(pt.x,pt.y);return;}
  if(m==='measure'){if(!DT.mStart){DT.mStart=pt;}else{DT.measures.push({a:DT.mStart,b:pt});DT.mStart=null;dtRenderRow();}dtOverlay();return;}
  if(!DT.start){DT.start=pt;var fl=dtLenFixed();if(fl){DT.hover=pt;}dtOverlay();var L=$('dtLen');if(L&&!DT.fix) setTimeout(function(){L.focus();L.select();},0);return;}
  var sg=dtSegment(DT.start,pt,dtLenFixed());if(sg.len>=1&&dtCommitWall(sg)){DT.start=null;}dtOverlay();
});
document.addEventListener('pointermove',function(ev){
  var m=EDIT.mode;if(m!=='draw'&&m!=='measure'&&m!=='marker') return;var raw=planPt(ev);if(!raw) return;
  if(DT.dragMk){var mk=dtMarkers().filter(function(x){return x.id===DT.dragMk.id;})[0];if(mk){var p=dtSnap(raw,0.0001);mk.x=p.x;mk.y=p.y;DT.dragMk.moved=true;dtOverlay();}return;}
  if(!$('plan').contains(ev.target)) return;DT.hover=dtSnap(raw,dtRadius());dtOverlay();
});
document.addEventListener('pointerup',function(){if(DT.dragMk){if(DT.dragMk.moved){save();dtRenderRow();}DT.dragMk=null;}});
document.addEventListener('keydown',function(e){
  var m=EDIT.mode,tg=(e.target&&e.target.tagName)||'';if(m!=='draw'&&m!=='measure'&&m!=='marker') return;
  if(e.key==='Escape'){DT.start=null;DT.mStart=null;dtOverlay();}
  if((e.key==='Delete'||e.key==='Backspace')&&m==='marker'&&DT.selMk&&!/INPUT|SELECT|TEXTAREA/.test(tg)){e.preventDefault();dtDelMarker(DT.selMk);}
  if(/INPUT|SELECT|TEXTAREA/.test(tg)) return;
  if(m==='draw'&&DT.start&&/^[0-9]$/.test(e.key)){var L=$('dtLen');if(L){L.value='';L.focus();}}
});
/* keep the overlay, options row and hints in step with the editor */
var _dtDraw=drawPlan;drawPlan=function(pl){_dtDraw(pl);dtOverlay();};
var _dtSync=edSync;edSync=function(){_dtSync();dtRenderRow();};
var _dtHint=edHint;edHint=function(){_dtHint();var m=EDIT.mode,t={draw:'Draw wall: click a start point, then click the end, or type a length and press Enter. Walls run across or along the house and snap to marker points, wall ends and the grid. A wall drawn right across a room splits it into two rooms.',measure:'Measure: click two points. The distance, and its parts across and along, stay on the plan until you clear them.',marker:'Marker points are construction points: place them by clicking, by coordinates, or at a set distance from another marker, then measure from them and draw walls to them.'}[m];if(t&&!$('editHint').getAttribute('data-msg')) $('editHint').textContent=t;};
if(window.__ed){window.__ed.DT=DT;window.__ed.dtParse=dtParse;window.__ed.dtCommitWall=dtCommitWall;window.__ed.dtAddMarker=dtAddMarker;window.__ed.dtSegment=dtSegment;window.__ed.pv=function(){return PV;};window.__ed.costFor=costFor;}

/* split jagali: optional steps up to each platform wing (off by default) */
Array.prototype.forEach.call($('splitWing').children,function(b){b.addEventListener('click',function(){ST.jag.split=ST.jag.split||{};ST.jag.split.wingSteps=(b.getAttribute('data-v')==='1');update();});});
var _dtSync2=syncControls;syncControls=function(){_dtSync2();var on=!!(ST.jag&&ST.jag.split&&ST.jag.split.wingSteps);Array.prototype.forEach.call($('splitWing').children,function(b){b.setAttribute('aria-pressed',String((b.getAttribute('data-v')==='1')===on));});};
