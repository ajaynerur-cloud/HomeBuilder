/* ---------- program, optimiser, plan ---------- */
var IDEAL={master:125,bed:100,living:110,kitchen:80,dining:90,entry:55,entryBig:95,pooja:60,store:36,wbath:30,wwc:24,wcomb:36,util:30,att:38,lobby:45};
var MINA={master:96,bed:80,living:85,kitchen:56,dining:64,entry:36,entryBig:64,pooja:30,store:20,wbath:20,wwc:15,wcomb:25,util:18,att:26,lobby:28};
var WGT={master:1.4,bed:1.2,living:1,kitchen:1.2,dining:1,entry:0.6,entryBig:0.8,pooja:0.6,store:0.4,wbath:0.8,wwc:0.6,wcomb:0.8,util:0.3,att:0.8,lobby:0.3};
var FIXED_ID={wbath:1,wwc:1,wcomb:1,att:1,util:1,lobby:1};
function courtTarget(cfg){return Math.max(5,Math.min(16,Math.sqrt(({S:0.05,M:0.085,L:0.14}[cfg.cy||'M'])*cfg.area)));}
function scaleFor(area){return Math.pow(area/800,0.55);}
function ideal(id,sc){return FIXED_ID[id]?IDEAL[id]:IDEAL[id]*sc;}
function cl(v,lo,hi,d){v=parseFloat(v);if(isNaN(v)) v=d;return Math.max(lo,Math.min(hi,Math.round(v*2)/2));}
function normCfg(S){
  var beds=Math.max(1,Math.min(3,S.beds|0)),att=Math.max(0,Math.min(beds,S.att|0));
  var wetOut=!!S.wetOut;if(wetOut) att=0;
  var c={wetOut:wetOut,area:Math.max(450,Math.min(1600,Math.round(S.area/25)*25)),beds:beds,att:att,pooja:!!S.pooja,store:!!S.store,k:S.corr||0};
  c.cy=(S.cy==='S'||S.cy==='L')?S.cy:'M';
  var u=S.custom;
  if(u&&u.on){
    var cu={k:cl(u.k,0,8,3),cw:cl(u.cw,3,40,8),ch:cl(u.ch,3,40,8),tn:cl(u.tn,6,24,10),ts:cl(u.ts,6,24,10),tw:cl(u.tw,6,24,10),te:cl(u.te,6,24,10),lens:{}};
    Object.keys(u.lens||{}).forEach(function(k){var v=parseFloat(u.lens[k]);if(v>0) cu.lens[k]=cl(v,2,40,5);});
    c.custom=cu;c.k=cu.k;
    c.area=Math.round((cu.tw+cu.cw+2*cu.k+cu.te)*(cu.tn+cu.ch+2*cu.k+cu.ts));
  }
  var j=S.jag,ex=S.exits||{};
  c.facing=FROT[S.facing]?S.facing:'N';
  c.exits={s:!!ex.s&&c.facing==='N',e:!!ex.e,w:!!ex.w};
  c.backOff=cl(S.backOff,-12,12,-3);
  if(j&&j.on){
    var sd=j.sides||{n:true};
    var sp=j.split||{},stp=(+sp.steps===2?2:4),hh0=cl(j.h,1.5,4,2.5);
    c.jag={h:sp.on?Math.min(hh0,Math.round(stp*0.65*10)/10):hh0,ledges:!!j.ledges,sides:{n:!!sd.n,s:!!sd.s,e:!!sd.e,w:!!sd.w},split:{on:!!sp.on,all:sp.scope==='all',h:(+sp.h===1?1:1.5),steps:stp,wing:!!sp.wingSteps}};c.vd=cl(j.d,4,12,7);
  }
  return c;
}
function cfgKey(c){var e=c.exits||{};return [c.area,c.beds,c.att,c.pooja?1:0,c.store?1:0,c.k,c.cy||'M'].join('_')+(c.facing&&c.facing!=='N'?'_F'+c.facing:'')+(c.wetOut?'_X':'')+(e.s?'_L'+c.backOff:'')+(e.w?'_W':'')+(c.custom?'_'+JSON.stringify(c.custom):'');}
// east and west entrances: the entrance wing is drawn at the top, so each room goes where its true Vastu zone falls
function programFacing(cfg){
  var comb=cfg.area<700,f=cfg.facing,R=function(key,n,t,id,x){return Object.assign({key:key,n:n,t:t,id:id},x||{});};
  var entry=R('entry',cfg.pooja?'Entry hall':'Entry / sitting','entry',cfg.pooja?'entry':'entryBig'),master=R('master','Master bedroom','bed','master'),bed2=R('bed2','Bedroom 2','bed','bed'),kit=R('kitchen','Kitchen','kit','kitchen'),din=R('dining','Dining','din','dining');
  var att1=cfg.att>=1?R('att1','Att. bath + WC','wet','att',{att:true,parent:'master'}):null,att2=(cfg.att>=2&&cfg.beds>=2)?R('att2','Att. bath + WC','wet','att',{att:true,parent:'bed2'}):null;
  var bed3=cfg.beds>=3?R('bed3','Bedroom 3','bed','bed'):null,att3=(cfg.beds>=3&&cfg.att>=3)?R('att3','Att. bath + WC','wet','att',{att:true,parent:'bed3'}):null;
  var pooja=cfg.pooja?R('pooja','Pooja / family','pooja','pooja'):null,store=cfg.store?R('store','Store','store','store'):null,util=(cfg.area>=1000||(cfg.exits||{}).w||cfg.wetOut)?R('util',cfg.wetOut?'Wash / utility (to bath block)':'Wash / utility','store','util'):null;
  var baths=cfg.wetOut?[]:comb?[R('wcomb','Bath + WC','wet','wcomb')]:[R('wbath','Bath','wet','wbath'),R('wwc','WC','wet','wwc')],live=R('living','Family / sitting','din','living');
  var cl=function(a){return a.filter(function(x){return !!x;});},N,S,E,W;
  if(f==='E'){ // top = east, right = south, bottom = west, left = north
    N=cl([pooja||live,entry,kit]);
    E=cl([din].concat(baths));
    S=cl([cfg.beds>=2?bed2:null,att2,att1,cfg.wetOut?util:null,master]);   // baths sit between the bedrooms on the west side
    W=cl([bed3,att3,store,cfg.wetOut?null:util]);                      // north side: third bedroom, store, utilityif(!W.length) W=[cfg.pooja?live:R('sitout','Sit-out','din','living')];
  }else{ // top = west, right = north, bottom = east, left = south
    N=cl([master,entry,att2,cfg.beds>=2?bed2:null]);
    S=cl([kit,din,pooja||live]);
    W=cl([att1].concat(baths,[cfg.wetOut?util:null]));                  // the master's bath heads the south wing, right beside the master
    E=cl([bed3,att3,store,cfg.wetOut?null:util]);                  // north side: third bedroom, store, utilityif(!E.length) E=[cfg.pooja?live:R('sitout','Sit-out','din','living')];
  }
  return {N:N,S:S,E:E,W:W,pass:cfg.k===0};
}
function program(cfg){
  if(cfg.facing==='E'||cfg.facing==='W') return programFacing(cfg);
  var N=[],S=[],E=[],Wg=[],comb=cfg.area<700,ex=cfg.exits||{};
  N.push(cfg.beds>=2?{key:'bed2',n:'Bedroom 2',t:'bed',id:'bed'}:{key:'living',n:'Living room',t:'din',id:'living'});
  N.push({key:'entry',n:cfg.pooja?'Entry hall':'Entry / sitting',t:'entry',id:cfg.pooja?'entry':'entryBig'});
  if(cfg.pooja) N.push({key:'pooja',n:'Pooja / family',t:'pooja',id:'pooja'});
  var west=[{key:'master',n:'Master bedroom',t:'bed',id:'master'}],mid=[];
  if(cfg.att>=1) west.push({key:'att1',n:'Att. bath + WC',t:'wet',id:'att',att:true,parent:'master'});
  var bed3={key:'bed3',n:'Bedroom 3',t:'bed',id:'bed'},att3={key:'att3',n:'Att. bath + WC',t:'wet',id:'att',att:true,parent:'bed3'};
  var buf={key:'store',n:'Dress / store',t:'store',id:'store'},kit={key:'kitchen',n:'Kitchen',t:'kit',id:'kitchen'};
  if(ex.s){
    if(cfg.beds>=3){mid.push(bed3);if(cfg.att>=3) mid.push(att3);}
    if(cfg.store) mid.push({key:'store',n:'Store',t:'store',id:'store'});
    if(mid.length&&mid[mid.length-1].t==='wet') mid.push(buf);
    S=west.concat([{key:'lobby',n:'Back lobby',t:'entry',id:'lobby'}],mid,[kit]);
  }else{
    if(cfg.beds>=3){if(cfg.att>=3) mid.push(att3);mid.push(bed3);}
    if(cfg.store) mid.push({key:'store',n:'Store',t:'store',id:'store'});
    S=west.concat(mid);
    if(S[S.length-1].t==='wet') S.push(buf);
    S.push(kit);
  }
  E.push({key:'dining',n:'Dining',t:'din',id:'dining'});
  if(cfg.att>=2&&cfg.beds>=2) Wg.push({key:'att2',n:'Att. bath + WC',t:'wet',id:'att',att:true,parent:'bed2'});
  if(cfg.wetOut){} else if(comb) Wg.push({key:'wcomb',n:'Bath + WC',t:'wet',id:'wcomb'});
  else{Wg.push({key:'wbath',n:'Bath',t:'wet',id:'wbath'});Wg.push({key:'wwc',n:'WC',t:'wet',id:'wwc'});}
  if(cfg.area>=1000||ex.w||cfg.wetOut) Wg.push({key:'util',n:cfg.wetOut?'Wash / utility (to bath block)':'Wash / utility',t:'store',id:'util'});
  return {N:N,S:S,E:E,W:Wg,pass:cfg.k===0};
}
function alloc(list,total,sc,depth){
  var w=list.map(function(r){return ideal(r.id,sc)/depth;}),sum=0,out=[],cum=0,prev=0;
  w.forEach(function(v){sum+=v;});
  list.forEach(function(r,i){
    cum+=w[i];
    var pos=(i===list.length-1)?total:Math.round(cum/sum*total*2)/2;
    out.push(pos-prev);prev=pos;
  });
  return out;
}
function allocC(list,total,lens,sc,depth,warn,label){
  var n=list.length,vals=[],sum=0,i,out=[],cum=0,prev=0;
  for(i=0;i<n-1;i++){var v=(lens&&lens[list[i].key]>0)?lens[list[i].key]:ideal(list[i].id,sc)/depth;vals.push(v);sum+=v;}
  var minLast=3;
  if(sum>total-minLast){
    var f=(total-minLast)/sum;
    for(i=0;i<vals.length;i++) vals[i]*=f;
    sum=total-minLast;
    warn.push(label+': the rooms you entered are longer than the wing, so they were shortened to fit.');
  }
  vals.push(total-sum);
  for(i=0;i<n;i++){cum+=vals[i];var pos=(i===n-1)?total:Math.round(cum*2)/2;out.push(pos-prev);prev=pos;}
  return out;
}
function adj(r1,r2,mn){
  if(!r1||!r2) return null;
  mn=mn||2.5;
  var a0,a1,x,y;
  if(Math.abs(r1.x+r1.w-r2.x)<1e-6||Math.abs(r2.x+r2.w-r1.x)<1e-6){
    x=Math.abs(r1.x+r1.w-r2.x)<1e-6?r2.x:r1.x;
    a0=Math.max(r1.y,r2.y);a1=Math.min(r1.y+r1.h,r2.y+r2.h);
    if(a1-a0>=mn) return {o:'V',pos:x,a0:a0,a1:a1};
  }
  if(Math.abs(r1.y+r1.h-r2.y)<1e-6||Math.abs(r2.y+r2.h-r1.y)<1e-6){
    y=Math.abs(r1.y+r1.h-r2.y)<1e-6?r2.y:r1.y;
    a0=Math.max(r1.x,r2.x);a1=Math.min(r1.x+r1.w,r2.x+r2.w);
    if(a1-a0>=mn) return {o:'H',pos:y,a0:a0,a1:a1};
  }
  return null;
}
function layout(cfg,par,prog,minLen){
  var W=par.W,D=par.D,k=par.k,tn=par.tn,ts=par.ts,tw=par.tw,te=par.te,pw=prog.pass?4:0;
  var cw=W-tw-te-2*k,ch=D-tn-ts-2*k;
  var minC=cfg.custom?3:(minLen<2?4:(cfg.area<700?5:6));
  if(cw<minC||ch<minC) return null;
  if(!cfg.custom&&cfg.cy==='L'&&minLen>=2){var tg=courtTarget(cfg);if(cw<0.9*tg||ch<0.9*tg) return null;}
  var sc=scaleFor(cfg.area),rooms=[],x,y,wl=D-tn-ts,cu=cfg.custom,warn=[];
  function add(sp,rx,ry,rw,rh){rooms.push({key:sp.key,n:sp.n,t:sp.t,id:sp.id,att:!!sp.att,parent:sp.parent,x:rx,y:ry,w:rw,h:rh});}
  var wd=tw-pw,i,lobIdx=-1;
  prog.S.forEach(function(r,j){if(r.key==='lobby') lobIdx=j;});
  var Ln=cu?allocC(prog.N,W,cu.lens,sc,tn,warn,'North wing'):alloc(prog.N,W,sc,tn);
  var Lw=cu?allocC(prog.W,wl,cu.lens,sc,wd,warn,'West wing'):alloc(prog.W,wl,sc,wd);
  x=0;prog.N.forEach(function(sp,j){add(sp,x,0,Ln[j],tn);x+=Ln[j];});
  if(lobIdx<0){
    var Ls=cu?allocC(prog.S,W,cu.lens,sc,ts,warn,'South wing'):alloc(prog.S,W,sc,ts);
    x=0;prog.S.forEach(function(sp,j){add(sp,x,D-ts,Ls[j],ts);x+=Ls[j];});
  }else{
    var er0=rooms.filter(function(r){return r.key==='entry';})[0];
    var mw0=Math.max(2.5,Math.floor(Math.min(4,er0.w-1.5)*2)/2),xm0=rnd(er0.x+er0.w-0.75)-mw0/2;
    var lw=5,bo=(cfg.backOff===undefined?-3:cfg.backOff),x0=rnd(xm0+bo-lw/2);
    var wmin=10.5+(cfg.att>=1?4.5:0),xlo=Math.max(tw+0.5,wmin),xhi=W-te-lw-0.5;
    if(xhi<xlo) return null;
    x0=Math.max(xlo,Math.min(xhi,x0));
    var wl2=prog.S.slice(0,lobIdx),el2=prog.S.slice(lobIdx+1);
    var La=cu?allocC(wl2,x0,cu.lens,sc,ts,warn,'South wing (west part)'):alloc(wl2,x0,sc,ts);
    var Lb=cu?allocC(el2,W-x0-lw,cu.lens,sc,ts,warn,'South wing (east part)'):alloc(el2,W-x0-lw,sc,ts);
    x=0;wl2.forEach(function(sp,j){add(sp,x,D-ts,La[j],ts);x+=La[j];});
    add(prog.S[lobIdx],x,D-ts,lw,ts);x+=lw;
    el2.forEach(function(sp,j){add(sp,x,D-ts,Lb[j],ts);x+=Lb[j];});
  }
  var Le=prog.E.length>1?(cu?allocC(prog.E,wl,cu.lens,sc,te,warn,'East wing'):alloc(prog.E,wl,sc,te)):[wl];
  y=tn;prog.E.forEach(function(sp,j){add(sp,W-te,y,te,Le[j]);y+=Le[j];});
  y=tn;prog.W.forEach(function(sp,j){add(sp,0,y,wd,Lw[j]);y+=Lw[j];});
  for(i=0;i<rooms.length;i++){if(rooms[i].w<minLen||rooms[i].h<minLen) return null;}
  if(pw>0) rooms.push({key:'pass',n:'Passage',t:'pass',id:'pass',x:tw-pw,y:tn,w:pw,h:wl});
  var Cr={x:tw,y:tn,w:W-tw-te,h:wl},court={x:tw+k,y:tn+k,w:cw,h:ch};
  if(k>0) rooms.push({key:'corr',n:'Corridor',t:'corr',x:Cr.x,y:Cr.y,w:Cr.w,h:Cr.h});
  rooms.push({key:'court',n:'Courtyard',t:'court',x:court.x,y:court.y,w:court.w,h:court.h});
  return {W:W,D:D,par:par,rooms:rooms,Cr:Cr,court:court,pw:pw,warn:warn};
}
function scoreLay(lay,cfg){
  var sc=scaleFor(cfg.area),pen=0,Cr=lay.Cr,by={};
  lay.rooms.forEach(function(r){by[r.key]=r;});
  lay.rooms.forEach(function(r){
    if(!r.id||r.t==='pass') return;
    var a=r.w*r.h,idl=ideal(r.id,sc),mn=MINA[r.id],wt=WGT[r.id],rel=(a-idl)/idl;
    pen+=wt*(a<idl?2*rel*rel:0.7*rel*rel);
    if(a<mn){var dd=(mn-a)/mn;pen+=wt*(6*dd*dd+1);}
    var sd=Math.min(r.w,r.h),ld=Math.max(r.w,r.h),md=r.t==='bed'?9:((r.t==='kit'||r.t==='din')?8:((r.t==='wet'||r.t==='store')?4:5));
    if(sd<md) pen+=6*(md-sd);
    if(ld/sd>2.2) pen+=1.2*Math.pow(ld/sd-2.2,2);
    if(r.att&&!adj(r,by[r.parent],3.5)) pen+=30;
  });
  if(!adj(by.master,Cr,3.5)) pen+=60;
  if(by.bed3&&!adj(by.bed3,Cr,3.5)) pen+=60;
  if(!adj(by.entry,Cr,4)) pen+=60;
  if(!adj(by.kitchen,by.dining,3.5)) pen+=60;
  if(by.lobby&&!adj(by.lobby,Cr,4)) pen+=60;
  lay.rooms.forEach(function(r){if(r.t==='wet'&&adj(r,by.kitchen,0.5)) pen+=300;});
  var t=courtTarget(cfg),c=lay.court;
  pen+=(cfg.cy==='L'?1.6:0.6)*(Math.pow((c.w-t)/t,2)+Math.pow((c.h-t)/t,2));
  if(Math.max(c.w,c.h)/Math.min(c.w,c.h)>1.5) pen+=0.5;
  pen+=0.8*Math.pow(lay.W/lay.D-1.1,2);
  pen+=0.3*(Math.abs(lay.par.tw-lay.par.te)+Math.abs(lay.par.tn-lay.par.ts));
  return pen;
}
var optCache={};
function search(cfg,prog,kk,relax,rg){
  var minLen=relax?1.5:3,bestS=1e9,best=null,W,tn,ts,tw,te;
  for(W=20;W<=46;W++){
    var D=Math.round(cfg.area/W*2)/2,asp=W/D;
    if(Math.abs(W*D-cfg.area)>cfg.area*0.02||asp<0.8||asp>1.5) continue;
    for(tn=rg.n0;tn<=rg.n1;tn++)for(ts=rg.n0;ts<=rg.n1;ts++){
      if(tn+ts>D-4-2*kk) continue;
      for(tw=rg.w0;tw<=rg.w1;tw++)for(te=rg.w0;te<=rg.w1;te++){
        if(tw+te>W-4-2*kk) continue;
        var par={W:W,D:D,k:kk,tn:tn,ts:ts,tw:tw,te:te},lay=layout(cfg,par,prog,minLen);
        if(!lay) continue;
        var p=scoreLay(lay,cfg);
        if(p<bestS){bestS=p;best={lay:lay,pen:p};}
      }
    }
  }
  return best;
}
function optimise(cfg){
  var key=cfgKey(cfg);
  if(optCache[key]) return optCache[key];
  if(cfg.custom){
    var cu0=cfg.custom,prog0=program(cfg),par0={W:cu0.tw+cu0.cw+2*cu0.k+cu0.te,D:cu0.tn+cu0.ch+2*cu0.k+cu0.ts,k:cu0.k,tn:cu0.tn,ts:cu0.ts,tw:cu0.tw,te:cu0.te};
    var lay0=layout(cfg,par0,prog0,1.5);
    if(lay0){var rs0={lay:lay0,pen:0,dropped:false,cfg:cfg,prog:prog0,custom:true};optCache[key]=rs0;return rs0;}
  }
  var prog=program(cfg),b=null,kk=cfg.k,dropped=false;
  var ranges=[{n0:8,n1:12,w0:7,w1:11},{n0:7,n1:14,w0:6,w1:12}];
  function tryK(k2){
    var r=null;
    for(var i=0;i<ranges.length&&!r;i++) r=search(cfg,prog,k2,false,ranges[i]);
    if(!r) r=search(cfg,prog,k2,true,ranges[1]);
    return r;
  }
  if(cfg.custom){cfg=Object.assign({},cfg,{custom:undefined,k:cfg.k,area:Math.max(450,Math.min(1600,Math.round(cfg.area/25)*25))});prog=program(cfg);}
  b=tryK(kk);
  function smallCount(L){var sc2=0;L.rooms.forEach(function(r){if(r.id&&r.t!=='pass'&&r.w*r.h<MINA[r.id]) sc2++;});return sc2;}
  if(b&&kk>0&&smallCount(b.lay)>0){
    var c1=Object.assign({},cfg,{k:0}),p1=program(c1),pp=prog;prog=p1;
    var b0=tryK(0);
    if(b0&&smallCount(b0.lay)<smallCount(b.lay)){b=b0;dropped=true;kk=0;}else{prog=pp;}
  }
  if(!b&&kk>0){dropped=true;kk=0;var c0=Object.assign({},cfg,{k:0}),p0=program(c0);prog=p0;b=tryK(0);}
  if(!b){b=search(cfg,prog,0,true,{n0:6,n1:15,w0:5,w1:13});}
  var res={lay:b.lay,pen:b.pen,dropped:dropped,cfg:cfg,prog:prog};
  optCache[key]=res;
  return res;
}
function minAreaFor(cfg){
  var prog=program(cfg),sum=0;
  [prog.N,prog.S,prog.E,prog.W].forEach(function(l){l.forEach(function(sp){sum+=IDEAL[sp.id]*0.85;});});
  var cwid=Math.max(6,Math.round(Math.sqrt(0.085*Math.max(cfg.area,600))));
  var ring=cfg.k>0?cfg.k*(4*cwid+4*cfg.k):0,pas=prog.pass?40:0;
  return Math.ceil((sum+cwid*cwid+ring+pas)/(cfg.k>0?0.84:0.9)/25)*25;
}
var VASTU={
  master:{b:['SW'],o:['S','W']},
  bed:{b:['NW','W'],o:['S','SW','N']},
  living:{b:['N','NE','E'],o:['NW']},
  kitchen:{b:['SE'],o:['NW','E','S']},
  dining:{b:['W','E'],o:['N','S','NW','SE']},
  entry:{b:['N','NE','E'],o:['NW']},
  entryBig:{b:['N','NE','E'],o:['NW']},
  pooja:{b:['NE'],o:['E','N']},
  store:{b:['NW','W','SW'],o:['S','SE','N']},
  util:{b:['NW','W'],o:['SW','SE','S','N']},
  lobby:{b:['S','W','SW'],o:['SE','E']},
  wbath:{b:['W','NW','S'],o:[]},wwc:{b:['W','NW','S'],o:[]},wcomb:{b:['W','NW','S'],o:[]},att:{b:['W','NW','S'],o:[]}
};
function zoneOfRoom(r,W,D){
  var dx=(r.x+r.w/2)-W/2,dy=(r.y+r.h/2)-D/2,sx=W/6,sy=D/6,ew=dx<-sx?'W':(dx>sx?'E':''),ns=dy<-sy?'N':(dy>sy?'S':'');
  return absZone((ns+ew)||'centre');
}
function vastuOf(r,W,D){
  var z=zoneOfRoom(r,W,D),v=VASTU[r.id];
  if(!v) return {zone:z,status:'ok',best:''};
  return {zone:z,status:v.b.indexOf(z)>=0?'ideal':(v.o.indexOf(z)>=0?'ok':'check'),best:v.b.join(' or ')};
}
var planCache={};
function monthsFor(a){return 4+(a-600)/600*2;}
var editCache={};
