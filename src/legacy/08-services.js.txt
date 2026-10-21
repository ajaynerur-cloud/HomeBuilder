/* ---------- services: plumbing, electrical, tanks ---------- */
function septicSize(u){
  if(u<=5) return {L:5,B:2.5,d:3.3};
  if(u<=10) return {L:6.5,B:3,d:3.3};
  if(u<=15) return {L:6.5,B:3,d:4.3};
  return {L:7.5,B:3.6,d:4.3};
}
function svcOn(S){var v=S.svc||{};return !!(v.plumb||v.elec||v.tanks);}
function servicesData(pl,S){
  var W=pl.W,D=pl.D,EX=pl.ext,PL=pl.plinth,R=mkRoof(pl,S),Cr=pl.center,k=pl.k;
  var users=Math.max(2,Math.min(20,Math.round(+S.users||2*pl.cfg.beds+1)));
  var by={};pl.rooms.forEach(function(r){by[r.key]=r;});
  var cen=function(r){return {x:r.x+r.w/2,y:r.y+r.h/2};};
  var out0=[],wet=pl.rooms.filter(function(r){return r.t==='wet'||r.key==='kitchen'||r.key==='util';});
  if(pl.outhouse){var OHs=pl.outhouse;OHs.rooms.forEach(function(r){wet.push({key:r.n==='WC'?'wwc':'wbath',n:r.n,t:'wet',x:r.x,y:r.y,w:r.w,h:r.h,outside:true});});[[OHs.x0,OHs.y0],[OHs.x1,OHs.y1]].forEach(function(p){out0.push(p);});}
  var hab=pl.rooms.filter(function(r){return !r.hidden&&r.id&&r.t!=='pass'&&r.t!=='wet'&&r.key!=='util'&&r.t!=='court'&&r.t!=='corr';});
  var out={users:users,pipes:[],risers:[],pts:[],tanks:{},counts:{wc:0,shower:0,basin:0,sink:0,taps:0,lights:0,fans:0,sockets:0,ac:0},len:{supply:0,drain:0,sump:0,elec:0},minX:0,maxX:W,minY:0,maxY:D};
  var zD=PL+0.25,zS=PL+1.2,zE=PL+8.6,side=S.sept==='N'?'N':'W';
  function ext(x,y){out.minX=Math.min(out.minX,x);out.maxX=Math.max(out.maxX,x);out.minY=Math.min(out.minY,y);out.maxY=Math.max(out.maxY,y);}
  function pipe(kind,pts,z){for(var i=0;i+1<pts.length;i++) out.len[kind]+=Math.abs(pts[i+1][0]-pts[i][0])+Math.abs(pts[i+1][1]-pts[i][1]);pts.forEach(function(p){ext(p[0],p[1]);});out.pipes.push({k:kind,pts:pts,z:z});}
  function riser(kind,x,y,z0,z1){out.len[kind]+=Math.abs(z1-z0);out.risers.push({k:kind,x:x,y:y,z0:z0,z1:z1});ext(x,y);}
  function pt(kind,x,y,z,extra){var o=Object.assign({k:kind,x:x,y:y,z:z},extra||{});out.pts.push(o);ext(x,y);}
  out0.forEach(function(p){ext(p[0],p[1]);});
  var dps=[];
  wet.forEach(function(r){
    var c=cen(r);
    if(r.key==='wcomb'||/\+/.test(r.n)){dps.push({x:c.x-r.w*0.2,y:c.y,t:'WC',r:r});dps.push({x:c.x+r.w*0.2,y:c.y+r.h*0.15,t:'bath',r:r});out.counts.wc++;out.counts.shower++;out.counts.basin++;}
    else if(r.key==='kitchen'){dps.push({x:c.x,y:c.y,t:'sink',r:r});out.counts.sink++;}
    else if(r.key==='wwc'){dps.push({x:c.x,y:c.y,t:'WC',r:r});out.counts.wc++;out.counts.basin++;}
    else if(r.key==='util'){dps.push({x:c.x,y:c.y,t:'wash',r:r});out.counts.taps++;}
    else{dps.push({x:c.x,y:c.y,t:'bath',r:r});out.counts.shower++;out.counts.basin++;}
  });
  out.counts.taps+=dps.length;
  /* septic tank and soak pit */
  var sz=septicSize(users),soakD=users<=10?4:5,cxw=-(EX.l)-6,cyn=-(EX.t)-6,sy=Math.round(D*0.3*2)/2,sx=Math.round(W*0.2*2)/2;
  if(side==='W'){
    var ys=[sy];
    dps.forEach(function(d){pipe('drain',[[d.x,d.y],[cxw,d.y]],zD);riser('drain',cxw,d.y,zD,0.3);ys.push(d.y);});
    pipe('drain',[[cxw,Math.min.apply(null,ys)],[cxw,Math.max.apply(null,ys)]],0.3);
    pipe('drain',[[cxw,sy],[cxw-2,sy]],0.3);
    out.tanks.septic={x:cxw-2-sz.L/2,y:sy,w:sz.L,h:sz.B,depth:sz.d,cap:Math.round(sz.L*sz.B*sz.d*28.317),side:'W'};
    pipe('drain',[[cxw-2-sz.L,sy],[cxw-2-sz.L-2,sy]],0.3);
    out.tanks.soak={x:cxw-2-sz.L-2-soakD/2,y:sy,d:soakD,depth:6.5};
    ext(out.tanks.septic.x-sz.L/2,sy-sz.B/2);ext(out.tanks.soak.x-soakD/2,sy);
  }else{
    var xs=[sx];
    dps.forEach(function(d){pipe('drain',[[d.x,d.y],[d.x,cyn]],zD);riser('drain',d.x,cyn,zD,0.3);xs.push(d.x);});
    pipe('drain',[[Math.min.apply(null,xs),cyn],[Math.max.apply(null,xs),cyn]],0.3);
    pipe('drain',[[sx,cyn],[sx,cyn-2]],0.3);
    out.tanks.septic={x:sx,y:cyn-2-sz.L/2,w:sz.B,h:sz.L,depth:sz.d,cap:Math.round(sz.L*sz.B*sz.d*28.317),side:'N'};
    pipe('drain',[[sx,cyn-2-sz.L],[sx,cyn-2-sz.L-2]],0.3);
    out.tanks.soak={x:sx,y:cyn-2-sz.L-2-soakD/2,d:soakD,depth:6.5};
    ext(sx-sz.B/2,out.tanks.septic.y-sz.L/2);ext(sx,out.tanks.soak.y-soakD/2);
  }
  /* water: overhead tank over the common bath block (west), underground sump in the north-east */
  var dem=135*users,over=[500,1000,1500,2000].filter(function(v){return v>=dem/2;})[0]||2000,sump=Math.max(1000,Math.ceil(dem/500)*500);
  var tr=by.wcomb||by.wbath||by.master,tc=cen(tr),tH=R.H(tc.x,tc.y),roofTop=PL+tH+0.3;
  var vo=over/28.317,od=Math.pow(4*vo/(Math.PI*1.1),1/3),oh=1.1*od;
  out.tanks.over={x:tc.x,y:tc.y,d:od,h:oh,cap:over,zb:roofTop+2.6,roofTop:roofTop};
  riser('supply',tc.x,tc.y,zS,roofTop+2.6);
  var vs=sump/28.317,sB=Math.sqrt(vs/4.5/1.6),sL=1.6*sB;
  var sux=W+EX.r+8+sL/2,suy=-(EX.t)-7-sB/2,yN=-(EX.t)-3.5,xW=-(EX.l)-3.5;
  out.tanks.sump={x:sux,y:suy,w:sL,h:sB,depth:4.5,cap:sump};
  pipe('sump',[[sux,suy],[sux,yN],[xW,yN],[xW,tc.y]],0.3);
  riser('sump',xW,tc.y,0.3,zS);
  pipe('supply',[[xW,tc.y],[tc.x,tc.y]],zS);
  ext(sux+sL/2,suy-sB/2);
  var done={};
  dps.forEach(function(d){
    if(done[d.r.key]) return;done[d.r.key]=1;
    var c=cen(d.r),rx=c.x+0.9,ry=c.y-0.9;
    if(Math.abs(rx-tc.x)>0.01||Math.abs(ry-tc.y)>0.01) pipe('supply',[[tc.x,tc.y],[rx,tc.y],[rx,ry]],zS);
    pt('tap',rx,ry,zS);
  });
  dps.forEach(function(d){pt('drain',d.x,d.y,zD,{t:d.t});});
  /* electrical */
  var door=pl.doors.filter(function(d){return d.k==='main';})[0],mt={x:door.a1+1.5,y:-0.5};
  var dr=by.store||by.kitchen,db={x:dr.x+0.7,y:dr.y+dr.h/2};
  var tx0,ty0,tx1,ty1,ins=k>0?k/2:0.4;
  tx0=Cr.x+ins;ty0=Cr.y+ins;tx1=Cr.x+Cr.w-ins;ty1=Cr.y+Cr.h-ins;
  pipe('elec',[[tx0,ty0],[tx1,ty0],[tx1,ty1],[tx0,ty1],[tx0,ty0]],zE);
  function near(p){
    var cands=[
      {x:Math.max(tx0,Math.min(tx1,p.x)),y:ty0,hz:true},{x:Math.max(tx0,Math.min(tx1,p.x)),y:ty1,hz:true},
      {x:tx0,y:Math.max(ty0,Math.min(ty1,p.y)),hz:false},{x:tx1,y:Math.max(ty0,Math.min(ty1,p.y)),hz:false}
    ],b=null,bd=1e9;
    cands.forEach(function(c){var d=Math.abs(c.x-p.x)+Math.abs(c.y-p.y);if(d<bd){bd=d;b=c;}});
    return b;
  }
  function branch(p,z1,kind){
    var T=near(p),pts=T.hz?[[T.x,T.y],[T.x,p.y],[p.x,p.y]]:[[T.x,T.y],[p.x,T.y],[p.x,p.y]];
    pipe('elec',pts,zE);
    if(kind) riser('elec',p.x,p.y,zE,z1);
  }
  branch(mt,PL+5,true);pt('meter',mt.x,mt.y,PL+5);
  branch(db,PL+5.5,true);pt('db',db.x,db.y,PL+5.5);
  hab.concat(wet).forEach(function(r){
    var c=cen(r),a=rArea(r),nl=Math.max(1,Math.ceil(a/70));
    if(r.t!=='wet'&&r.key!=='kitchen'&&r.key!=='util'||true){ branch(c,PL+8.9,false);}
    for(var i=0;i<nl;i++){pt('light',c.x+(nl>1?(i-(nl-1)/2)*r.w*0.25:0),c.y,PL+8.9);out.counts.lights++;}
    if(r.t==='bed'||r.t==='din'||r.t==='pooja'||r.key==='kitchen'){pt('fan',c.x,c.y+(nl>1?r.h*0.22:0),PL+8.9);out.counts.fans++;}
    out.counts.sockets+=(r.t==='bed'?4:(r.key==='kitchen'?6:(r.t==='din'||r.t==='pooja'||r.t==='entry'?3:1)));
    if(r.key==='master') out.counts.ac++;
  });
  out.counts.lights+=0;
  out.dims={over:out.tanks.over,sump:out.tanks.sump,septic:out.tanks.septic,soak:out.tanks.soak,dem:dem};
  return out;
}
function svcDraw(sv,o){
  var X=o.X,Y=o.Y,u=o.u,lw=o.lw,fs=o.fs,sh=o.show,s='',i,TF=o.themed?'style="fill:var(--ink)"':'fill="#333"';
  var col={supply:'#2F7BD9',sump:'#2F7BD9',drain:'#8A6A4A',elec:'#E0A500'},wd={supply:lw,sump:lw*1.2,drain:lw*1.7,elec:lw*0.9};
  var vis=function(p){return p.k==='elec'?sh.elec:(sh.plumb||(sh.tanks&&p.z<1));};
  sv.pipes.forEach(function(p){
    if(!vis(p)) return;
    var d='M '+p.pts.map(function(q){return r2(X(q[0]))+' '+r2(Y(q[1]));}).join(' L ');
    s+='<path d="'+d+'" fill="none" stroke="'+col[p.k]+'" stroke-width="'+r2(wd[p.k])+'" stroke-linejoin="round"'+(p.k==='sump'?' stroke-dasharray="'+r2(lw*4)+' '+r2(lw*2)+'"':'')+'/>';
  });
  var rr=lw*2.2;
  sv.pts.forEach(function(p){
    if(p.k==='drain'&&sh.plumb) s+='<circle cx="'+r2(X(p.x))+'" cy="'+r2(Y(p.y))+'" r="'+r2(rr)+'" fill="#fff" stroke="#8A6A4A" stroke-width="'+r2(lw*0.9)+'"/>';
    else if(p.k==='tap'&&sh.plumb) s+='<circle cx="'+r2(X(p.x))+'" cy="'+r2(Y(p.y))+'" r="'+r2(rr*0.8)+'" fill="#2F7BD9"/>';
    else if(p.k==='light'&&sh.elec) s+='<circle cx="'+r2(X(p.x))+'" cy="'+r2(Y(p.y))+'" r="'+r2(rr*0.9)+'" fill="#fff" stroke="#E0A500" stroke-width="'+r2(lw)+'"/><path d="M'+r2(X(p.x)-rr*0.6)+' '+r2(Y(p.y)-rr*0.6)+'L'+r2(X(p.x)+rr*0.6)+' '+r2(Y(p.y)+rr*0.6)+'M'+r2(X(p.x)+rr*0.6)+' '+r2(Y(p.y)-rr*0.6)+'L'+r2(X(p.x)-rr*0.6)+' '+r2(Y(p.y)+rr*0.6)+'" stroke="#E0A500" stroke-width="'+r2(lw*0.8)+'"/>';
    else if(p.k==='fan'&&sh.elec) s+='<circle cx="'+r2(X(p.x))+'" cy="'+r2(Y(p.y))+'" r="'+r2(rr*1.7)+'" fill="none" stroke="#E0A500" stroke-width="'+r2(lw*0.8)+'" stroke-dasharray="'+r2(lw*2)+' '+r2(lw*1.2)+'"/>';
    else if(p.k==='db'&&sh.elec) s+='<rect x="'+r2(X(p.x)-rr*1.4)+'" y="'+r2(Y(p.y)-rr*1.4)+'" width="'+r2(rr*2.8)+'" height="'+r2(rr*2.8)+'" fill="#333"/>'+(o.labels?'<text x="'+r2(X(p.x)+rr*2)+'" y="'+r2(Y(p.y)+fs*0.35)+'" font-size="'+fs+'" '+TF+' font-weight="700">DB</text>':'');
    else if(p.k==='meter'&&sh.elec) s+='<rect x="'+r2(X(p.x)-rr*1.2)+'" y="'+r2(Y(p.y)-rr*1.2)+'" width="'+r2(rr*2.4)+'" height="'+r2(rr*2.4)+'" fill="#E0A500" stroke="#333" stroke-width="'+r2(lw*0.8)+'"/>'+(o.labels?'<text x="'+r2(X(p.x)+rr*1.8)+'" y="'+r2(Y(p.y)+fs*0.35)+'" font-size="'+fs+'" '+TF+' font-weight="700">METER</text>':'');
  });
  if(sh.tanks){
    var T=sv.tanks,lab=function(x,y,t){return o.labels?'<text x="'+r2(X(x))+'" y="'+r2(Y(y))+'" font-size="'+fs+'" text-anchor="middle" '+TF+'>'+esc(t)+'</text>':'';};
    var sp=T.septic;
    s+='<rect x="'+r2(X(sp.x-sp.w/2))+'" y="'+r2(Y(sp.y-sp.h/2))+'" width="'+r2(sp.w*u)+'" height="'+r2(sp.h*u)+'" fill="#e8e6dc" stroke="#555" stroke-width="'+r2(lw)+'"/><line x1="'+r2(X(sp.x-(sp.side==='W'?sp.w/6:0)))+'" y1="'+r2(Y(sp.y-sp.h/2))+'" x2="'+r2(X(sp.x-(sp.side==='W'?sp.w/6:0)))+'" y2="'+r2(Y(sp.y+sp.h/2))+'" stroke="#555" stroke-width="'+r2(lw*0.7)+'"/>';
    s+=lab(sp.x,sp.y-sp.h/2-fs*0.4/u,'Septic tank '+sp.w+' × '+sp.h+' ft');
    var so=T.soak;s+='<circle cx="'+r2(X(so.x))+'" cy="'+r2(Y(so.y))+'" r="'+r2(so.d/2*u)+'" fill="#efe9d8" stroke="#555" stroke-width="'+r2(lw)+'" stroke-dasharray="'+r2(lw*3)+' '+r2(lw*1.5)+'"/>'+lab(so.x,so.y+so.d/2+fs*1.6/u,'Soak pit '+so.d+' ft dia');
    var su=T.sump;s+='<rect x="'+r2(X(su.x-su.w/2))+'" y="'+r2(Y(su.y-su.h/2))+'" width="'+r2(su.w*u)+'" height="'+r2(su.h*u)+'" fill="#dbe8f7" stroke="#2F7BD9" stroke-width="'+r2(lw)+'"/>'+lab(su.x,su.y+su.h/2+fs*1.5/u,'Water sump '+num(su.cap)+' L');
    var ov=T.over;s+='<circle cx="'+r2(X(ov.x))+'" cy="'+r2(Y(ov.y))+'" r="'+r2(ov.d/2*u)+'" fill="#444" fill-opacity="0.75" stroke="#111" stroke-width="'+r2(lw*0.8)+'"/>'+(o.labels?'<text x="'+r2(X(ov.x))+'" y="'+r2(Y(ov.y)+fs*0.35)+'" font-size="'+fs*0.95+'" text-anchor="middle" fill="#fff" font-weight="700">'+num(ov.cap)+' L</text>':'');
  }
  return s;
}
function vPillarCount(pl){
  var sc=stepCenters(pl),n=0;
  pl.strips.forEach(function(st){
    var horiz=(st.side==='N'||st.side==='S'),lo=horiz?st.x0:st.y0,len=horiz?st.x1-st.x0:st.y1-st.y0,nn=Math.max(2,Math.round(len/9))+1;
    for(var k=0;k<nn;k++){
      var a=lo+0.5+k*(len-1)/(nn-1);if(Math.abs(a-sc[st.side])<3.4) continue;
      var inGap=pl.segs.some(function(g){return g.kind==='gap'&&g.side===st.side&&a>(horiz?g.x0:g.y0)+0.05&&a<(horiz?g.x1:g.y1)-0.05;});
      if(!inGap) n++;
    }
  });
  return n;
}
var PILLAR_COST={turned:14000,square:9500,masonry:6500};

var core={costFor:costFor,budgetPlans:budgetPlans,roomAt:roomAt,winList:winList,mkRoof:mkRoof,wallJoints:wallJoints,designChecks:designChecks,buildDXF:buildDXF,runMove:runMove,runRooms:runRooms,moveInfo:moveInfo,planParts:planParts,rArea:rArea,servicesData:servicesData,svcDraw:svcDraw,vPillarCount:vPillarCount,wallRuns:wallRuns,editedPlan:editedPlan,snapDoor:snapDoor,doorKey:doorKey,buildPickMeshes:buildPickMeshes,planBase:planBase,diyPlan:diyPlan,suggestFor:suggestFor,SOILS:SOILS,structure:structure,buildSheets:buildSheets,sheetRoof:sheetRoof,buildPlan:buildPlan,planFor:planFor,optimise:optimise,normCfg:normCfg,minAreaFor:minAreaFor,mkRoof:mkRoof,roofMesh:roofMesh,creases:creases,vRoof:vRoof,costFor:costFor,geoBuild:geoBuild,RT:RT,DEF_RATES:DEF_RATES};
if(typeof window!=='undefined') window.__core=core;
if(typeof document==='undefined') return;

