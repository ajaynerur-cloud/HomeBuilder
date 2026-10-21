/* ---------- 3D geometry ---------- */
function geoBuild(S,sys){
  var pl=planFor(S),R=mkRoof(pl,S),vr=vRoof(pl,S);
  var V3=THREE.Vector3,PL=pl.plinth,W=pl.W,D=pl.D,vd=pl.vd;
  var banks={},roofBanks={};
  function bank(store,col){return store[col]||(store[col]={p:[],n:[]});}
  function face(g,c,n,hn,u,hu,v,hv){
    var cn=c.clone().addScaledVector(n,hn),cs=[[-1,-1],[1,-1],[1,1],[-1,1]],pts=[];
    for(var i=0;i<4;i++) pts.push(cn.clone().addScaledVector(u,cs[i][0]*hu).addScaledVector(v,cs[i][1]*hv));
    [0,1,2,0,2,3].forEach(function(k){g.p.push(pts[k].x,pts[k].y,pts[k].z);g.n.push(n.x,n.y,n.z);});
  }
  function obox(g,c,ex,ey,ez,sx,sy,sz){
    var hx=sx/2,hy=sy/2,hz=sz/2,nx=ex.clone().negate(),ny=ey.clone().negate(),nz=ez.clone().negate();
    face(g,c,ex,hx,ey,hy,ez,hz);face(g,c,nx,hx,ez,hz,ey,hy);
    face(g,c,ey,hy,ez,hz,ex,hx);face(g,c,ny,hy,ex,hx,ez,hz);
    face(g,c,ez,hz,ex,hx,ey,hy);face(g,c,nz,hz,ey,hy,ex,hx);
  }
  var X=new V3(1,0,0),Y=new V3(0,1,0),Z=new V3(0,0,1);
  function abox(g,cx,cy,cz,sx,sy,sz){obox(g,new V3(cx,cy,cz),X,Y,Z,sx,sy,sz);}
  function tx(x){return x-W/2;}
  function tz(y){return y-D/2;}
  var WALL=0xEADFC8,DOOR=0x7A5236,MAINDOOR=0x4E3320,GLASS=0x4A86BD,STONE=0xA8A294,FLOOR=0xD5CEBF,DECK=0xC2BBA9,WOOD=0x8A6340;
  var COLCOL=(sys==='rcc')?0xB5B2AA:0x3F5168;
  var roofCol=S.shape==='flat'?0xB9B5A8:(COVERS.filter(function(c){return c.v===S.cover;})[0]||COVERS[0]).c;

  /* plinth, sunken courtyard, floors, pillars */
  var QC=pl.court,PIT=0.7,qx2=QC.x+QC.w,qy2=QC.y+QC.h;
  function slab(col,x0,x1,y0,y1,yb,yt){if(x1-x0<0.01||y1-y0<0.01) return;abox(bank(banks,col),tx((x0+x1)/2),(yb+yt)/2,tz((y0+y1)/2),x1-x0,yt-yb,y1-y0);}
  var EXT=pl.ext,PX0=-EXT.l-0.5,PX1=W+EXT.r+0.5,PY0=-EXT.t-0.5,PY1=D+EXT.b+0.5,JG=pl.jag,PLC=JG?0xE6E0D0:STONE;
  var HX0=-0.5,HX1=W+0.5,HY0=-0.5,HY1=D+0.5;
  slab(PLC,HX0,HX1,HY0,HY1,0,PL-PIT);
  [[HX0,HX1,HY0,QC.y],[HX0,HX1,qy2,HY1],[HX0,QC.x,QC.y,qy2],[qx2,HX1,QC.y,qy2]].forEach(function(r){slab(PLC,r[0],r[1],r[2],r[3],PL-PIT,PL);});
  function segM(g){
    var m=[0,0,0,0],hz=(g.side==='N'||g.side==='S');
    if(hz){if(g.first) m[0]=0.5;if(g.last) m[1]=0.5;if(g.side==='N') m[2]=0.5;else m[3]=0.5;}
    else{if(g.first&&!pl.sides.n) m[2]=0.5;if(g.last&&!pl.sides.s) m[3]=0.5;if(g.side==='W') m[0]=0.5;else m[1]=0.5;}
    return m;
  }
  pl.segs.forEach(function(g){
    var m=segM(g);
    if(g.kind==='gap'){slab(0xCFC7B3,g.x0,g.x1,g.y0-m[2],g.y1+m[3],0,0.06);return;}
    slab(PLC,g.x0-m[0],g.x1+m[1],g.y0-m[2],g.y1+m[3],0,g.h);
    slab(JG?0x9B3B2F:DECK,g.x0,g.x1,g.y0,g.y1,g.h,g.h+0.04);
  });
  [[0,W,0,QC.y],[0,W,qy2,D],[0,QC.x,QC.y,qy2],[qx2,W,QC.y,qy2]].forEach(function(r){slab(FLOOR,r[0],r[1],r[2],r[3],PL,PL+0.04);});
  if(pl.corr){
    var QR=pl.center,bd=1.2,YEL=0xE3B04B;
    [[QR.x,QR.x+QR.w,QR.y,QC.y],[QR.x,QR.x+QR.w,qy2,QR.y+QR.h],[QR.x,QC.x,QC.y,qy2],[qx2,QR.x+QR.w,QC.y,qy2]].forEach(function(r){slab(0x2F6B5A,r[0],r[1],r[2],r[3],PL+0.04,PL+0.08);});
    slab(YEL,QC.x-bd,qx2+bd,QC.y-bd,QC.y,PL+0.08,PL+0.11);slab(YEL,QC.x-bd,qx2+bd,qy2,qy2+bd,PL+0.08,PL+0.11);
    slab(YEL,QC.x-bd,QC.x,QC.y,qy2,PL+0.08,PL+0.11);slab(YEL,qx2,qx2+bd,QC.y,qy2,PL+0.08,PL+0.11);
  }
  slab(0xD2B48C,QC.x,qx2,QC.y,qy2,PL-PIT,PL-PIT+0.04);
  var GR=0x8F9298,gw=0.7;
  slab(GR,QC.x,qx2,QC.y,QC.y+gw,PL-PIT+0.04,PL-PIT+0.12);slab(GR,QC.x,qx2,qy2-gw,qy2,PL-PIT+0.04,PL-PIT+0.12);
  slab(GR,QC.x,QC.x+gw,QC.y+gw,qy2-gw,PL-PIT+0.04,PL-PIT+0.12);slab(GR,qx2-gw,qx2,QC.y+gw,qy2-gw,PL-PIT+0.04,PL-PIT+0.12);
  var TIMB=0x5B2A1B,pil=[],pedge={N:[],S:[],W:[],E:[]};
  var STC=S.pillarC||'turned',STV=S.pillarV||'turned';
  function pillarAt(style,x,z,baseY,topY){
    var h=topY-baseY;
    if(style==='masonry'){
      var lo=Math.min(3.2,h-0.8);
      abox(bank(banks,0x7A2E35),x,baseY+lo/2,z,1.05,lo,1.05);
      abox(bank(banks,WALL),x,baseY+lo+(h-lo)/2,z,1.05,h-lo,1.05);
      abox(bank(banks,0xA39B8A),x,topY-0.15,z,1.4,0.3,1.4);
    }else{
      abox(bank(banks,STONE),x,baseY+0.45,z,0.95,0.9,0.95);
      var ph0=h-0.9-0.6;
      abox(bank(banks,TIMB),x,baseY+0.9+ph0/2,z,0.72,ph0,0.72);
      abox(bank(banks,TIMB),x,topY-0.45,z,1.05,0.3,1.05);
      abox(bank(banks,TIMB),x,topY-0.72,z,1.9,0.26,0.3);abox(bank(banks,TIMB),x,topY-0.72,z,0.3,0.26,1.9);
    }
  }
  pl.pillars.forEach(function(pp){
    var hx=pp[0],hy=pp[1],e=0.35,h;
    if(Math.abs(hy-QC.y)<1e-6) h=R.hAt(hx,hy-e);
    else if(Math.abs(hy-qy2)<1e-6) h=R.hAt(hx,hy+e);
    else if(Math.abs(hx-QC.x)<1e-6) h=R.hAt(hx-e,hy);
    else h=R.hAt(hx+e,hy);
    if(!(h>3)) h=9;
    var rec={x:tx(hx),z:tz(hy),h:h-0.1,hx:hx,hy:hy};
    if(STC==='turned'){abox(bank(banks,STONE),tx(hx),PL+0.45,tz(hy),1.1,0.9,1.1);pil.push(rec);}
    else pillarAt(STC,rec.x,rec.z,PL,PL+rec.h);
    if(Math.abs(hy-QC.y)<1e-6) pedge.N.push(rec);
    if(Math.abs(hy-qy2)<1e-6) pedge.S.push(rec);
    if(Math.abs(hx-QC.x)<1e-6) pedge.W.push(rec);
    if(Math.abs(hx-qx2)<1e-6) pedge.E.push(rec);
  });
  var tb=bank(banks,TIMB);
  ['N','S'].forEach(function(k){
    var a2=pedge[k].sort(function(u,v){return u.hx-v.hx;});
    for(var i=0;i+1<a2.length;i++){var ln=a2[i+1].hx-a2[i].hx,yy=PL+(a2[i].h+a2[i+1].h)/2-0.5;abox(tb,(a2[i].x+a2[i+1].x)/2,yy,a2[i].z,ln,0.55,0.5);}
  });
  ['W','E'].forEach(function(k){
    var a2=pedge[k].sort(function(u,v){return u.hy-v.hy;});
    for(var i=0;i+1<a2.length;i++){var ln=a2[i+1].hy-a2[i].hy,yy=PL+(a2[i].h+a2[i+1].h)/2-0.5;abox(tb,a2[i].x,yy,(a2[i].z+a2[i+1].z)/2,0.5,0.55,ln);}
  });

  /* walls */
  var nodes={};
  function node(nx,ny,dir,h){
    var k=nx+','+ny,n=nodes[k]||(nodes[k]={h:false,v:false,hm:0,x:nx,y:ny});
    n[dir]=true;if(h>n.hm)n.hm=h;
  }
  pl.units.forEach(function(u){
    if(u.k==='gone') return;
    var hz=u.o==='H',mx=hz?(u.i+0.5)/2:u.p/2,my=hz?u.p/2:(u.i+0.5)/2;
    var h=R.wallH(u.o,mx,my),th=u.c==='out'?0.75:(u.c==='ct'?0.5:0.375);
    var cx=tx(mx),cz=tz(my),sx=hz?0.52:th,sz=hz?th:0.52;
    var gl=(u.c==='in'?wallSel(S).inn:wallSel(S).out)==='glass',g=bank(banks,gl?0x9CC9E0:WALL);if(gl){if(hz) sz=0.12;else sx=0.12;}
    function seg(y0,y1){if(y1-y0>0.01) abox(g,cx,PL+(y0+y1)/2,cz,sx,y1-y0,sz);}
    if(gl&&(u.k==='win'||u.k==='vent')){seg(0,h);if(hz){node(u.i,u.p,'h',h);node(u.i+1,u.p,'h',h);}else{node(u.p,u.i,'v',h);node(u.p,u.i+1,'v',h);}return;}
    if(hz){node(u.i,u.p,'h',h);node(u.i+1,u.p,'h',h);}else{node(u.p,u.i,'v',h);node(u.p,u.i+1,'v',h);}
    switch(u.k){
      case 'wall':seg(0,h);break;
      case 'door':seg(7,h);abox(bank(banks,DOOR),cx,PL+3.5,cz,hz?0.52:0.12,7,hz?0.12:0.52);break;
      case 'main':seg(7,h);abox(bank(banks,MAINDOOR),cx,PL+3.5,cz,hz?0.52:0.16,7,hz?0.16:0.52);break;
      case 'open':seg(7.5,h);break;
      case 'win':seg(0,3);seg(6.5,h);abox(bank(banks,GLASS),cx,PL+4.75,cz,hz?0.52:0.1,3.5,hz?0.1:0.52);var fcB=bank(banks,FRAMECOL[specOf(S,'winFrame').v]||WOOD);abox(fcB,cx,PL+3.08,cz,hz?0.52:0.2,0.16,hz?0.2:0.52);abox(fcB,cx,PL+6.42,cz,hz?0.52:0.2,0.16,hz?0.2:0.52);break;
      case 'vent':seg(0,5.5);seg(7,h);abox(bank(banks,GLASS),cx,PL+6.25,cz,hz?0.52:0.1,1.5,hz?0.1:0.52);break;
    }
  });
  (function(){
    var jg=bank(banks,wallSel(S).out==='glass'?0x3A3F44:WALL);
    wallJoints(pl,false).forEach(function(j){
      var nd=nodes[(j.x*2)+','+(j.y*2)],h=nd?nd.hm:9;
      abox(jg,tx(j.x),PL+h/2,tz(j.y),j.tw,h,j.th);
    });
  })();
  if(sys!=='brick'){
    var cs=(sys==='rcc')?0.95:0.82,cg=bank(banks,COLCOL);
    Object.keys(nodes).forEach(function(k){
      var n=nodes[k];
      if(n.h&&n.v) abox(cg,tx(n.x/2),PL+n.hm/2,tz(n.y/2),cs,n.hm,cs);
    });
  }

  /* roof */
  var rb=bank(roofBanks,roofCol);
  var rm=roofMesh(pl,S,rb,{x:-W/2,y:PL,z:-D/2});
  if(rm.flat){
    rm.flat.forEach(function(f){abox(rb,tx((f.x0+f.x1)/2),PL+10.25,tz((f.y0+f.y1)/2),f.x1-f.x0,0.5,f.y1-f.y0);});
    var pc=bank(roofBanks,0xCFCABD),py=PL+10.5+1.25;
    abox(pc,0,py,tz(0),W+0.75,2.5,0.5);abox(pc,0,py,tz(D),W+0.75,2.5,0.5);
    abox(pc,tx(0),py,0,0.5,2.5,D);abox(pc,tx(W),py,0,0.5,2.5,D);
  }
  platRoof(pl,S,rb,{x:-W/2,y:PL,z:-D/2});

  /* exposed timber rafters under the roof */
  if(S.shape!=='flat'){
    var rg=bank(banks,0x6B3A22),rsp=2.5,rio=rnd(S.over/2),roo=S.over;
    var rh0=QC.x-rio,rh1=qx2+rio,rv0=QC.y-rio,rv1=qy2+rio;
    var zn=function(x,y){var d=[x,W-x,y,D-y],m=0,i;for(i=1;i<4;i++) if(d[i]<d[m]-1e-9) m=i;return m;};
    var rseg=function(ax,ay,bx,by,wz){
      var mx=(ax+bx)/2,my=(ay+by)/2;
      if(zn(mx,my)!==wz||(mx>rh0&&mx<rh1&&my>rv0&&my<rv1)) return;
      var A=new V3(tx(ax),PL+R.H(ax,ay)-0.25,tz(ay)),B=new V3(tx(bx),PL+R.H(bx,by)-0.25,tz(by)),ln=A.distanceTo(B);
      if(ln<0.05) return;
      var ez3=B.clone().sub(A).normalize(),ex3=new V3(by-ay,0,-(bx-ax)).normalize(),ey3=new V3().crossVectors(ez3,ex3);
      if(ey3.y<0){ex3.negate();ey3.negate();}
      obox(rg,A.clone().add(B).multiplyScalar(0.5),ex3,ey3,ez3,0.28,0.45,ln);
    };
    var rx,ry;
    for(rx=1.25;rx<W;rx+=rsp)for(ry=-roo;ry<D+roo-1e-6;ry+=1){rseg(rx,ry,rx,ry+1,2);rseg(rx,ry,rx,ry+1,3);}
    for(ry=1.25;ry<D;ry+=rsp)for(rx=-roo;rx<W+roo-1e-6;rx+=1){rseg(rx,ry,rx+1,ry,0);rseg(rx,ry,rx+1,ry,1);}
  }

  /* veranda or jagali on the chosen sides */
  var door=pl.doors.filter(function(d){return d.k==='main';})[0],dc=(door.a0+door.a1)/2;
  var gw=bank(banks,WOOD),i,SD=pl.sides,ledgeOn=!!(JG&&JG.ledges&&SD.n&&!pl.split);
  var ph=vr.top(vd-0.4),pcol=JG?0xA39B8A:STONE,stc=JG?0xE6E0D0:STONE;
  var exitC={S:null,E:null,W:null};
  pl.doors.forEach(function(d){if(d.exit) exitC[d.exit]=(d.a0+d.a1)/2;});
  var stepC={N:dc,S:exitC.S===null?W/2:exitC.S,E:exitC.E===null?D/2:exitC.E,W:exitC.W===null?D/2:exitC.W};
  pl.strips.forEach(function(st){
    var sd=st.side,horiz=(sd==='N'||sd==='S'),lo=horiz?st.x0:st.y0,len=horiz?st.x1-st.x0:st.y1-st.y0,n=Math.max(2,Math.round(len/9))+1,k;
    var edge=sd==='N'?-vd+0.4:(sd==='S'?D+vd-0.4:(sd==='W'?-vd+0.4:W+vd-0.4));
    for(k=0;k<n;k++){
      var a=lo+0.5+k*(len-1)/(n-1);
      if(Math.abs(a-stepC[sd])<3.4) continue;
      var px=horiz?a:edge,py=horiz?edge:a;
      var inGap=pl.segs.some(function(g){return g.kind==='gap'&&g.side===sd&&a>(horiz?g.x0:g.y0)+0.05&&a<(horiz?g.x1:g.y1)-0.05;});
      if(inGap) continue;
      var gs=pl.segs.filter(function(g){return g.side===sd&&g.kind!=='gap'&&a>=(horiz?g.x0:g.y0)-1e-6&&a<=(horiz?g.x1:g.y1)+1e-6;})[0],gh=gs?gs.h:PL;
      if(STV==='turned'){abox(bank(banks,pcol),tx(px),gh+0.45,tz(py),0.95,0.9,0.95);pil.push({x:tx(px),z:tz(py),h:ph,by:gh,top:PL+ph});}
      else pillarAt(STV,tx(px),tz(py),gh,PL+ph);
    }
    if(horiz) abox(tb,tx((st.x0+st.x1)/2),PL+ph-0.5,tz(edge),len,0.55,0.5);
    else abox(tb,tx(edge),PL+ph-0.5,tz((st.y0+st.y1)/2),0.5,0.55,len);
  });
  var SSET=stepSets(pl);
  function stepBox(sd,c,w0,H){
    var n=Math.max(2,Math.ceil(H/0.55)),r=H/n,col=bank(banks,stc);
    var ec=sd==='N'?-EXT.t-0.5:(sd==='S'?D+EXT.b+0.5:(sd==='W'?-EXT.l-0.5:W+EXT.r+0.5));
    for(var si=0;si<n-1;si++){
      var sth=H-r*(si+1),off=0.5+si,w=w0+si*0.6;
      if(sd==='N') abox(col,tx(c),sth/2,tz(ec-off),w,sth,1.0);
      else if(sd==='S') abox(col,tx(c),sth/2,tz(ec+off),w,sth,1.0);
      else if(sd==='W') abox(col,tx(ec-off),sth/2,tz(c),1.0,sth,w);
      else abox(col,tx(ec+off),sth/2,tz(c),1.0,sth,w);
    }
  }
  SSET.steps.forEach(function(q){stepBox(q.side,q.c,q.w,q.H);});
  SSET.stairs.forEach(function(q){
    var n=q.N,r=q.H/n,col=bank(banks,stc);
    for(var si=0;si<n-1;si++){
      var top=q.H-r*(si+1);
      if(q.side==='N') abox(col,tx(q.c),top/2,tz(-0.875-si),q.w,top,1.0);
      else if(q.side==='S') abox(col,tx(q.c),top/2,tz(D+0.875+si),q.w,top,1.0);
      else if(q.side==='W') abox(col,tx(-0.875-si),top/2,tz(q.c),1.0,top,q.w);
      else abox(col,tx(W+0.875+si),top/2,tz(q.c),1.0,top,q.w);
    }
  });
  SSET.door.forEach(function(q){
    var n=Math.ceil(q.rise/0.55),r=q.rise/n,col=bank(banks,stc);
    for(var si=0;si<n-1;si++){
      var top=PL-r*(si+1);
      if(q.side==='N') abox(col,tx(q.c),top/2,tz(-0.875-si),q.w,top,1.0);
      else if(q.side==='S') abox(col,tx(q.c),top/2,tz(D+0.875+si),q.w,top,1.0);
      else if(q.side==='W') abox(col,tx(-0.875-si),top/2,tz(q.c),1.0,top,q.w);
      else abox(col,tx(W+0.875+si),top/2,tz(q.c),1.0,top,q.w);
    }
  });
  if(JG){
    var COP=0xA39B8A;
    var cp=function(x0,x1,y0,y1,h){slab(COP,x0,x1,y0,y1,h-0.1,h+0.06);};
    var spanG=function(lo,hi,gaps,fn){
      var cur=lo;gaps.sort(function(a,b){return a.c-b.c;});
      gaps.forEach(function(g){var g0=g.c-g.half,g1=g.c+g.half;if(g1<=cur||g0>=hi) return;if(g0>cur) fn(cur,g0);cur=Math.max(cur,g1);});
      if(cur<hi) fn(cur,hi);
    };
    pl.segs.forEach(function(g){
      if(g.kind==='gap') return;
      var m=segM(g),bx0=g.x0-m[0],bx1=g.x1+m[1],by0=g.y0-m[2],by1=g.y1+m[3],hz=(g.side==='N'||g.side==='S'),h=g.h;
      var a0=hz?g.x0:g.y0,a1=hz?g.x1:g.y1;
      var gaps=SSET.steps.filter(function(q){return q.side===g.side&&q.c>=a0-1e-6&&q.c<=a1+1e-6;}).map(function(q){return {c:q.c,half:(q.w+(q.H>1?1.2:0.6))/2};});
      if(g.side==='N') spanG(bx0-0.2,bx1+0.2,gaps,function(a,b){cp(a,b,by0-0.2,by0+0.35,h);});
      else if(g.side==='S') spanG(bx0-0.2,bx1+0.2,gaps,function(a,b){cp(a,b,by1-0.35,by1+0.2,h);});
      else if(g.side==='W') spanG(by0-0.2,by1+0.2,gaps,function(a,b){cp(bx0-0.2,bx0+0.35,a,b,h);});
      else spanG(by0-0.2,by1+0.2,gaps,function(a,b){cp(bx1-0.35,bx1+0.2,a,b,h);});
      if(hz){
        if(g.first&&!SD.w) cp(bx0-0.2,bx0+0.35,g.side==='N'?by0-0.2:g.y0,g.side==='N'?g.y1:by1+0.2,h);
        if(g.last&&!SD.e) cp(bx1-0.35,bx1+0.2,g.side==='N'?by0-0.2:g.y0,g.side==='N'?g.y1:by1+0.2,h);
      }else{
        if(g.first&&!SD.n) cp(g.side==='W'?bx0-0.2:g.x0,g.side==='W'?g.x1:bx1+0.2,by0-0.2,by0+0.35,h);
        if(g.last&&!SD.s) cp(g.side==='W'?bx0-0.2:g.x0,g.side==='W'?g.x1:bx1+0.2,by1-0.35,by1+0.2,h);
      }
      if(g.kind==='wing'){
        if(hz){
          if(!g.last) cp(g.x1-0.35,g.x1+0.2,by0,by1,h);
          if(!g.first) cp(g.x0-0.2,g.x0+0.35,by0,by1,h);
        }else{
          if(!g.last) cp(bx0,bx1,g.y1-0.35,g.y1+0.2,h);
          if(!g.first) cp(bx0,bx1,g.y0-0.2,g.y0+0.35,h);
        }
      }
    });
    if(ledgeOn){
      [[0.1,1.5],[W-1.5,W-0.1]].forEach(function(r){
        slab(0xE6E0D0,r[0],r[1],-vd+1.1,-0.5,PL,PL+1.3);
        slab(COP,r[0]-0.06,r[1]+0.06,-vd+1.04,-0.44,PL+1.3,PL+1.42);
      });
    }
    var dd=bank(banks,0x7A2E35),dgn=bank(banks,0x2F6B5A);
    pl.strips.forEach(function(st){
      var sd=st.side,L=(sd==='N'||sd==='S')?W:D;
      var ex=unitRuns(pl,sd).filter(function(r){return r.k==='door'||r.k==='main'||r.k==='open';}).map(function(r){return [r.a,r.b];}).sort(function(a,b){return a[0]-b[0];});
      var cur=0,spans=[];
      ex.forEach(function(e){if(e[0]>cur+0.5) spans.push([cur,e[0]]);cur=Math.max(cur,e[1]);});
      if(L>cur+0.5) spans.push([cur,L]);
      spans.forEach(function(r){
        var c=(r[0]+r[1])/2,l=r[1]-r[0];
        if(sd==='N'){abox(dd,tx(c),PL+1.45,tz(0)-0.4,l,2.9,0.05);abox(dgn,tx(c),PL+2.97,tz(0)-0.4,l,0.14,0.06);}
        else if(sd==='S'){abox(dd,tx(c),PL+1.45,tz(D)+0.4,l,2.9,0.05);abox(dgn,tx(c),PL+2.97,tz(D)+0.4,l,0.14,0.06);}
        else if(sd==='W'){abox(dd,tx(0)-0.4,PL+1.45,tz(c),0.05,2.9,l);abox(dgn,tx(0)-0.4,PL+2.97,tz(c),0.06,0.14,l);}
        else{abox(dd,tx(W)+0.4,PL+1.45,tz(c),0.05,2.9,l);abox(dgn,tx(W)+0.4,PL+2.97,tz(c),0.06,0.14,l);}
      });
    });
  }
  if(SD.n){
  var baseAt=function(x){var g=pl.segs.filter(function(q){return q.side==='N'&&x>=q.x0-1e-6&&x<=q.x1+1e-6;})[0];return g?g.h:PL;};
  var bx=W*0.2+(ledgeOn?2.4:0),by=-1.0,BB=baseAt(bx);
  abox(gw,tx(bx),BB+1.4,tz(by),8,0.2,1.6);
  abox(gw,tx(bx-3.8),BB+0.7,tz(by),0.2,1.4,1.4);abox(gw,tx(bx+3.8),BB+0.7,tz(by),0.2,1.4,1.4);
  abox(gw,tx(bx),BB+2.15,tz(-0.25),8,1.3,0.15);
  var tcx=W*(ledgeOn?0.78:0.85),tcy=-vd/2-0.2,TB=baseAt(tcx);
  abox(gw,tx(tcx),TB+2.5,tz(tcy),2.2,0.15,2.2);abox(gw,tx(tcx),TB+1.25,tz(tcy),0.3,2.4,0.3);
  [-1,1].forEach(function(sd){
    var cx=tcx+sd*2.9;
    abox(gw,tx(cx),TB+1.45,tz(tcy),1.4,0.15,1.4);abox(gw,tx(cx),TB+0.7,tz(tcy),1.2,1.4,1.2);
    abox(gw,tx(cx+sd*0.7),TB+2.2,tz(tcy),0.15,1.3,1.4);
  });
  }
  var SV=null;
  if(svcOn(S)){
    SV=servicesData(pl,S);
    var sf2=S.svc,colr={supply:0x2F7BD9,sump:0x2F7BD9,drain:0x6E625A,elec:0xF0B400},th={supply:0.2,sump:0.24,drain:0.36,elec:0.15};
    var visP=function(p){return p.k==='elec'?sf2.elec:(sf2.plumb||(sf2.tanks&&p.z<1));};
    SV.pipes.forEach(function(pp){
      if(!visP(pp)) return;
      var b=bank(banks,colr[pp.k]),t=th[pp.k];
      for(var i=0;i+1<pp.pts.length;i++){
        var a=pp.pts[i],c=pp.pts[i+1];
        abox(b,tx((a[0]+c[0])/2),pp.z,tz((a[1]+c[1])/2),Math.abs(c[0]-a[0])+t,t,Math.abs(c[1]-a[1])+t);
      }
    });
    SV.risers.forEach(function(rv){
      if(!(rv.k==='elec'?sf2.elec:(sf2.plumb||(sf2.tanks&&rv.k==='sump')))) return;
      var t=th[rv.k];abox(bank(banks,colr[rv.k]),tx(rv.x),(rv.z0+rv.z1)/2,tz(rv.y),t,Math.abs(rv.z1-rv.z0),t);
    });
    SV.pts.forEach(function(q){
      if(q.k==='light'&&sf2.elec) abox(bank(banks,0xFFE27A),tx(q.x),q.z,tz(q.y),0.9,0.12,0.9);
      else if(q.k==='fan'&&sf2.elec){var b=bank(banks,0x444444);abox(b,tx(q.x),q.z-0.1,tz(q.y),0.35,0.35,0.35);abox(b,tx(q.x),q.z-0.4,tz(q.y),4,0.05,0.35);abox(b,tx(q.x),q.z-0.4,tz(q.y),0.35,0.05,4);}
      else if(q.k==='db'&&sf2.elec) abox(bank(banks,0x333333),tx(q.x),PL+q.z-PL,tz(q.y),0.4,1.5,1.1);
      else if(q.k==='meter'&&sf2.elec) abox(bank(banks,0xE0A500),tx(q.x),PL+q.z-PL,tz(q.y),1.2,1.4,0.5);
      else if(q.k==='tap'&&sf2.plumb) abox(bank(banks,0x2F7BD9),tx(q.x),q.z,tz(q.y),0.5,0.5,0.5);
      else if(q.k==='drain'&&sf2.plumb) abox(bank(banks,0x6E625A),tx(q.x),q.z,tz(q.y),0.8,0.12,0.8);
    });
    if(sf2.tanks){
      var T=SV.tanks,sl=bank(banks,0xB9B4A6);
      abox(sl,tx(T.septic.x),0.06,tz(T.septic.y),T.septic.w,0.12,T.septic.h);
      abox(sl,tx(T.sump.x),0.06,tz(T.sump.y),T.sump.w,0.12,T.sump.h);
      var ob=T.over,lg=bank(banks,0x555555),rr=ob.d/2-0.25;
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(c){abox(lg,tx(ob.x)+c[0]*rr*0.8,(ob.roofTop+ob.zb)/2,tz(ob.y)+c[1]*rr*0.8,0.22,ob.zb-ob.roofTop,0.22);});
      abox(lg,tx(ob.x),ob.zb-0.1,tz(ob.y),ob.d+0.3,0.2,ob.d+0.3);
    }
  }
  return {banks:banks,roofBanks:roofBanks,pl:pl,pillars:pil,svc:SV};
}

