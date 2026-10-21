/* ---------- layout editor: walls, doors, windows, rooms ---------- */
var EDIT={mode:'off',sel:null,chip:'door3',orient:'auto',newDoor:true,snap:0.5,grid:false,stack:[],redo:[],lastKey:'',reselect:null};
var CHIPS={door3:{n:'Door 3 ft',w:3,k:'door'},door4:{n:'Wide door 4 ft',w:4,k:'door'},arch4:{n:'Open arch 4 ft',w:4,k:'open'},win3:{n:'Window 3 ft',w:3,k:'win'},win4:{n:'Window 4 ft',w:4,k:'win'},vent:{n:'Ventilator 1.5 ft',w:1.5,k:'vent'}};
var PV=null,pickObjs=[],selObjs=[],X3=null,DRAG=null,GH=null,dragJust=false,WD=null,AD=null,pend=null;
function snapV(v){return Math.round(v/EDIT.snap)*EDIT.snap;}
function edCur(){var b=planBase(ST),e=ST.edits;if(!e||e.key!==b.key) return {key:b.key,ops:[]};return {key:e.key,ops:(e.ops||[]).slice()};}
function edMsg(t){$('editHint').setAttribute('data-msg',t||'');edHint();}
function edCommit(e,re){
  EDIT.stack.push(JSON.stringify(ST.edits));if(EDIT.stack.length>60) EDIT.stack.shift();
  EDIT.redo=[];ST.edits=e.ops.length?e:null;EDIT.sel=null;EDIT.reselect=re||null;
  $('editHint').setAttribute('data-msg','');update();
}
function edPush(ops,re){var e=edCur();ops.forEach(function(o){e.ops.push(o);});edCommit(e,re);}
function findOpening(pl,key){return pl.doors.concat(winList(pl)).filter(function(d){return doorKey(d)===key;})[0];}
function edRemoveWall(id){
  var r=wallRuns(planFor(ST)).filter(function(x){return x.id===id;})[0];if(!r) return;
  if(r.units.some(function(u){return u.k==='main';})){edMsg('This wall holds the main entrance, so it stays. Move the entrance door instead, or remove the walls beside it.');return;}
  edPush([{t:'rm',o:r.o,p:r.p,i0:r.i0,i1:r.i1}]);
}
function edRestore(id){
  var g=(planFor(ST).ghosts||[]).filter(function(x){return x.id===id;})[0];if(!g) return;
  edPush([{t:'aw',o:g.o,p:g.p,i0:g.i0,i1:g.i1}]);
}
function edMoveWall(id,d){
  var pl=planFor(ST),r=wallRuns(pl).filter(function(x){return x.id===id;})[0];if(!r) return false;
  var mi=runMove(pl,r);if(!mi.ok){edMsg(mi.msg);return false;}
  d=Math.max(mi.lo,Math.min(mi.hi,d));
  if(Math.abs(d)<0.01){edMsg('One of the rooms would become narrower than 2.5 ft, so the wall cannot go further.');return false;}
  edPush([{t:'mv',o:r.o,pos:r.pos,a0:mi.a0,a1:mi.a1,d:d}],{o:r.o,pos:r.pos+d,a0:mi.a0,a1:mi.a1});return true;
}
function edSplit(o,pos,x,y){
  var pl=planFor(ST),parts=planParts(pl),L=splitLimits(parts,o,x,y);
  if(!L){edMsg('This room is too small to split. Each part needs at least 2.5 ft.');return false;}
  pos=Math.max(L.lo,Math.min(L.hi,snapV(pos)));
  var room=roomAt(pl,x,y),dw=EDIT.newDoor?((room&&room.t==='wet')?2.5:3):0;
  edPush([{t:'sp',o:o,pos:pos,x:x,y:y,dw:dw}]);return true;
}
function edPlaceOpening(sn){edPush([{t:'dadd',d:{o:sn.o,pos:sn.pos,a0:sn.a0,a1:sn.a1,k:sn.k}}]);}
function edDeleteOpening(key){edPush([{t:'ddel',key:key}]);}
function edMoveOpening(key,sn){
  var d=findOpening(planFor(ST),key),nd={o:sn.o,pos:sn.pos,a0:sn.a0,a1:sn.a1,k:d?d.k:sn.k};
  if(d&&d.exit) nd.exit=d.exit;
  edPush([{t:'ddel',key:key},{t:'dadd',d:nd}]);
}
function edSnap(x,y,w,k,ignoreKey){
  var pl=planFor(ST);
  if(ignoreKey){var e=edCur();e.ops.push({t:'ddel',key:ignoreKey});pl=editedPlan(planBase(ST),e);}
  return snapDoor(pl,x,y,w,k);
}
function edSetWidth(key,w){
  var pl=planFor(ST),d=findOpening(pl,key);if(!d) return;
  var c=(d.a0+d.a1)/2,sn=edSnap(d.o==='H'?c:d.pos,d.o==='H'?d.pos:c,w,d.k,key);
  if(!sn||Math.abs((sn.a0+sn.a1)/2-c)>0.26){edMsg('There is no room for that width here.');edRender();return;}
  edPush([{t:'dw',key:key,w:w}]);
}
function edRename(key,name){
  var r=planFor(ST).rooms.filter(function(x){return x.key===key&&!x.hidden;})[0];if(!r) return;
  name=String(name||'').replace(/[<>]/g,'').slice(0,40).trim();if(!name) return;
  edPush([{t:'rn',x:r.x+r.w/2,y:r.y+r.h/2,n:name}]);
}
function edReselect(pl){
  var rs=EDIT.reselect;if(!rs) return;
  var r=wallRuns(pl).filter(function(x){return x.o===rs.o&&Math.abs(x.pos-rs.pos)<0.02&&x.a0<rs.a1-0.02&&x.a1>rs.a0+0.02;})[0];
  if(r) EDIT.sel={t:'wall',id:r.id};
}
function edUndo(){if(!EDIT.stack.length) return;EDIT.redo.push(JSON.stringify(ST.edits));ST.edits=JSON.parse(EDIT.stack.pop());EDIT.sel=null;update();}
function edRedo(){if(!EDIT.redo.length) return;EDIT.stack.push(JSON.stringify(ST.edits));ST.edits=JSON.parse(EDIT.redo.pop());EDIT.sel=null;update();}
function edSelect(sel){EDIT.sel=sel;redrawPlan();sel3d();edRender();}
function edDeleteSel(){
  var s=EDIT.sel;if(!s) return;
  if(s.t==='wall') edRemoveWall(s.id);
  else if(s.t==='door'||s.t==='win'){var d=findOpening(planFor(ST),s.key);if(d&&d.k==='main'){edMsg('The main entrance cannot be removed.');return;}edDeleteOpening(s.key);}
  else if(s.t==='ghost') edRestore(s.id);
}
/* ---- text and panels ---- */
function edHint(){
  var m=$('editHint').getAttribute('data-msg')||'',pl=planBase(ST),e=ST.edits,t;
  t={off:'Turn on the layout editor to move, add or remove walls and to place doors and windows. Rooms follow the walls: removing a wall merges the rooms, adding a wall splits a room.',
    select:'Tap a wall, door, window or room. Drag a wall sideways to resize the rooms beside it. Use the red × or the Delete key to remove. Tap a dashed red line to put a removed wall back.',
    addwall:'Drag across a room to draw a wall that splits it. The wall runs from side to side of the room. You can also tap a room with Horizontal or Vertical set.',
    door:'Drag a chip onto a wall, or pick a chip and tap a wall. Windows go on outer walls and replace any window they overlap. Drag a door or window to move it, or tap it to change its width.'}[EDIT.mode];
  if(e&&e.key===pl.key) t+=' '+edCount(e)+' edit'+(edCount(e)>1?'s':'')+' applied.';
  else if(e) t+=' Your edits belong to an earlier layout and are hidden. Reset edits to clear them.';
  $('editHint').textContent=(m?m+' ':'')+t;
}
function edSync(){
  Array.prototype.forEach.call($('segEdit').children,function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-v')===EDIT.mode));});
  $('edAdd').style.display=EDIT.mode==='addwall'?'flex':'none';
  $('doorPal').style.display=EDIT.mode==='door'?'flex':'none';
  $('edTools').style.display=EDIT.mode==='off'?'none':'flex';
  Array.prototype.forEach.call($('segOrient').children,function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-v')===EDIT.orient));});
  Array.prototype.forEach.call($('segSnap').children,function(b){b.setAttribute('aria-pressed',String(+b.getAttribute('data-v')===EDIT.snap));});
  Array.prototype.forEach.call($('doorPal').children,function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-d')===EDIT.chip));});
  $('edNewDoor').checked=EDIT.newDoor;$('bGrid').setAttribute('aria-pressed',String(EDIT.grid));
  $('edUndo').disabled=!EDIT.stack.length;$('edRedo').disabled=!EDIT.redo.length;$('edReset').disabled=!ST.edits;
  edHint();
}
function edRender(){edSync();edRenderProps();edRenderChecks();}
function edRenderChecks(){
  var box=$('edChecks'),show=EDIT.mode!=='off'||!!ST.edits;
  box.style.display=show?'block':'none';if(!show){box.innerHTML='';return;}
  var ck=designChecks(planFor(ST),ST),h='<b>Design checks</b> ';
  if(!ck.length) h+='<span class="v-ideal">no issues found</span>';
  else{h+='<span>'+ck.length+' note'+(ck.length>1?'s':'')+'</span><ul>';ck.slice(0,14).forEach(function(c){h+='<li class="lv-'+c.lvl+'">'+esc(c.msg)+'</li>';});h+='</ul>';}
  h+='<p class="hint" style="margin:6px 0 0">Indicative checks only: NBC 2016 minimum room sizes, daylight, access, kitchen and bath adjacency, Vastu zones and spans over removed walls. The structural engineer must confirm the design.</p>';
  box.innerHTML=h;
}
function edRenderProps(){
  var box=$('edProps'),sel=EDIT.sel;
  if(EDIT.mode==='off'||!sel){box.style.display='none';box.innerHTML='';return;}
  if(box.innerHTML&&box.contains(document.activeElement)) return;
  var pl=planFor(ST),h='';
  if(sel.t==='wall'){
    var r=wallRuns(pl).filter(function(x){return x.id===sel.id;})[0];
    if(!r){box.style.display='none';return;}
    var rr=runRooms(pl,r),mi=runMove(pl,r),V=r.o==='V';
    var cl=r.cls==='out'?'Outer wall, 9 in (230 mm)':(r.cls==='ct'?'Courtyard-side wall, 6 in (150 mm)':'Inner wall, 4.5 in (115 mm)');
    var A=rr.A.map(function(x){return x.n;}).join(' + ')||'outside or corridor',B=rr.B.map(function(x){return x.n;}).join(' + ')||'outside or corridor';
    h+='<div><b>Wall</b> · '+cl+' · '+ft(r.len)+' ('+Math.round(r.len*304.8)+' mm)</div>';
    h+='<div>'+(V?'West':'North')+': '+esc(A)+'<br>'+(V?'East':'South')+': '+esc(B)+'</div>';
    h+='<div class="btns wrap"><button class="b" type="button" data-act="rmwall">'+(rr.A.length&&rr.B.length?'Remove wall and merge rooms':'Remove wall')+'</button></div>';
    if(mi.ok){
      h+='<div class="edrow"><label for="edMv" style="margin:0">Move by (ft)</label><input type="number" id="edMv" step="'+EDIT.snap+'" min="'+mi.lo+'" max="'+mi.hi+'" value="0" style="width:84px"><button class="b" type="button" data-act="mvapply">Apply</button><button class="b" type="button" data-act="mvn" data-d="-1">−'+EDIT.snap+'</button><button class="b" type="button" data-act="mvn" data-d="1">+'+EDIT.snap+'</button></div>';
      h+='<div class="hint" style="margin:0">Range '+(mi.lo<0?'−'+ft(-mi.lo):'0')+' to +'+ft(mi.hi)+' ('+(V?'west to east':'north to south')+'). Doors on this wall move with it.</div>';
    }else h+='<div class="hint" style="margin:0">'+esc(mi.msg)+'</div>';
  }else if(sel.t==='door'||sel.t==='win'){
    var d=findOpening(pl,sel.key);if(!d){box.style.display='none';return;}
    var isW=(d.k==='win'||d.k==='vent'),widths=isW?[1.5,2,3,4,5,6]:[2.5,3,3.5,4,5],wd=d.a1-d.a0;
    var nm=d.k==='main'?'Main entrance':(d.k==='open'?'Open arch':(d.k==='vent'?'Ventilator':(d.k==='win'?'Window':'Door')));
    h+='<div><b>'+nm+'</b> · '+ft(wd)+' wide ('+Math.round(wd*304.8)+' mm) · on a '+(d.o==='H'?'horizontal':'vertical')+' wall</div>';
    h+='<div class="edrow"><label for="edW" style="margin:0">Width</label><select id="edW" data-act="dw">'+widths.map(function(w){return '<option value="'+w+'"'+(Math.abs(w-wd)<0.01?' selected':'')+'>'+ft(w)+'</option>';}).join('')+'</select>';
    h+=d.k==='main'?'<span class="hint" style="margin:0">The main entrance cannot be removed.</span>':'<button class="b" type="button" data-act="del">Remove</button>';
    h+='</div>';
  }else if(sel.t==='room'){
    var r2=pl.rooms.filter(function(x){return x.key===sel.key&&!x.hidden;})[0];
    if(!r2){box.style.display='none';return;}
    var a=rArea(r2),vz=r2.id&&r2.t!=='pass'?vastuOf(r2,pl.W,pl.D):null,rule=nbcRule(r2);
    h+='<div class="edrow"><label for="edName" style="margin:0"><b>Room name</b></label><input type="text" id="edName" value="'+esc(r2.n).replace(/"/g,'&quot;')+'" maxlength="40" style="width:190px"></div>';
    h+='<div>Area '+f1(a)+' sq ft ('+f1(a*0.092903)+' m²)'+(r2.parts&&r2.parts.length>1?' · combined room of '+r2.parts.length+' parts':' · '+ft(r2.w)+' × '+ft(r2.h))+'</div>';
    if(r2.merged&&r2.merged.length) h+='<div>Includes: '+esc(r2.merged.join(', '))+'</div>';
    if(vz) h+='<div>Vastu zone: '+vz.zone+(vz.status==='check'?' (best '+vz.best+')':' · '+vz.status)+'</div>';
    if(rule) h+='<div>NBC minimum for a '+rule.n+': '+rule.a+' m² and '+rule.w+' m wide · '+(a*0.092903>=rule.a-0.01?'<span class="v-ideal">meets area</span>':'<span class="lv-warn">below minimum</span>')+'</div>';
    h+='<div class="hint" style="margin:0">Remove a wall to merge this room with its neighbour, or use Add wall to split it.</div>';
  }
  box.innerHTML=h;box.style.display='grid';
}
$('edProps').addEventListener('click',function(ev){
  var b=ev.target.closest&&ev.target.closest('[data-act]');if(!b||!EDIT.sel) return;
  var a=b.getAttribute('data-act'),s=EDIT.sel;
  if(a==='rmwall'&&s.t==='wall') edRemoveWall(s.id);
  else if(a==='del') edDeleteSel();
  else if(a==='mvn'&&s.t==='wall') edMoveWall(s.id,+b.getAttribute('data-d')*EDIT.snap);
  else if(a==='mvapply'&&s.t==='wall') edMoveWall(s.id,+($('edMv').value||0));
});
$('edProps').addEventListener('change',function(ev){
  var t=ev.target,s=EDIT.sel;if(!s) return;
  if(t.id==='edW') edSetWidth(s.key,+t.value);
  else if(t.id==='edName'&&s.t==='room') edRename(s.key,t.value);
  else if(t.id==='edMv'&&s.t==='wall') edMoveWall(s.id,+t.value||0);
});
function redrawPlan(){drawPlan(planFor(ST));}
$('pFit').addEventListener('click',function(){Z2={k:1,cx:null,cy:null};applyVB();});
$('pIn').addEventListener('click',function(){zoomAt(1.3);});
$('pOut').addEventListener('click',function(){zoomAt(1/1.3);});
$('pPan').addEventListener('click',function(){PANMODE=!PANMODE;this.setAttribute('aria-pressed',String(PANMODE));var sv=$('plan').querySelector('svg');if(sv) sv.style.touchAction=PANMODE?'none':'pan-y';$('plan').style.cursor=PANMODE?'grab':'';});
$('plan').addEventListener('wheel',function(e){if(!(e.ctrlKey||e.metaKey)&&!document.body.classList.contains('planfocus')) return;e.preventDefault();zoomAt(e.deltaY<0?1.15:1/1.15,e.clientX,e.clientY);},{passive:false});
(function(){
  var ptrs={};
  $('plan').addEventListener('pointerdown',function(e){
    ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
    var ids=Object.keys(ptrs);
    if(ids.length===2){pend=null;WD=null;AD=null;setPrev('');var a=ptrs[ids[0]],b=ptrs[ids[1]];pinch={d:Math.hypot(a.x-b.x,a.y-b.y)};panning=null;return;}
    if(PANMODE||e.button===1){panning={x:e.clientX,y:e.clientY};$('plan').style.cursor='grabbing';}
  });
  document.addEventListener('pointermove',function(e){
    if(!ptrs[e.pointerId]) return;
    var prev=ptrs[e.pointerId];ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
    var ids=Object.keys(ptrs);
    if(ids.length===2&&pinch){
      var a=ptrs[ids[0]],b=ptrs[ids[1]],d=Math.hypot(a.x-b.x,a.y-b.y);
      if(pinch.d>0&&d>0) zoomAt(d/pinch.d,(a.x+b.x)/2,(a.y+b.y)/2);
      pinch.d=d;dragJust=true;return;
    }
    if(panning&&Z2.k>1){
      var svg=$('plan').querySelector('svg');if(!svg) return;
      var r=svg.getBoundingClientRect(),vb=(svg.getAttribute('viewBox')||'').split(' ').map(Number),sc=vb[2]/(r.width||1);
      Z2.cx-=(e.clientX-prev.x)*sc;Z2.cy-=(e.clientY-prev.y)*sc;applyVB();dragJust=true;
    }
  });
  function end(e){
    delete ptrs[e.pointerId];
    if(Object.keys(ptrs).length<2) pinch=null;
    if(panning){panning=null;$('plan').style.cursor=PANMODE?'grab':'';}
    if(dragJust) setTimeout(function(){dragJust=false;},150);
  }
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
})();
function planPt(ev){
  var svg=$('plan').querySelector('svg');if(!svg||!PV||!svg.getScreenCTM) return null;
  var m=svg.getScreenCTM();if(!m) return null;
  var pt=svg.createSVGPoint();pt.x=ev.clientX;pt.y=ev.clientY;
  var q=pt.matrixTransform(m.inverse());return {x:(q.x-PV.mx)/PV.s,y:(q.y-PV.mt)/PV.s};
}
/* ---- toolbar ---- */
Array.prototype.forEach.call($('segEdit').children,function(b){b.addEventListener('click',function(){EDIT.mode=b.getAttribute('data-v');EDIT.sel=null;edMsg('');redrawPlan();sel3d();edRender();});});
Array.prototype.forEach.call($('segOrient').children,function(b){b.addEventListener('click',function(){EDIT.orient=b.getAttribute('data-v');edSync();});});
Array.prototype.forEach.call($('segSnap').children,function(b){b.addEventListener('click',function(){EDIT.snap=+b.getAttribute('data-v');edRender();});});
$('edNewDoor').addEventListener('change',function(){EDIT.newDoor=this.checked;});
$('bGrid').addEventListener('click',function(){EDIT.grid=!EDIT.grid;redrawPlan();edSync();});
Array.prototype.forEach.call($('doorPal').children,function(b){
  b.addEventListener('click',function(){EDIT.chip=b.getAttribute('data-d');edSync();});
  b.addEventListener('pointerdown',function(ev){EDIT.chip=b.getAttribute('data-d');edSync();var c=CHIPS[EDIT.chip];startDrag({w:c.w,k:c.k,label:c.n},ev);});
});
$('edUndo').addEventListener('click',edUndo);$('edRedo').addEventListener('click',edRedo);
$('edReset').addEventListener('click',function(){if(!ST.edits) return;EDIT.stack.push(JSON.stringify(ST.edits));EDIT.redo=[];ST.edits=null;EDIT.sel=null;update();});
$('edDxf').addEventListener('click',function(){saveFile('courtyard-house-layout.dxf','application/dxf',buildDXF(planFor(ST),ST));});
document.addEventListener('keydown',function(ev){
  if(EDIT.mode==='off') return;
  var tg=ev.target&&ev.target.tagName;if(tg==='INPUT'||tg==='SELECT'||tg==='TEXTAREA') return;
  var k=ev.key,mod=ev.ctrlKey||ev.metaKey;
  if(mod&&(k==='z'||k==='Z')){ev.preventDefault();if(ev.shiftKey) edRedo();else edUndo();}
  else if(mod&&(k==='y'||k==='Y')){ev.preventDefault();edRedo();}
  else if(k==='Delete'||k==='Backspace'){if(EDIT.sel){ev.preventDefault();edDeleteSel();}}
  else if(k==='Escape'){EDIT.sel=null;redrawPlan();sel3d();edRender();}
  else if(EDIT.sel&&EDIT.sel.t==='wall'&&(k==='ArrowLeft'||k==='ArrowRight'||k==='ArrowUp'||k==='ArrowDown')){
    var r=wallRuns(planFor(ST)).filter(function(x){return x.id===EDIT.sel.id;})[0];if(!r) return;
    var d=(k==='ArrowRight'||k==='ArrowDown')?EDIT.snap:-EDIT.snap;
    if((r.o==='V'&&(k==='ArrowLeft'||k==='ArrowRight'))||(r.o==='H'&&(k==='ArrowUp'||k==='ArrowDown'))){ev.preventDefault();edMoveWall(EDIT.sel.id,d);}
  }
});
/* ---- drag and drop ---- */
function setPrev(h){
  var svg=$('plan').querySelector('svg');if(!svg) return;
  var o=document.getElementById('dprev');if(o&&o.parentNode) o.parentNode.removeChild(o);
  if(!h) return;
  var g=document.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('id','dprev');g.setAttribute('pointer-events','none');g.innerHTML=h;svg.appendChild(g);
}
function prevLine(o,a,b,c,col,w,dash){
  var x1=o==='V'?c:a,y1=o==='V'?a:c,x2=o==='V'?c:b,y2=o==='V'?b:c;
  return '<line x1="'+(PV.mx+x1*PV.s)+'" y1="'+(PV.mt+y1*PV.s)+'" x2="'+(PV.mx+x2*PV.s)+'" y2="'+(PV.mt+y2*PV.s)+'" stroke="'+col+'" stroke-width="'+w+'" stroke-linecap="round"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';
}
function prevTip(x,y,lines){
  var h='';lines.forEach(function(t,i){h+='<text x="'+(x+12)+'" y="'+(y-10+i*14)+'" font-size="11" font-weight="500" style="fill:var(--ink);paint-order:stroke;stroke:var(--card);stroke-width:4px;stroke-linejoin:round">'+esc(t)+'</text>';});return h;
}
function startDrag(info,ev){
  DRAG=info;GH=document.createElement('div');GH.className='dghost';GH.textContent=info.label;document.body.appendChild(GH);
  moveDrag(ev);document.addEventListener('pointermove',moveDrag);document.addEventListener('pointerup',endDrag);document.addEventListener('pointercancel',stopDrag);
  if(ev.preventDefault) ev.preventDefault();
}
function stopDrag(){
  document.removeEventListener('pointermove',moveDrag);document.removeEventListener('pointerup',endDrag);document.removeEventListener('pointercancel',stopDrag);
  if(GH&&GH.parentNode) GH.parentNode.removeChild(GH);GH=null;DRAG=null;setPrev('');
}
function moveDrag(ev){
  if(!DRAG||!GH) return;
  GH.style.left=ev.clientX+'px';GH.style.top=ev.clientY+'px';
  var el=document.elementFromPoint(ev.clientX,ev.clientY);
  if(el&&$('plan').contains(el)){var pt=planPt(ev);if(pt){var sn=edSnap(pt.x,pt.y,DRAG.w,DRAG.k,DRAG.key);setPrev(sn?prevLine(sn.o,sn.a0,sn.a1,sn.pos,'#2851A3',7,''):'');return;}}
  setPrev('');
}
function endDrag(ev){
  var info=DRAG;stopDrag();dragJust=true;setTimeout(function(){dragJust=false;},120);
  if(!info) return;
  var el=document.elementFromPoint(ev.clientX,ev.clientY),sn=null,placed=false;
  if(el&&$('plan').contains(el)){var pt=planPt(ev);if(pt){sn=edSnap(pt.x,pt.y,info.w,info.k,info.key);placed=true;}}
  else if(renderer&&el===renderer.domElement){
    var hit=pick3D(ev,'wall');
    if(hit&&hit.object.userData.wall){var pl=planFor(ST);sn=edSnap(hit.point.x+pl.W/2,hit.point.z+pl.D/2,info.w,info.k,info.key);placed=true;}
  }
  if(!placed) return;
  if(!sn){edMsg(info.k==='win'||info.k==='vent'?'Windows go on outer walls with free space for the width.':'That spot does not fit. Drop it on a wall that is long enough and has no door.');return;}
  if(info.key) edMoveOpening(info.key,sn);else edPlaceOpening(sn);
}
function dropDoorPlan(x,y,chip){var c=CHIPS[chip||EDIT.chip],sn=edSnap(x,y,c.w,c.k);if(!sn){edMsg('That spot does not fit.');return false;}edPlaceOpening(sn);return true;}
/* wall dragging */
function startWallDrag(pp,ev){
  var pl=planFor(ST),run=wallRuns(pl).filter(function(r){return r.id===pp.id;})[0];if(!run) return;
  var mi=runMove(pl,run);
  EDIT.sel={t:'wall',id:run.id};redrawPlan();edRenderProps();
  if(!mi.ok){edMsg(mi.msg);return;}
  var rr=runRooms(pl,run);
  WD={run:run,mi:mi,rr:rr,pl:pl,start:pp.pt,d:0};
  document.body.style.userSelect='none';
}
function wallDragMove(ev){
  var pt=planPt(ev);if(!pt||!WD) return;
  var V=WD.run.o==='V',raw=V?pt.x-WD.start.x:pt.y-WD.start.y,d=Math.max(WD.mi.lo,Math.min(WD.mi.hi,snapV(raw)));
  WD.d=d;
  var tip=[],q;
  WD.mi.A.slice(0,1).forEach(function(ix){q=WD.pl.parts[ix];});
  var pa=WD.pl.parts[WD.mi.A[0]],pb=WD.pl.parts[WD.mi.B[0]];
  var na=WD.rr.A[0]?WD.rr.A[0].n:'A',nb=WD.rr.B[0]?WD.rr.B[0].n:'B';
  tip.push((d>0?'+':'')+ft(Math.abs(d)).replace(/^/,d<0?'−':''));
  tip.push(na+': '+ft((V?pa.w:pa.h)+d));tip.push(nb+': '+ft((V?pb.w:pb.h)-d));
  var h=prevLine(WD.run.o,WD.mi.a0,WD.mi.a1,WD.run.pos+d,'#2851A3',5,'6 4');
  var px=PV.mx+(V?WD.run.pos+d:(WD.mi.a0+WD.mi.a1)/2)*PV.s,py=PV.mt+(V?(WD.mi.a0+WD.mi.a1)/2:WD.run.pos+d)*PV.s;
  setPrev(h+prevTip(px,py,tip));
}
function wallDragEnd(){
  var w=WD;WD=null;document.body.style.userSelect='';setPrev('');
  dragJust=true;setTimeout(function(){dragJust=false;},120);
  if(w&&Math.abs(w.d)>0.01) edMoveWall(w.run.id,w.d);
}
/* add-wall drawing */
function startAddDrag(pp){
  var pl=planFor(ST),parts=planParts(pl),ix=partAt(parts,pp.pt.x,pp.pt.y);
  if(ix<0) return;
  AD={start:pp.pt,parts:parts,pl:pl,o:null,pos:0};
  document.body.style.userSelect='none';
}
function addOrient(dx,dy,q){
  if(EDIT.orient==='H'||EDIT.orient==='V') return EDIT.orient;
  return Math.abs(dx)>=Math.abs(dy)?'H':'V';
}
function addDragMove(ev){
  var pt=planPt(ev);if(!pt||!AD) return;
  var o=addOrient(pt.x-AD.start.x,pt.y-AD.start.y),L=splitLimits(AD.parts,o,AD.start.x,AD.start.y);
  if(!L){setPrev(prevTip(PV.mx+pt.x*PV.s,PV.mt+pt.y*PV.s,['Room too small to split']));AD.o=null;return;}
  var pos=Math.max(L.lo,Math.min(L.hi,snapV(o==='V'?pt.x:pt.y))),q=L.part;
  AD.o=o;AD.pos=pos;
  var a0=o==='V'?q.y:q.x,a1=o==='V'?q.y+q.h:q.x+q.w;
  var w1=o==='V'?pos-q.x:q.w,h1=o==='V'?q.h:pos-q.y,w2=o==='V'?q.x+q.w-pos:q.w,h2=o==='V'?q.h:q.y+q.h-pos;
  var tip=[f1(w1*h1)+' sq ft  '+ft(w1)+' × '+ft(h1),f1(w2*h2)+' sq ft  '+ft(w2)+' × '+ft(h2)];
  var px=PV.mx+(o==='V'?pos:pt.x)*PV.s,py=PV.mt+(o==='V'?pt.y:pos)*PV.s;
  setPrev(prevLine(o,a0,a1,pos,'#2851A3',5,'')+prevTip(px,py,tip));
}
function addDragEnd(){
  var a=AD;AD=null;document.body.style.userSelect='';setPrev('');
  dragJust=true;setTimeout(function(){dragJust=false;},120);
  if(a&&a.o) edSplit(a.o,a.pos,a.start.x,a.start.y);
}
/* plan pointer handling */
$('plan').addEventListener('pointerdown',function(ev){
  if(EDIT.mode==='off'||ev.button>0||PANMODE||pinch) return;
  var t=ev.target,pt=planPt(ev);if(!pt||!t.closest) return;
  if(t.closest('[data-xw],[data-xd],[data-xg]')) return;
  if(EDIT.mode==='select'||EDIT.mode==='door'){
    var g=t.closest('[data-door],[data-win]');
    if(g){if(g.getAttribute('data-main')!=='1') pend={t:'open',key:g.getAttribute('data-door')||g.getAttribute('data-win'),w:+g.getAttribute('data-w')||3,k:g.getAttribute('data-k')||'door',x:ev.clientX,y:ev.clientY};return;}
    if(EDIT.mode==='select'){g=t.closest('[data-wall]');if(g){pend={t:'wall',id:g.getAttribute('data-wall'),pt:pt,x:ev.clientX,y:ev.clientY};return;}}
  }
  if(EDIT.mode==='addwall'&&t.closest('[data-room]')) pend={t:'add',pt:pt,x:ev.clientX,y:ev.clientY};
});
document.addEventListener('pointermove',function(ev){
  if(pend&&!DRAG&&!WD&&!AD){
    if(Math.abs(ev.clientX-pend.x)+Math.abs(ev.clientY-pend.y)<9) return;
    var pp=pend;pend=null;
    if(pp.t==='open') startDrag({w:pp.w,k:pp.k,key:pp.key,label:'Move'},ev);
    else if(pp.t==='wall') startWallDrag(pp,ev);
    else if(pp.t==='add') startAddDrag(pp);
  }
  if(WD) wallDragMove(ev);
  if(AD) addDragMove(ev);
});
document.addEventListener('pointerup',function(){pend=null;if(WD) wallDragEnd();if(AD) addDragEnd();});
$('plan').addEventListener('click',function(ev){
  if(EDIT.mode==='off'||dragJust||PANMODE) return;
  var g=ev.target.closest&&ev.target.closest('[data-xw],[data-xd],[data-xg],[data-ghost],[data-win],[data-door],[data-wall],[data-room]');
  if(!g){if(EDIT.sel){EDIT.sel=null;redrawPlan();sel3d();edRender();}return;}
  if(g.hasAttribute('data-xw')){edRemoveWall(g.getAttribute('data-xw'));return;}
  if(g.hasAttribute('data-xd')){var kk=g.getAttribute('data-xd');edDeleteOpening(kk);return;}
  if(g.hasAttribute('data-ghost')){edRestore(g.getAttribute('data-ghost'));return;}
  if(g.hasAttribute('data-win')){edSelect({t:'win',key:g.getAttribute('data-win')});return;}
  if(g.hasAttribute('data-door')){
    if(g.getAttribute('data-main')==='1'){edSelect({t:'door',key:g.getAttribute('data-door')});return;}
    edSelect({t:'door',key:g.getAttribute('data-door')});return;
  }
  if(g.hasAttribute('data-wall')){
    var id=g.getAttribute('data-wall');
    if(EDIT.mode==='select'){edSelect({t:'wall',id:id});return;}
    if(EDIT.mode==='door'){
      var pt=planPt(ev)||{x:+g.getAttribute('data-mx'),y:+g.getAttribute('data-my')},c=CHIPS[EDIT.chip],sn=edSnap(pt.x,pt.y,c.w,c.k);
      if(!sn){edMsg(c.k==='win'||c.k==='vent'?'Windows go on outer walls with free space for the width.':'That wall piece is too short for the opening, or already has one.');return;}
      edPlaceOpening(sn);
    }
    return;
  }
  if(g.hasAttribute('data-room')){
    if(EDIT.mode==='select'){edSelect({t:'room',key:g.getAttribute('data-room')});return;}
    if(EDIT.mode==='addwall'){
      var p2=planPt(ev)||{x:+g.getAttribute('data-cx'),y:+g.getAttribute('data-cy')},pl=planFor(ST),parts=planParts(pl),ix=partAt(parts,p2.x,p2.y);
      if(ix<0) return;
      var q=parts[ix],o=(EDIT.orient==='H'||EDIT.orient==='V')?EDIT.orient:(q.w>=q.h?'V':'H');
      edSplit(o,o==='V'?p2.x:p2.y,p2.x,p2.y);
    }
  }
});
/* plan overlay */
function edOverlay(pl,s,mx,mt){
  var mode=EDIT.mode;if(mode==='off') return '';
  var X=function(x){return mx+x*s;},Y=function(y){return mt+y*s;},o='',sel=EDIT.sel,runs=wallRuns(pl);
  var L=function(x1,y1,x2,y2,attr,w,col){return '<line x1="'+X(x1).toFixed(1)+'" y1="'+Y(y1).toFixed(1)+'" x2="'+X(x2).toFixed(1)+'" y2="'+Y(y2).toFixed(1)+'" '+attr+' stroke="'+col+'" stroke-width="'+w+'" stroke-linecap="round"/>';};
  var sg=function(r){return r.o==='H'?[r.a0,r.pos,r.a1,r.pos]:[r.pos,r.a0,r.pos,r.a1];};
  var xm=function(px,py,attr){return '<g '+attr+' style="cursor:pointer"><circle cx="'+px.toFixed(1)+'" cy="'+py.toFixed(1)+'" r="11" fill="#E24B4A" stroke="#fff" stroke-width="1.5"/><path d="M'+(px-4).toFixed(1)+' '+(py-4).toFixed(1)+'L'+(px+4).toFixed(1)+' '+(py+4).toFixed(1)+'M'+(px+4).toFixed(1)+' '+(py-4).toFixed(1)+'L'+(px-4).toFixed(1)+' '+(py+4).toFixed(1)+'" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></g>';};
  var tx=function(px,py,t){return '<text x="'+px.toFixed(1)+'" y="'+py.toFixed(1)+'" font-size="10.5" font-weight="500" text-anchor="middle" pointer-events="none" style="fill:var(--ink);paint-order:stroke;stroke:var(--card);stroke-width:4px;stroke-linejoin:round">'+esc(t)+'</text>';};
  var i;
  if(EDIT.grid){
    for(i=0;i<=pl.W;i++) o+=L(i,0,i,pl.D,'pointer-events="none" opacity="0.4"',i%5===0?0.9:0.35,'#8a8a8a');
    for(i=0;i<=pl.D;i++) o+=L(0,i,pl.W,i,'pointer-events="none" opacity="0.4"',i%5===0?0.9:0.35,'#8a8a8a');
  }
  if(mode==='select'||mode==='addwall'){
    pl.rooms.forEach(function(r){
      if(r.hidden||r.t==='court'||r.t==='corr') return;
      rparts(r).forEach(function(q){
        o+='<rect data-room="'+r.key+'" data-cx="'+(q.x+q.w/2)+'" data-cy="'+(q.y+q.h/2)+'" x="'+X(q.x).toFixed(1)+'" y="'+Y(q.y).toFixed(1)+'" width="'+(q.w*s).toFixed(1)+'" height="'+(q.h*s).toFixed(1)+'" fill="rgba(0,0,0,0.001)" style="cursor:'+(mode==='addwall'?'crosshair':'pointer')+(mode==='addwall'?';touch-action:none':'')+'"/>';
      });
    });
  }
  if(sel&&sel.t==='room'){
    var rs=pl.rooms.filter(function(r){return r.key===sel.key&&!r.hidden;})[0];
    if(rs){
      rparts(rs).forEach(function(q){o+='<rect x="'+X(q.x).toFixed(1)+'" y="'+Y(q.y).toFixed(1)+'" width="'+(q.w*s).toFixed(1)+'" height="'+(q.h*s).toFixed(1)+'" fill="none" stroke="#2851A3" stroke-width="2.2" stroke-dasharray="6 3" pointer-events="none"/>';});
      var big={x:rs.x,y:rs.y,w:rs.w,h:rs.h};
      o+=tx(X(big.x+big.w/2),Y(big.y)-5,ft(big.w))+tx(X(big.x)-4,Y(big.y+big.h/2)+4,ft(big.h));
    }
  }
  (pl.ghosts||[]).forEach(function(g){
    var q=sg(g);
    o+=L(q[0],q[1],q[2],q[3],'pointer-events="none" stroke-dasharray="4 3" opacity="0.75"',1.7,'#E24B4A');
    if(mode!=='door') o+=L(q[0],q[1],q[2],q[3],'data-ghost="'+g.id+'" style="cursor:pointer"',14,'rgba(0,0,0,0.001)');
  });
  if(mode==='select'||mode==='door'){
    runs.forEach(function(r){
      var q=sg(r),mxp=(q[0]+q[2])/2,myp=(q[1]+q[3])/2;
      o+=L(q[0],q[1],q[2],q[3],'data-wall="'+r.id+'" data-mx="'+mxp+'" data-my="'+myp+'" style="cursor:pointer;touch-action:none"',14,'rgba(0,0,0,0.001)');
    });
    winList(pl).forEach(function(w){
      var key=doorKey(w),q=w.o==='H'?[w.a0,w.pos,w.a1,w.pos]:[w.pos,w.a0,w.pos,w.a1];
      o+=L(q[0],q[1],q[2],q[3],'data-win="'+key+'" data-w="'+(w.a1-w.a0)+'" data-k="'+w.k+'" data-main="0" style="cursor:grab;touch-action:none"',12,'rgba(0,0,0,0.001)');
    });
    pl.doors.forEach(function(d){
      var key=doorKey(d),q=d.o==='H'?[d.a0,d.pos,d.a1,d.pos]:[d.pos,d.a0,d.pos,d.a1];
      o+=L(q[0],q[1],q[2],q[3],'data-door="'+key+'" data-main="'+(d.k==='main'?1:0)+'" data-w="'+(d.a1-d.a0)+'" data-k="'+d.k+'" style="cursor:grab;touch-action:none"',14,'rgba(0,0,0,0.001)');
    });
  }
  if(sel&&sel.t==='wall'){
    var r=runs.filter(function(q){return q.id===sel.id;})[0];
    if(r){
      var q=sg(r),mpx=X((q[0]+q[2])/2),mpy=Y((q[1]+q[3])/2),V=r.o==='V',mi=runMove(pl,r);
      o+=L(q[0],q[1],q[2],q[3],'pointer-events="none"',5,'#E24B4A');
      mpx=+mpx;mpy=+mpy;
      o+=xm(V?mpx:mpx+24,V?mpy-24:mpy,'data-xw="'+r.id+'"');
      if(mi.ok) o+='<path d="'+(V?'M'+(mpx-16)+' '+mpy+'L'+(mpx-7)+' '+(mpy-6)+'L'+(mpx-7)+' '+(mpy+6)+'ZM'+(mpx+16)+' '+mpy+'L'+(mpx+7)+' '+(mpy-6)+'L'+(mpx+7)+' '+(mpy+6)+'Z':'M'+mpx+' '+(mpy-16)+'L'+(mpx-6)+' '+(mpy-7)+'L'+(mpx+6)+' '+(mpy-7)+'ZM'+mpx+' '+(mpy+16)+'L'+(mpx-6)+' '+(mpy+7)+'L'+(mpx+6)+' '+(mpy+7)+'Z')+'" fill="#2851A3" pointer-events="none"/>';
      o+=tx(V?mpx+30:mpx,V?mpy+4:mpy-26,ft(r.len));
    }
  }
  if(sel&&(sel.t==='door'||sel.t==='win')){
    var d2=findOpening(pl,sel.key);
    if(d2){
      var q2=d2.o==='H'?[d2.a0,d2.pos,d2.a1,d2.pos]:[d2.pos,d2.a0,d2.pos,d2.a1],cxp=+X((q2[0]+q2[2])/2),cyp=+Y((q2[1]+q2[3])/2);
      o+=L(q2[0],q2[1],q2[2],q2[3],'pointer-events="none"',6,'#E24B4A');
      if(d2.k!=='main') o+=xm(d2.o==='H'?cxp:cxp+22,d2.o==='H'?cyp-22:cyp,'data-xd="'+sel.key+'"');
      o+=tx(d2.o==='H'?cxp:cxp+(d2.k==='main'?26:44),d2.o==='H'?cyp+(d2.k==='main'?-12:20):cyp+4,ft(d2.a1-d2.a0));
    }
  }
  return o;
}
function pick3D(ev,filter){
  if(!renderer||!cam) return null;
  var r=renderer.domElement.getBoundingClientRect(),ndc=new THREE.Vector2(((ev.clientX-r.left)/r.width)*2-1,-((ev.clientY-r.top)/r.height)*2+1);
  var rc=new THREE.Raycaster();rc.setFromCamera(ndc,cam);
  var objs=pickObjs.filter(function(m){return filter==='wall'?!!m.userData.wall:true;});
  if(X3&&X3.parent){var sh=rc.intersectObject(X3,false);if(sh.length) return sh[0];}
  var hits=rc.intersectObjects(objs,false);
  return hits.length?hits[0]:null;
}
function xTex(){
  var c=document.createElement('canvas');c.width=64;c.height=64;var x=c.getContext('2d');
  x.fillStyle='#E24B4A';x.beginPath();x.arc(32,32,28,0,6.2832);x.fill();x.strokeStyle='#fff';x.lineWidth=4;x.stroke();
  x.lineWidth=6;x.lineCap='round';x.beginPath();x.moveTo(21,21);x.lineTo(43,43);x.moveTo(43,21);x.lineTo(21,43);x.stroke();
  return new THREE.CanvasTexture(c);
}
function sel3d(){
  selObjs.forEach(function(m){if(m.parent) m.parent.remove(m);if(m.material&&m.material.dispose) m.material.dispose();});selObjs=[];X3=null;
  if(!have3d||!house||!EDIT.sel||EDIT.mode==='off') return;
  var m=pickObjs.filter(function(o){return EDIT.sel.t==='wall'?o.userData.wall===EDIT.sel.id:o.userData.door===EDIT.sel.key;})[0];
  if(!m) return;
  var u=m.userData,ov=new THREE.Mesh(new THREE.BoxGeometry(u.sx+0.2,(EDIT.sel.t==='wall'?u.hm:7)+0.1,u.sz+0.2),new THREE.MeshBasicMaterial({color:0xE24B4A,transparent:true,opacity:0.5,depthTest:false}));
  ov.position.copy(m.position);ov.renderOrder=5;house.add(ov);selObjs.push(ov);
  var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:xTex(),depthTest:false,transparent:true}));
  sp.position.set(m.position.x,m.position.y+((EDIT.sel.t==='wall'?u.hm:7)/2)+2.2,m.position.z);sp.scale.set(4,4,1);sp.renderOrder=10;sp.userData={xmark:true};
  house.add(sp);selObjs.push(sp);X3=sp;
}
function click3D(ev){
  if(EDIT.mode==='addwall'){edMsg('Draw walls in the floor plan. The 3D model updates straight away.');return;}
  var hit=pick3D(ev);
  if(!hit){EDIT.sel=null;redrawPlan();sel3d();edRender();return;}
  var o=hit.object,u=o.userData;
  if(u.xmark){
    if(EDIT.sel&&EDIT.sel.t==='wall') edRemoveWall(EDIT.sel.id);else if(EDIT.sel&&EDIT.sel.t==='door') edDeleteOpening(EDIT.sel.key);
    return;
  }
  if(u.door){edSelect({t:'door',key:u.door});return;}
  if(u.wall){
    if(EDIT.mode==='select'){edSelect({t:'wall',id:u.wall});return;}
    var pl=planFor(ST),c=CHIPS[EDIT.chip],sn=edSnap(hit.point.x+pl.W/2,hit.point.z+pl.D/2,c.w,c.k);
    if(!sn){edMsg('That wall piece cannot take this opening.');return;}
    edPlaceOpening(sn);
  }
}
window.__ed={EDIT:EDIT,edRemoveWall:edRemoveWall,edRestore:edRestore,edMoveWall:edMoveWall,edSplit:edSplit,edPlaceOpening:edPlaceOpening,edDeleteOpening:edDeleteOpening,edSetWidth:edSetWidth,edRename:edRename,edUndo:edUndo,edRedo:edRedo,dropDoorPlan:dropDoorPlan,edSnap:edSnap,edCur:edCur,planFor:planFor,ST:ST};

