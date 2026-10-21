/* ---------- UI ---------- */
var $=function(id){return document.getElementById(id);};
var ST={facing:'N',wetOut:false,spec:{},addons:{},compoundFt:160,wallOut:'brick',wallIn:'brick',brick:'conv',tube:'40x40x2.0',studSp:600,wpcT:12,budget:20,area:800,beds:2,att:1,pooja:true,store:true,corr:4,cy:'L',shape:'double',cover:'tile',pitch:22,over:2,sys:'ms',finish:1,region:0.88,custom:null,soil:'medium',sbc:150,jag:{on:false,h:2.5,d:7,ledges:false,sides:{n:true,s:false,e:false,w:false},split:{on:false,scope:'front',h:1.5,steps:4}},exits:{s:false,e:false,w:false},backOff:-3,edits:null,svc:{plumb:false,elec:false,tanks:false},users:0,sept:'W',pillarC:'turned',pillarV:'turned',xray:false,rise:3};
try{
  var sv=JSON.parse(localStorage.getItem('chp_state_v7')||'null');
  if(sv){for(var k in ST){if(sv[k]!==undefined&&sv[k]!==null) ST[k]=sv[k];}}
  var rv=JSON.parse(localStorage.getItem('chp_rates_v1')||'null');
  if(rv){RT.found=Object.assign({},RT.found,rv.found||{});RT.frame=Object.assign({},RT.frame,rv.frame||{});RT.roof=Object.assign({},RT.roof,rv.roof||{});['b9','b45','plaster','paint','floor','elec'].forEach(function(k){if(typeof rv[k]==='number')RT[k]=rv[k];});}
}catch(e){}
function clampState(){
  if(!ST.spec||typeof ST.spec!=='object') ST.spec={};SPECS.forEach(function(sp){if(!sp.o.some(function(o){return o[0]===ST.spec[sp.k];})) ST.spec[sp.k]=sp.def;});
  if(!ST.addons||typeof ST.addons!=='object') ST.addons={};ST.compoundFt=Math.max(0,Math.min(5000,+ST.compoundFt||0));
  if(ST.wallOut==='glass'&&ST.sys==='brick') ST.sys='ms';
  ST.wetOut=!!ST.wetOut;if(ST.wetOut) ST.att=0;
  if(!FROT[ST.facing]) ST.facing='N';
  if(ST.facing!=='N'&&ST.exits) ST.exits.s=false;
  if(ST.walls&&!ST._wallMig){var wsel=wallSel(ST);ST.wallOut=wsel.out;ST.wallIn=wsel.inn;ST._wallMig=1;delete ST.walls;}
  var wsel2=wallSel(ST);ST.wallOut=wsel2.out;ST.wallIn=wsel2.inn;
  if(!BRICKS.some(function(b){return b.v===ST.brick;})||ST.brick==='fly') ST.brick='conv';if(!MS_TUBES.some(function(t){return t.v===ST.tube;})) ST.tube='40x40x2.0';ST.studSp=+ST.studSp===400?400:600;if(WPC_T.indexOf(+ST.wpcT)<0) ST.wpcT=12;else ST.wpcT=+ST.wpcT;
  if(ST.jag&&!ST._ledgeMig){ST.jag.ledges=false;ST._ledgeMig=1;}
  ST.budget=Math.max(1,Math.min(500,+ST.budget||20));
  ST.area=Math.max(500,Math.min(1500,Math.round((+ST.area||800)/25)*25));
  ST.beds=Math.max(1,Math.min(3,ST.beds|0||2));
  ST.att=Math.max(0,Math.min(ST.beds,ST.att|0));
  if([0,3,4,5,6].indexOf(ST.corr)<0) ST.corr=4;
  if(['S','M','L'].indexOf(ST.cy)<0) ST.cy='M';
  if(!soilInfo(ST.soil)||SOILS.map(function(z){return z.v;}).indexOf(ST.soil)<0) ST.soil='medium';
  ST.sbc=Math.max(50,Math.min(400,+ST.sbc||150));
  if(ST.custom&&typeof ST.custom!=='object') ST.custom=null;
  if(!ST.jag||typeof ST.jag!=='object') ST.jag={on:false,h:2.5,d:7,ledges:false};
  if(!ST.jag.sides||typeof ST.jag.sides!=='object') ST.jag.sides={n:true,s:false,e:false,w:false};
  if(!ST.exits||typeof ST.exits!=='object') ST.exits={s:false,e:false,w:false};
  if(!ST.svc||typeof ST.svc!=='object') ST.svc={plumb:false,elec:false,tanks:false};
  ['plumb','elec','tanks'].forEach(function(q){ST.svc[q]=!!ST.svc[q];});
  ST.users=Math.max(0,Math.min(20,Math.round(+ST.users||0)));
  if(ST.sept!=='N') ST.sept='W';
  ['pillarC','pillarV'].forEach(function(q){if(['turned','square','masonry'].indexOf(ST[q])<0) ST[q]='turned';});
  ST.xray=!!ST.xray;
  ST.rise=Math.max(1.5,Math.min(8,+ST.rise||3));
  if(ST.edits&&typeof ST.edits==='object'){
    if(ST.edits.rm||ST.edits.doors||ST.edits.del) ST.edits={key:ST.edits.key,ops:opsOf(ST.edits)};
    else ST.edits.ops=Array.isArray(ST.edits.ops)?ST.edits.ops:[];
    if(!ST.edits.ops.length) ST.edits=null;
  }else ST.edits=null;
  if(!ST.jag.split||typeof ST.jag.split!=='object') ST.jag.split={on:false,scope:'front',h:1.5};
  ST.jag.split.scope=ST.jag.split.scope==='all'?'all':'front';ST.jag.split.steps=(+ST.jag.split.steps===2)?2:4;ST.jag.split.h=(+ST.jag.split.h===1)?1:1.5;
  ST.backOff=cl(ST.backOff,-10,10,-3);
  ST.jag.h=cl(ST.jag.h,1.5,4,2.5);ST.jag.d=cl(ST.jag.d,4,12,7);
}
clampState();
function save(){try{localStorage.setItem('chp_state_v7',JSON.stringify(ST));localStorage.setItem('chp_rates_v1',JSON.stringify(RT));}catch(e){}}

function fmt(n){return '₹ '+Math.round(n).toLocaleString('en-IN');}
function lakh(n){return '₹ '+(n/100000).toFixed(1)+' lakh';}
function num(n){return Math.round(n).toLocaleString('en-IN');}
function f1(n){return (Math.round(n*10)/10).toString();}

function segBuild(id,items,key){
  var el=$(id);el.innerHTML='';
  items.forEach(function(it){
    var b=document.createElement('button');b.type='button';b.setAttribute('data-v',it.v);
    b.innerHTML=it.n+(it.s?'<small>'+it.s+'</small>':'');
    b.addEventListener('click',function(){ST[key]=it.v;update();});
    el.appendChild(b);
  });
}
function segMark(id,val){
  Array.prototype.forEach.call($(id).children,function(b){
    b.setAttribute('aria-pressed',String(b.getAttribute('data-v')===String(val)));
  });
}
segBuild('segSize',[600,800,1100,1200].map(function(s){return {v:s,n:num(s)};}),'area');
segBuild('segBeds',[{v:1,n:'1'},{v:2,n:'2'},{v:3,n:'3'}],'beds');
segBuild('segAtt',[{v:0,n:'0'},{v:1,n:'1'},{v:2,n:'2'},{v:3,n:'3'}],'att');
segBuild('segCorr',[{v:0,n:'None'},{v:3,n:'3 ft'},{v:4,n:'4 ft'},{v:5,n:'5 ft'},{v:6,n:'6 ft'}],'corr');
segBuild('segCy',[{v:'S',n:'Small'},{v:'M',n:'Medium'},{v:'L',n:'Large'}],'cy');
segBuild('segShape',SHAPES,'shape');
var PILS=[{v:'turned',n:'Turned timber'},{v:'square',n:'Square timber',s:'brackets'},{v:'masonry',n:'Plastered'}];
segBuild('segPilC',PILS,'pillarC');segBuild('segPilV',PILS,'pillarV');
segBuild('segSept',[{v:'W',n:'West',s:'Vastu NW'},{v:'N',n:'North'}],'sept');
[['plumb','Plumbing'],['elec','Electrical'],['tanks','Septic and water tanks']].forEach(function(q){
  var b=document.createElement('button');b.type='button';b.setAttribute('data-k',q[0]);b.textContent=q[1];
  b.addEventListener('click',function(){
    var any=ST.svc.plumb||ST.svc.elec||ST.svc.tanks;ST.svc[q[0]]=!ST.svc[q[0]];
    var now=ST.svc.plumb||ST.svc.elec||ST.svc.tanks;
    if(!any&&now) ST.xray=true;
    if(any&&!now) ST.xray=false;
    update();
  });
  $('segSvc').appendChild(b);
});
$('users').addEventListener('input',function(){ST.users=+this.value;update();});
$('bXray').addEventListener('click',function(){ST.xray=!ST.xray;update();});
segBuild('segSys',SYSTEMS,'sys');
segBuild('segWallOut',WALL_OUT,'wallOut');segBuild('segWallIn',WALL_IN,'wallIn');
segBuild('segFace',FACINGS,'facing');
$('segExtra').innerHTML='<button type="button" data-k="pooja">Pooja / family room</button><button type="button" data-k="store">Store room</button><button type="button" data-k="wetOut">Bath and WC outside</button>';
Array.prototype.forEach.call($('segExtra').children,function(b){b.addEventListener('click',function(){var kk=b.getAttribute('data-k');ST[kk]=!ST[kk];update();});});
$('cover').innerHTML=COVERS.map(function(c){return '<option value="'+c.v+'">'+c.n+'</option>';}).join('');
$('cover').addEventListener('change',function(){ST.cover=this.value;update();});
$('pitch').addEventListener('input',function(){ST.pitch=+this.value;update();});
$('rise').addEventListener('input',function(){ST.rise=+this.value;update();});
$('over').addEventListener('input',function(){ST.over=+this.value;update();});
$('finish').addEventListener('change',function(){ST.finish=+this.value;update();});
$('region').addEventListener('change',function(){ST.region=+this.value;update();});
var areaTimer=null;
$('area').addEventListener('input',function(){
  ST.area=+this.value;$('areaV').textContent=num(ST.area)+' sq ft';
  clearTimeout(areaTimer);areaTimer=setTimeout(function(){update();},260);
});
$('useMin').addEventListener('click',function(){ST.area=+this.getAttribute('data-a');if(ST.custom) ST.custom.on=false;customSig='';update();});

var rEl=$('rates');
rEl.innerHTML=RATE_FIELDS.map(function(f){return '<div><label for="r_'+f[0]+'">'+f[1]+'</label><input type="number" min="0" step="1" id="r_'+f[0]+'" data-p="'+f[0]+'"></div>';}).join('');
function getP(p){var a=p.split('.');return a.length===1?RT[a[0]]:RT[a[0]][a[1]];}
function setP(p,v){var a=p.split('.');if(a.length===1)RT[a[0]]=v;else RT[a[0]][a[1]]=v;}
function syncRates(){Array.prototype.forEach.call(rEl.querySelectorAll('input'),function(i){i.value=getP(i.getAttribute('data-p'));});}
rEl.addEventListener('input',function(e){var i=e.target,v=parseFloat(i.value);if(isNaN(v)||v<0)return;setP(i.getAttribute('data-p'),v);update(true);});
$('rateReset').addEventListener('click',function(){RT.found=Object.assign({},DEF_RATES.found);RT.frame=Object.assign({},DEF_RATES.frame);RT.roof=Object.assign({},DEF_RATES.roof);['b9','b45','plaster','paint','floor','elec'].forEach(function(k){RT[k]=DEF_RATES[k];});syncRates();update(true);});

/* plan drawing */
var Z2={k:1,cx:null,cy:null},VBF={vw:1,vh:1},PANMODE=false,pinch=null,panning=null;
function planVB(vw,vh){
  VBF={vw:vw,vh:vh};
  var k=Z2.k;
  if(k<=1.001){Z2.cx=Z2.cy=null;return '0 0 '+vw.toFixed(0)+' '+vh.toFixed(0);}
  var w=vw/k,h=vh/k,cx=Z2.cx==null?vw/2:Z2.cx,cy=Z2.cy==null?vh/2:Z2.cy;
  cx=Math.max(w/2,Math.min(vw-w/2,cx));cy=Math.max(h/2,Math.min(vh-h/2,cy));Z2.cx=cx;Z2.cy=cy;
  return (cx-w/2).toFixed(1)+' '+(cy-h/2).toFixed(1)+' '+w.toFixed(1)+' '+h.toFixed(1);
}
function applyVB(){var svg=$('plan').querySelector('svg');if(svg) svg.setAttribute('viewBox',planVB(VBF.vw,VBF.vh));}
function zoomAt(f,clientX,clientY){
  var svg=$('plan').querySelector('svg');if(!svg) return;
  var nk=Math.max(1,Math.min(8,Z2.k*f));if(Math.abs(nk-Z2.k)<1e-6) return;
  var vb=(svg.getAttribute('viewBox')||'').split(' ').map(Number),px=vb[0]+vb[2]/2,py=vb[1]+vb[3]/2;
  var m=svg.getScreenCTM&&svg.getScreenCTM();
  if(clientX!=null&&m){var pt=svg.createSVGPoint();pt.x=clientX;pt.y=clientY;var q=pt.matrixTransform(m.inverse());px=q.x;py=q.y;}
  var w0=vb[2],h0=vb[3],w1=VBF.vw/nk,h1=VBF.vh/nk,ox=px-(px-vb[0])*(w1/w0),oy=py-(py-vb[1])*(h1/h0);
  Z2.k=nk;Z2.cx=ox+w1/2;Z2.cy=oy+h1/2;applyVB();
}
function drawPlan(pl){
  var s=430/pl.W,EX=pl.ext,SD=pl.sides,sc=stepCenters(pl),door=sc.door,nst1=Math.max(1,Math.ceil(pl.plinth/0.55)-1),tex=(nst1+0.5)*s,i,k;
  var mx=34+EX.l*s+(sc.has.W?tex:0),mt=36+tex+EX.t*s,mb=18+EX.b*s+(sc.has.S?tex:0),vw=430+mx+34+EX.r*s+(sc.has.E?tex:0),vh=mt+pl.D*s+mb;
  var sv=svcOn(ST)?servicesData(pl,ST):null;
  if(sv){
    var xl=Math.max(0,-sv.minX*s+16-mx),xt=Math.max(0,-sv.minY*s+22-mt),xr=Math.max(0,(sv.maxX-pl.W)*s+44-(vw-mx-pl.W*s)),xb=Math.max(0,(sv.maxY-pl.D)*s+22-mb);
    mx+=xl;mt+=xt;mb+=xb;vw+=xl+xr;vh=mt+pl.D*s+mb;
  }
  if(pl.outhouse){var OH=pl.outhouse,oxl=Math.max(0,-OH.x0*s+16-mx),oxt=Math.max(0,-OH.y0*s+22-mt),oxr=Math.max(0,(OH.x1-pl.W)*s+24-(vw-mx-pl.W*s)),oxb=Math.max(0,(OH.y1-pl.D)*s+24-mb);mx+=oxl;mt+=oxt;mb+=oxb;vw+=oxl+oxr;vh=mt+pl.D*s+mb;}
  function X(x){return (mx+x*s).toFixed(1);}
  function Y(y){return (mt+y*s).toFixed(1);}
  var o='<svg viewBox="'+planVB(vw,vh)+'" width="100%" role="img" aria-label="Floor plan, north up" style="touch-action:'+(PANMODE?'none':'pan-y')+'">';
  var JG=pl.jag,vd=pl.vd,W=pl.W,D=pl.D,ledgeOn=!!(JG&&JG.ledges&&SD.n);
  pl.segs.forEach(function(g){
    var low=g.h<pl.plinth-0.05;
    if(g.kind==='gap'){
      o+='<rect x="'+X(g.x0)+'" y="'+Y(g.y0)+'" width="'+((g.x1-g.x0)*s).toFixed(1)+'" height="'+((g.y1-g.y0)*s).toFixed(1)+'" fill="var(--f-pass)" stroke="var(--ink2)" stroke-width="1" stroke-dasharray="3 3"/>';
      return;
    }
    o+='<rect x="'+X(g.x0)+'" y="'+Y(g.y0)+'" width="'+((g.x1-g.x0)*s).toFixed(1)+'" height="'+((g.y1-g.y0)*s).toFixed(1)+'" fill="var(--'+(JG?(low?'f-jag2':'f-jag'):'f-ver')+')" stroke="var(--ink2)" stroke-width="1" stroke-dasharray="5 4"/>';
    if(JG&&(pl.split||low)) o+='<text x="'+X((g.x0+g.x1)/2)+'" y="'+(mt+((g.y0+g.y1)/2)*s+(g.side==='N'?9:4)).toFixed(1)+'" font-size="9.5" text-anchor="middle" style="fill:var(--ink2)">+'+ft(g.h)+'</text>';
  });
  pl.strips.forEach(function(st){
    var sd=st.side,horiz=(sd==='N'||sd==='S'),lo=horiz?st.x0:st.y0,len=horiz?st.x1-st.x0:st.y1-st.y0,n=Math.max(2,Math.round(len/9))+1;
    var edge=sd==='N'?-vd+0.4:(sd==='S'?D+vd-0.4:(sd==='W'?-vd+0.4:W+vd-0.4));
    for(k=0;k<n;k++){
      var a=lo+0.5+k*(len-1)/(n-1);if(Math.abs(a-sc[sd])<3.4) continue;
      var px=horiz?a:edge,py=horiz?edge:a;
      o+='<rect x="'+(mx+px*s-3).toFixed(1)+'" y="'+(mt+py*s-3).toFixed(1)+'" width="6" height="6" fill="var(--ink2)"/>';
    }
    if(sd!=='N') o+='<text x="'+X((st.x0+st.x1)/2)+'" y="'+(mt+((st.y0+st.y1)/2)*s+4).toFixed(1)+'" font-size="10" text-anchor="middle" style="fill:var(--ink2)">'+(JG?'Jagali ':'Veranda ')+({S:'south',E:'east',W:'west'}[sd])+'</text>';
  });
  if(SD.n){
    o+='<text x="'+X(W*0.5)+'" y="'+Y(-vd*0.75)+'" font-size="11" text-anchor="middle" style="fill:var(--ink2)">'+(JG?'Jagali, raised '+ft(pl.plinth)+', ':'Veranda ')+W+' × '+vd+' ft</text>';
    var bxp=W*0.2+(ledgeOn?2.4:0);
    o+='<rect x="'+X(bxp-4)+'" y="'+Y(-1.9)+'" width="'+(8*s).toFixed(1)+'" height="'+(1.6*s).toFixed(1)+'" fill="var(--furn)" stroke="var(--ink2)" stroke-width="0.5"/>';
    var tcx=W*(ledgeOn?0.78:0.85),tcy=-vd/2-0.2;
    o+='<rect x="'+X(tcx-1.1)+'" y="'+Y(tcy-1.1)+'" width="'+(2.2*s).toFixed(1)+'" height="'+(2.2*s).toFixed(1)+'" fill="var(--furn)" stroke="var(--ink2)" stroke-width="0.5"/>';
    [-1,1].forEach(function(sd){o+='<rect x="'+X(tcx+sd*2.9-0.7)+'" y="'+Y(tcy-0.7)+'" width="'+(1.4*s).toFixed(1)+'" height="'+(1.4*s).toFixed(1)+'" fill="var(--furn)" stroke="var(--ink2)" stroke-width="0.5"/>';});
    if(ledgeOn){[[0.1,1.5],[W-1.5,W-0.1]].forEach(function(r){o+='<rect x="'+X(r[0])+'" y="'+Y(-vd+1.1)+'" width="'+((r[1]-r[0])*s).toFixed(1)+'" height="'+((vd-1.6)*s).toFixed(1)+'" fill="var(--f-entry)" stroke="var(--ink2)" stroke-width="0.8"/>';});}
  }
  var SSU=stepSets(pl);
  SSU.steps.forEach(function(q){
    var sd=q.side,c=q.c,w0=q.w,nn=Math.max(2,Math.ceil(q.H/0.55));
    var ec=sd==='N'?-EX.t-0.5:(sd==='S'?D+EX.b+0.5:(sd==='W'?-EX.l-0.5:W+EX.r+0.5));
    for(i=0;i<nn-1;i++){
      var w=w0+i*0.6,rx,ry,rw,rh;
      if(sd==='N'){rx=X(c-w/2);ry=Y(ec-1-i);rw=(w*s).toFixed(1);rh=s.toFixed(1);}
      else if(sd==='S'){rx=X(c-w/2);ry=Y(ec+i);rw=(w*s).toFixed(1);rh=s.toFixed(1);}
      else if(sd==='W'){rx=X(ec-1-i);ry=Y(c-w/2);rw=s.toFixed(1);rh=(w*s).toFixed(1);}
      else{rx=X(ec+i);ry=Y(c-w/2);rw=s.toFixed(1);rh=(w*s).toFixed(1);}
      o+='<rect x="'+rx+'" y="'+ry+'" width="'+rw+'" height="'+rh+'" fill="var(--f-entry)" stroke="var(--ink2)" stroke-width="0.8"/>';
    }
  });
  SSU.stairs.forEach(function(q){
    for(i=0;i<q.N-1;i++){
      var rx,ry,rw,rh;
      if(q.side==='N'){rx=X(q.c-q.w/2);ry=Y(-1.375-i);rw=(q.w*s).toFixed(1);rh=s.toFixed(1);}
      else if(q.side==='S'){rx=X(q.c-q.w/2);ry=Y(D+0.375+i);rw=(q.w*s).toFixed(1);rh=s.toFixed(1);}
      else if(q.side==='W'){rx=X(-1.375-i);ry=Y(q.c-q.w/2);rw=s.toFixed(1);rh=(q.w*s).toFixed(1);}
      else{rx=X(W+0.375+i);ry=Y(q.c-q.w/2);rw=s.toFixed(1);rh=(q.w*s).toFixed(1);}
      o+='<rect x="'+rx+'" y="'+ry+'" width="'+rw+'" height="'+rh+'" fill="var(--f-entry)" stroke="var(--ink2)" stroke-width="1"/>';
    }
    var lx=q.side==='N'||q.side==='S'?X(q.c):(q.side==='W'?X(-vd/2-0.2):X(W+vd/2+0.2)),ly=q.side==='N'?Y(-vd*0.45):(q.side==='S'?Y(D+vd*0.55):Y(q.c));
    o+='<text x="'+lx+'" y="'+ly+'" font-size="9.5" text-anchor="middle" style="fill:var(--ink2)">up '+q.N+' steps</text>';
  });
  SSU.door.forEach(function(q){
    var nn=Math.ceil(q.rise/0.55);
    for(i=0;i<nn-1;i++){
      var rx,ry,rw,rh;
      if(q.side==='N'){rx=X(q.c-q.w/2);ry=Y(-1.375-i);rw=(q.w*s).toFixed(1);rh=s.toFixed(1);}
      else if(q.side==='S'){rx=X(q.c-q.w/2);ry=Y(D+0.375+i);rw=(q.w*s).toFixed(1);rh=s.toFixed(1);}
      else if(q.side==='W'){rx=X(-1.375-i);ry=Y(q.c-q.w/2);rw=s.toFixed(1);rh=(q.w*s).toFixed(1);}
      else{rx=X(W+0.375+i);ry=Y(q.c-q.w/2);rw=s.toFixed(1);rh=(q.w*s).toFixed(1);}
      o+='<rect x="'+rx+'" y="'+ry+'" width="'+rw+'" height="'+rh+'" fill="var(--f-pass)" stroke="var(--ink2)" stroke-width="0.8"/>';
    }
  });
  pl.rooms.forEach(function(r){
    if(r.hidden) return;
    rparts(r).forEach(function(q){o+='<rect x="'+X(q.x)+'" y="'+Y(q.y)+'" width="'+(q.w*s).toFixed(1)+'" height="'+(q.h*s).toFixed(1)+'" fill="var(--f-'+r.t+')"/>';});
  });
  function lines(filter,width,color){
    var g={},out='';
    pl.units.filter(filter).forEach(function(u){var kk=u.o+'|'+u.p;(g[kk]=g[kk]||[]).push(u.i);});
    Object.keys(g).forEach(function(kk){
      var pr=kk.split('|'),arr=g[kk].sort(function(a,b){return a-b;}),st=arr[0],pv=arr[0],j;
      function flush(a,b){
        var p=+pr[1]/2,a0=a/2,b0=(b+1)/2;
        out+=pr[0]==='H'?'<line x1="'+X(a0)+'" y1="'+Y(p)+'" x2="'+X(b0)+'" y2="'+Y(p)+'"/>':'<line x1="'+X(p)+'" y1="'+Y(a0)+'" x2="'+X(p)+'" y2="'+Y(b0)+'"/>';
      }
      for(j=1;j<arr.length;j++){if(arr[j]!==pv+1){flush(st,pv);st=arr[j];}pv=arr[j];}
      flush(st,pv);
    });
    return '<g stroke="'+color+'" stroke-width="'+width.toFixed(1)+'" fill="none" stroke-linecap="butt">'+out+'</g>';
  }
  var wOut=Math.max(3,0.75*s*0.85),wCt=Math.max(2,0.5*s*0.85),wIn=Math.max(1.5,0.375*s*0.85);
  ['out','ct','in'].forEach(function(c){var w=c==='out'?wOut:(c==='ct'?wCt:wIn),gl=(c==='in'?wallSel(ST).inn:wallSel(ST).out)==='glass';o+=lines(function(u){return u.c===c&&(u.k==='wall'||u.k==='win'||u.k==='vent');},gl?Math.max(2,w*0.38):w,gl?'var(--glass)':'var(--wall)');});
  (function(){
    var tp={out:wOut,ct:wCt,'in':wIn},g='';
    wallJoints(pl,true).forEach(function(j){var w=tp[j.cls.V],h=tp[j.cls.H];g+='<rect x="'+(mx+j.x*s-w/2).toFixed(1)+'" y="'+(mt+j.y*s-h/2).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'"/>';});
    o+='<g fill="var(--wall)">'+g+'</g>';
  })();
  o+=lines(function(u){return u.k==='win'||u.k==='vent';},wOut*0.45,'var(--glass)');
  o+=lines(function(u){return u.k==='door';},2.6,'var(--door)');
  o+=lines(function(u){return u.k==='main';},4,'var(--door)');
  if(pl.corr){
    pl.pillars.forEach(function(p){o+='<rect x="'+(mx+p[0]*s-2.5).toFixed(1)+'" y="'+(mt+p[1]*s-2.5).toFixed(1)+'" width="5" height="5" fill="var(--ink)"/>';});
    var ct=pl.court;
    o+='<rect x="'+X(ct.x)+'" y="'+Y(ct.y)+'" width="'+(ct.w*s).toFixed(1)+'" height="'+(ct.h*s).toFixed(1)+'" fill="none" stroke="var(--ink2)" stroke-width="0.8" stroke-dasharray="3 3"/>';
    if(pl.k*s>=11) o+='<text x="'+X(pl.center.x+pl.center.w/2)+'" y="'+(mt+(ct.y-pl.k/2)*s+3.5).toFixed(1)+'" font-size="9.5" text-anchor="middle" style="fill:var(--ink2)">Corridor '+pl.k+' ft</text>';
  }
  pl.rooms.forEach(function(r){
    if(r.t==='corr'||r.hidden) return;
    var cx=r.x+r.w/2,cy=r.y+r.h/2,wp=r.w*s,hp=r.h*s,a=rArea(r);
    var ar=f1(a)+' sq ft',dm=(r.parts&&r.parts.length>1)?'combined room':f1(r.w)+' × '+f1(r.h)+' ft',t='';
    if(r.t==='court'){
      var rad=Math.min(wp,hp)*0.2;
      t+='<circle cx="'+X(cx)+'" cy="'+(mt+(r.y+r.h*0.62)*s).toFixed(1)+'" r="'+rad.toFixed(1)+'" fill="#97C459" stroke="#3B6D11" stroke-width="0.6"/>';
      t+='<text x="'+X(cx)+'" y="'+(mt+(r.y+r.h*0.17)*s+4).toFixed(1)+'" font-size="11" font-weight="500" text-anchor="middle">Courtyard</text>';
      if(hp>=60) t+='<text x="'+X(cx)+'" y="'+(mt+(r.y+r.h*0.17)*s+17).toFixed(1)+'" font-size="9.5" text-anchor="middle" style="fill:var(--ink2)">'+f1(r.w)+' × '+f1(r.h)+', open</text>';
      o+=t;return;
    }
    var fs=wp<62?9.5:11,l3=(hp>=50&&wp>=66),l2=hp>=30,nm=r.n;
    if(wp<80) nm=nm.replace('Att. bath + WC','Att. bath').replace('Bath + WC','Bath, WC');
    if(wp<70) nm=nm.replace('Master bedroom','Master').replace('Wash / utility','Utility').replace('Pooja / family','Pooja').replace('Entry / sitting','Entry');
    var vz=(r.id&&r.t!=='pass')?vastuOf(r,pl.W,pl.D):null,l4=!!vz&&hp>=70&&wp>=74,sh=l4?-7:0;
    if(l3){
      t+='<text x="'+X(cx)+'" y="'+(mt+cy*s-9+sh).toFixed(1)+'" font-size="'+fs+'" font-weight="500" text-anchor="middle">'+nm+'</text>';
      t+='<text x="'+X(cx)+'" y="'+(mt+cy*s+4+sh).toFixed(1)+'" font-size="10" text-anchor="middle" style="fill:var(--ink2)">'+dm+'</text>';
      t+='<text x="'+X(cx)+'" y="'+(mt+cy*s+17+sh).toFixed(1)+'" font-size="10" text-anchor="middle" style="fill:var(--ink2)">'+ar+'</text>';
      if(l4) t+='<text x="'+X(cx)+'" y="'+(mt+cy*s+30+sh).toFixed(1)+'" font-size="9.5" text-anchor="middle" style="fill:var('+(vz.status==='ideal'?'--acc':(vz.status==='ok'?'--ink2':'--warn'))+')">'+vz.zone+(vz.status==='check'?' (best '+vz.best+')':', '+vz.status)+'</text>';
    }else if(l2){
      t+='<text x="'+X(cx)+'" y="'+(mt+cy*s-3).toFixed(1)+'" font-size="'+fs+'" font-weight="500" text-anchor="middle">'+nm+'</text>';
      t+='<text x="'+X(cx)+'" y="'+(mt+cy*s+11).toFixed(1)+'" font-size="9.5" text-anchor="middle" style="fill:var(--ink2)">'+ar+'</text>';
    }else{
      t+='<text x="'+X(cx)+'" y="'+(mt+cy*s+3).toFixed(1)+'" font-size="'+fs+'" font-weight="500" text-anchor="middle">'+nm+'</text>';
    }
    o+=t;
  });
  var dx=(door.a0+door.a1)/2;
  o+='<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5"/></marker></defs>';
  o+='<line x1="'+X(dx)+'" y1="10" x2="'+X(dx)+'" y2="'+(mt-EX.t*s-tex-4).toFixed(1)+'" stroke="var(--ink)" stroke-width="1.4" marker-end="url(#ah)"/>';
  o+='<text x="'+(mx+dx*s-8).toFixed(1)+'" y="20" font-size="11" text-anchor="end" style="fill:var(--ink2)">Main entrance</text>';
  var nRot={N:0,E:-90,W:90}[facingOf()]||0,nCx=vw-18,nCy=mt-EX.t*s-19;o+='<g transform="rotate('+nRot+' '+nCx+' '+nCy+')">';
  o+='<line x1="'+(vw-18)+'" y1="'+(mt-EX.t*s-4)+'" x2="'+(vw-18)+'" y2="'+(mt-EX.t*s-34)+'" stroke="var(--ink)" stroke-width="1.4" marker-end="url(#ah)"/>';
  o+='<text x="'+(vw-18)+'" y="'+(mt-EX.t*s-40)+'" font-size="12" font-weight="600" text-anchor="middle">N</text>';
  o+='</g>';
  if(sv) o+=svcDraw(sv,{X:function(x){return mx+x*s;},Y:function(y){return mt+y*s;},u:s,lw:Math.max(1.3,s*0.085),fs:9,labels:true,themed:true,show:{plumb:ST.svc.plumb,tanks:ST.svc.tanks,elec:ST.svc.elec}});
  if(pl.outhouse){var OB=pl.outhouse,pa=OB.path;
    o+='<rect x="'+X(Math.min(pa.x0,pa.x1))+'" y="'+Y(Math.min(pa.y0,pa.y1))+'" width="'+(Math.abs(pa.x1-pa.x0)*s).toFixed(1)+'" height="'+(Math.abs(pa.y1-pa.y0)*s).toFixed(1)+'" fill="var(--f-ver)" stroke="var(--ink2)" stroke-width="0.8" stroke-dasharray="4 3"/>';
    OB.rooms.forEach(function(r){o+='<rect x="'+X(r.x)+'" y="'+Y(r.y)+'" width="'+(r.w*s).toFixed(1)+'" height="'+(r.h*s).toFixed(1)+'" fill="var(--f-wet)"/><text x="'+X(r.x+r.w/2)+'" y="'+(+Y(r.y+r.h/2)+4)+'" font-size="10.5" font-weight="500" text-anchor="middle">'+r.n+'</text>';});
    o+='<rect x="'+X(OB.x0)+'" y="'+Y(OB.y0)+'" width="'+((OB.x1-OB.x0)*s).toFixed(1)+'" height="'+((OB.y1-OB.y0)*s).toFixed(1)+'" fill="none" stroke="var(--wall)" stroke-width="'+(0.375*s).toFixed(1)+'"/>';
    var r0=OB.rooms[0];o+=OB.side==='W'?'<line x1="'+X(OB.x0)+'" y1="'+Y(r0.y+r0.h+0.19)+'" x2="'+X(OB.x1)+'" y2="'+Y(r0.y+r0.h+0.19)+'" stroke="var(--wall)" stroke-width="'+(0.375*s).toFixed(1)+'"/>':'<line x1="'+X(r0.x+r0.w+0.19)+'" y1="'+Y(OB.y0)+'" x2="'+X(r0.x+r0.w+0.19)+'" y2="'+Y(OB.y1)+'" stroke="var(--wall)" stroke-width="'+(0.375*s).toFixed(1)+'"/>';
    OB.doors.forEach(function(dd){o+=dd.o==='V'?'<line x1="'+X(dd.pos)+'" y1="'+Y(dd.a0)+'" x2="'+X(dd.pos)+'" y2="'+Y(dd.a1)+'" stroke="var(--door)" stroke-width="3"/>':'<line x1="'+X(dd.a0)+'" y1="'+Y(dd.pos)+'" x2="'+X(dd.a1)+'" y2="'+Y(dd.pos)+'" stroke="var(--door)" stroke-width="3"/>';});
    o+='<text x="'+X((OB.x0+OB.x1)/2)+'" y="'+(+Y(OB.side==='W'?OB.y0:OB.y1)+(OB.side==='W'?-6:14))+'" font-size="9.5" text-anchor="middle" style="fill:var(--ink2)">Bath and WC block, '+OB.gap+' ft path</text>';
  }
  o+=edOverlay(pl,s,mx,mt);
  o+='</svg>';
  $('plan').innerHTML=o;PV={s:s,mx:mx,mt:mt};
}
$('legend').innerHTML=[['bed','Bedrooms'],['kit','Kitchen'],['din','Dining, living'],['pooja','Pooja / family'],['wet','Bath, WC'],['store','Store, utility'],['entry','Entry'],['corr','Corridor'],['court','Courtyard']].map(function(x){return '<span><i style="background:var(--f-'+x[0]+')"></i>'+x[1]+'</span>';}).join('')+'<span><i style="background:var(--door)"></i>Door</span><span><i style="background:var(--glass)"></i>Window</span>';

/* schedule + cost UI */
var FITL={good:'Good',tight:'Tight',small:'Too small',generous:'Roomy'};
function renderSched(pl){
  var rows='<table><tr><th>Room</th><th>Size (ft)</th><th>Area</th><th>Target</th><th>Fit</th><th>Vastu</th></tr>';
  pl.sched.forEach(function(r){
    rows+='<tr><td>'+r.n+'</td><td>'+f1(r.w)+' × '+f1(r.h)+'</td><td>'+f1(r.a)+'</td><td>'+r.ideal+'</td><td class="fit-'+r.fit+'">'+FITL[r.fit]+'</td><td class="v-'+r.vastu+'">'+r.zone+(r.vastu==='check'?', check (best '+r.vbest+')':', '+r.vastu)+'</td></tr>';
  });
  var c=pl.court;
  rows+='<tr><td>Courtyard</td><td>'+f1(c.w)+' × '+f1(c.h)+'</td><td>'+f1(pl.courtArea)+'</td><td>open</td><td></td><td class="v-ideal">centre, ideal</td></tr>';
  if(pl.corr){var ring=pl.center.w*pl.center.h-pl.courtArea;rows+='<tr><td>Corridor ring, '+pl.k+' ft wide</td><td></td><td>'+f1(ring)+'</td><td>covered</td><td></td><td></td></tr>';}
  $('sched').innerHTML=rows+'</table>';
  var notes=[];
  notes.push('Sizes come from an optimiser. For '+num(pl.area)+' sq ft and this room list it tries thousands of wing depths and footprints, then keeps the layout whose rooms sit closest to comfortable targets, stay near square, and each open to the courtyard, corridor or a neighbour. '+Math.round(pl.eff*100)+'% of the footprint is room floor.');
  var vchk=pl.sched.filter(function(r){return r.vastu==='check';}).map(function(r){return r.n+' sits in the '+r.zone+' (best '+r.vbest+')';});
  notes.push('Vastu: '+(vchk.length?vchk.join('; ')+'.':'every room sits in an ideal or acceptable zone.')+' No bath or WC shares a wall with the kitchen.'+(pl.rooms.some(function(r){return r.n==='Dress / store';})?' A dress and store room separates the master bath from the kitchen.':''));
  var tight=pl.sched.filter(function(r){return r.fit==='small'||r.fit==='tight';}).map(function(r){return r.n;});
  if(pl.grownFrom) notes.push('Footprint grown from '+num(pl.grownFrom)+' to '+num(pl.area)+' sq ft so the '+pl.k+' ft walkway all around the '+f1(pl.court.w)+' × '+f1(pl.court.h)+' ft courtyard fits with usable rooms.');
  if(pl.dropped){
    var want=minAreaFor(Object.assign({},pl.cfg,{k:ST.corr}));
    notes.push('A '+ST.corr+' ft corridor does not fit this room list at '+num(pl.cfg.area)+' sq ft, so the plan is shown without it. About '+num(want)+' sq ft, or one room fewer, would make room for it.');
  }
  if(tight.length) notes.push('Tight rooms: '+tight.join(', ')+'.');
  if(pl.noDoor.length) notes.push('No door could be placed for: '+pl.noDoor.join(', ')+'. Try a larger area.');
  $('schedNote').innerHTML=notes.map(function(n){return '<p>'+n+'</p>';}).join('');
  var sg=suggestFor(ST),b=$('useMin');
  $('minLine').textContent='Suggested for these rooms: about '+num(sg.area)+' sq ft footprint ('+sg.W+' × '+sg.D+' ft), '+num(sg.builtup)+' sq ft built-up, courtyard '+f1(sg.court.w)+' × '+f1(sg.court.h)+' ft. Yours: '+num(pl.area)+' sq ft footprint, '+num(pl.builtup)+' sq ft built-up.'+(sg.dropped?' A corridor does not fit comfortably at any area in range, so this suggestion has none.':'');
  if(pl.custom||Math.abs(pl.area-sg.area)>30){b.style.display='';b.setAttribute('data-a',sg.cfgArea);b.textContent='Use the suggested '+num(sg.area)+' sq ft';}
  else b.style.display='none';
}
function renderCost(){
  var pl=planFor(ST);
  var r=costFor(pl,ST,ST.sys,ST.finish,ST.region);
  $('tot').textContent=lakh(r.total);
  $('meta').innerHTML='<span><b>'+fmt(r.total)+'</b> total</span><span><b>'+fmt(r.perSqft)+'</b> per sq ft of footprint</span><span><b>'+r.months.toFixed(1)+'</b> months</span>'+(r.bricks?'<span><b>'+num(r.bricks)+'</b> bricks</span>':'')+(r.blocks?'<span><b>'+num(r.blocks)+'</b> AAC blocks</span>':'')+(r.boards?'<span><b>'+num(r.boards)+'</b> '+(r.boardKind==='wpc'?'WPC':'gypsum')+' boards (8 × 4 ft)</span>':'');
  renderBudget(pl,r);renderMaterials(pl,r);try{renderCompare();}catch(e){console.error(e);}
  var mx=0;r.items.forEach(function(i){if(i[1]>mx)mx=i[1];});
  $('bars').innerHTML=r.items.map(function(i){return '<div class="bar"><span>'+i[0]+'</span><span class="t"><i style="width:'+(i[1]/mx*100).toFixed(1)+'%"></i></span><span class="v">'+lakh(i[1]).replace('₹ ','₹')+'</span></div>';}).join('');
  var base=r.total,rows='<table><tr><th>Structure</th><th>Total</th><th>Per sq ft</th><th>Months</th><th>vs selected</th></tr>';
  SYSTEMS.forEach(function(sy){
    var c=costFor(pl,ST,sy.v,ST.finish,ST.region),d=c.total-base;
    rows+='<tr'+(sy.v===ST.sys?' class="sel"':'')+'><td>'+sy.n+'</td><td>'+lakh(c.total)+'</td><td>'+fmt(c.perSqft)+'</td><td>'+c.months.toFixed(1)+'</td><td>'+(sy.v===ST.sys?'selected':(d>0?'+':'−')+lakh(Math.abs(d)).replace('₹ ',''))+'</td></tr>';
  });
  $('cmpSys').innerHTML=rows+'</table>';
  rows='<table><tr><th>Roof</th><th>Total</th><th>Per sq ft</th><th>Roof area</th><th>vs selected</th></tr>';
  SHAPES.forEach(function(sh){
    var S2=Object.assign({},ST,{shape:sh.v}),c=costFor(pl,S2,ST.sys,ST.finish,ST.region),d=c.total-base;
    rows+='<tr'+(sh.v===ST.shape?' class="sel"':'')+'><td>'+sh.n+'</td><td>'+lakh(c.total)+'</td><td>'+fmt(c.perSqft)+'</td><td>'+num(c.roofArea)+' sq ft</td><td>'+(sh.v===ST.shape?'selected':(d>0?'+':'−')+lakh(Math.abs(d)).replace('₹ ',''))+'</td></tr>';
  });
  $('cmpRoof').innerHTML=rows+'</table>';
  $('areaLine').textContent=pl.W+' × '+pl.D+' ft footprint = '+num(pl.area)+' sq ft. Built-up '+num(pl.builtup)+' sq ft plus open courtyard '+num(pl.courtArea)+' sq ft. '+(pl.jag?'Jagali platforms ':'Veranda ')+num(pl.verArea)+' sq ft.';
  renderSched(pl);
  clearTimeout(renderCost.t);
  renderCost.t=setTimeout(function(){
    if(ST.custom&&ST.custom.on){$('cmpCorr').innerHTML='<p class="hint">Switch to "Optimised for me" to compare corridor widths.</p>';return;}
    var base2=r.total,rr='<table><tr><th>Corridor</th><th>Total</th><th>Per sq ft</th><th>Built-up</th><th>vs selected</th></tr>';
    [[0,'None'],[3,'3 ft wide'],[4,'4 ft wide'],[5,'5 ft wide'],[6,'6 ft wide']].forEach(function(o){
      var p2=planFor(Object.assign({},ST,{corr:o[0]})),sel=(o[0]===ST.corr);
      if(p2.dropped&&o[0]>0){rr+='<tr><td>'+o[1]+'</td><td colspan="4" style="text-align:left;color:var(--ink2)">Does not fit at '+num(ST.area)+' sq ft</td></tr>';return;}
      var c=costFor(p2,ST,ST.sys,ST.finish,ST.region),d=c.total-base2;
      rr+='<tr'+(sel?' class="sel"':'')+'><td>'+o[1]+'</td><td>'+lakh(c.total)+'</td><td>'+fmt(c.perSqft)+'</td><td>'+num(p2.builtup)+' sq ft</td><td>'+(sel?'selected':(d>0?'+':'−')+lakh(Math.abs(d)).replace('₹ ',''))+'</td></tr>';
    });
    $('cmpCorr').innerHTML=rr+'</table>';
  },40);
}

/* 3D scene */
var renderer=null,scene=null,cam=null,house=null,roofMeshes=[],spin=true,roofOn=true,az=2.5,el=0.62,zoom=1,baseDist=90,tgt=null,have3d=false;
function init3D(){
  var host=$('v3d');
  if(typeof THREE==='undefined'){host.innerHTML='<p class="warnbox" style="padding:16px">The 3D view could not load. Check your internet connection and reload.</p>';return;}
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  }catch(e){host.innerHTML='<p class="warnbox" style="padding:16px">The 3D view needs WebGL, which this browser has turned off.</p>';return;}
  have3d=true;
  scene=new THREE.Scene();
  cam=new THREE.PerspectiveCamera(36,1,0.5,900);
  tgt=new THREE.Vector3(0,5,-3);
  scene.add(new THREE.HemisphereLight(0xffffff,0x8a8576,0.9));
  var dl=new THREE.DirectionalLight(0xffffff,0.6);dl.position.set(40,70,-30);scene.add(dl);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  host.appendChild(renderer.domElement);
  resize();
  var cv=renderer.domElement,pts={},lastPinch=0;
  var dn0=null;
  cv.addEventListener('pointerdown',function(e){dn0={x:e.clientX,y:e.clientY,t:Date.now(),n:Object.keys(pts).length};pts[e.pointerId]={x:e.clientX,y:e.clientY};spin=false;$('bSpin').textContent='Spin';try{cv.setPointerCapture(e.pointerId);}catch(x){}cv.style.cursor='grabbing';});
  cv.addEventListener('pointermove',function(e){
    var p=pts[e.pointerId];if(!p)return;
    var ids=Object.keys(pts);
    if(ids.length===2){
      pts[e.pointerId]={x:e.clientX,y:e.clientY};
      var a=pts[ids[0]],b=pts[ids[1]],d=Math.hypot(a.x-b.x,a.y-b.y);
      if(lastPinch>0) zoom=Math.max(0.45,Math.min(1.9,zoom*(lastPinch/d)));
      lastPinch=d;return;
    }
    az-=(e.clientX-p.x)*0.008;el=Math.max(0.1,Math.min(1.45,el+(e.clientY-p.y)*0.006));
    pts[e.pointerId]={x:e.clientX,y:e.clientY};
  });
  function up(e){
    var d0=dn0;dn0=null;
    if(d0&&e.type==='pointerup'&&d0.n===0&&EDIT.mode!=='off'&&Math.abs(e.clientX-d0.x)+Math.abs(e.clientY-d0.y)<8&&Date.now()-d0.t<600&&Object.keys(pts).length<=1) click3D(e);
    delete pts[e.pointerId];lastPinch=0;cv.style.cursor='grab';
  }
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('wheel',function(e){e.preventDefault();zoom=Math.max(0.45,Math.min(1.9,zoom*(1+e.deltaY*0.001)));spin=false;$('bSpin').textContent='Spin';},{passive:false});
  window.addEventListener('resize',resize);
  (function loop(){
    if(spin) az+=0.004;
    var d=baseDist*zoom;
    cam.position.set(tgt.x+d*Math.cos(el)*Math.sin(az),tgt.y+d*Math.sin(el),tgt.z+d*Math.cos(el)*Math.cos(az));
    cam.lookAt(tgt);renderer.render(scene,cam);requestAnimationFrame(loop);
  })();
}
function resize(){
  if(!renderer)return;
  var h=$('v3d'),w=h.clientWidth||360,hh=h.clientHeight||340;
  renderer.setSize(w,hh);cam.aspect=w/hh;cam.updateProjectionMatrix();
}
function toMesh(banks,store){
  Object.keys(banks).forEach(function(k){
    var b=banks[k],g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(b.p),3));
    g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(b.n),3));
    var mt=new THREE.MeshLambertMaterial({color:+k,side:THREE.DoubleSide});
    if(ST.xray&&(store||+k===0xEADFC8)){mt.transparent=true;mt.opacity=store?0.2:0.26;mt.depthWrite=false;}
    if(+k===0x9CC9E0){mt.transparent=true;mt.opacity=0.32;mt.depthWrite=false;}
    var m=new THREE.Mesh(g,mt);
    house.add(m);if(store)store.push(m);
  });
}
function build3D(){
  if(!have3d)return;
  if(house){
    scene.remove(house);
    house.traverse(function(o){if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
  }
  house=new THREE.Group();roofMeshes=[];
  var r=geoBuild(ST,ST.sys),pl=r.pl,W=pl.W,D=pl.D,vd=pl.vd;
  toMesh(r.banks,null);toMesh(r.roofBanks,roofMeshes);
  roofMeshes.forEach(function(m){m.visible=roofOn;});
  pickObjs=buildPickMeshes(pl,ST);pickObjs.forEach(function(m){house.add(m);});
  if(r.svc&&ST.svc&&ST.svc.tanks){
    var T=r.svc.tanks,ob=T.over,add=function(geo,col,x,y,z){var m=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:col}));m.position.set(x,y,z);house.add(m);return m;};
    add(new THREE.CylinderGeometry(ob.d/2,ob.d/2*0.96,ob.h,28),0x23272B,ob.x-W/2,ob.zb+ob.h/2,ob.y-D/2);
    add(new THREE.CylinderGeometry(ob.d/2*0.55,ob.d/2*0.55,0.25,20),0x14171A,ob.x-W/2,ob.zb+ob.h+0.12,ob.y-D/2);
    var mh=function(x,y){add(new THREE.CylinderGeometry(0.85,0.85,0.18,20),0x6F6A5E,x-W/2,0.2,y-D/2);};
    var sp=T.septic;
    if(sp.side==='W'){mh(sp.x-sp.w/3,sp.y);mh(sp.x+sp.w/3,sp.y);}else{mh(sp.x,sp.y-sp.h/3);mh(sp.x,sp.y+sp.h/3);}
    mh(T.sump.x,T.sump.y);
    add(new THREE.CylinderGeometry(T.soak.d/2,T.soak.d/2,0.16,28),0xB8AE98,T.soak.x-W/2,0.1,T.soak.y-D/2);
    add(new THREE.CylinderGeometry(T.soak.d/2*0.35,T.soak.d/2*0.35,0.2,16),0x6F6A5E,T.soak.x-W/2,0.14,T.soak.y-D/2);
  }
  (r.pillars||[]).forEach(function(pp){
    var by0=(pp.by===undefined?pl.plinth:pp.by),top0=(pp.by===undefined?pl.plinth+pp.h:pp.top),hh=top0-by0-0.9;if(hh<3) return;
    var prof=[[0.30,0],[0.42,0.25],[0.34,0.5],[0.27,1.3],[0.27,hh-1.4],[0.38,hh-0.95],[0.33,hh-0.75],[0.5,hh-0.45],[0.5,hh]].map(function(q){return new THREE.Vector2(q[0],q[1]);});
    var pm=new THREE.Mesh(new THREE.LatheGeometry(prof,18),new THREE.MeshLambertMaterial({color:0x5B2A1B}));
    pm.position.set(pp.x,by0+0.9,pp.z);house.add(pm);
  });
  var g=new THREE.Mesh(new THREE.CylinderGeometry(Math.max(W,D)*1.9,Math.max(W,D)*1.9,0.2,64),new THREE.MeshLambertMaterial({color:0xA9BC84}));g.position.y=-0.1;house.add(g);
  var c=pl.court,cx=c.x+c.w/2-W/2,cz=c.y+c.h/2-D/2,PL=pl.plinth-0.7;
  var ring=new THREE.Mesh(new THREE.CylinderGeometry(1.8,1.8,0.8,24),new THREE.MeshLambertMaterial({color:0xA8A294}));ring.position.set(cx,PL+0.4,cz);house.add(ring);
  var tr=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.45,5,10),new THREE.MeshLambertMaterial({color:0x6B4A2F}));tr.position.set(cx,PL+3.3,cz);house.add(tr);
  var cr=Math.min(c.w,c.h)*0.3;
  [[0,8.2,0,1],[0.55,7.2,0.3,0.7],[-0.55,7.4,-0.3,0.7]].forEach(function(p){
    var m=new THREE.Mesh(new THREE.SphereGeometry(cr*p[3],18,14),new THREE.MeshLambertMaterial({color:0x5E8A3A}));m.position.set(cx+p[0],PL+p[1],cz+p[2]);house.add(m);
  });
  var narr=new THREE.Group();house.add(narr);var fRot={N:0,E:Math.PI/2,W:-Math.PI/2}[facingOf()]||0;narr.rotation.y=fRot;var fR=Math.max(W,D)/2+vd/2;
  var ax=Math.max(7,W*0.25)*(facingOf()==='N'?1:0)+(facingOf()==='N'?W/2:0),az0=-(facingOf()==='N'?D/2+vd/2:fR);
  var sh=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.3,8),new THREE.MeshLambertMaterial({color:0x3B6D11}));sh.position.set(ax,0.2,az0+4);narr.add(sh);
  var cn=new THREE.Mesh(new THREE.ConeGeometry(2.2,4,16),new THREE.MeshLambertMaterial({color:0x3B6D11}));cn.rotation.x=-Math.PI/2;cn.position.set(ax,0.3,az0-1.5);narr.add(cn);
  var cvs=document.createElement('canvas');cvs.width=64;cvs.height=64;
  var cx2=cvs.getContext('2d');cx2.fillStyle='#3B6D11';cx2.font='bold 48px sans-serif';cx2.textAlign='center';cx2.textBaseline='middle';cx2.fillText('N',32,34);
  var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cvs),transparent:true}));sp.position.set(ax,5,az0-5.5);sp.scale.set(6,6,1);narr.add(sp);
  if(wallSel(ST).out==='glass'&&specOf(ST,'curtains').f>0){var cuCol=specOf(ST,'curtains').v==='pair'?0xD9CBB0:0xF3EEE2,cuM=new THREE.MeshLambertMaterial({color:cuCol,transparent:true,opacity:0.92}),cH=8.4,cy0=pl.plinth+0.15+cH/2,ccx=pl.court?pl.court.x+pl.court.w/2:W/2,ccy=pl.court?pl.court.y+pl.court.h/2:D/2;
    try{wallRuns(pl).filter(function(rn){return rn.cls==='out'||rn.cls==='ct';}).forEach(function(rn){var L=rn.len,cw=Math.min(2.6,L/4);if(L<3) return;
      var mid=rn.pos,inw=rn.cls==='out'?((rn.o==='H'?D/2:W/2)>mid?1:-1):((rn.o==='H'?ccy:ccx)>mid?-1:1),off=mid+inw*0.32;
      [rn.a0+cw/2+0.2,rn.a1-cw/2-0.2].forEach(function(a){var m=new THREE.Mesh(new THREE.BoxGeometry(rn.o==='H'?cw:0.12,cH,rn.o==='H'?0.12:cw),cuM);m.position.set((rn.o==='H'?a:off)-W/2,cy0,(rn.o==='H'?off:a)-D/2);house.add(m);});});}catch(e){}
  }
  if(pl.outhouse){var OQ=pl.outhouse,PLo=0.75,hw=OQ.wallH,box=function(w2,h2,d2,col,x,y,z){var m=new THREE.Mesh(new THREE.BoxGeometry(w2,h2,d2),new THREE.MeshLambertMaterial({color:col}));m.position.set(x-W/2,y,z-D/2);house.add(m);return m;};
    var ow=OQ.x1-OQ.x0,od=OQ.y1-OQ.y0,ocx=(OQ.x0+OQ.x1)/2,ocy=(OQ.y0+OQ.y1)/2,tw=0.375;
    box(ow+0.6,PLo,od+0.6,0xB8AE98,ocx,PLo/2,ocy);
    box(ow,hw,tw,0xEDE6D8,ocx,PLo+hw/2,OQ.y0+tw/2);box(ow,hw,tw,0xEDE6D8,ocx,PLo+hw/2,OQ.y1-tw/2);box(tw,hw,od,0xEDE6D8,OQ.x0+tw/2,PLo+hw/2,ocy);box(tw,hw,od,0xEDE6D8,OQ.x1-tw/2,PLo+hw/2,ocy);
    box(ow+1.2,0.4,od+1.2,0xBDBAB2,ocx,PLo+hw+0.2,ocy);
    OQ.doors.forEach(function(dd){if(dd.o==='V') box(0.12,6.8,dd.a1-dd.a0,0x7A4E2C,dd.pos+(OQ.side==='W'?0.08:-0.08),PLo+3.4,(dd.a0+dd.a1)/2);else box(dd.a1-dd.a0,6.8,0.12,0x7A4E2C,(dd.a0+dd.a1)/2,PLo+3.4,dd.pos-0.08);});
    var pq=OQ.path;box(Math.abs(pq.x1-pq.x0),0.15,Math.abs(pq.y1-pq.y0),0xC9C0AE,(pq.x0+pq.x1)/2,0.08,(pq.y0+pq.y1)/2);
  }
  scene.add(house);
  sel3d();
  fit3D(r.pl,r.svc,false);
}
function fit3D(pl,sv,reset){
  if(!cam||!tgt) return;
  var W=pl.W,D=pl.D,EX=pl.ext,R=mkRoof(pl,ST);
  var x0=-EX.l-4,x1=W+EX.r+4,z0=-EX.t-5,z1=D+EX.b+4,top=pl.plinth+R.top+1;
  if(sv&&svcOn(ST)){
    x0=Math.min(x0,sv.minX-2);x1=Math.max(x1,sv.maxX+2);z0=Math.min(z0,sv.minY-2);z1=Math.max(z1,sv.maxY+2);
    if(ST.svc.tanks) top=Math.max(top,sv.tanks.over.zb+sv.tanks.over.h+1);
  }
  var cx=(x0+x1)/2-W/2,cz=(z0+z1)/2-D/2,r=0.5*Math.sqrt((x1-x0)*(x1-x0)+(z1-z0)*(z1-z0)+top*top);
  var vf=36*Math.PI/180,ef=Math.min(vf,2*Math.atan(Math.tan(vf/2)*(cam.aspect||1)));
  baseDist=r/Math.sin(ef/2)*0.95;
  tgt.set(cx,top*0.35,cz);zoom=1;
  if(reset){el=0.62;}
}
$('bRoof').addEventListener('click',function(){roofOn=!roofOn;roofMeshes.forEach(function(m){m.visible=roofOn;});this.textContent=roofOn?'Hide roof':'Show roof';});
$('bFit3').addEventListener('click',function(){var pl=planFor(ST);fit3D(pl,svcOn(ST)?servicesData(pl,ST):null,true);});
$('bSpin').addEventListener('click',function(){spin=!spin;this.textContent=spin?'Stop spin':'Spin';});


