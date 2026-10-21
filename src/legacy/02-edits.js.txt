/* ---------- wall and door edits (rooms follow the walls) ---------- */
function doorKey(d){return d.o+'|'+d.pos+'|'+d.a0+'|'+d.a1;}
function opsOf(ed){
  var ops=[];
  (ed.rm||[]).forEach(function(r){ops.push({t:'rm',o:r.o,p:r.p,i0:r.i0,i1:r.i1});});
  (ed.del||[]).forEach(function(k){ops.push({t:'ddel',key:k});});
  (ed.doors||[]).forEach(function(d){ops.push({t:'dadd',d:d});});
  return ops.concat(ed.ops||[]);
}
function edCount(e){return e?opsOf(e).length:0;}
function edHash(e){var t=JSON.stringify(opsOf(e)),h=0,i;for(i=0;i<t.length;i++){h=(h*31+t.charCodeAt(i))|0;}return (h>>>0).toString(36);}
var EPS=0.02,MINW=2.5;
function eq(a,b){return Math.abs(a-b)<EPS;}
function rparts(r){return r.parts||[{x:r.x,y:r.y,w:r.w,h:r.h}];}
function rArea(r){var a=0;rparts(r).forEach(function(q){a+=q.w*q.h;});return a;}
function ukey(o,p,i){return o+'|'+p+'|'+i;}
function addSegU(U,o,pos,a0,a1){
  var p=Math.round(pos*2),s=Math.round(a0*2),e=Math.round(a1*2);
  for(var i=s;i<e;i++){var kk=ukey(o,p,i);if(!U[kk]) U[kk]={o:o,p:p,i:i,k:'wall',c:'in'};}
}
function deriveUnits(parts,pl){
  var U={},W2=pl.W*2,D2=pl.D*2,Cr=pl.center,cx0=Cr.x*2,cx1=(Cr.x+Cr.w)*2,cy0=Cr.y*2,cy1=(Cr.y+Cr.h)*2;
  parts.forEach(function(q){addSegU(U,'H',q.y,q.x,q.x+q.w);addSegU(U,'H',q.y+q.h,q.x,q.x+q.w);addSegU(U,'V',q.x,q.y,q.y+q.h);addSegU(U,'V',q.x+q.w,q.y,q.y+q.h);});
  Object.keys(U).forEach(function(kk){
    var u=U[kk];
    if((u.o==='H'&&(u.p===0||u.p===D2))||(u.o==='V'&&(u.p===0||u.p===W2))) u.c='out';
    else if(u.o==='H'&&(u.p===cy0||u.p===cy1)&&u.i>=cx0&&u.i<cx1) u.c='ct';
    else if(u.o==='V'&&(u.p===cx0||u.p===cx1)&&u.i>=cy0&&u.i<cy1) u.c='ct';
  });
  return U;
}
var WTH={out:0.75,ct:0.5,'in':0.375};
function wallJoints(pl,wallOnly){
  var U={},out=[],seen={};
  var live=function(u){return u.k!=='gone'&&(!wallOnly||u.k==='wall'||u.k==='win'||u.k==='vent');};
  pl.units.forEach(function(u){if(live(u)) U[u.o+'|'+u.p+'|'+u.i]=u;});
  Object.keys(U).forEach(function(kk){
    var u=U[kk],pts=u.o==='H'?[[u.i,u.p],[u.i+1,u.p]]:[[u.p,u.i],[u.p,u.i+1]];
    pts.forEach(function(q){
      var X=q[0],Y=q[1],nk=X+','+Y;if(seen[nk]) return;seen[nk]=1;
      var e=U['H|'+Y+'|'+X],w=U['H|'+Y+'|'+(X-1)],sa=U['V|'+X+'|'+Y],na=U['V|'+X+'|'+(Y-1)];
      if(!(e||w)||!(sa||na)) return;
      out.push({x:X/2,y:Y/2,tw:Math.max(sa?WTH[sa.c]:0,na?WTH[na.c]:0),th:Math.max(e?WTH[e.c]:0,w?WTH[w.c]:0),cls:{H:(e||w).c,V:(sa||na).c}});
    });
  });
  return out;
}
function winList(pl){return pl.wins||winsOf(pl);}
function winsOf(pl){
  var g={},out=[];
  pl.units.forEach(function(u){if(u.k==='win'||u.k==='vent'){var l=u.o+'|'+u.p+'|'+u.k;(g[l]=g[l]||[]).push(u.i);}});
  Object.keys(g).forEach(function(l){
    var pr=l.split('|'),arr=g[l].sort(function(a,b){return a-b;}),s=arr[0],pv=arr[0],j;
    function fl(a,b){out.push({o:pr[0],pos:+pr[1]/2,a0:a/2,a1:(b+1)/2,k:pr[2]});}
    for(j=1;j<arr.length;j++){if(arr[j]!==pv+1){fl(s,pv);s=arr[j];}pv=arr[j];}
    fl(s,pv);
  });
  return out;
}
function ivCover(iv,a,b){
  iv.sort(function(x,y){return x[0]-y[0];});
  var c=a,i;
  for(i=0;i<iv.length;i++){if(iv[i][0]>c+EPS) return false;c=Math.max(c,iv[i][1]);if(c>=b-EPS) return true;}
  return c>=b-EPS;
}
/* a wall can be moved when it runs between the same rooms along its whole length */
function moveInfo(parts,o,pos,a0,a1,gone){
  var V=o==='V',A=[],B=[],n=0,changed=true,i;
  function ext(q){return V?[q.y,q.y+q.h]:[q.x,q.x+q.w];}
  function eA(q){return V?q.x+q.w:q.y+q.h;}
  function eB(q){return V?q.x:q.y;}
  while(changed&&n++<8){
    changed=false;
    parts.forEach(function(q){
      var e=ext(q);if(e[1]<=a0+EPS||e[0]>=a1-EPS) return;
      if(eq(eA(q),pos)||eq(eB(q),pos)){if(e[0]<a0-EPS){a0=e[0];changed=true;}if(e[1]>a1+EPS){a1=e[1];changed=true;}}
    });
  }
  parts.forEach(function(q,ix){
    var e=ext(q);if(e[1]<=a0+EPS||e[0]>=a1-EPS) return;
    if(eq(eA(q),pos)) A.push(ix);else if(eq(eB(q),pos)) B.push(ix);
  });
  if(!A.length||!B.length) return {ok:false,msg:'Only walls between two rooms can be moved. Outer walls and walls facing the corridor or courtyard stay fixed.'};
  if(!ivCover(A.map(function(ix){return ext(parts[ix]);}),a0,a1)||!ivCover(B.map(function(ix){return ext(parts[ix]);}),a0,a1)) return {ok:false,msg:'This wall does not run between the same rooms along its whole length, so it cannot be moved on its own.'};
  for(i=Math.round(a0*2);i<Math.round(a1*2);i++) if(gone[ukey(o,Math.round(pos*2),i)]) return {ok:false,msg:'Part of this wall has been removed. Add the wall back first.'};
  var loA=-1e9,hiB=1e9;
  A.forEach(function(ix){var q=parts[ix];loA=Math.max(loA,-(V?q.w:q.h)+MINW);});
  B.forEach(function(ix){var q=parts[ix];hiB=Math.min(hiB,(V?q.w:q.h)-MINW);});
  if(loA>-0.49&&hiB<0.49) return {ok:false,msg:'The rooms on both sides are already at their minimum size.'};
  return {ok:true,a0:a0,a1:a1,A:A,B:B,lo:Math.min(0,loA),hi:Math.max(0,hiB)};
}
function doMove(parts,doors,gone,op){
  var mi=moveInfo(parts,op.o,op.pos,op.a0,op.a1,gone);
  if(!mi.ok) return;
  var d=Math.max(mi.lo,Math.min(mi.hi,op.d)),V=op.o==='V',i;
  if(Math.abs(d)<EPS) return;
  mi.A.forEach(function(ix){var q=parts[ix];if(V) q.w+=d;else q.h+=d;});
  mi.B.forEach(function(ix){var q=parts[ix];if(V){q.x+=d;q.w-=d;}else{q.y+=d;q.h-=d;}});
  doors.forEach(function(dd){if(dd.o===op.o&&eq(dd.pos,op.pos)&&dd.a0>=mi.a0-EPS&&dd.a1<=mi.a1+EPS) dd.pos=dd.pos+d;});
  for(i=Math.round(mi.a0*2);i<Math.round(mi.a1*2);i++) delete gone[ukey(op.o,Math.round((op.pos+d)*2),i)];
}
function partAt(parts,x,y){
  for(var i=0;i<parts.length;i++){var q=parts[i];if(x>=q.x-EPS&&x<q.x+q.w+EPS&&y>=q.y-EPS&&y<q.y+q.h+EPS) return i;}
  return -1;
}
/* limits for a new wall across the part under (x,y) */
function splitLimits(parts,o,x,y){
  var ix=partAt(parts,x,y);if(ix<0) return null;
  var q=parts[ix],lo=(o==='V'?q.x:q.y)+MINW,hi=(o==='V'?q.x+q.w:q.y+q.h)-MINW;
  if(hi<lo-EPS) return null;
  return {ix:ix,part:q,lo:lo,hi:hi};
}
function doSplit(parts,doors,gone,op){
  var L=splitLimits(parts,op.o,op.x,op.y);if(!L) return;
  var q=L.part,pos=Math.max(L.lo,Math.min(L.hi,op.pos)),V=op.o==='V',i,p1,p2;
  if(V){p1=Object.assign({},q,{w:pos-q.x});p2=Object.assign({},q,{x:pos,w:q.x+q.w-pos});}
  else{p1=Object.assign({},q,{h:pos-q.y});p2=Object.assign({},q,{y:pos,h:q.y+q.h-pos});}
  parts.splice(L.ix,1,p1,p2);
  var a0=V?q.y:q.x,a1=V?q.y+q.h:q.x+q.w;
  for(i=Math.round(a0*2);i<Math.round(a1*2);i++) delete gone[ukey(op.o,Math.round(pos*2),i)];
  if(op.dw){
    var c=rnd((a0+a1)/2),dw=op.dw;
    if(a1-a0>=dw+1) doors.push({o:op.o,pos:pos,a0:c-dw/2,a1:c+dw/2,k:'door'});
  }
}
function openingAlive(U,d){
  var p=Math.round(d.pos*2),any=false;
  for(var i=Math.round(d.a0*2);i<Math.round(d.a1*2);i++){var u=U[ukey(d.o,p,i)];if(u&&u.k!=='gone') any=true;}
  return any;
}
function editedPlan(pl,ed){
  var ck=pl.key+'|'+edHash(ed);
  if(editCache[ck]) return editCache[ck];
  var parts=[],doors=pl.doors.map(function(d){return Object.assign({},d);}),wins=winsOf(pl),gone={},rn=[],ops=opsOf(ed);
  pl.rooms.forEach(function(r){if(r.t!=='court'&&r.t!=='corr') parts.push({x:r.x,y:r.y,w:r.w,h:r.h,orig:r.key});});
  ops.forEach(function(op){
    var i,k;
    if(op.t==='rm'){for(i=op.i0;i<op.i1;i++) gone[ukey(op.o,op.p,i)]=1;}
    else if(op.t==='aw'){for(i=op.i0;i<op.i1;i++) delete gone[ukey(op.o,op.p,i)];}
    else if(op.t==='sp') doSplit(parts,doors,gone,op);
    else if(op.t==='mv') doMove(parts,doors,gone,op);
    else if(op.t==='dadd'){
      var d=Object.assign({},op.d);
      if(d.k==='win'||d.k==='vent'){
        wins=wins.filter(function(w){return !(w.o===d.o&&eq(w.pos,d.pos)&&w.a0<d.a1-EPS&&w.a1>d.a0+EPS);});
        wins.push(d);
      }
      else{
        doors.push(d);
        wins=wins.filter(function(w){return !(w.o===d.o&&eq(w.pos,d.pos)&&w.a0<d.a1-EPS&&w.a1>d.a0+EPS);});
      }
    }
    else if(op.t==='ddel'){
      doors=doors.filter(function(d){return doorKey(d)!==op.key||d.k==='main';});
      wins=wins.filter(function(w){return doorKey(w)!==op.key;});
    }
    else if(op.t==='dw'){
      doors.concat(wins).forEach(function(d){
        if(doorKey(d)!==op.key||d.k==='main') return;
        var c=(d.a0+d.a1)/2;d.a0=c-op.w/2;d.a1=c+op.w/2;
      });
    }
    else if(op.t==='rn') rn.push(op);
  });
  var U=deriveUnits(parts,pl);
  ops.forEach(function(op){if(op.t==='fw') addSegU(U,op.o,op.pos,op.a0,op.a1);});
  wins.forEach(function(w){var p=Math.round(w.pos*2);for(var i=Math.round(w.a0*2);i<Math.round(w.a1*2);i++){var u=U[ukey(w.o,p,i)];if(u) u.k=w.k;}});
  doors.forEach(function(d){var p=Math.round(d.pos*2);for(var i=Math.round(d.a0*2);i<Math.round(d.a1*2);i++){var u=U[ukey(d.o,p,i)];if(u) u.k=d.k;}});
  doors.forEach(function(d){if(d.k!=='main') return;var p=Math.round(d.pos*2);for(var i=Math.round(d.a0*2);i<Math.round(d.a1*2);i++) delete gone[ukey(d.o,p,i)];});
  Object.keys(gone).forEach(function(kk){if(U[kk]) U[kk].k='gone';});
  doors=doors.filter(function(d){return openingAlive(U,d);});
  wins=wins.filter(function(w){return openingAlive(U,w);});
  var rooms=rebuildRooms(pl,parts,U,rn);
  var units=Object.keys(U).map(function(kk){return U[kk];});
  var nWin=wins.filter(function(w){return w.k==='win';}).length,nVent=wins.filter(function(w){return w.k==='vent';}).length;
  var sc=scaleFor(pl.cfg.area),sched=[],net=0;
  rooms.forEach(function(r){
    if(!r.id||r.hidden) return;
    var a=rArea(r),idl=ideal(r.id,sc),fit;
    if(r.t!=='pass') net+=a;
    if(r.t==='pass') return;
    fit=a<MINA[r.id]?'small':(a<idl*0.85?'tight':(a>idl*1.3?'generous':'good'));
    var vz=vastuOf(r,pl.W,pl.D);
    sched.push({n:r.n+(r.merged&&r.merged.length?' (incl. '+r.merged.join(', ')+')':''),w:r.w,h:r.h,a:a,ideal:Math.round(idl),fit:fit,key:r.key,zone:vz.zone,vastu:vz.status,vbest:vz.best});
  });
  var noDoor=[];
  rooms.forEach(function(r){
    if(r.hidden||r.t==='court'||r.t==='corr'||r.t==='pass') return;
    var ok=false;
    rparts(r).forEach(function(q){
      doors.forEach(function(d){
        if(d.o==='H'&&(eq(d.pos,q.y)||eq(d.pos,q.y+q.h))&&d.a0<q.x+q.w-0.4&&d.a1>q.x+0.4) ok=true;
        if(d.o==='V'&&(eq(d.pos,q.x)||eq(d.pos,q.x+q.w))&&d.a0<q.y+q.h-0.4&&d.a1>q.y+0.4) ok=true;
      });
      [['H',q.y,q.x,q.x+q.w],['H',q.y+q.h,q.x,q.x+q.w],['V',q.x,q.y,q.y+q.h],['V',q.x+q.w,q.y,q.y+q.h]].forEach(function(e){
        var p=Math.round(e[1]*2);
        for(var i=Math.round(e[2]*2);i<Math.round(e[3]*2);i++){var u=U[ukey(e[0],p,i)];if(u&&u.k==='gone'){var other=(e[0]==='H')?partAt(parts,(i+0.5)/2,e[1]+(Math.abs(e[1]-q.y)<EPS?-0.3:0.3)):partAt(parts,e[1]+(Math.abs(e[1]-q.x)<EPS?-0.3:0.3),(i+0.5)/2);if(other<0) ok=true;}}
      });
    });
    if(!ok&&r.id) noDoor.push(r.n);
  });
  /* openings left by removed walls (for beam checks) */
  var opened=[],lines={};
  units.forEach(function(u){if(u.k==='gone'&&u.c==='in'){var l=u.o+'|'+u.p;(lines[l]=lines[l]||[]).push(u.i);}});
  Object.keys(lines).forEach(function(l){
    var pr=l.split('|'),arr=lines[l].sort(function(a,b){return a-b;}),s=arr[0],pv=arr[0],j;
    function fl(a,b){opened.push({o:pr[0],pos:+pr[1]/2,a0:a/2,a1:(b+1)/2,len:(b+1-a)/2});}
    for(j=1;j<arr.length;j++){if(arr[j]!==pv+1){fl(s,pv);s=arr[j];}pv=arr[j];}
    fl(s,pv);
  });
  var ghosts=[],gl={};
  units.forEach(function(u){if(u.k==='gone'){var l=u.o+'|'+u.p;(gl[l]=gl[l]||[]).push(u.i);}});
  Object.keys(gl).forEach(function(l){
    var pr=l.split('|'),arr=gl[l].sort(function(a,b){return a-b;}),s0=arr[0],pv=arr[0],j;
    function fl(a,b){ghosts.push({id:pr[0]+'|'+pr[1]+'|'+a+'|'+(b+1),o:pr[0],p:+pr[1],i0:a,i1:b+1,pos:+pr[1]/2,a0:a/2,a1:(b+1)/2,len:(b+1-a)/2});}
    for(j=1;j<arr.length;j++){if(arr[j]!==pv+1){fl(s0,pv);s0=arr[j];}pv=arr[j];}
    fl(s0,pv);
  });
  var pl2=Object.assign({},pl,{rooms:rooms,units:units,doors:doors,wins:wins,parts:parts,ghosts:ghosts,opened:opened,nDoor:doors.filter(function(d){return d.k==='door';}).length,nWin:nWin,nVent:nVent,sched:sched,eff:net/pl.area,noDoor:noDoor,key:ck,_ss:undefined,edited:true});
  editCache[ck]=pl2;
  return pl2;
}
function rebuildRooms(pl,parts,U,renames){
  var n=parts.length,par=[],i,j,byKey={};
  for(i=0;i<n;i++) par[i]=i;
  function find(a){while(par[a]!==a){par[a]=par[par[a]];a=par[a];}return a;}
  function goneRun(o,p,i0,i1){var run=0,best=0,i;for(i=i0;i<i1;i++){var u=U[ukey(o,p,i)];if(u&&u.k==='gone'){run++;best=Math.max(best,run);}else run=0;}return best;}
  for(i=0;i<n;i++) for(j=i+1;j<n;j++){
    var c=false;
    [[parts[i],parts[j]],[parts[j],parts[i]]].forEach(function(pr){
      var L=pr[0],R=pr[1],y0,y1,x0,x1;
      if(eq(L.x+L.w,R.x)){y0=Math.max(L.y,R.y);y1=Math.min(L.y+L.h,R.y+R.h);if(y1-y0>0.4&&goneRun('V',Math.round(R.x*2),Math.round(y0*2),Math.round(y1*2))>=4) c=true;}
      if(eq(L.y+L.h,R.y)){x0=Math.max(L.x,R.x);x1=Math.min(L.x+L.w,R.x+R.w);if(x1-x0>0.4&&goneRun('H',Math.round(R.y*2),Math.round(x0*2),Math.round(x1*2))>=4) c=true;}
    });
    if(c) par[find(i)]=find(j);
  }
  pl.rooms.forEach(function(r){byKey[r.key]=r;});
  var comps={},order=[];
  parts.forEach(function(q,ix){var r=find(ix);if(!comps[r]){comps[r]=[];order.push(r);}comps[r].push(q);});
  var recs=[],per={};
  order.forEach(function(root,ci){
    var cp=comps[root],g={},bestK=null,bestW=-1;
    cp.forEach(function(q){(g[q.orig]=g[q.orig]||[]).push(q);});
    Object.keys(g).forEach(function(k){
      var a=0;g[k].forEach(function(q){a+=q.w*q.h;});
      var t=byKey[k].t,wgt=a*((t==='wet'||t==='pass'||t==='store')?0.5:1);
      if(wgt>bestW){bestW=wgt;bestK=k;}
    });
    Object.keys(g).forEach(function(k){
      var a=0,big=g[k][0];g[k].forEach(function(q){a+=q.w*q.h;if(q.w*q.h>big.w*big.h) big=q;});
      var rec={orig:k,comp:ci,area:a,parts:g[k],big:big,host:k===bestK};
      (per[k]=per[k]||[]).push(rec);recs.push(rec);
    });
  });
  var hostOf={},names=['A','B','C','D','E','F'];
  recs.forEach(function(rec){
    var L=per[rec.orig];L.sort(function(a,b){return b.area-a.area;});
    rec.idx=L.indexOf(rec);rec.multi=L.length>1;
  });
  recs.forEach(function(rec){
    var o=byKey[rec.orig];
    rec.key=rec.idx===0?o.key:o.key+'_'+names[rec.idx].toLowerCase();
    rec.n=rec.multi?o.n+' '+names[rec.idx]:o.n;
    if(rec.host) hostOf[rec.comp]=rec;
  });
  var rooms=[];
  pl.rooms.forEach(function(o){
    if(o.t==='court'||o.t==='corr'){rooms.push(Object.assign({},o));return;}
    var L=per[o.key]||[];
    L.slice().sort(function(a,b){return a.comp-b.comp;}).forEach(function(rec){
      var base=Object.assign({},o,{key:rec.key,n:rec.n,x:rec.big.x,y:rec.big.y,w:rec.big.w,h:rec.big.h});
      if(rec.host){
        var all=[],merged=[];
        recs.forEach(function(r2){if(r2.comp===rec.comp){r2.parts.forEach(function(q){all.push({x:q.x,y:q.y,w:q.w,h:q.h});});if(r2!==rec) merged.push(r2.n);}});
        base.parts=all;base.merged=merged;
      }else{
        base.hidden=true;base.into=hostOf[rec.comp].key;base.parts=rec.parts.map(function(q){return {x:q.x,y:q.y,w:q.w,h:q.h};});
      }
      rooms.push(base);
    });
  });
  (renames||[]).forEach(function(op){
    rooms.forEach(function(r){
      if(r.hidden||r.t==='court'||r.t==='corr') return;
      if(partAt(rparts(r),op.x,op.y)>=0&&op.n) {r.n=op.n;r.renamed=true;}
    });
  });
  return rooms;
}
function runRooms(pl,run){
  var V=run.o==='V',A=[],B=[];
  pl.rooms.forEach(function(r){
    if(r.hidden||r.t==='court'||r.t==='corr') return;
    rparts(r).forEach(function(q){
      var e0=V?q.y:q.x,e1=V?q.y+q.h:q.x+q.w;
      if(e1<=run.a0+EPS||e0>=run.a1-EPS) return;
      if(eq(V?q.x+q.w:q.y+q.h,run.pos)&&A.indexOf(r)<0) A.push(r);
      if(eq(V?q.x:q.y,run.pos)&&B.indexOf(r)<0) B.push(r);
    });
  });
  return {A:A,B:B};
}
function runMove(pl,run){
  var parts=pl.parts||pl.rooms.filter(function(r){return r.t!=='court'&&r.t!=='corr';}).map(function(r){return {x:r.x,y:r.y,w:r.w,h:r.h};}),gone={};
  pl.units.forEach(function(u){if(u.k==='gone') gone[ukey(u.o,u.p,u.i)]=1;});
  return moveInfo(parts,run.o,run.pos,run.a0,run.a1,gone);
}
function planParts(pl){
  if(pl.parts) return pl.parts.map(function(q){return Object.assign({},q);});
  return pl.rooms.filter(function(r){return r.t!=='court'&&r.t!=='corr';}).map(function(r){return {x:r.x,y:r.y,w:r.w,h:r.h,orig:r.key};});
}
function snapDoor(pl,x,y,w,k,opts){
  opts=opts||{};
  var isWin=(k==='win'||k==='vent'),cands=[];
  function busy(r,a,b){
    for(var i=Math.round(a*2);i<Math.round(b*2);i++){
      var u=r.units.filter(function(q){return q.i===i;})[0];
      if(!u) return true;
      if(u.k==='door'||u.k==='main'||u.k==='open') return true;
    }
    return false;
  }
  wallRuns(pl).forEach(function(r){
    if(r.len<w+0.5) return;
    if(isWin&&r.cls!=='out') return;
    var along=r.o==='H'?x:y,across=r.o==='H'?y:x;
    var dA=along<r.a0?r.a0-along:(along>r.a1?along-r.a1:0),dd=Math.sqrt(dA*dA+Math.pow(across-r.pos,2));
    if(dd<=2) cands.push({r:r,dd:dd,along:along});
  });
  cands.sort(function(a,b){return a.dd-b.dd;});
  for(var ci=0;ci<cands.length;ci++){
    var r=cands[ci].r,lo=r.a0+w/2,hi=r.a1-w/2;
    if(hi<lo) continue;
    var c0=rnd(Math.max(lo,Math.min(hi,cands[ci].along)));
    for(var off=0;off<=r.len;off+=0.5){
      var tries=off===0?[0]:[off,-off];
      for(var ti=0;ti<tries.length;ti++){
        var c=c0+tries[ti];
        if(c<lo-1e-6||c>hi+1e-6) continue;
        if(!busy(r,c-w/2,c+w/2)) return {o:r.o,pos:r.pos,a0:c-w/2,a1:c+w/2,k:k||'door',run:r.id};
      }
    }
  }
  return null;
}
var NBC={bed:[9.5,2.4],din:[9.5,2.4],kit:[4.5,1.8]};
function nbcRule(r){
  if(NBC[r.t]) return {a:NBC[r.t][0],w:NBC[r.t][1],n:r.t==='kit'?'kitchen':'habitable room'};
  if(r.t==='wet'){
    if(/\+/.test(r.n)||/bath.*wc/i.test(r.n)) return {a:2.8,w:1.2,n:'bath with WC'};
    if(/wc/i.test(r.n)) return {a:1.1,w:0.9,n:'WC'};
    return {a:1.8,w:1.2,n:'bathroom'};
  }
  return null;
}
function designChecks(pl,S){
  var out=[],U={};
  pl.units.forEach(function(u){U[ukey(u.o,u.p,u.i)]=u;});
  function add(l,m){out.push({lvl:l,msg:m});}
  var vis=pl.rooms.filter(function(r){return !r.hidden&&r.t!=='court'&&r.t!=='corr';});
  vis.forEach(function(r){
    if(r.t==='pass') return;
    var a=rArea(r)*0.092903,w=Math.min(r.w,r.h)*0.3048,rule=nbcRule(r);
    if(rule){
      var wide=r.parts&&r.parts.length>1;
      if(a<rule.a-0.01) add(a<rule.a*0.8?'err':'warn',r.n+': '+(Math.round(a*10)/10)+' m\u00B2 is below the NBC minimum of '+rule.a+' m\u00B2 for a '+rule.n+'.');
      else if(!wide&&w<rule.w-0.01) add('warn',r.n+': width '+(Math.round(w*100)/100)+' m is below the NBC minimum of '+rule.w+' m.');
    }
    if(r.parts&&r.parts.length>1&&r.merged&&r.merged.length) add('info',r.n+' now includes '+r.merged.join(', ')+'.');
    if(rule&&(r.t==='bed'||r.t==='din'||r.t==='kit'||r.t==='wet')){
      var lit=false;
      rparts(r).forEach(function(q){
        [['H',q.y,q.x,q.x+q.w],['H',q.y+q.h,q.x,q.x+q.w],['V',q.x,q.y,q.y+q.h],['V',q.x+q.w,q.y,q.y+q.h]].forEach(function(e){
          var p=Math.round(e[1]*2);
          for(var i=Math.round(e[2]*2);i<Math.round(e[3]*2);i++){var u=U[ukey(e[0],p,i)];if(u&&(u.k==='win'||u.k==='vent'||u.c==='ct'||(u.k==='gone'&&u.c!=='in'))) lit=true;}
        });
      });
      if(!lit) add('warn',r.n+' has no window and no courtyard wall, so it gets no daylight or cross ventilation.');
    }
  });
  (pl.noDoor||[]).forEach(function(n){add('err',n+' has no door or opening, so it cannot be reached.');});
  var kit=vis.filter(function(r){return r.key==='kitchen';})[0];
  if(kit){
    pl.rooms.forEach(function(r){
      if(r.t!=='wet') return;
      var touch=false;
      rparts(kit).forEach(function(a){rparts(r).forEach(function(b){
        var x0,x1,y0,y1,i,p;
        if(eq(a.x+a.w,b.x)||eq(b.x+b.w,a.x)){
          y0=Math.max(a.y,b.y);y1=Math.min(a.y+a.h,b.y+b.h);p=Math.round((eq(a.x+a.w,b.x)?b.x:a.x)*2);
          if(y1-y0>0.9) for(i=Math.round(y0*2);i<Math.round(y1*2);i++){var u=U[ukey('V',p,i)];if(u&&u.k!=='gone') touch=true;}
        }
        if(eq(a.y+a.h,b.y)||eq(b.y+b.h,a.y)){
          x0=Math.max(a.x,b.x);x1=Math.min(a.x+a.w,b.x+b.w);p=Math.round((eq(a.y+a.h,b.y)?b.y:a.y)*2);
          if(x1-x0>0.9) for(i=Math.round(x0*2);i<Math.round(x1*2);i++){var u2=U[ukey('H',p,i)];if(u2&&u2.k!=='gone') touch=true;}
        }
      });});
      if(touch) add('warn',r.n+' shares a wall with the kitchen. Keep a buffer (store, lobby) between a bath or WC and the kitchen.');
    });
  }
  (pl.sched||[]).forEach(function(r){if(r.vastu==='check') add('info',r.n+' sits in the '+r.zone+' zone (Vastu best: '+r.vbest+').');});
  (pl.opened||[]).forEach(function(o){
    if(o.len>=8) add('warn','Opening '+ft(o.len)+' wide where a wall was removed. The roof load needs an RCC or MS beam over it, sized by the structural engineer.');
  });
  var small=0;pl.doors.forEach(function(d){if(d.k==='door'&&d.a1-d.a0<2.45) small++;});
  if(small) add('info',small+' door'+(small>1?'s are':' is')+' narrower than 2.5 ft.');
  var order={err:0,warn:1,info:2};
  out.sort(function(a,b){return order[a.lvl]-order[b.lvl];});
  return out;
}


function wallRuns(pl){
  var U={},lines={},runs=[];
  pl.units.forEach(function(u){if(u.k!=='gone') U[u.o+'|'+u.p+'|'+u.i]=u;});
  Object.keys(U).forEach(function(k){var u=U[k],l=u.o+'|'+u.p;(lines[l]=lines[l]||[]).push(u);});
  Object.keys(lines).forEach(function(l){
    var arr=lines[l].sort(function(a,b){return a.i-b.i;}),o=arr[0].o,p=arr[0].p,cur=null;
    function perp(i){return o==='H'?(U['V|'+i+'|'+(p-1)]||U['V|'+i+'|'+p]):(U['H|'+i+'|'+(p-1)]||U['H|'+i+'|'+p]);}
    arr.forEach(function(u){
      if(cur&&u.i===cur.i1&&!perp(u.i)){cur.i1=u.i+1;cur.units.push(u);}
      else{cur={o:o,p:p,i0:u.i,i1:u.i+1,units:[u]};runs.push(cur);}
    });
  });
  runs.forEach(function(r){
    r.id=r.o+'|'+r.p+'|'+r.i0+'|'+r.i1;r.len=(r.i1-r.i0)/2;
    r.pos=r.p/2;r.a0=r.i0/2;r.a1=r.i1/2;r.cls=r.units[0].c;
    r.hasDoor=r.units.some(function(u){return u.k==='door'||u.k==='main'||u.k==='open';});
  });
  return runs;
}
function buildDXF(pl,S){
  var MM=304.8,L=[],layers={'A-WALL-OUTR':7,'A-WALL-INNR':8,'A-DOOR':3,'A-GLAZ':5,'A-AREA':9,'A-ANNO-TEXT':2,'A-ANNO-DIMS':6,'A-COLS':1,'P-SUPPLY':5,'P-DRAIN':30,'E-CONDUIT':2,'S-TANKS':4};
  function X(x){return (x*MM).toFixed(1);}
  function Y(y){return ((pl.D-y)*MM).toFixed(1);}
  function line(l,x1,y1,x2,y2){L.push('0\nLINE\n8\n'+l+'\n10\n'+X(x1)+'\n20\n'+Y(y1)+'\n30\n0.0\n11\n'+X(x2)+'\n21\n'+Y(y2)+'\n31\n0.0');}
  function text(l,x,y,h,t){L.push('0\nTEXT\n8\n'+l+'\n10\n'+X(x)+'\n20\n'+Y(y)+'\n30\n0.0\n40\n'+h+'\n1\n'+String(t).replace(/[\r\n]/g,' '));}
  function rect(l,x0,y0,x1,y1){line(l,x0,y0,x1,y0);line(l,x1,y0,x1,y1);line(l,x1,y1,x0,y1);line(l,x0,y1,x0,y0);}
  var TH={out:0.75,ct:0.5,in:0.375};
  wallRuns(pl).forEach(function(r){
    var layer=r.cls==='out'?'A-WALL-OUTR':'A-WALL-INNR',t=TH[r.cls]/2,segs=[],cur=null;
    r.units.forEach(function(u){
      var open=(u.k==='door'||u.k==='main'||u.k==='open');
      if(open){cur=null;return;}
      if(cur&&u.i===cur.i1){cur.i1=u.i+1;}else{cur={i0:u.i,i1:u.i+1};segs.push(cur);}
    });
    segs.forEach(function(sg){
      var a0=sg.i0/2,a1=sg.i1/2;
      if(r.o==='H') rect(layer,a0,r.pos-t,a1,r.pos+t);else rect(layer,r.pos-t,a0,r.pos+t,a1);
    });
  });
  var wins=pl.wins||winsOf(pl);
  wins.forEach(function(w){
    [-0.1,0,0.1].forEach(function(o){if(w.o==='H') line('A-GLAZ',w.a0,w.pos+o,w.a1,w.pos+o);else line('A-GLAZ',w.pos+o,w.a0,w.pos+o,w.a1);});
  });
  pl.doors.forEach(function(d){
    if(d.k==='open') return;
    var W=d.a1-d.a0,H=d.o==='H',mid=(d.a0+d.a1)/2,pa=H?[mid,d.pos-0.9]:[d.pos-0.9,mid],pb=H?[mid,d.pos+0.9]:[d.pos+0.9,mid];
    var ra=roomAt(pl,pa[0],pa[1]),rb=roomAt(pl,pb[0],pb[1]),sg=1;
    function ok(r){return r&&r.t!=='corr'&&r.t!=='court';}
    if(ok(ra)&&!ok(rb)) sg=-1;else if(ok(ra)&&ok(rb)) sg=(rArea(ra)<rArea(rb))?-1:1;else if(!ra&&rb) sg=-1;
    var h0=d.a0,n=10,i,prev=null;
    if(H){line('A-DOOR',h0,d.pos,h0,d.pos+sg*W);}else{line('A-DOOR',d.pos,h0,d.pos+sg*W,h0);}
    for(i=0;i<=n;i++){
      var ang=Math.PI/2*i/n,px=H?h0+W*Math.sin(ang):d.pos+sg*W*Math.cos(ang),py=H?d.pos+sg*W*Math.cos(ang):h0+W*Math.sin(ang);
      if(prev) line('A-DOOR',prev[0],prev[1],px,py);
      prev=[px,py];
    }
  });
  pl.rooms.forEach(function(r){
    if(r.hidden) return;
    rparts(r).forEach(function(q){rect('A-AREA',q.x,q.y,q.x+q.w,q.y+q.h);});
    if(r.t==='corr') return;
    var c={x:r.x+r.w/2,y:r.y+r.h/2},nm=r.n.toUpperCase(),h=250;
    text('A-ANNO-TEXT',c.x-nm.length*h*0.3/MM,c.y-0.4,h,nm);
    if(r.t!=='court') text('A-ANNO-TEXT',c.x-4*h*0.3/MM,c.y+0.6,h*0.75,(Math.round(rArea(r)*10)/10)+' sq ft');
  });
  (pl.pillars||[]).forEach(function(p){rect('A-COLS',p[0]-0.45,p[1]-0.45,p[0]+0.45,p[1]+0.45);});
  line('A-ANNO-DIMS',0,pl.D+2,pl.W,pl.D+2);line('A-ANNO-DIMS',0,pl.D+1.5,0,pl.D+2.5);line('A-ANNO-DIMS',pl.W,pl.D+1.5,pl.W,pl.D+2.5);
  text('A-ANNO-DIMS',pl.W/2-2,pl.D+2.8,260,ft(pl.W));
  line('A-ANNO-DIMS',pl.W+2,0,pl.W+2,pl.D);line('A-ANNO-DIMS',pl.W+1.5,0,pl.W+2.5,0);line('A-ANNO-DIMS',pl.W+1.5,pl.D,pl.W+2.5,pl.D);
  text('A-ANNO-DIMS',pl.W+2.6,pl.D/2,260,ft(pl.D));
  if(svcOn(S)){
    var sv=servicesData(pl,S),f=S.svc;
    var lay={supply:'P-SUPPLY',sump:'P-SUPPLY',drain:'P-DRAIN',elec:'E-CONDUIT'};
    sv.pipes.forEach(function(p){
      if(!(p.k==='elec'?f.elec:(f.plumb||(f.tanks&&p.z<1)))) return;
      for(var i=0;i+1<p.pts.length;i++) line(lay[p.k],p.pts[i][0],p.pts[i][1],p.pts[i+1][0],p.pts[i+1][1]);
    });
    if(f.tanks){
      var T=sv.tanks;
      rect('S-TANKS',T.septic.x-T.septic.w/2,T.septic.y-T.septic.h/2,T.septic.x+T.septic.w/2,T.septic.y+T.septic.h/2);
      rect('S-TANKS',T.sump.x-T.sump.w/2,T.sump.y-T.sump.h/2,T.sump.x+T.sump.w/2,T.sump.y+T.sump.h/2);
      rect('S-TANKS',T.soak.x-T.soak.d/2,T.soak.y-T.soak.d/2,T.soak.x+T.soak.d/2,T.soak.y+T.soak.d/2);
      text('A-ANNO-TEXT',T.septic.x-3,T.septic.y-T.septic.h/2-0.8,200,'SEPTIC TANK');
      text('A-ANNO-TEXT',T.sump.x-3,T.sump.y-T.sump.h/2-0.8,200,'WATER SUMP '+T.sump.cap+' L');
    }
  }
  var h='0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n';
  h+='0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLTYPE\n70\n1\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n0\nENDTAB\n';
  var ln=Object.keys(layers);
  h+='0\nTABLE\n2\nLAYER\n70\n'+ln.length+'\n';
  ln.forEach(function(k){h+='0\nLAYER\n2\n'+k+'\n70\n0\n62\n'+layers[k]+'\n6\nCONTINUOUS\n';});
  h+='0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'+L.join('\n')+'\n0\nENDSEC\n0\nEOF\n';
  return h;
}

function buildPickMeshes(pl,S){
  var R=mkRoof(pl,S),PL=pl.plinth,out=[],mat=new THREE.MeshBasicMaterial({visible:false});
  wallRuns(pl).forEach(function(r){
    var hm=0;
    r.units.forEach(function(u){var mx=u.o==='H'?(u.i+0.5)/2:u.p/2,my=u.o==='H'?u.p/2:(u.i+0.5)/2;hm=Math.max(hm,R.wallH(u.o,mx,my));});
    var L=r.len,cx=r.o==='H'?(r.i0+r.i1)/4:r.p/2,cy=r.o==='H'?r.p/2:(r.i0+r.i1)/4,sx=r.o==='H'?L:1.4,sz=r.o==='H'?1.4:L;
    var m=new THREE.Mesh(new THREE.BoxGeometry(sx,hm,sz),mat);
    m.position.set(cx-pl.W/2,PL+hm/2,cy-pl.D/2);
    m.userData={wall:r.id,cx:cx,cy:cy,hm:hm,sx:sx,sz:sz,o:r.o};out.push(m);
  });
  pl.doors.forEach(function(d){
    var mid=(d.a0+d.a1)/2,L=d.a1-d.a0,cx=d.o==='H'?mid:d.pos,cy=d.o==='H'?d.pos:mid,sx=d.o==='H'?L:1.9,sz=d.o==='H'?1.9:L;
    var m=new THREE.Mesh(new THREE.BoxGeometry(sx,7,sz),mat);
    m.position.set(cx-pl.W/2,PL+3.5,cy-pl.D/2);
    m.userData={door:doorKey(d),k:d.k,main:d.k==='main',cx:cx,cy:cy,sx:sx,sz:sz,o:d.o,exit:d.exit};out.push(m);
  });
  return out;
}
function planFor(S){
  var pl=planBase(S);
  var e=S.edits;
  if(e&&e.key===pl.key&&edCount(e)>0) pl=editedPlan(pl,e);
  if(S.wetOut&&!pl.outhouse) pl.outhouse=outhouseFor(pl,FROT[S.facing]?S.facing:'N',S);
  return pl;
}
/* bath and WC in a separate block outside the house: west side (south when the entrance faces west), 6 ft away, door facing the house */
function outhouseFor(pl,f,S){
  S=S||{};var EX=pl.ext||{l:0,r:0,t:0,b:0},side=f==='E'?'S':'W',septW=S.sept!=='N',gap=side==='W'&&septW?8:6,along=10,dep=6.75,bw=5.5,o={side:side,gap:gap,rooms:[],doors:[]},W=pl.W,D=pl.D,t=0.375;
  if(side==='W'){o.x1=-(EX.l||0)-gap;o.x0=o.x1-dep;o.y0=Math.max(1,D/2-along/2);if(septW) o.y0=Math.max(o.y0,Math.round(D*0.3*2)/2+4.5);o.y1=o.y0+along;
    o.rooms.push({n:'Bath',x:o.x0+t,y:o.y0+t,w:dep-2*t,h:bw-t*1.5},{n:'WC',x:o.x0+t,y:o.y0+bw+t/2,w:dep-2*t,h:along-bw-t*1.5});
    o.rooms.forEach(function(r){o.doors.push({o:'V',pos:o.x1,a0:r.y+r.h/2-1.25,a1:r.y+r.h/2+1.25});});
    o.path={x0:o.x1,x1:-(EX.l||0),y0:(o.y0+o.y1)/2-1.5,y1:(o.y0+o.y1)/2+1.5};}
  else{o.y0=D+(EX.b||0)+gap;o.y1=o.y0+dep;o.x0=Math.max(1,W/2-along/2);o.x1=o.x0+along;
    o.rooms.push({n:'Bath',x:o.x0+t,y:o.y0+t,w:bw-t*1.5,h:dep-2*t},{n:'WC',x:o.x0+bw+t/2,y:o.y0+t,w:along-bw-t*1.5,h:dep-2*t});
    o.rooms.forEach(function(r){o.doors.push({o:'H',pos:o.y0,a0:r.x+r.w/2-1.25,a1:r.x+r.w/2+1.25});});
    o.path={x0:(o.x0+o.x1)/2-1.5,x1:(o.x0+o.x1)/2+1.5,y0:D+(EX.b||0),y1:o.y0};}
  o.area=along*dep;o.wallLen=2*(along+dep)+dep;o.wallH=7.5;return o;
}
function courtShort(cfg,pl){
  if(cfg.cy!=='L'||cfg.custom) return false;
  var tg=courtTarget(Object.assign({},cfg,{area:pl.area}));
  return pl.court.w<0.9*tg||pl.court.h<0.9*tg;
}
function planBase(S){
  var cfg=normCfg(S),pl=buildPlan(cfg);
  function bad(p){return (p.dropped&&!cfg.custom&&cfg.k>0)||courtShort(cfg,p)||(cfg.cy==='L'&&!cfg.custom&&p.sched.some(function(r){return r.fit==='small';}));}
  if(!cfg.custom&&bad(pl)){
    for(var a=cfg.area+25;a<=1600;a+=25){
      var p2=buildPlan(Object.assign({},cfg,{area:a}));
      if(!bad(p2)){p2.grownFrom=cfg.area;return p2;}
    }
  }
  return pl;
}
function buildPlan(cfg){
  var jsd=cfg.jag?cfg.jag.sides:null,key=cfgKey(cfg)+'|'+(cfg.vd||'')+'|'+(cfg.jag?cfg.jag.h+(cfg.jag.ledges?'L':'N')+(jsd.n?'n':'')+(jsd.s?'s':'')+(jsd.e?'e':'')+(jsd.w?'w':'')+(cfg.jag.split.on?'S'+(cfg.jag.split.all?'A':'F')+cfg.jag.split.h+'x'+cfg.jag.split.steps+(cfg.jag.split.wing?'w':''):''):'')+(cfg.exits&&cfg.exits.e?'|E':'');
  if(planCache[key]) return planCache[key];
  if(Object.keys(planCache).length>80){planCache={};optCache={};}
  var O=optimise(cfg),lay=O.lay,W=lay.W,D=lay.D,rooms=lay.rooms,Cr=lay.Cr,court=lay.court,k=lay.par.k;
  var by={};rooms.forEach(function(r){by[r.key]=r;});
  var doors=[],noDoor=[];
  function addDoor(seg,w,kind){
    if(!seg) return false;
    var len=seg.a1-seg.a0;if(len<2.5) return false;
    var ww=Math.min(w,Math.floor((len-1)*2)/2);if(ww<2) return false;
    var c=(seg.a0+seg.a1)/2,a0=rnd(c-ww/2);
    if(a0<seg.a0+0.5) a0=seg.a0+0.5;
    var a1=a0+ww;if(a1>seg.a1-0.5){a1=seg.a1-0.5;a0=a1-ww;}
    doors.push({o:seg.o,pos:seg.pos,a0:rnd(a0),a1:rnd(a1),k:kind||'door'});
    return true;
  }
  function openDoor(seg){
    if(!seg) return false;
    var a0=seg.a0+1,a1=seg.a1-1;
    if(a1-a0<3){return addDoor(seg,3);}
    doors.push({o:seg.o,pos:seg.pos,a0:rnd(a0),a1:rnd(a1),k:'open'});return true;
  }
  rooms.forEach(function(r){
    if(r.t==='court'||r.t==='corr') return;
    var kk=r.key,wet=(r.t==='wet'),dw=wet?2.5:3,ok=false;
    if(kk==='pass'){openDoor(adj(r,Cr));return;}
    if(r.att){addDoor(adj(r,by[r.parent]),2.5);return;}
    if(kk==='entry'||kk==='lobby'){ok=openDoor(adj(r,Cr));}
    else if(wet||kk==='util'){ok=by.pass?addDoor(adj(r,by.pass),dw):addDoor(adj(r,Cr),dw);}
    else if(kk==='kitchen'){ok=addDoor(adj(r,by.dining),3);}
    else if(kk==='dining'){ok=addDoor(adj(r,Cr),3);}
    else if(kk==='store'){ok=addDoor(adj(r,by.kitchen),3)||addDoor(adj(r,Cr),3);}
    else if(kk==='pooja'){ok=addDoor(adj(r,by.entry),3);addDoor(adj(r,Cr),3);}
    else{ok=addDoor(adj(r,Cr),3)||addDoor(adj(r,by.lobby),3)||addDoor(adj(r,by.entry),3);}
    if(!ok) noDoor.push(r.n);
  });
  var er=by.entry,mw=Math.max(2.5,Math.floor(Math.min(4,er.w-1.5)*2)/2),ma1=rnd(er.x+er.w-0.75);
  if(by.lobby&&cfg.exits&&cfg.exits.s){
    var lcen=by.lobby.x+by.lobby.w/2,want=rnd(lcen-(cfg.backOff===undefined?-3:cfg.backOff)+mw/2);
    ma1=Math.max(er.x+mw+0.75,Math.min(er.x+er.w-0.75,want));
  }
  doors.push({o:'H',pos:0,a0:ma1-mw,a1:ma1,k:'main'});
  var cex=cfg.exits||{},sight=null;
  if(by.lobby){var lb=by.lobby,lbc=lb.x+lb.w/2,lb0=rnd(lbc-1.75);doors.push({o:'H',pos:D,a0:lb0,a1:lb0+3.5,k:'door',exit:'S'});}
  if(cex.e&&by.dining){var dn=by.dining,dcy=dn.y+dn.h/2,d0e=rnd(dcy-1.75);doors.push({o:'V',pos:W,a0:d0e,a1:d0e+3.5,k:'door',exit:'E'});}
  if(cex.w&&by.util){var ut=by.util,ucy=ut.y+ut.h/2,d0w=rnd(ucy-1.5);doors.push({o:'V',pos:0,a0:d0w,a1:d0w+3,k:'door',exit:'W'});}
  if(by.lobby){
    var xf=ma1-mw/2,bd=doors.filter(function(d){return d.exit==='S';})[0],xbk=(bd.a0+bd.a1)/2,off=xbk-xf;
    var archN=doors.filter(function(d){return d.o==='H'&&d.k==='open'&&Math.abs(d.pos-Cr.y)<1e-6&&d.a0>=er.x-0.01&&d.a1<=er.x+er.w+0.01;})[0];
    var archS=doors.filter(function(d){return d.o==='H'&&d.k==='open'&&Math.abs(d.pos-(Cr.y+Cr.h))<1e-6&&d.a0>=by.lobby.x-0.01&&d.a1<=by.lobby.x+by.lobby.w+0.01;})[0];
    var okN=false,okS=false;
    if(archN){var xN=xf+off*(Cr.y/D);okN=xN>=archN.a0&&xN<=archN.a1;}
    if(archS){var xS=xf+off*((Cr.y+Cr.h)/D);okS=xS>=archS.a0&&xS<=archS.a1;}
    sight={front:xf,back:xbk,offset:off,visible:okN&&okS,straight:Math.abs(off)<0.5,asked:cfg.backOff};
  }

  var U={};
  function addSeg(o,pos,a0,a1){
    var p=Math.round(pos*2),s=Math.round(a0*2),e=Math.round(a1*2);
    for(var i=s;i<e;i++){var kk=o+'|'+p+'|'+i;if(!U[kk]) U[kk]={o:o,p:p,i:i,k:'wall',c:'in'};}
  }
  rooms.forEach(function(r){
    if(r.t==='court'||r.t==='corr') return;
    addSeg('H',r.y,r.x,r.x+r.w);addSeg('H',r.y+r.h,r.x,r.x+r.w);
    addSeg('V',r.x,r.y,r.y+r.h);addSeg('V',r.x+r.w,r.y,r.y+r.h);
  });
  var W2=W*2,D2=D*2,cx0=Cr.x*2,cx1=(Cr.x+Cr.w)*2,cy0=Cr.y*2,cy1=(Cr.y+Cr.h)*2;
  Object.keys(U).forEach(function(kk){
    var u=U[kk];
    if((u.o==='H'&&(u.p===0||u.p===D2))||(u.o==='V'&&(u.p===0||u.p===W2))) u.c='out';
    else if(u.o==='H'&&(u.p===cy0||u.p===cy1)&&u.i>=cx0&&u.i<cx1) u.c='ct';
    else if(u.o==='V'&&(u.p===cx0||u.p===cx1)&&u.i>=cy0&&u.i<cy1) u.c='ct';
  });
  doors.forEach(function(d){
    var p=Math.round(d.pos*2),s=Math.round(d.a0*2),e=Math.round(d.a1*2);
    for(var i=s;i<e;i++){var u=U[d.o+'|'+p+'|'+i];if(u) u.k=d.k;}
  });
  var nWin=0,nVent=0;
  rooms.forEach(function(r){
    if(r.t==='court'||r.t==='corr'||r.t==='pass'||r.t==='entry') return;
    var vent=(r.t==='wet'||r.t==='store'),wu=vent?3:6,edges=[];
    if(r.y===0) edges.push(['H',0,r.x*2,(r.x+r.w)*2]);
    if(r.y+r.h===D) edges.push(['H',D2,r.x*2,(r.x+r.w)*2]);
    if(r.x===0) edges.push(['V',0,r.y*2,(r.y+r.h)*2]);
    if(r.x+r.w===W) edges.push(['V',W2,r.y*2,(r.y+r.h)*2]);
    edges.forEach(function(e){
      var len=(e[3]-e[2])/2,cnt=len>=12?2:1;
      for(var q=1;q<=cnt;q++){
        var ctr=e[2]+(e[3]-e[2])*q/(cnt+1),st=Math.round(ctr-wu/2),ok=true,i;
        for(i=st;i<st+wu;i++){var u=U[e[0]+'|'+e[1]+'|'+i];if(!u||u.k!=='wall'){ok=false;break;}}
        if(ok){for(i=st;i<st+wu;i++) U[e[0]+'|'+e[1]+'|'+i].k=vent?'vent':'win';if(vent) nVent++;else nWin++;}
      }
    });
  });
  var units=Object.keys(U).map(function(kk){return U[kk];});
  var pillars=[];
  if(k>0){
    var nx=Math.ceil(court.w/8),ny=Math.ceil(court.h/8),i2;
    for(i2=0;i2<=nx;i2++){var px=court.x+court.w*i2/nx;pillars.push([px,court.y]);pillars.push([px,court.y+court.h]);}
    for(i2=1;i2<ny;i2++){var py=court.y+court.h*i2/ny;pillars.push([court.x,py]);pillars.push([court.x+court.w,py]);}
  }
  var area=W*D,ca=court.w*court.h,vd=cfg.vd||(area<700?5:(area<1000?6:7)),sc=scaleFor(cfg.area);
  var sdd=cfg.jag?cfg.jag.sides:{n:true,s:false,e:false,w:false};
  var ext={t:sdd.n?vd:0,b:sdd.s?vd:0,l:sdd.w?vd:0,r:sdd.e?vd:0},strips=[],verArea=0,edgeLen=0;
  if(sdd.n) strips.push({side:'N',x0:-ext.l,x1:W+ext.r,y0:-vd,y1:0});
  if(sdd.s) strips.push({side:'S',x0:-ext.l,x1:W+ext.r,y0:D,y1:D+vd});
  if(sdd.w) strips.push({side:'W',x0:-vd,x1:0,y0:0,y1:D});
  if(sdd.e) strips.push({side:'E',x0:W,x1:W+vd,y0:0,y1:D});
  var ctrx={S:null,E:null,W:null};doors.forEach(function(d){if(d.exit) ctrx[d.exit]=(d.a0+d.a1)/2;});
  var ccx={N:ma1-mw/2,S:ctrx.S===null?W/2:ctrx.S,E:ctrx.E===null?D/2:ctrx.E,W:ctrx.W===null?D/2:ctrx.W};
  var spl=(cfg.jag&&cfg.jag.split&&cfg.jag.split.on)?cfg.jag.split:null,PLh=cfg.jag?cfg.jag.h:1.5,sideH=spl?Math.min(spl.h,PLh-0.25):PLh,segs=[];
  strips.forEach(function(st){
    var horiz=(st.side==='N'||st.side==='S'),lo=horiz?st.x0:st.y0,hi=horiz?st.x1:st.y1,parts=[];
    if(!spl) parts.push([lo,hi,PLh,'full']);
    else if(st.side==='N'||(spl.all&&ctrx[st.side]!==null)){
      var cx0=ccx[st.side],gw0=(st.side==='N'?mw:3.5)+1.5+1.0,a0=Math.max(lo,cx0-gw0/2),b0=Math.min(hi,cx0+gw0/2);
      if(a0-lo>0.5) parts.push([lo,a0,sideH,'wing']);
      parts.push([a0,b0,0,'gap']);
      if(hi-b0>0.5) parts.push([b0,hi,sideH,'wing']);
    }else parts.push([lo,hi,sideH,'low']);
    parts.forEach(function(q,i){segs.push({side:st.side,x0:horiz?q[0]:st.x0,x1:horiz?q[1]:st.x1,y0:horiz?st.y0:q[0],y1:horiz?st.y1:q[1],h:q[2],kind:q[3],first:i===0,last:i===parts.length-1});});
  });
  strips.forEach(function(st){
    verArea+=(st.x1-st.x0)*(st.y1-st.y0);
    if(st.side==='N'||st.side==='S') edgeLen+=(st.x1-st.x0)+(sdd.w?0:vd)+(sdd.e?0:vd);
    else edgeLen+=(st.y1-st.y0)+(sdd.n?0:vd)+(sdd.s?0:vd);
  });
  var sched=[],net=0;
  rooms.forEach(function(r){
    if(!r.id) return;
    var a=r.w*r.h,idl=ideal(r.id,sc),fit;
    if(r.t!=='pass') net+=a;
    if(r.t==='pass') return;
    fit=a<MINA[r.id]?'small':(a<idl*0.85?'tight':(a>idl*1.3?'generous':'good'));
    var vz=vastuOf(r,W,D);
    sched.push({n:r.n,w:r.w,h:r.h,a:a,ideal:Math.round(idl),fit:fit,key:r.key,zone:vz.zone,vastu:vz.status,vbest:vz.best});
  });
  var pl={cfg:cfg,W:W,D:D,rooms:rooms,doors:doors,units:units,court:court,center:Cr,k:k,corr:k>0,pillars:pillars,vd:vd,
    area:area,courtArea:ca,builtup:area-ca,verArea:verArea,sides:sdd,ext:ext,strips:strips,segs:segs,split:spl,edgeLen:edgeLen,sight:sight,exits:cex,nWin:nWin,nVent:nVent,months:monthsFor(area),
    nDoor:doors.filter(function(d){return d.k==='door';}).length,dropped:O.dropped,noDoor:noDoor,sched:sched,
    eff:net/area,par:lay.par,minArea:minAreaFor(cfg),warn:lay.warn||[],custom:!!O.custom,jag:cfg.jag||null,plinth:cfg.jag?cfg.jag.h:1.5,key:key};
  planCache[key]=pl;
  return pl;
}

