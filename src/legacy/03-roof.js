/* ---------- roof model ---------- */
function pitchEff(pl,S){
  var C=pl.court,W=pl.W,D=pl.D,maxD=Math.max(C.y,D-(C.y+C.h),C.x,W-(C.x+C.w)),cap=S.rise>0?S.rise:3;
  var span=(S.shape==='inward'||S.shape==='outward')?maxD:maxD/2,deg=S.pitch;
  if(S.shape!=='flat'&&Math.tan(deg*Math.PI/180)*span>cap) deg=Math.atan(cap/span)*180/Math.PI;
  return Math.round(deg*10)/10;
}
function mkRoof(pl,S){
  var t=Math.tan(pitchEff(pl,S)*Math.PI/180),C=pl.court,W=pl.W,D=pl.D,cx2=C.x+C.w,cy2=C.y+C.h,sh=S.shape;
  var maxD=Math.max(C.y,D-cy2,C.x,W-cx2),Hout=9+maxD*t;
  function dOut(x,y){return Math.min(x,W-x,y,D-y);}
  function dIn(x,y){return Math.max(C.x-x,x-cx2,C.y-y,y-cy2);}
  function H(x,y){
    if(sh==='flat') return 10;
    if(sh==='inward') return Hout-t*dOut(x,y);
    if(sh==='outward') return 9+t*dOut(x,y);
    return 9+t*Math.min(dOut(x,y),dIn(x,y));
  }
  var top=0;
  if(sh!=='flat'){for(var gx=0;gx<=W;gx+=1) for(var gy=0;gy<=D;gy+=1){if(gx>C.x&&gx<cx2&&gy>C.y&&gy<cy2) continue;top=Math.max(top,H(gx,gy));}}
  else top=10;
  return {t:t,H:H,hAt:H,wallH:function(o,mx,my){return H(mx,my);},maxD:maxD,Hout:Hout,top:top,eff:pitchEff(pl,S)};
}
function creases(pl,S){
  var W=pl.W,D=pl.D,C=pl.court,cx2=C.x+C.w,cy2=C.y+C.h,sh=S.shape,segs=[];
  if(sh==='flat') return segs;
  var P=[[1,0,0],[-1,0,W],[0,1,0],[0,-1,D]];
  if(sh==='double') P=P.concat([[-1,0,C.x],[1,0,-cx2],[0,-1,C.y],[0,1,-cy2]]);
  function ev(p,x,y){return p[0]*x+p[1]*y+p[2];}
  function Sf(x,y){var o=Math.min(x,W-x,y,D-y);if(sh!=='double') return o;return Math.min(o,Math.max(C.x-x,x-cx2,C.y-y,y-cy2));}
  function ok(i,j,x,y){
    if(x<-1e-9||x>W+1e-9||y<-1e-9||y>D+1e-9) return false;
    if(x>C.x+1e-9&&x<cx2-1e-9&&y>C.y+1e-9&&y<cy2-1e-9) return false;
    var s=Sf(x,y);return Math.abs(ev(P[i],x,y)-s)<1e-6&&Math.abs(ev(P[j],x,y)-s)<1e-6;
  }
  for(var i=0;i<P.length;i++)for(var j=i+1;j<P.length;j++){
    var A=P[i][0]-P[j][0],B=P[i][1]-P[j][1],Cc=P[i][2]-P[j][2];
    if(Math.abs(A)<1e-9&&Math.abs(B)<1e-9) continue;
    var run=null,q,n,x,y;
    function flush(){if(run&&run.length>=2) segs.push({a:run[0],b:run[run.length-1]});run=null;}
    if(Math.abs(B)>=Math.abs(A)){n=Math.round(W/0.25);for(q=0;q<=n;q++){x=q*0.25;y=-(A*x+Cc)/B;if(ok(i,j,x,y)){(run=run||[]).push([x,y]);}else flush();}}
    else{n=Math.round(D/0.25);for(q=0;q<=n;q++){y=q*0.25;x=-(B*y+Cc)/A;if(ok(i,j,x,y)){(run=run||[]).push([x,y]);}else flush();}}
    flush();
  }
  return segs;
}
function vRoof(pl,S){
  var th=0.3,vs=S.shape==='flat'?0.06:0.12,vd=pl.vd,oo=S.over,ov=Math.min(oo,1.5);
  var d0=-0.2,d1=vd+oo*0.6+0.3,h0=8.0-vs*d0+th/2,h1=8.0-vs*d1+th/2;
  var sl=Math.sqrt((d1-d0)*(d1-d0)+(h1-h0)*(h1-h0)),slabs=[],area=0,sd=pl.sides,W=pl.W,D=pl.D;
  pl.strips.forEach(function(st){
    var len,p0,p1,ex;
    if(st.side==='N'||st.side==='S'){
      len=st.x1-st.x0+2*ov;var xc=(st.x0+st.x1)/2;ex=[1,0];
      if(st.side==='N'){p0=[xc,-d0];p1=[xc,-d1];}else{p0=[xc,D+d0];p1=[xc,D+d1];}
    }else{
      var ya=st.y0-(sd.n?0:ov),yb=st.y1+(sd.s?0:ov);len=yb-ya;var yc=(ya+yb)/2;ex=[0,1];
      if(st.side==='E'){p0=[W+d0,yc];p1=[W+d1,yc];}else{p0=[-d0,yc];p1=[-d1,yc];}
    }
    slabs.push({side:st.side,p0:p0,p1:p1,ex:ex,len:len});area+=len*sl;
  });
  return {slabs:slabs,h0:h0,h1:h1,th:th,area:area,top:function(d){return 8.0-vs*d;},vs:vs};
}
function platRoof(pl,S,bank,off){
  if(!pl.strips.length) return 0;
  var W=pl.W,D=pl.D,SD=pl.sides,vd=pl.vd,oo=S.over,ov=Math.min(oo,1.5),m=oo*0.6+0.3,th=0.3,vs=S.shape==='flat'?0.06:0.12,st=0.5,lim=vd+m+1,area=0,i,j;
  var x0=-lim,y0=-lim,nx=Math.round((W+2*lim)/st),ny=Math.round((D+2*lim)/st);
  function H(x,y){return 8.0-vs*Math.max(-y,y-D,x-W,-x);}
  function inc(a,b){
    if(a<0||b<0||a>=nx||b>=ny) return false;
    var cx=x0+(a+0.5)*st,cy=y0+(b+0.5)*st;
    if(cx>0&&cx<W&&cy>0&&cy<D) return false;
    var dN=-cy,dS=cy-D,dE=cx-W,dW=-cx,d=Math.max(dN,dS,dE,dW);
    if(d<=0||d>vd+m) return false;
    var sd=d===dN?'n':(d===dS?'s':(d===dE?'e':'w'));
    if(!SD[sd]) return false;
    if(sd==='n'||sd==='s') return cx>=-(SD.w?vd:0)-ov&&cx<=W+(SD.e?vd:0)+ov;
    return cy>=-(SD.n?vd:0)-ov&&cy<=D+(SD.s?vd:0)+ov;
  }
  function P3(x,y,h){return [x+off.x,h+off.y,y+off.z];}
  function push(a,b,c,d){
    var u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    var n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2])||1;
    n=[n[0]/l,n[1]/l,n[2]/l];
    if(n[0]*d[0]+n[1]*d[1]+n[2]*d[2]<0){var tmp=b;b=c;c=tmp;n=[-n[0],-n[1],-n[2]];}
    [a,b,c].forEach(function(q){bank.p.push(q[0],q[1],q[2]);bank.n.push(n[0],n[1],n[2]);});
  }
  function quad(a,b,c,d,dir){push(a,b,c,dir);push(a,c,d,dir);}
  for(j=0;j<ny;j++)for(i=0;i<nx;i++){
    if(!inc(i,j)) continue;
    var xa=x0+i*st,xb=xa+st,ya=y0+j*st,yb=ya+st;
    var hA=H(xa,ya),hB=H(xb,ya),hC=H(xb,yb),hD=H(xa,yb),hM=H(xa+st/2,ya+st/2);
    var useAC=Math.abs(hM-(hA+hC)/2)<=Math.abs(hM-(hB+hD)/2)+1e-9;
    var vx=[xa,xb,xb,xa],vy=[ya,ya,yb,yb],vh=[hA,hB,hC,hD],tr=useAC?[[0,1,2],[0,2,3]]:[[0,1,3],[1,2,3]];
    tr.forEach(function(t3){
      var a=[vx[t3[0]],vy[t3[0]],vh[t3[0]]],b=[vx[t3[1]],vy[t3[1]],vh[t3[1]]],c=[vx[t3[2]],vy[t3[2]],vh[t3[2]]];
      var u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
      var cx=u[1]*v[2]-u[2]*v[1],cy=u[2]*v[0]-u[0]*v[2],cz=u[0]*v[1]-u[1]*v[0];
      area+=0.5*Math.sqrt(cx*cx+cy*cy+cz*cz);
      if(bank){
        push(P3(a[0],a[1],a[2]+th),P3(b[0],b[1],b[2]+th),P3(c[0],c[1],c[2]+th),[0,1,0]);
        push(P3(a[0],a[1],a[2]),P3(b[0],b[1],b[2]),P3(c[0],c[1],c[2]),[0,-1,0]);
      }
    });
    if(bank){
      var T=function(x,y,h){return P3(x,y,h+th);},B=function(x,y,h){return P3(x,y,h);};
      if(!inc(i-1,j)) quad(T(xa,ya,hA),T(xa,yb,hD),B(xa,yb,hD),B(xa,ya,hA),[-1,0,0]);
      if(!inc(i+1,j)) quad(T(xb,ya,hB),T(xb,yb,hC),B(xb,yb,hC),B(xb,ya,hB),[1,0,0]);
      if(!inc(i,j-1)) quad(T(xa,ya,hA),T(xb,ya,hB),B(xb,ya,hB),B(xa,ya,hA),[0,0,-1]);
      if(!inc(i,j+1)) quad(T(xa,yb,hD),T(xb,yb,hC),B(xb,yb,hC),B(xa,yb,hD),[0,0,1]);
    }
  }
  return area;
}
function roofMesh(pl,S,bank,off){
  var W=pl.W,D=pl.D,C=pl.court,oo=S.over,area=0,i,j;
  if(S.shape==='flat'){
    var ch=Math.min(S.over,2),fl=[
      {x0:-ch,x1:W+ch,y0:-ch,y1:C.y},{x0:-ch,x1:W+ch,y0:C.y+C.h,y1:D+ch},
      {x0:-ch,x1:C.x,y0:C.y,y1:C.y+C.h},{x0:C.x+C.w,x1:W+ch,y0:C.y,y1:C.y+C.h}];
    fl.forEach(function(f){area+=(f.x1-f.x0)*(f.y1-f.y0);});
    return {area:area,flat:fl};
  }
  var R=mkRoof(pl,S),th=0.3,io=rnd(S.over/2),st=0.5,x0=-oo,y0=-oo,nx=Math.round((W+2*oo)/st),ny=Math.round((D+2*oo)/st);
  var hx0=C.x-io,hx1=C.x+C.w+io,hy0=C.y-io,hy1=C.y+C.h+io;
  function inc(a,b){
    if(a<0||b<0||a>=nx||b>=ny) return false;
    var cx=x0+(a+0.5)*st,cy=y0+(b+0.5)*st;
    return !(cx>hx0&&cx<hx1&&cy>hy0&&cy<hy1);
  }
  function P3(x,y,h){return [x+off.x,h+off.y,y+off.z];}
  function push(a,b,c,d){
    var u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    var n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2])||1;
    n=[n[0]/l,n[1]/l,n[2]/l];
    if(n[0]*d[0]+n[1]*d[1]+n[2]*d[2]<0){var tmp=b;b=c;c=tmp;n=[-n[0],-n[1],-n[2]];}
    [a,b,c].forEach(function(p){bank.p.push(p[0],p[1],p[2]);bank.n.push(n[0],n[1],n[2]);});
  }
  function quad(a,b,c,d,dir){push(a,b,c,dir);push(a,c,d,dir);}
  for(j=0;j<ny;j++)for(i=0;i<nx;i++){
    if(!inc(i,j)) continue;
    var xa=x0+i*st,xb=xa+st,ya=y0+j*st,yb=ya+st;
    var hA=R.H(xa,ya),hB=R.H(xb,ya),hC=R.H(xb,yb),hD=R.H(xa,yb),hM=R.H(xa+st/2,ya+st/2);
    var useAC=Math.abs(hM-(hA+hC)/2)<=Math.abs(hM-(hB+hD)/2)+1e-9;
    var vx=[xa,xb,xb,xa],vy=[ya,ya,yb,yb],vh=[hA,hB,hC,hD];
    var tr=useAC?[[0,1,2],[0,2,3]]:[[0,1,3],[1,2,3]];
    tr.forEach(function(t3){
      var a=[vx[t3[0]],vy[t3[0]],vh[t3[0]]],b=[vx[t3[1]],vy[t3[1]],vh[t3[1]]],c=[vx[t3[2]],vy[t3[2]],vh[t3[2]]];
      var u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
      var cx=u[1]*v[2]-u[2]*v[1],cy=u[2]*v[0]-u[0]*v[2],cz=u[0]*v[1]-u[1]*v[0];
      area+=0.5*Math.sqrt(cx*cx+cy*cy+cz*cz);
      if(bank){
        push(P3(a[0],a[1],a[2]+th),P3(b[0],b[1],b[2]+th),P3(c[0],c[1],c[2]+th),[0,1,0]);
        push(P3(a[0],a[1],a[2]),P3(b[0],b[1],b[2]),P3(c[0],c[1],c[2]),[0,-1,0]);
      }
    });
    if(bank){
      var T=function(x,y,h){return P3(x,y,h+th);},B=function(x,y,h){return P3(x,y,h);};
      if(!inc(i-1,j)) quad(T(xa,ya,hA),T(xa,yb,hD),B(xa,yb,hD),B(xa,ya,hA),[-1,0,0]);
      if(!inc(i+1,j)) quad(T(xb,ya,hB),T(xb,yb,hC),B(xb,yb,hC),B(xb,ya,hB),[1,0,0]);
      if(!inc(i,j-1)) quad(T(xa,ya,hA),T(xb,ya,hB),B(xb,ya,hB),B(xa,ya,hA),[0,0,-1]);
      if(!inc(i,j+1)) quad(T(xa,yb,hD),T(xb,yb,hC),B(xb,yb,hC),B(xa,yb,hD),[0,0,1]);
    }
  }
  return {area:area,flat:null};
}

