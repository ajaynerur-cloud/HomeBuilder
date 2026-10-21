/* ---------- structure and drawings ---------- */
var FS=3.048;
function r2(v){return Math.round(v*100)/100;}
function ft(v){
  var neg=v<0;v=Math.abs(v);var f=Math.floor(v+1e-9),i=Math.round((v-f)*12);
  if(i===12){f++;i=0;}
  return (neg?'-':'')+f+'\u2032-'+i+'\u2033';
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function TX(x,y,s,sz,anc,wt,col){return '<text x="'+r2(x)+'" y="'+r2(y)+'" font-size="'+sz+'" text-anchor="'+(anc||'start')+'" font-weight="'+(wt||400)+'" fill="'+(col||'#111')+'">'+esc(s)+'</text>';}
function LN(x1,y1,x2,y2,w,col,dash){return '<line x1="'+r2(x1)+'" y1="'+r2(y1)+'" x2="'+r2(x2)+'" y2="'+r2(y2)+'" stroke="'+(col||'#111')+'" stroke-width="'+(w||0.3)+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';}
function RC(x,y,w,h,fill,stroke,sw,dash){return '<rect x="'+r2(x)+'" y="'+r2(y)+'" width="'+r2(w)+'" height="'+r2(h)+'" fill="'+(fill||'none')+'" stroke="'+(stroke||'none')+'" stroke-width="'+(sw||0.3)+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';}
function PG(pts,fill,stroke,sw){return '<polygon points="'+pts.map(function(p){return r2(p[0])+','+r2(p[1]);}).join(' ')+'" fill="'+(fill||'none')+'" stroke="'+(stroke||'none')+'" stroke-width="'+(sw||0.3)+'" stroke-linejoin="round"/>';}
function dimH(x1,x2,y,off,txt,sz){
  var yy=y+off,s='';
  s+=LN(x1,y,x1,yy+1.2,0.18,'#444')+LN(x2,y,x2,yy+1.2,0.18,'#444')+LN(x1,yy,x2,yy,0.25);
  s+=LN(x1-0.9,yy+0.9,x1+0.9,yy-0.9,0.35)+LN(x2-0.9,yy+0.9,x2+0.9,yy-0.9,0.35);
  s+=TX((x1+x2)/2,yy-0.8,txt,sz||2.2,'middle');
  return s;
}
function dimV(y1,y2,x,off,txt,sz){
  var xx=x+off,s='';
  s+=LN(x,y1,xx+(off>0?1.2:-1.2),y1,0.18,'#444')+LN(x,y2,xx+(off>0?1.2:-1.2),y2,0.18,'#444')+LN(xx,y1,xx,y2,0.25);
  s+=LN(xx-0.9,y1+0.9,xx+0.9,y1-0.9,0.35)+LN(xx-0.9,y2+0.9,xx+0.9,y2-0.9,0.35);
  var cy=(y1+y2)/2;
  s+='<text x="'+r2(xx-0.8)+'" y="'+r2(cy)+'" font-size="'+(sz||2.2)+'" text-anchor="middle" fill="#111" transform="rotate(-90 '+r2(xx-0.8)+' '+r2(cy)+')">'+esc(txt)+'</text>';
  return s;
}
function roomAt(pl,x,y){
  for(var i=0;i<pl.rooms.length;i++){var r=pl.rooms[i];if(r.hidden||r.t==='court'||r.t==='corr') continue;if(partAt(rparts(r),x,y)>=0&&x<r.x+r.w+1e3) return r;}
  for(i=0;i<pl.rooms.length;i++){r=pl.rooms[i];if(r.t==='corr'&&x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h) return r;}
  return null;
}
function unitRuns(pl,face){
  var W2=pl.W*2,D2=pl.D*2,us=pl.units.filter(function(u){
    if(face==='N') return u.o==='H'&&u.p===0;
    if(face==='S') return u.o==='H'&&u.p===D2;
    if(face==='E') return u.o==='V'&&u.p===W2;
    return u.o==='V'&&u.p===0;
  }).sort(function(a,b){return a.i-b.i;});
  var runs=[],cur=null;
  us.forEach(function(u){
    if(u.k==='wall'){cur=null;return;}
    if(cur&&cur.k===u.k&&cur.e===u.i){cur.e=u.i+1;}
    else{cur={k:u.k,s:u.i,e:u.i+1};runs.push(cur);}
  });
  return runs.map(function(r){return {k:r.k,a:r.s/2,b:r.e/2};});
}
function nodesOf(pl){
  var nodes={};
  function nd(nx,ny,dir,u){
    var k=nx+','+ny,n=nodes[k]||(nodes[k]={x:nx/2,y:ny/2,h:false,v:false,out:false});
    n[dir]=true;if(u.c==='out') n.out=true;
  }
  pl.units.forEach(function(u){
    if(u.k==='gone') return;
    if(u.o==='H'){nd(u.i,u.p,'h',u);nd(u.i+1,u.p,'h',u);}else{nd(u.p,u.i,'v',u);nd(u.p,u.i+1,'v',u);}
  });
  return Object.keys(nodes).map(function(k){return nodes[k];}).filter(function(n){return n.h&&n.v;});
}

/* structural design (preliminary, rule-of-thumb sizing) */
var STR_CACHE={};
function structure(pl,S,sys,sbc){
  var key=pl.key+'|'+S.shape+'|'+S.cover+'|'+S.pitch+'|'+S.over+'|'+S.rise+'|'+sys+'|'+sbc;
  if(STR_CACHE[key]) return STR_CACHE[key];
  var q=quant(pl,S),flat=S.shape==='flat',M2=0.0929,i;
  var roofDL=flat?4.8:({tile:0.9,sheet:0.6,rcctile:4.2}[S.cover]||0.9),LL=flat?1.5:0.75;
  var roofA=pl.builtup*M2,a9=(q.A.out+q.A.ct)*M2,ain=q.A.in*M2;
  var wallW=a9*5.0+ain*(sys==='brick'?5.0:2.5),roofW=(roofDL+LL)*roofA,total=(roofW+wallW)*1.1;
  var W=pl.W,D=pl.D,wallLen=0,outLen=0;
  pl.units.forEach(function(u){if(u.k==='gone') return;wallLen+=0.5;if(u.c==='out') outLen+=0.5;});
  var res={sys:sys,sbc:sbc,roofDL:roofDL,LL:LL,roofW:roofW,wallW:wallW,total:total,wallLenFt:wallLen,outLenFt:outLen,cols:[],foot:[],strip:null,colSec:[],beams:{}};
  var ctrX=[],ctrY=[];
  if(sys==='brick'){
    var wOut=Math.max(0.6,1.1*((roofDL+LL)*1.8+5.0*3.2+3)/sbc),wIn=Math.max(0.45,1.1*(5.0*3.0+2)/sbc);
    wOut=Math.ceil(wOut/0.05)*0.05;wIn=Math.ceil(wIn/0.05)*0.05;
    var inLen=wallLen-outLen;
    res.strip={outMm:Math.round(wOut*1000),inMm:Math.round(wIn*1000),outFt:wOut*3.281,inFt:wIn*3.281,outLen:outLen,inLen:inLen,
      concrete:(outLen*0.3048*wOut+inLen*0.3048*wIn)*0.15};
    res.beams={plinth:'230 × 150 plinth band, 4-10φ, 8φ @ 200',lintel:'230 × 150 lintel/roof band, 4-10φ, 8φ @ 200',len:wallLen};
    res.steelKg=Math.round(res.strip.concrete*40+wallLen*0.3048*0.23*0.15*2*130+(flat?pl.builtup*M2*0.125*85:0)+(flat?0:roofA*8));
    res.concreteM3=Math.round((res.strip.concrete+wallLen*0.3048*0.23*0.15*2+(flat?pl.builtup*M2*0.125:0))*10)/10;
  }else{
    var nds=nodesOf(pl),cand=[],Cr=pl.center,cols=[];
    nds.forEach(function(n){
      var corner=n.out&&(n.x===0||n.x===W)&&(n.y===0||n.y===D);
      var onCt=((Math.abs(n.x-Cr.x)<1e-6||Math.abs(n.x-Cr.x-Cr.w)<1e-6)&&n.y>=Cr.y-1e-6&&n.y<=Cr.y+Cr.h+1e-6)||((Math.abs(n.y-Cr.y)<1e-6||Math.abs(n.y-Cr.y-Cr.h)<1e-6)&&n.x>=Cr.x-1e-6&&n.x<=Cr.x+Cr.w+1e-6);
      cand.push({x:n.x,y:n.y,kind:corner?'corner':(n.out?'edge':'inner'),pr:corner?0:(n.out?1:(onCt?2:3))});
    });
    cand.sort(function(a,b){return a.pr-b.pr||a.y-b.y||a.x-b.x;});
    cand.forEach(function(c){
      if(c.kind==='corner'){cols.push(c);return;}
      var md=c.pr===3?9:7.5,ok=true;
      for(var q=0;q<cols.length;q++){var ddx=cols[q].x-c.x,ddy=cols[q].y-c.y;if(Math.sqrt(ddx*ddx+ddy*ddy)<md){ok=false;break;}}
      if(ok) cols.push(c);
    });
    // mid-span columns on long outer wall runs
    function fill(isH,line,lo,hi){
      var pts=cols.filter(function(c){return isH?Math.abs(c.y-line)<1e-6:Math.abs(c.x-line)<1e-6;}).map(function(c){return isH?c.x:c.y;}).sort(function(a,b){return a-b;});
      for(var k=0;k+1<pts.length;k++){
        var g=pts[k+1]-pts[k];
        if(g>14.5){var m=Math.round((pts[k]+g/2)*2)/2;cols.push(isH?{x:m,y:line,kind:'edge'}:{x:line,y:m,kind:'edge'});}
      }
    }
    fill(true,0);fill(true,D);fill(false,0);fill(false,W);
    pl.pillars.forEach(function(p){cols.push({x:p[0],y:p[1],kind:'pillar'});});
    function snapMap(vals,edge){
      var v2=vals.filter(function(v){return Math.abs(v)>1e-6&&Math.abs(v-edge)>1e-6;}).sort(function(a,b){return a-b;}),cl=[];
      v2.forEach(function(v){var last=cl[cl.length-1];if(last&&v-last.max<0.8){last.vals.push(v);last.max=v;}else cl.push({vals:[v],max:v});});
      cl.forEach(function(c){var m=0;c.vals.forEach(function(v){m+=v;});c.mean=Math.round(m/c.vals.length*2)/2;});
      return function(v){if(Math.abs(v)<1e-6||Math.abs(v-edge)<1e-6) return v;for(var i=0;i<cl.length;i++) if(v>=cl[i].vals[0]-1e-9&&v<=cl[i].max+1e-9) return cl[i].mean;return v;};
    }
    var sx=snapMap(cols.map(function(c){return c.x;}),W),sy=snapMap(cols.map(function(c){return c.y;}),D);
    cols.forEach(function(c){c.x=sx(c.x);c.y=sy(c.y);});
    cols.sort(function(a,b){return a.y-b.y||a.x-b.x;});
    var WT={corner:0.6,edge:0.9,inner:1.2,pillar:0.7},sw=0;
    cols.forEach(function(c){sw+=WT[c.kind];});
    cols.forEach(function(c,ix){
      c.id='C'+(ix+1);c.P=total*WT[c.kind]/sw;
      var area=1.1*c.P/sbc,s=Math.max(0.9,Math.ceil(Math.sqrt(area)/0.15)*0.15);
      c.fs=Math.round(s*1000);c.fd=s<=1.5?450:500;
      if(sys==='rcc'){c.sec=c.P<=200?'230 × 230, 4-12φ, 8φ @ 150':'230 × 300, 6-12φ, 8φ @ 150';}
      else{c.sec=c.P<=90?'SHS 100×100×4':(c.P<=160?'SHS 125×125×5':(c.P<=260?'SHS 150×150×6':'ISMB 200'));}
    });
    res.cols=cols;
    var fm={};
    cols.forEach(function(c){var k=c.fs+'|'+c.fd;(fm[k]=fm[k]||{fs:c.fs,fd:c.fd,qty:0,ids:[],P:0}).qty++;fm[k].ids.push(c.id);fm[k].P=Math.max(fm[k].P,c.P);});
    res.foot=Object.keys(fm).map(function(k){return fm[k];}).sort(function(a,b){return a.fs-b.fs;});
    res.foot.forEach(function(f,ix){f.mark='F'+(ix+1);f.bars=f.fs<=1200?'10φ @ 150 c/c both ways':'12φ @ 150 c/c both ways';});
    cols.forEach(function(c){var f=res.foot.filter(function(f){return f.fs===c.fs&&f.fd===c.fd;})[0];c.fmark=f.mark;});
    var sm={};
    cols.forEach(function(c){(sm[c.sec]=sm[c.sec]||{sec:c.sec,qty:0,ids:[],P:0}).qty++;sm[c.sec].ids.push(c.id);sm[c.sec].P=Math.max(sm[c.sec].P,c.P);});
    res.colSec=Object.keys(sm).map(function(k,ix){sm[k].mark='S'+(ix+1);return sm[k];});
    cols.forEach(function(c){c.smark=sm[c.sec].mark;});
    var maxSpan=0;
    [true,false].forEach(function(isH){
      [0,isH?D:W].forEach(function(line){
        var pts=cols.filter(function(c){return isH?Math.abs(c.y-line)<1e-6:Math.abs(c.x-line)<1e-6;}).map(function(c){return isH?c.x:c.y;}).sort(function(a,b){return a-b;});
        for(var k=0;k+1<pts.length;k++) maxSpan=Math.max(maxSpan,pts[k+1]-pts[k]);
      });
    });
    res.maxSpan=maxSpan;
    var spanM=maxSpan*0.3048;
    if(sys==='rcc') res.beams={plinth:'230 × 300 plinth beam, 4-12φ bottom, 2-12φ top, 8φ @ 150',roof:spanM<=3.6?'230 × 380 roof beam, 3-16φ bottom, 2-12φ top, 8φ @ 150':'230 × 450 roof beam, 3-16φ bottom, 2-12φ top, 8φ @ 125',len:wallLen};
    else res.beams={plinth:'230 × 300 RCC plinth beam (ties column bases), 4-12φ, 8φ @ 150',roof:spanM<=3.6?'ISMB 150 roof beam':'ISMB 200 roof beam',len:wallLen};
    var avgH=3.0,colV=cols.length*0.23*0.23*avgH,fV=0;
    res.foot.forEach(function(f){fV+=f.qty*(f.fs/1000)*(f.fs/1000)*(f.fd/1000);});
    var bV=wallLen*0.3048*0.23*0.3+(sys==='rcc'?wallLen*0.3048*0.23*0.38:0);
    var slabV=(flat||S.cover==='rcctile')?pl.builtup*M2*0.125:0;
    if(sys==='rcc'){
      res.concreteM3=Math.round((fV+colV+bV+slabV)*10)/10;
      res.steelKg=Math.round(fV*70+colV*160+bV*130+slabV*85+(flat||S.cover==='rcctile'?0:roofA*8));
    }else{
      var kgm={'SHS 100×100×4':11.7,'SHS 125×125×5':18.3,'SHS 150×150×6':26.4,'ISMB 200':25.4},sk=0;
      cols.forEach(function(c){sk+=(kgm[c.sec]||18)*avgH;});
      var rbk=wallLen*0.3048*(spanM<=3.6?14.9:25.4);
      res.concreteM3=Math.round((fV+bV+slabV)*10)/10;
      res.steelKg=Math.round(sk+rbk+fV*70+bV*130+slabV*85+(flat||S.cover==='rcctile'?0:roofA*8));
    }
  }
  res.roofNote=flat?'125 mm RCC slab (M20), main bars 10φ @ 150, distribution 8φ @ 200, 15 mm cover; chajja 75 mm thick':
    (S.cover==='rcctile'?'100 mm RCC sloped slab (M20) with 10φ @ 150 both ways, laid on roof beams, tiles bedded on top':
    (S.cover==='tile'?'Clay tiles on 40×40×3 SHS purlins at 900 c/c, ISMC 75 or SHS 80×40×3 rafters at about 4 ft c/c, ISMB 125 hip and ridge members':
    'Colour-coated sheet on 40×40×3 SHS purlins at 1,200 c/c, SHS 80×40×3 rafters at about 4 ft c/c, ISMB 125 hip and ridge members'));
  STR_CACHE[key]=res;
  return res;
}

/* ----- sheet frame ----- */
function sheetFrame(no,title,scale,body,proj){
  var s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 297" font-family="Arial, Helvetica, sans-serif">';
  s+='<rect width="420" height="297" fill="#fff"/>'+RC(8,8,404,281,'none','#111',0.8)+body;
  var bx=262,by=245,bw=150,bh=44;
  s+=RC(bx,by-9,bw,8,'#fff','#111',0.5)+TX(bx+bw/2,by-3.2,'FOR APPROVAL - PRELIMINARY, NOT FOR CONSTRUCTION',2.6,'middle',700);
  s+=RC(bx,by,bw,bh,'#fff','#111',0.6)+LN(bx,by+14,bx+bw,by+14,0.3)+LN(bx,by+28,bx+bw,by+28,0.3)+LN(bx+60,by+28,bx+60,by+bh,0.3)+LN(bx+100,by+28,bx+100,by+bh,0.3);
  s+=TX(bx+3,by+4.5,'PROJECT',1.8,'start',400,'#555')+TX(bx+3,by+11,proj,4,'start',700);
  s+=TX(bx+3,by+18.5,'SHEET',1.8,'start',400,'#555')+TX(bx+3,by+25,title,3.4,'start',700);
  s+=TX(bx+3,by+32,'SHEET NO.',1.8,'start',400,'#555')+TX(bx+3,by+40,no,5,'start',700);
  s+=TX(bx+63,by+32,'SCALE',1.8,'start',400,'#555')+TX(bx+63,by+40,scale,3.4,'start',700);
  var d=new Date();
  s+=TX(bx+103,by+32,'DATE',1.8,'start',400,'#555')+TX(bx+103,by+40,d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2),3.2,'start',700);
  s+=TX(14,283,'Generated by Courtyard house planner. Dimensions in feet and inches unless noted. Verify all dimensions on site. Review and stamping by a licensed architect and structural engineer is required before construction.',1.9,'start',400,'#555');
  return s+'</svg>';
}
function northArrow(x,y){return '<g transform="rotate('+({N:0,E:-90,W:90}[facingOf()]||0)+' '+x+' '+y+')">'+'<circle cx="'+x+'" cy="'+y+'" r="6" fill="none" stroke="#111" stroke-width="0.35"/>'+PG([[x,y-5],[x-2.2,y+3],[x,y+1.6],[x+2.2,y+3]],'#111','#111',0.2)+TX(x,y-7.5,'N',3.2,'middle',700)+'</g>';}
function table(x,y,cols,rows,rh,sz,head){
  var s='',tw=0,i,j,cx;
  cols.forEach(function(c){tw+=c.w;});
  var th=rh*(rows.length+(head?1:0));
  s+=RC(x,y,tw,th,'#fff','#111',0.35);
  cx=x;cols.forEach(function(c,ci){if(ci>0) s+=LN(cx,y,cx,y+th,0.2);cx+=c.w;});
  var ry=y;
  if(head){s+=RC(x,ry,tw,rh,'#eee','#111',0.35);cx=x;cols.forEach(function(c){s+=TX(cx+1.2,ry+rh*0.68,c.h,sz,'start',700);cx+=c.w;});ry+=rh;}
  rows.forEach(function(r){
    s+=LN(x,ry,x+tw,ry,0.15,'#888');
    cx=x;r.forEach(function(v,ci){s+=TX(cx+1.2,ry+rh*0.68,String(v),sz,'start',400);cx+=cols[ci].w;});
    ry+=rh;
  });
  return {svg:s,h:th,w:tw};
}
function notesBlock(x,y,title,lines,sz,lh){
  var s=TX(x,y,title,3,'start',700),yy=y+4.5;
  lines.forEach(function(l){
    var words=l.split(' '),line='',max=Math.floor(78*2.2/sz);
    words.forEach(function(w){if((line+' '+w).length>max){s+=TX(x,yy,line,sz);yy+=lh;line=w;}else line=line?line+' '+w:w;});
    s+=TX(x,yy,line,sz);yy+=lh+0.8;
  });
  return {svg:s,h:yy-y};
}

/* ----- floor plan sheet ----- */
function planGroup(pl,ox,oy,opts){
  opts=opts||{};
  var X=function(x){return ox+x*FS;},Y=function(y){return oy+y*FS;},s='';
  pl.rooms.forEach(function(r){
    var fill=r.t==='court'?'#eaf3de':(r.t==='corr'?'#f3ecd8':(r.t==='wet'?'#e8eef2':(r.t==='pass'?'#f6f6f0':'#fff')));
    if(opts.plain) fill='#fff';
    if(r.hidden) return;
    rparts(r).forEach(function(q){s+=RC(X(q.x),Y(q.y),q.w*FS,q.h*FS,fill,'none');});
  });
  function runs(filter,w,col){
    var g={},out='';
    pl.units.filter(filter).forEach(function(u){var k=u.o+'|'+u.p;(g[k]=g[k]||[]).push(u.i);});
    Object.keys(g).forEach(function(k){
      var pr=k.split('|'),arr=g[k].sort(function(a,b){return a-b;}),st=arr[0],pv=arr[0],j;
      function fl(a,b){var p=+pr[1]/2,a0=a/2,b0=(b+1)/2;out+=pr[0]==='H'?LN(X(a0),Y(p),X(b0),Y(p),w,col):LN(X(p),Y(a0),X(p),Y(b0),w,col);}
      for(j=1;j<arr.length;j++){if(arr[j]!==pv+1){fl(st,pv);st=arr[j];}pv=arr[j];}
      fl(st,pv);
    });
    return out;
  }
  var tk={out:0.75*FS,ct:0.5*FS,'in':0.375*FS};
  ['out','ct','in'].forEach(function(c){var gl=(c==='in'?wallSel(S0()).inn:wallSel(S0()).out)==='glass';s+=runs(function(u){return u.c===c&&(u.k==='wall'||u.k==='win'||u.k==='vent');},gl?tk[c]*0.35:tk[c],gl?'#4A86BD':'#111');});
  wallJoints(pl,true).forEach(function(j){s+=RC(X(pl.W*0+j.x)-j.tw*FS/2,Y(j.y)-j.th*FS/2,j.tw*FS,j.th*FS,'#111','none',0);});
  ['out','ct','in'].forEach(function(c){
    s+=runs(function(u){return u.c===c&&(u.k==='win'||u.k==='vent');},tk[c]*0.6,'#fff');
    s+=runs(function(u){return u.c===c&&(u.k==='win'||u.k==='vent');},0.18,'#111');
  });
  pl.doors.forEach(function(d){
    if(d.k==='open') return;
    var w=d.a1-d.a0,mid=(d.a0+d.a1)/2,sd=1,hx,hy,ex,ey,tx2,ty2;
    if(d.k==='main') sd=1;
    else{
      var ra=d.o==='V'?roomAt(pl,d.pos-0.4,mid):roomAt(pl,mid,d.pos-0.4),rb=d.o==='V'?roomAt(pl,d.pos+0.4,mid):roomAt(pl,mid,d.pos+0.4);
      var sa=ra?ra.w*ra.h*(ra.t==='wet'?0.2:1):0,sb=rb?rb.w*rb.h*(rb.t==='wet'?0.2:1):0;
      sd=sb>=sa?1:-1;
    }
    if(d.o==='V'){hx=d.pos;hy=d.a0;ex=d.pos+sd*w;ey=d.a0;tx2=d.pos;ty2=d.a1;}
    else{hx=d.a0;hy=d.pos;ex=d.a0;ey=d.pos+sd*w;tx2=d.a1;ty2=d.pos;}
    var cr=(X(ex)-X(hx))*(Y(ty2)-Y(hy))-(Y(ey)-Y(hy))*(X(tx2)-X(hx));
    s+=LN(X(hx),Y(hy),X(ex),Y(ey),0.35)+'<path d="M '+r2(X(ex))+' '+r2(Y(ey))+' A '+r2(w*FS)+' '+r2(w*FS)+' 0 0 '+(cr>0?1:0)+' '+r2(X(tx2))+' '+r2(Y(ty2))+'" fill="none" stroke="#111" stroke-width="0.18"/>';
  });
  if(!opts.noLabels){
    pl.rooms.forEach(function(r){
      if(r.t==='corr'||r.hidden) return;
      var cx=X(r.x+r.w/2),cy=Y(r.y+r.h/2),wp=r.w*FS,hp=r.h*FS,nm=r.n.toUpperCase();
      if(r.t==='court'){
        s+=TX(cx,Y(r.y)+hp*0.22,'COURTYARD',2.6,'middle',700)+TX(cx,Y(r.y)+hp*0.22+3.4,ft(r.w)+' × '+ft(r.h),2.1,'middle')+TX(cx,Y(r.y)+hp*0.22+6.4,'(open to sky, sunk 8\u2033)',2,'middle',400,'#555');
        s+='<circle cx="'+r2(cx)+'" cy="'+r2(Y(r.y)+hp*0.7)+'" r="'+r2(Math.min(wp,hp)*0.14)+'" fill="#cfe3b0" stroke="#3b6d11" stroke-width="0.3"/>';
        return;
      }
      var sz=wp<26?1.9:2.5;
      if(wp<30) nm=nm.replace('ATT. BATH + WC','ATT. BATH').replace('BATH + WC','BATH+WC').replace('MASTER BEDROOM','MASTER BED').replace('WASH / UTILITY','UTILITY').replace('POOJA / FAMILY','POOJA').replace('ENTRY / SITTING','ENTRY');
      var a=rArea(r),vz=r.id&&r.t!=='pass'?vastuOf(r,pl.W,pl.D):null,multi=r.parts&&r.parts.length>1;
      if(vz&&wp>=30) nm+=' ('+vz.zone+')';
      s+=TX(cx,cy-1.4,nm,sz,'middle',700)+TX(cx,cy+1.6,multi?'combined room':ft(r.w)+' × '+ft(r.h),sz*0.85,'middle')+TX(cx,cy+4.3,(Math.round(a*10)/10)+' sq ft',sz*0.8,'middle',400,'#555');
    });
    if(pl.corr){var ct=pl.court;s+=TX(X(pl.center.x+pl.center.w/2),Y(ct.y)-pl.k*FS/2+0.7,'OPEN CORRIDOR '+pl.k+'\u2032 ON PILLARS',2,'middle',400,'#555');}
  }
  if(pl.corr){
    pl.pillars.forEach(function(p){s+=RC(X(p[0])-0.9,Y(p[1])-0.9,1.8,1.8,'#111','#111',0.1);});
    s+=RC(X(pl.court.x),Y(pl.court.y),pl.court.w*FS,pl.court.h*FS,'none','#555',0.2,'1.2 0.8');
  }
  if(pl.outhouse){var OB=pl.outhouse,pa=OB.path;
    s+=RC(X(Math.min(pa.x0,pa.x1)),Y(Math.min(pa.y0,pa.y1)),Math.abs(pa.x1-pa.x0)*FS,Math.abs(pa.y1-pa.y0)*FS,'#f6f2e6','#777',0.2,'1.2 0.8');
    OB.rooms.forEach(function(r){s+=RC(X(r.x),Y(r.y),r.w*FS,r.h*FS,opts.plain?'#fff':'#e8eef2','none');if(!opts.plain) s+=TX(X(r.x+r.w/2),Y(r.y+r.h/2)+0.8,r.n.toUpperCase(),2.1,'middle',600);});
    s+=RC(X(OB.x0),Y(OB.y0),(OB.x1-OB.x0)*FS,(OB.y1-OB.y0)*FS,'none','#111',0.375*FS);
    var r0=OB.rooms[0];s+=OB.side==='W'?LN(X(OB.x0),Y(r0.y+r0.h+0.19),X(OB.x1),Y(r0.y+r0.h+0.19),0.375*FS,'#111'):LN(X(r0.x+r0.w+0.19),Y(OB.y0),X(r0.x+r0.w+0.19),Y(OB.y1),0.375*FS,'#111');
    OB.doors.forEach(function(dd){s+=dd.o==='V'?LN(X(dd.pos),Y(dd.a0),X(dd.pos),Y(dd.a1),0.375*FS+0.3,'#fff'):LN(X(dd.a0),Y(dd.pos),X(dd.a1),Y(dd.pos),0.375*FS+0.3,'#fff');});
    s+=TX(X((OB.x0+OB.x1)/2),Y(OB.side==='W'?OB.y0:OB.y1)+(OB.side==='W'?-2:4),'BATH AND WC BLOCK, '+OB.gap+'\u2032 PATH',1.9,'middle',600,'#333');
  }
  return s;
}
function S0(){return typeof ST!=='undefined'?ST:{};}
function stepCenters(pl){
  var door=pl.doors.filter(function(d){return d.k==='main';})[0],ec={S:null,E:null,W:null};
  pl.doors.forEach(function(d){if(d.exit) ec[d.exit]=(d.a0+d.a1)/2;});
  return {N:(door.a0+door.a1)/2,S:ec.S===null?pl.W/2:ec.S,E:ec.E===null?pl.D/2:ec.E,W:ec.W===null?pl.D/2:ec.W,door:door,
    has:{N:true,S:pl.sides.s||ec.S!==null,E:pl.sides.e||ec.E!==null,W:pl.sides.w||ec.W!==null},
    exit:{N:true,S:ec.S!==null,E:ec.E!==null,W:ec.W!==null}};
}
function stepSets(pl){
  if(pl._ss) return pl._ss;
  var sc=stepCenters(pl),door=sc.door,out=[],ds=[],stairs=[],PLh=pl.plinth;
  ['N','S','E','W'].forEach(function(sd){
    if(!sc.has[sd]) return;
    var horiz=(sd==='N'||sd==='S'),c=sc[sd],w0=(sd==='N'?(door.a1-door.a0):3.5)+2.5;
    var segs=pl.segs.filter(function(g){return g.side===sd;});
    if(!segs.length){out.push({side:sd,c:c,w:w0,H:PLh});return;}
    var gap=segs.filter(function(g){return g.kind==='gap';})[0];
    if(gap){
      stairs.push({side:sd,c:c,w:(sd==='N'?(door.a1-door.a0):3.5)+1.5,N:pl.split.steps,H:PLh});
      segs.forEach(function(g){
        if(g.kind!=='wing') return;
        var a=horiz?g.x0:g.y0,b=horiz?g.x1:g.y1,len=b-a;
        // extra steps up to each jagali wing only when asked for: the central flight already serves the door
        if(len>=4&&pl.split&&pl.split.wing) out.push({side:sd,c:(a+b)/2,w:Math.min(5,len-1),H:g.h,wing:true});
      });
      return;
    }
    var under=segs.filter(function(g){var a=horiz?g.x0:g.y0,b=horiz?g.x1:g.y1;return c>=a-1e-6&&c<=b+1e-6;})[0]||segs[0];
    out.push({side:sd,c:c,w:w0,H:under.h});
    if(under.h<PLh-0.05&&sc.exit[sd]) ds.push({side:sd,c:c,w:w0-1,rise:PLh-under.h});
  });
  pl._ss={steps:out,door:ds,stairs:stairs};
  return pl._ss;
}
function verandaGroup(pl,ox,oy){
  var X=function(x){return ox+x*FS;},Y=function(y){return oy+y*FS;},s='',vd=pl.vd,JG=pl.jag,SD=pl.sides,EXT=pl.ext,W=pl.W,D=pl.D;
  var ledgeOn=!!(JG&&JG.ledges&&SD.n&&!pl.split),sc=stepCenters(pl);
  pl.segs.forEach(function(g){
    var low=g.h<pl.plinth-0.05;
    if(g.kind==='gap'){s+=RC(X(g.x0),Y(g.y0),(g.x1-g.x0)*FS,(g.y1-g.y0)*FS,'#fff','#999',0.3,'1.5 1');return;}
    s+=RC(X(g.x0),Y(g.y0),(g.x1-g.x0)*FS,(g.y1-g.y0)*FS,JG?(low?'#f9ece6':'#f1d4c8'):'#fbf8ee','#555',0.3,'2 1.2');
    if(JG&&(pl.split||low)) s+=TX(X((g.x0+g.x1)/2),Y((g.y0+g.y1)/2)+(g.side==='N'?3.6:3.4),'+'+ft(g.h),1.7,'middle',700);
  });
  pl.strips.forEach(function(st){
    var sd=st.side,horiz=(sd==='N'||sd==='S'),lo=horiz?st.x0:st.y0,len=horiz?st.x1-st.x0:st.y1-st.y0,n=Math.max(2,Math.round(len/9))+1;
    var edge=sd==='N'?-vd+0.4:(sd==='S'?D+vd-0.4:(sd==='W'?-vd+0.4:W+vd-0.4));
    for(var k=0;k<n;k++){
      var a=lo+0.5+k*(len-1)/(n-1);if(Math.abs(a-sc[sd])<3.4) continue;
      var px=horiz?a:edge,py=horiz?edge:a;s+=RC(X(px)-0.9,Y(py)-0.9,1.8,1.8,'#111','#111',0.1);
    }
    if(sd!=='N') s+=TX(X((st.x0+st.x1)/2),Y((st.y0+st.y1)/2)+0.6,(JG?'JAGALI ':'VERANDA ')+({S:'SOUTH',E:'EAST',W:'WEST'}[sd]),1.9,'middle',700);
  });
  if(SD.n){
    var bxp=W*0.2+(ledgeOn?2.4:0);
    s+=RC(X(bxp-4),Y(-1.9),8*FS,1.6*FS,'#ead9b8','#555',0.2)+TX(X(bxp),Y(-1.1)+0.6,'BENCH',1.8,'middle');
    var tcx=W*(ledgeOn?0.78:0.85),tcy=-vd/2-0.2;
    s+=RC(X(tcx-1.1),Y(tcy-1.1),2.2*FS,2.2*FS,'#ead9b8','#555',0.2)+RC(X(tcx-2.9-0.7),Y(tcy-0.7),1.4*FS,1.4*FS,'#ead9b8','#555',0.2)+RC(X(tcx+2.9-0.7),Y(tcy-0.7),1.4*FS,1.4*FS,'#ead9b8','#555',0.2);
    s+=TX(X(W*0.5),Y(-vd*0.5)+0.6,(JG?(pl.split?'SPLIT JAGALI, DOOR LEVEL +':'JAGALI, RAISED PLATFORM +')+ft(pl.plinth)+'  ':'VERANDA ')+ft(W)+' × '+ft(vd),2.3,'middle',700);
    if(ledgeOn){
      [[0.1,1.5],[W-1.5,W-0.1]].forEach(function(r){s+=RC(X(r[0]),Y(-vd+1.1),(r[1]-r[0])*FS,(vd-1.6)*FS,'#e4ddd0','#555',0.25)+TX(X((r[0]+r[1])/2),Y(-vd/2)+0.3,'LEDGE',1.4,'middle');});
    }
  }
  var SS=stepSets(pl);
  SS.steps.forEach(function(q){
    var sd=q.side,c=q.c,w0=q.w,n=Math.max(2,Math.ceil(q.H/0.55));
    var ec=sd==='N'?-EXT.t-0.5:(sd==='S'?D+EXT.b+0.5:(sd==='W'?-EXT.l-0.5:W+EXT.r+0.5));
    for(var si=0;si<n-1;si++){
      var w=w0+si*0.6;
      if(sd==='N') s+=RC(X(c-w/2),Y(ec-1-si),w*FS,FS,'#e8e8e2','#555',0.25);
      else if(sd==='S') s+=RC(X(c-w/2),Y(ec+si),w*FS,FS,'#e8e8e2','#555',0.25);
      else if(sd==='W') s+=RC(X(ec-1-si),Y(c-w/2),FS,w*FS,'#e8e8e2','#555',0.25);
      else s+=RC(X(ec+si),Y(c-w/2),FS,w*FS,'#e8e8e2','#555',0.25);
    }
  });
  SS.stairs.forEach(function(q){
    for(var si=0;si<q.N-1;si++){
      if(q.side==='N') s+=RC(X(q.c-q.w/2),Y(-1.375-si),q.w*FS,FS,'#e8e8e2','#555',0.3);
      else if(q.side==='S') s+=RC(X(q.c-q.w/2),Y(D+0.375+si),q.w*FS,FS,'#e8e8e2','#555',0.3);
      else if(q.side==='W') s+=RC(X(-1.375-si),Y(q.c-q.w/2),FS,q.w*FS,'#e8e8e2','#555',0.3);
      else s+=RC(X(W+0.375+si),Y(q.c-q.w/2),FS,q.w*FS,'#e8e8e2','#555',0.3);
    }
    var tx2=q.side==='N'||q.side==='S'?X(q.c):(q.side==='W'?X(-vd/2-0.2):X(W+vd/2+0.2)),ty2=q.side==='N'?Y(-vd*0.5)+(0):(q.side==='S'?Y(D+vd*0.5):Y(q.c));
    s+=TX(tx2,ty2+(q.side==='N'||q.side==='S'?3.2:0),'UP '+q.N+' STEPS',1.6,'middle',700);
  });
  SS.door.forEach(function(q){
    var n=Math.ceil(q.rise/0.55);
    for(var si=0;si<n-1;si++){
      if(q.side==='N') s+=RC(X(q.c-q.w/2),Y(-1.375-si),q.w*FS,FS,'#dcdcd2','#555',0.25);
      else if(q.side==='S') s+=RC(X(q.c-q.w/2),Y(D+0.375+si),q.w*FS,FS,'#dcdcd2','#555',0.25);
      else if(q.side==='W') s+=RC(X(-1.375-si),Y(q.c-q.w/2),FS,q.w*FS,'#dcdcd2','#555',0.25);
      else s+=RC(X(W+0.375+si),Y(q.c-q.w/2),FS,q.w*FS,'#dcdcd2','#555',0.25);
    }
  });
  return s;
}
function sheetPlan(pl,S,proj){
  var vd=pl.vd,EXT=pl.ext,sc0=stepCenters(pl),stE=(0.5+Math.max(1,Math.ceil(pl.plinth/0.55)-1))*FS,topX=stE,ox=34+EXT.l*FS+(sc0.has.W?stE:0),oy=24+topX+EXT.t*FS,s='';
  if(pl.outhouse&&pl.outhouse.side==='W') ox=Math.max(ox,34+(-pl.outhouse.x0)*FS+4);
  s+=verandaGroup(pl,ox,oy)+planGroup(pl,ox,oy);
  var bot=Math.max(oy+pl.D*FS+EXT.b*FS+(sc0.has.S?stE:0),pl.outhouse&&pl.outhouse.side==='S'?oy+pl.outhouse.y1*FS+3:0),rgt=ox+pl.W*FS+EXT.r*FS+(sc0.has.E?stE:0);
  // chains
  var xs=[0,pl.W];pl.rooms.forEach(function(r){if(r.hidden||r.t==='court'||r.t==='corr'||r.t==='pass') return;rparts(r).forEach(function(q){if(eq(q.y+q.h,pl.D)){xs.push(q.x);xs.push(q.x+q.w);}});});
  xs=xs.filter(function(v,i,a){return a.indexOf(v)===i;}).sort(function(a,b){return a-b;});
  for(var i=0;i+1<xs.length;i++) s+=dimH(ox+xs[i]*FS,ox+xs[i+1]*FS,bot,5,ft(xs[i+1]-xs[i]),2);
  s+=dimH(ox,rgt,bot,11,ft(pl.W)+' overall',2.4);
  var ys=[0,pl.D];pl.rooms.forEach(function(r){if(r.hidden||r.t==='court'||r.t==='corr'||r.t==='pass') return;rparts(r).forEach(function(q){if(eq(q.x+q.w,pl.W)){ys.push(q.y);ys.push(q.y+q.h);}});});
  var c=pl.center;ys.push(c.y);ys.push(c.y+c.h);
  ys=ys.filter(function(v,i,a){return a.indexOf(v)===i;}).sort(function(a,b){return a-b;});
  for(i=0;i+1<ys.length;i++) s+=dimV(oy+ys[i]*FS,oy+ys[i+1]*FS,rgt,5,ft(ys[i+1]-ys[i]),2);
  s+=dimV(oy,bot,rgt,11,ft(pl.D)+' overall',2.4);
  s+=northArrow(rgt+22,34);
  s+=TX(ox,bot+22,'FLOOR LEVEL +'+ft(pl.plinth)+' ABOVE NATURAL GROUND. WALLS: '+({brick:'9\u2033 BRICK',fly:'9\u2033 FLY-ASH BRICK',aac:'200 MM AAC',glass:'12 MM GLASS'}[wallSel(S).out])+' OUTER AND COURTYARD SIDE, '+({brick:'4.5\u2033 BRICK',fly:'4.5\u2033 FLY-ASH BRICK',aac:'100 MM AAC',gyp:'GYPSUM BOARD ON MS FRAME',wpc:'WPC BOARD ON MS FRAME',glass:'10 MM GLASS'}[wallSel(S).inn])+' INNER PARTITIONS.',1.9,'start',400,'#333');
  // main entrance
  var door=pl.doors.filter(function(d){return d.k==='main';})[0];
  s+=TX(ox+((door.a0+door.a1)/2)*FS,oy-EXT.t*FS-topX-3,'MAIN ENTRANCE ('+({N:'NORTH',E:'EAST',W:'WEST'}[S.facing]||'NORTH')+')',2.3,'middle',700);
  // right column schedules
  var tx=Math.max(rgt+36,198),ty=24;
  var vt=function(r){return r.vastu==='ideal'?'Ideal':(r.vastu==='ok'?'Acceptable':'Check, best '+r.vbest);};
  var rows=pl.sched.map(function(r){return [r.n,ft(r.w)+' × '+ft(r.h),Math.round(r.a*10)/10,r.zone,vt(r)];});
  rows.push(['Courtyard',ft(pl.court.w)+' × '+ft(pl.court.h),Math.round(pl.courtArea*10)/10,'centre','Ideal']);
  if(pl.corr) rows.push(['Corridor ring ('+pl.k+'\u2032 wide)','',Math.round((pl.center.w*pl.center.h-pl.courtArea)*10)/10,'','']);
  rows.push([pl.jag?(pl.split?'Jagali (split platform)':'Jagali (raised platform)'):'Veranda','',Math.round(pl.verArea),'north'+(pl.sides.s?', south':'')+(pl.sides.e?', east':'')+(pl.sides.w?', west':''),'']);
  var t1=table(tx,ty+4,[{w:50,h:'Room'},{w:34,h:'Size'},{w:18,h:'Sq ft'},{w:20,h:'Zone'},{w:36,h:'Vastu'}],rows,4.4,2.1,true);
  s+=TX(tx,ty,'ROOM SCHEDULE',3,'start',700)+t1.svg;
  var y2=ty+4+t1.h+8;
  var dm={};
  pl.doors.forEach(function(d){if(d.k==='open') return;var w=Math.round((d.a1-d.a0)*2)/2,k=(d.k==='main'?'Main door':'Door')+' '+ft(w)+' × 7\u2032-0\u2033';dm[k]=(dm[k]||0)+1;});
  var dr=Object.keys(dm).map(function(k,ix){return [k,dm[k]];});
  dr.push(['Open arch (no leaf)',pl.doors.filter(function(d){return d.k==='open';}).length]);
  dr.push(['Window 6\u2032-0\u2033 × 3\u2032-6\u2033, sill 3\u2032-0\u2033',pl.nWin]);
  dr.push(['Ventilator 3\u2032-0\u2033 × 1\u2032-6\u2033, sill 5\u2032-6\u2033',pl.nVent]);
  var t2=table(tx,y2+4,[{w:100,h:'Doors and windows'},{w:30,h:'Qty'}],dr,4.6,2.3,true);
  s+=TX(tx,y2,'DOOR AND WINDOW SCHEDULE',3,'start',700)+t2.svg;
  var y3=y2+4+t2.h+8;
  var nb=notesBlock(tx,y3,'AREA STATEMENT',[
    'Footprint '+ft(pl.W)+' × '+ft(pl.D)+' = '+Math.round(pl.area)+' sq ft.','Built-up (covered) '+Math.round(pl.builtup)+' sq ft. Open courtyard '+Math.round(pl.courtArea)+' sq ft.','Veranda '+Math.round(pl.verArea)+' sq ft (covered, outside footprint).','Layout follows Vastu zoning (see the Vastu column). No bath or WC shares a wall with the kitchen.'].concat(pl.sight?['Front door to back door: '+(Math.abs(pl.sight.offset)<0.5?'in a straight line':ft(Math.abs(pl.sight.offset))+' off a straight line, '+(pl.sight.offset>0?'back door east of the front door':'back door west of the front door'))+'. '+(pl.sight.visible?'Each door can be seen from the other.':'The doors cannot see each other.')]:[]).concat(pl.edited?['Edited layout: some walls were removed or doors changed. Have the structure checked by an engineer.']:[]).concat(pl.split?['Split jagali: '+pl.split.steps+' steps straight from the ground to '+(pl.split.all?'each door':'the front door')+', with a jagali either side at +'+ft((pl.segs.filter(function(g){return g.kind==='wing'||g.kind==='low';})[0]||{h:0}).h)+'. Door level +'+ft(pl.plinth)+'.']:[]),2.3,3.4);
  s+=nb.svg;
  return sheetFrame('A-1','FLOOR PLAN','1:100',s,proj);
}

/* ----- elevations ----- */
function envelope(R,pl,S,mode){
  // returns arrays for roof top envelope along u, plus eave underside
  var W=pl.W,D=pl.D,C=pl.court,oo=S.over,io=rnd(S.over/2),st=0.5,th=0.3;
  var hx0=C.x-io,hx1=C.x+C.w+io,hy0=C.y-io,hy1=C.y+C.h+io;
  var out=[];
  var lo=-oo,hi=(mode==='x'?W:D)+oo;
  for(var u=lo;u<=hi+1e-9;u+=st){
    var mx=-1e9,i;
    var oHi=(mode==='x'?D:W)+oo;
    for(var v=-oo;v<=oHi+1e-9;v+=st){
      var x=mode==='x'?u:v,y=mode==='x'?v:u;
      var cx=mode==='x'?x:x,cy=y;
      if(x>hx0&&x<hx1&&y>hy0&&y<hy1) continue;
      var h=R.H(x,y)+th;if(h>mx) mx=h;
    }
    out.push([u,mx]);
  }
  return out;
}
function elevGroup(pl,S,face,ox,gy,K){
  var R=mkRoof(pl,S),W=pl.W,D=pl.D,PL=pl.plinth,oo=S.over,vd=pl.vd,flat=S.shape==='flat',s='',th=0.3;
  var isN=(face==='N'),len=isN?W:D;
  function sxN(x){return ox+(W-x)*K;}
  function sxE(y){return ox+(D-y)*K;}
  var SX=isN?sxN:sxE;
  function SY(h){return gy-(h+PL)*K;}
  var runs=unitRuns(pl,isN?'N':'E');
  // ground
  var SDv=pl.sides,gl=isN?[-(SDv.w?vd:0)-oo-2,W+(SDv.e?vd:0)+oo+2]:[-(SDv.n?vd:0)-oo-2,D+(SDv.s?vd:0)+oo+2];
  s+=LN(SX(gl[1]),gy,SX(gl[0]),gy,0.6);
  // roof silhouette
  var pts=[],bot=[],env=envelope(R,pl,S,isN?'x':'y');
  if(flat){
    var chj=Math.min(oo,2);
    env=[];for(var u=-chj;u<=len+chj+1e-9;u+=0.5) env.push([u,10.5]);
  }
  var wallTop=[];
  for(var q=0;q<env.length;q++){
    var u2=env[q][0];
    pts.push([SX(u2),SY(env[q][1])]);
  }
  // wall polygon
  var wp=[[SX(0),SY(0)],];
  for(var u3=0;u3<=len+1e-9;u3+=0.5){
    var hx=isN?u3:W,hy=isN?0:u3;
    wp.push([SX(u3),SY(R.H(hx,hy))]);
  }
  wp.push([SX(len),SY(0)]);
  s+=RC(Math.min(SX(-0.25),SX(len+0.25)),gy-PL*K,(len+0.5)*K,PL*K,'#d9d6cc','#111',0.35);
  s+=PG(wp,'#f3f0e6','#111',0.4);
  if(pl.jag&&pl.sides[isN?'n':'e']){var axL=isN?W:D;s+=RC(SX(axL),SY(2.9),axL*K,2.9*K,'#d9b9b6','none')+RC(SX(axL),SY(3.05),axL*K,0.15*K,'#9bc3b4','none');}
  // openings
  runs.forEach(function(r){
    var a=isN?SX(r.b):SX(r.b),b=isN?SX(r.a):SX(r.a),x0=Math.min(a,b),w=Math.abs(a-b);
    if(r.k==='win') s+=RC(x0,SY(6.5),w,3.5*K,'#fff','#111',0.35)+LN(x0+w/2,SY(6.5),x0+w/2,SY(3),0.2);
    else if(r.k==='vent') s+=RC(x0,SY(7),w,1.5*K,'#fff','#111',0.3);
    else if(r.k==='door'||r.k==='main') s+=RC(x0,SY(7),w,7*K,'#d6c2a5','#111',0.35);
    else if(r.k==='open') s+=RC(x0,SY(7.5),w,7.5*K,'#fff','#111',0.25,'1 1');
  });
  // roof polygon (behind veranda, in front of wall top)
  var eave,lowline=[];
  for(var e=env.length-1;e>=0;e--){
    var u4=env[e][0],fy=isN?-oo:(W+oo),fx=isN?u4:W+oo;
    var hf=flat?10:R.H(isN?u4:fx,isN?-oo:u4);
    var hw=flat?10:R.H(isN?Math.max(0,Math.min(W,u4)):W,isN?0:Math.max(0,Math.min(D,u4)));
    lowline.push([SX(u4),SY(Math.min(hf,hw))]);
  }
  s+=PG(pts.concat(lowline),flat?'#cfcabd':'#e3c2b0','#111',0.5);
  if(flat){
    var pc=[[SX(-0.25),SY(10.5)],[SX(len+0.25),SY(10.5)],[SX(len+0.25),SY(13)],[SX(-0.25),SY(13)]];
    s+=PG(pc,'#d9d6cc','#111',0.4);
  }else{
    // roof tile lines
    var step=1.5;
    for(var hh=9;hh<24;hh+=step){
      var a1=null;
    }
  }
  // veranda or jagali: the strip facing us is drawn front-on, the others in profile
  var vr=vRoof(pl,S),vs=flat?0.06:0.12,sc=stepCenters(pl),door=sc.door,frontSide=isN?'N':'E',SD=pl.sides;
  var front=pl.strips.filter(function(q){return q.side===frontSide;})[0],f1=Math.min(oo,1.5),low=8.0-vs*(vd+oo*0.6+0.3);
  var d0=-0.2,d1=vd+oo*0.6+0.3,h0=8.0-vs*d0,h1=8.0-vs*d1,topP=vr.top(vd-0.4);
  if(front){
    var ua=isN?front.x0:front.y0,ub=isN?front.x1:front.y1,len2=ub-ua,n2=Math.max(2,Math.round(len2/9))+1;
    s+=RC(SX(ub+f1),SY(low+th+0.4),(len2+2*f1)*K,(0.6+th)*K,'#c9a98c','#111',0.45);
    for(var i=0;i<n2;i++){var px=ua+0.5+i*(len2-1)/(n2-1);if(Math.abs(px-sc[frontSide])<3.4) continue;s+=RC(SX(px)-0.3*K,SY(topP),0.6*K,topP*K,PILC(S),'#111',0.3);}
  }
  pl.segs.forEach(function(g){
    if(g.side!==frontSide||g.kind==='gap') return;
    var ua2=isN?g.x0:g.y0,ub2=isN?g.x1:g.y1;
    s+=RC(SX(ub2),gy-g.h*K,(ub2-ua2)*K,g.h*K,'#e6e0d0','#111',0.3);
  });
  stepSets(pl).stairs.forEach(function(q){
    if(q.side!==frontSide) return;
    var rr=q.H/q.N;
    for(var si=q.N-2;si>=0;si--){var shh=q.H-rr*(si+1);s+=RC(SX(q.c)-q.w*K/2,gy-shh*K,q.w*K,shh*K,'#d8d4c8','#111',0.3);}
  });
  stepSets(pl).steps.forEach(function(q){
    if(q.side!==frontSide) return;
    var nn=Math.max(2,Math.ceil(q.H/0.55)),rr=q.H/nn;
    for(var si=nn-2;si>=0;si--){var shh=q.H-rr*(si+1),swd=q.w+si*0.6;s+=RC(SX(q.c)-swd*K/2,gy-shh*K,swd*K,shh*K,'#d8d4c8','#111',0.3);}
  });
  if(isN&&pl.jag&&pl.jag.ledges&&SD.n&&!pl.split){[[0.1,1.5],[W-1.5,W-0.1]].forEach(function(r){s+=RC(SX(r[1]),SY(1.42),(r[1]-r[0])*K,1.42*K,'#e6e0d0','#111',0.3);});}
  var prof=isN?[['e',W,1],['w',0,-1]]:[['s',D,1],['n',0,-1]];
  prof.forEach(function(q){
    if(!SD[q[0]]) return;
    var u0=q[1],sg=q[2],P=function(d){return SX(u0+sg*d);};
    var sgs=pl.segs.filter(function(g){return g.side===q[0].toUpperCase()&&g.kind!=='gap';}),near=sgs.length?(isN?sgs[0]:sgs[sgs.length-1]):null;
    if(near) s+=RC(Math.min(SX(u0),SX(u0+sg*vd)),gy-near.h*K,vd*K,near.h*K,'#e6e0d0','#111',0.3);
    s+=PG([[P(d0),SY(h0+th)],[P(d1),SY(h1+th)],[P(d1),SY(h1)],[P(d0),SY(h0)]],'#c9a98c','#111',0.45);
    s+=RC(P(vd-0.4)-0.3*K,SY(topP),0.6*K,topP*K,PILC(S),'#111',0.3);
    if(!isN&&q[0]==='n'&&pl.jag&&pl.jag.ledges&&!pl.split) s+=RC(SX(-0.5),SY(1.42),(vd-1.6)*K,1.42*K,'#e6e0d0','#111',0.3);
  });
  // dimensions
  var topMax=0;env.forEach(function(p){if(p[1]>topMax) topMax=p[1];});
  var eaveH=R.H(isN?W/2:W,isN?0:D/2);
  var xl=Math.min(SX(-oo-2),SX(len+oo+2))-2,xr=Math.max(SX(-oo),SX(len+oo))+0;
  var dxL=(isN?SX(W+(pl.sides.e?vd:0)+oo):SX(D+(pl.sides.s?vd:0)+oo))-8;
  s+=dimV(SY(topMax),gy,dxL,-6,ft(topMax+PL)+' to top of roof',2.1);
  s+=dimV(SY(eaveH),gy,dxL,-14,ft(eaveH+PL)+' to wall top (at wall)',2.1);
  s+=dimV(gy-PL*K,gy,dxL,-22,ft(PL),2.1);
  s+=TX(isN?SX(W/2):SX(D/2),gy+6,(isN?'FRONT ELEVATION (VIEW FROM NORTH, ENTRANCE SIDE)':'SIDE ELEVATION (VIEW FROM EAST)'),3,'middle',700);
  s+=dimH(Math.min(SX(0),SX(len)),Math.max(SX(0),SX(len)),gy,9,ft(len)+(isN?' building width':' building depth'),2.1);
  return s;
}
function W_(pl){return pl.W;}
function sheetElev(pl,S,proj){
  var R=mkRoof(pl,S),flat=S.shape==='flat',top=0,oo=S.over;
  if(flat) top=13;
  else{envelope(R,pl,S,'x').forEach(function(p){if(p[1]>top) top=p[1];});envelope(R,pl,S,'y').forEach(function(p){if(p[1]>top) top=p[1];});}
  var hft=top+1.5,K=3.048,sc='1:100',opts=[[6.096,'1:50'],[4.064,'1:75'],[3.048,'1:100']],SDe=pl.sides,vdE=pl.vd;
  var leftN=(SDe.e?vdE:0)+oo,leftE=(SDe.s?vdE:0)+oo,rightN=W_(pl)+oo+(SDe.w?vdE:0),rightE=pl.D+oo+(SDe.n?vdE:0);
  var ox=76;
  for(var i=0;i<opts.length;i++){
    var k=opts[i][0],oxk=Math.max(76,48+Math.max(leftN,leftE)*k);
    if(2*hft*k+70<=205&&oxk+Math.max(rightN,rightE)*k<=402){K=k;sc=opts[i][1];ox=oxk;break;}
    if(i===opts.length-1){K=k;sc=opts[i][1];ox=oxk;}
  }
  var gy1=22+hft*K+10,gy2=gy1+hft*K+34,s='';
  s+=elevGroup(pl,S,'N',ox,gy1,K)+elevGroup(pl,S,'E',ox,gy2,K);
  var nb=notesBlock(270,30,'ELEVATION NOTES',[
    'Roof: '+SHAPES.filter(function(x){return x.v===S.shape;})[0].n.toLowerCase()+(flat?', RCC slab with parapet':', pitch '+pitchEff(pl,S)+'\u00B0, overhang '+ft(S.over))+'.',
    'Ground level is +0\u2032-0\u2033. Finished floor level +'+ft(pl.plinth)+' above ground.',
    'Front elevation looks at the entrance side (north), so east is on the left. Side elevation looks west from the east side, so north is on the right.',
    'All heights are approximate and for approval review.'],2.3,3.5);
  s+=nb.svg;
  return sheetFrame('A-2','ELEVATIONS',sc,s,proj);
}

/* ----- roof (top) view ----- */
function sheetRoof(pl,S,proj){
  var R=mkRoof(pl,S),W=pl.W,D=pl.D,C=pl.court,vd=pl.vd,oo=S.over,io=rnd(S.over/2),s='';
  var EXT=pl.ext,ox=40+EXT.l*FS,oy=34+EXT.t*FS,X=function(x){return ox+x*FS;},Y=function(y){return oy+y*FS;};
  var flat=S.shape==='flat';
  s+=RC(X(-oo),Y(-oo),(W+2*oo)*FS,(D+2*oo)*FS,flat?'#ecebe4':'#f6e6dc','#111',0.5,oo>0?'2 1':null);
  s+=RC(X(0),Y(0),W*FS,D*FS,'none','#111',0.35);
  s+=RC(X(C.x-io),Y(C.y-io),(C.w+2*io)*FS,(C.h+2*io)*FS,'#fff','#111',0.5,io>0?'2 1':null);
  s+=RC(X(C.x),Y(C.y),C.w*FS,C.h*FS,'#eaf3de','#555',0.25);
  s+=TX(X(C.x+C.w/2),Y(C.y+C.h/2)-1,'COURTYARD',2.6,'middle',700)+TX(X(C.x+C.w/2),Y(C.y+C.h/2)+2.4,'OPEN TO SKY',2.1,'middle',400,'#555');
  pl.strips.forEach(function(st){
    s+=RC(X(st.x0),Y(st.y0),(st.x1-st.x0)*FS,(st.y1-st.y0)*FS,'#f1e1d3','#111',0.4,'2 1');
    var mx=(st.x0+st.x1)/2,my=(st.y0+st.y1)/2,ax,ay,bx,by;
    if(st.side==='N'){ax=X(mx);ay=Y(st.y0)+3;bx=ax;by=Y(st.y0)+9;s+=TX(X(mx*0.5+st.x0*0.5),Y(my)+0.8,(pl.jag?'JAGALI':'VERANDA')+' ROOF, LEAN-TO SLOPING OUTWARD',2.1,'middle');}
    else if(st.side==='S'){ax=X(mx);ay=Y(st.y1)-3;bx=ax;by=Y(st.y1)-9;}
    else if(st.side==='W'){ax=X(st.x0)+3;ay=Y(my);bx=X(st.x0)+9;by=ay;}
    else{ax=X(st.x1)-3;ay=Y(my);bx=X(st.x1)-9;by=ay;}
    s+=LN(ax,ay,bx,by,0.4);
    var ddx=bx-ax,ddy=by-ay,ll=Math.sqrt(ddx*ddx+ddy*ddy)||1,ux=ddx/ll,uy=ddy/ll;
    s+=PG([[bx+ux*2.4,by+uy*2.4],[bx-uy*1.4,by+ux*1.4],[bx+uy*1.4,by-ux*1.4]],'#111','#111',0.2);
  });
  if(!flat){
    var cr=creases(pl,S);
    cr.forEach(function(sg){
      var mx=(sg.a[0]+sg.b[0])/2,my=(sg.a[1]+sg.b[1])/2,dx=sg.b[0]-sg.a[0],dy=sg.b[1]-sg.a[1],l=Math.sqrt(dx*dx+dy*dy)||1;
      var nx=-dy/l,ny=dx/l,e=0.6,hc=R.H(mx,my),h1=R.H(mx+nx*e,my+ny*e),h2=R.H(mx-nx*e,my-ny*e);
      var convex=hc>(h1+h2)/2+1e-6;
      s+=LN(X(sg.a[0]),Y(sg.a[1]),X(sg.b[0]),Y(sg.b[1]),convex?0.7:0.5,convex?'#7a2e12':'#1f4f8a',convex?null:'2 1');
    });
    // slope arrows
    var cE=W-C.x-C.w,cS=D-C.y-C.h,pts=[[C.x*0.25,D/2],[C.x*0.75,D/2],[W-cE*0.25,D/2],[W-cE*0.75,D/2],[W/2,C.y*0.25],[W/2,C.y*0.75],[W/2,D-cS*0.25],[W/2,D-cS*0.75]];
    pts.forEach(function(p){
      var e=0.5,gx=(R.H(p[0]+e,p[1])-R.H(p[0]-e,p[1]))/(2*e),gy2=(R.H(p[0],p[1]+e)-R.H(p[0],p[1]-e))/(2*e),l=Math.sqrt(gx*gx+gy2*gy2);
      if(l<1e-6) return;
      var dx=-gx/l,dy=-gy2/l,x1=X(p[0])-dx*5,y1=Y(p[1])-dy*5,x2=X(p[0])+dx*5,y2=Y(p[1])+dy*5;
      s+=LN(x1,y1,x2,y2,0.45,'#111')+PG([[x2,y2],[x2-dx*2.2-dy*1.2,y2-dy*2.2+dx*1.2],[x2-dx*2.2+dy*1.2,y2-dy*2.2-dx*1.2]],'#111','#111',0.1);
    });
  }else{
    s+=TX(X(W/2),Y(D*0.12),'FLAT RCC SLAB WITH PARAPET, FALL 1 IN 100 TO OUTLETS',2.4,'middle',700);
  }
  s+=dimH(X(0),X(W),Y(D+oo+EXT.b),6,ft(W),2.2)+dimV(Y(0),Y(D),X(W+oo+EXT.r),6,ft(D),2.2);
  var tx=Math.max(210,X(W+EXT.r)+34),ty=30;
  s+=northArrow(tx-12,22);
  // legend and notes
  s+=TX(tx,ty,'ROOF (TOP VIEW) LEGEND',3,'start',700);
  s+=LN(tx,ty+6,tx+14,ty+6,0.7,'#7a2e12')+TX(tx+17,ty+7,'Ridge or hip (convex)',2.3);
  s+=LN(tx,ty+12,tx+14,ty+12,0.5,'#1f4f8a','2 1')+TX(tx+17,ty+13,'Valley (concave)',2.3);
  s+=RC(tx,ty+16,14,4,'#f6e6dc','#111',0.4,'2 1')+TX(tx+17,ty+19.2,'Eave with overhang '+ft(S.over),2.3);
  s+=PG([[tx+2,ty+27],[tx+12,ty+27],[tx+7,ty+23]],'#111','#111',0.1)+TX(tx+17,ty+26.5,'Direction of fall',2.3);
  var sh=SHAPES.filter(function(x){return x.v===S.shape;})[0];
  var cv=COVERS.filter(function(x){return x.v===S.cover;})[0];
  var nb=notesBlock(tx,ty+38,'ROOF DATA',[
    'Shape: '+sh.n+'. '+sh.d,
    flat?'Cover: RCC slab with waterproofing and parapet.':'Cover: '+cv.n+'. Pitch '+pitchEff(pl,S)+'\u00B0 (about 1 in '+(1/Math.tan(pitchEff(pl,S)*Math.PI/180)).toFixed(1)+').',
    'Overhang: '+ft(S.over)+' outside, '+ft(rnd(S.over/2))+' at the courtyard.',
    'Rainwater: '+(S.shape==='inward'?'falls into the courtyard. Provide drain outlet at the north-east corner of the courtyard and a rainwater harvesting pit.':(S.shape==='outward'?'sheds to the outer eaves. Provide gutters and downpipes at the outer corners.':(S.shape==='double'?'sheds both ways. Gutters on the outer eaves and at the courtyard edge, with an outlet at the north-east courtyard corner.':'drains to outlets at the courtyard edge, with a drain at the north-east corner.')))],2.3,3.5);
  s+=nb.svg;
  return sheetFrame('A-3','ROOF PLAN (TOP VIEW)','1:100',s,proj);
}

/* ----- structural sheets ----- */
function axes(cols,pl,X,Y){
  var xs=[],ys=[];
  cols.forEach(function(c){
    if(!xs.some(function(v){return Math.abs(v-c.x)<0.3;})) xs.push(c.x);
    if(!ys.some(function(v){return Math.abs(v-c.y)<0.3;})) ys.push(c.y);
  });
  xs.sort(function(a,b){return a-b;});ys.sort(function(a,b){return a-b;});
  var s='',lastX=-99,lastRow=0,lastY=-99,lastCol=0;
  xs.forEach(function(x,k){
    var row=(X(x)-lastX<6.5&&lastRow===0)?1:0;lastX=X(x);lastRow=row;
    var by=Y(0)-10.5-row*6.2;
    s+=LN(X(x),by,X(x),Y(pl.D)+6,0.12,'#999','5 1 1 1');
    s+='<circle cx="'+r2(X(x))+'" cy="'+r2(by)+'" r="2.6" fill="#fff" stroke="#111" stroke-width="0.3"/>'+TX(X(x),by+0.9,String.fromCharCode(65+k),2.4,'middle',700);
  });
  ys.forEach(function(y,k){
    var col=(Y(y)-lastY<6.5&&lastCol===0)?1:0;lastY=Y(y);lastCol=col;
    var bx=X(0)-10.5-col*6.2;
    s+=LN(bx,Y(y),X(pl.W)+6,Y(y),0.12,'#999','5 1 1 1');
    s+='<circle cx="'+r2(bx)+'" cy="'+r2(Y(y))+'" r="2.6" fill="#fff" stroke="#111" stroke-width="0.3"/>'+TX(bx,Y(y)+0.9,String(k+1),2.4,'middle',700);
  });
  var gx=function(x){for(var k=0;k<xs.length;k++) if(Math.abs(xs[k]-x)<0.3) return String.fromCharCode(65+k);return '?';};
  var gy=function(y){for(var k=0;k<ys.length;k++) if(Math.abs(ys[k]-y)<0.3) return String(k+1);return '?';};
  return {svg:s,gx:gx,gy:gy,xs:xs,ys:ys};
}
function wallLines(pl,X,Y,w,col,dash){
  var g={},out='';
  pl.units.forEach(function(u){if(u.k==='gone') return;var k=u.o+'|'+u.p;(g[k]=g[k]||[]).push(u.i);});
  Object.keys(g).forEach(function(k){
    var pr=k.split('|'),arr=g[k].sort(function(a,b){return a-b;}),st=arr[0],pv=arr[0],j;
    function fl(a,b){var p=+pr[1]/2,a0=a/2,b0=(b+1)/2;out+=pr[0]==='H'?LN(X(a0),Y(p),X(b0),Y(p),w,col,dash):LN(X(p),Y(a0),X(p),Y(b0),w,col,dash);}
    for(j=1;j<arr.length;j++){if(arr[j]!==pv+1){fl(st,pv);st=arr[j];}pv=arr[j];}
    fl(st,pv);
  });
  return out;
}
function sheetFound(pl,S,sys,sbc,proj){
  var st=structure(pl,S,sys,sbc),so=soilInfo(S.soil),dg=so.dig+so.cush,dgTxt=mft(dg)+' ('+dg.toFixed(1)+' m)',ox=Math.max(40,pl.outhouse&&pl.outhouse.side==='W'?14+(-pl.outhouse.x0)*FS:0),oy=36,fdS=pl.outhouse&&pl.outhouse.side==='S'?pl.outhouse.y1-pl.D+2:0,X=function(x){return ox+x*FS;},Y=function(y){return oy+y*FS;},s='';
  s+=wallLines(pl,X,Y,0.5,'#aaa');
  if(pl.outhouse){var OF=pl.outhouse,fw=1.5;s+=RC(X(OF.x0-fw/2),Y(OF.y0-fw/2),(OF.x1-OF.x0+fw)*FS,(OF.y1-OF.y0+fw)*FS,'#e4e4dc','#111',0.3);s+=RC(X(OF.x0+fw/2),Y(OF.y0+fw/2),(OF.x1-OF.x0-fw)*FS,(OF.y1-OF.y0-fw)*FS,'#fff','#111',0.3);s+=TX(X((OF.x0+OF.x1)/2),Y(OF.side==='W'?OF.y0:OF.y1)+(OF.side==='W'?-2:4),'BATH BLOCK: 450 MM STRIP FOOTING, 600 MM DEEP',1.8,'middle',600,'#333');}
  var ax=null;
  if(sys==='brick'){
    pl.units.forEach(function(u){
      if(u.k==='gone') return;
      var w=(u.c==='out'?st.strip.outFt:st.strip.inFt)*FS,mx=u.o==='H'?(u.i+0.5)/2:u.p/2,my=u.o==='H'?u.p/2:(u.i+0.5)/2;
      s+=u.o==='H'?RC(X(mx-0.26),Y(my)-w/2,0.52*FS,w,'#e4e4dc','none'):RC(X(mx)-w/2,Y(my-0.26),w,0.52*FS,'#e4e4dc','none');
    });
    s+=wallLines(pl,X,Y,0.35,'#111');
    s+=TX(X(pl.W/2),Y(pl.D+fdS)+9,'Strip footing: '+st.strip.outMm+' mm wide under outer and courtyard walls, '+st.strip.inMm+' mm under inner walls',2.3,'middle',700);
  }else{
    ax=axes(st.cols,pl,X,Y);
    s+=ax.svg+wallLines(pl,X,Y,0.3,'#777','2 1');
    st.cols.forEach(function(c){
      var fs=c.fs/304.8*FS;
      s+=RC(X(c.x)-fs/2,Y(c.y)-fs/2,fs,fs,'#f4f4ee','#111',0.3,'1.6 0.8')+RC(X(c.x)-1.1,Y(c.y)-1.1,2.2,2.2,'#111','#111',0.1);
      s+=TX(X(c.x)+fs/2+0.6,Y(c.y)-fs/2+2.2,c.fmark,1.9,'start',700);
    });
    s+=TX(X(pl.W/2),Y(pl.D+fdS)+13,'ISOLATED FOOTINGS AT COLUMN POSITIONS, TIED BY PLINTH BEAMS (DASHED) ALONG ALL WALLS',2.3,'middle',700);
  }
  s+=northArrow(X(pl.W)+28,40);
  var tx=212,ty=30,rows,t;
  if(sys==='brick'){
    rows=[['Outer and courtyard walls',st.strip.outMm+' wide',Math.round(st.strip.outLen)+' ft'],['Inner walls',st.strip.inMm+' wide',Math.round(st.strip.inLen)+' ft']];
    t=table(tx,ty+4,[{w:70,h:'Strip footing'},{w:40,h:'Width, mm'},{w:30,h:'Length'}],rows,5,2.3,true);
  }else{
    rows=st.foot.map(function(f){return [f.mark,f.qty,f.fs+' × '+f.fs,f.fd,f.bars];});
    t=table(tx,ty+4,[{w:12,h:'Mark'},{w:10,h:'Qty'},{w:30,h:'Size, mm'},{w:14,h:'Depth'},{w:46,h:'Bottom steel'}],rows,5,2.1,true);
  }
  s+=TX(tx,ty,'FOUNDATION SCHEDULE',3,'start',700)+t.svg;
  var lines=sys==='brick'?[
    'Excavate to firm soil, at least '+dgTxt+' below natural ground ('+so.n.toLowerCase()+'). Check the soil on site before casting.',
    'Footing: 150 mm PCC 1:4:8, then three brick steps in CM 1:6 up to plinth. Column-free, load-bearing walls.',
    'Plinth band 230 × 150 RCC (M20) on all walls. Damp-proof course 40 mm at plinth.',
    'Assumed safe bearing capacity '+sbc+' kN/m\u00B2. Confirm with a soil test.']:[
    'Excavate to firm soil, at least '+dgTxt+' below natural ground ('+so.n.toLowerCase()+'). Confirm bearing capacity by soil test. Details on sheet S-4.',
    'Footing: M20 concrete, Fe500 steel, 50 mm cover, over 100 mm PCC 1:4:8 blinding.',
    'Plinth beam 230 × 300 on all walls, tied to every footing column starter.',
    'Assumed safe bearing capacity '+sbc+' kN/m\u00B2. Footing size = 1.1 × column load / SBC, rounded up to 150 mm, minimum 900 mm.',
    'Column marks and grid references are shown on sheet S-2.'];
  var nb=notesBlock(tx,ty+4+t.h+8,'FOUNDATION NOTES',lines,2.3,3.4);
  s+=nb.svg;
  return sheetFrame('S-1','FOUNDATION PLAN','1:100',s,proj);
}
function sheetFrame2(pl,S,sys,sbc,proj){
  var st=structure(pl,S,sys,sbc),ox=40,oy=36,X=function(x){return ox+x*FS;},Y=function(y){return oy+y*FS;},s='';
  var R=mkRoof(pl,S);
  if(sys==='brick'){
    s+=wallLines(pl,X,Y,0.9,'#111');
    s+=wallLines(pl,X,Y,0.35,'#fff');
    s+=TX(X(pl.W/2),Y(pl.D)+9,'LOAD-BEARING BRICK WALLS WITH RCC BANDS. NO COLUMNS.',2.4,'middle',700);
  }else{
    var ax=axes(st.cols,pl,X,Y);
    s+=ax.svg+wallLines(pl,X,Y,0.35,'#999');
    s+=wallLines(pl,X,Y,0.8,sys==='rcc'?'#444':'#1f4f8a','3 1.2');
    st.cols.forEach(function(c){
      if(sys==='rcc') s+=RC(X(c.x)-1.2,Y(c.y)-1.2,2.4,2.4,'#111','#111',0.1);
      else s+=RC(X(c.x)-1.3,Y(c.y)-1.3,2.6,2.6,'#fff','#1f4f8a',0.45)+LN(X(c.x)-1.3,Y(c.y)-1.3,X(c.x)+1.3,Y(c.y)+1.3,0.3,'#1f4f8a')+LN(X(c.x)+1.3,Y(c.y)-1.3,X(c.x)-1.3,Y(c.y)+1.3,0.3,'#1f4f8a');
      s+=TX(X(c.x)+2,Y(c.y)-1.6,c.id,1.7,'start',700);
    });
    s+=TX(X(pl.W/2),Y(pl.D)+13,(sys==='rcc'?'RCC':'MS')+' COLUMNS AND ROOF BEAMS (DASHED) ON WALL LINES',2.4,'middle',700);
  }
  if(S.shape!=='flat'){
    creases(pl,S).forEach(function(sg){s+=LN(X(sg.a[0]),Y(sg.a[1]),X(sg.b[0]),Y(sg.b[1]),0.7,'#7a2e12');});
  }
  s+=northArrow(X(pl.W)+28,40);
  var tx=212,ty=30,rows,t,y;
  if(sys==='brick'){
    rows=[['Plinth band',st.beams.plinth],['Lintel and roof band',st.beams.lintel]];
    t=table(tx,ty+4,[{w:36,h:'Member'},{w:106,h:'Size and steel'}],rows,5,2.1,true);
  }else{
    rows=st.colSec.map(function(c){return [c.mark,c.qty,c.sec,Math.round(c.P)+' kN',c.ids.length>8?c.ids.slice(0,8).join(', ')+' ...':c.ids.join(', ')];});
    t=table(tx,ty+4,[{w:11,h:'Mark'},{w:9,h:'Qty'},{w:50,h:'Section'},{w:17,h:'Max load'},{w:55,h:'Columns'}],rows,5,2.0,true);
  }
  s+=TX(tx,ty,sys==='brick'?'BAND SCHEDULE':'COLUMN SCHEDULE',3,'start',700)+t.svg;
  y=ty+4+t.h+8;
  var lines=[];
  if(sys==='brick') lines=['Walls: 9\u2033 brick in cement mortar 1:6. Bands: M20 concrete, Fe500 steel.','Roof: '+st.roofNote+'.','Openings wider than 4 ft need RCC lintels extending 9\u2033 each side.'];
  else lines=[st.beams.plinth+'.',st.beams.roof+' on all outer and courtyard lines. Roof beams span at most '+ft(st.maxSpan)+' between columns.','Roof: '+st.roofNote+'.','Hip and ridge lines (brown) carry ISMB 125 or RCC hip beams.','Infill: 9\u2033 brick outside, 4.5\u2033 inside, built after the frame.'];
  var nb=notesBlock(tx,y,'FRAMING NOTES',lines,2.3,3.4);
  s+=nb.svg;
  return sheetFrame('S-2',sys==='brick'?'BANDS AND ROOF LAYOUT':'COLUMN AND BEAM LAYOUT','1:100',s,proj);
}
function sheetSched(pl,S,sys,sbc,proj){
  var st=structure(pl,S,sys,sbc),s='',y=22,t,x=14;
  var inf=SYSTEMS.filter(function(z){return z.v===sys;})[0];
  var nb=notesBlock(x,y,'DESIGN BASIS (PRELIMINARY)',[
    'Structure: '+inf.n+' ('+inf.s+'). Single storey. Roof: '+(S.shape==='flat'?'flat RCC slab':'sloped, '+pitchEff(pl,S)+'\u00B0')+'.',
    'Loads (unfactored): roof dead '+st.roofDL.toFixed(1)+' kN/m\u00B2, roof live '+st.LL.toFixed(2)+' kN/m\u00B2, 9\u2033 brick wall with plaster 5.0 kN/m\u00B2, 4.5\u2033 wall 2.5 kN/m\u00B2, plus 10% for beams.',
    'Total building load about '+Math.round(st.total)+' kN. Wind, seismic and soil effects are not analysed here and must be added by the engineer.',
    'Materials: concrete M20, steel Fe500, brick masonry in cement mortar 1:6, structural steel E250.',
    'Assumed safe bearing capacity '+sbc+' kN/m\u00B2. Change it on screen to match your soil test report.'].concat(pillarNote(S)),2.3,3.3);
  s+=nb.svg;y+=nb.h+6;
  if(sys!=='brick'){
    var rows=st.cols.map(function(c){return [c.id,ax2(c),c.kind,Math.round(c.P),c.fmark,c.smark];});
    function ax2(c){return '('+Math.round(c.x*10)/10+', '+Math.round(c.y*10)/10+')';}
    var mid=Math.ceil(rows.length/2);
    s+=TX(x,y,'COLUMN LOCATIONS AND LOADS',3,'start',700);
    var cols=[{w:11,h:'ID'},{w:24,h:'x, y (ft)'},{w:15,h:'Type'},{w:13,h:'kN'},{w:10,h:'Ftg'},{w:10,h:'Sec'}];
    t=table(x,y+3,cols,rows.slice(0,mid),3.6,1.9,true);s+=t.svg;
    var t2=table(x+t.w+4,y+3,cols,rows.slice(mid),3.6,1.9,true);s+=t2.svg;
    y+=3+t.h+6;
    var fr=st.foot.map(function(f){return [f.mark,f.qty,f.fs+' × '+f.fs+' × '+f.fd,f.bars,Math.round(f.P)+' kN'];});
    s+=TX(x,y,'FOOTING SCHEDULE',3,'start',700);
    var t3=table(x,y+3,[{w:11,h:'Mark'},{w:9,h:'Qty'},{w:36,h:'Size, mm'},{w:44,h:'Steel'},{w:18,h:'Max load'}],fr,4,1.9,true);s+=t3.svg;
    y+=3+t3.h+6;
    var cr=st.colSec.map(function(c){return [c.mark,c.qty,c.sec,Math.round(c.P)+' kN'];});
    s+=TX(x,y,'COLUMN SECTIONS',3,'start',700);
    var t4=table(x,y+3,[{w:11,h:'Mark'},{w:9,h:'Qty'},{w:58,h:'Section'},{w:18,h:'Max load'}],cr,4,1.9,true);s+=t4.svg;
  }else{
    s+=TX(x,y,'STRIP FOOTINGS AND BANDS',3,'start',700);
    t=table(x,y+3,[{w:60,h:'Item'},{w:80,h:'Size'},{w:30,h:'Length, ft'}],[
      ['Strip footing, outer',st.strip.outMm+' mm wide, 150 mm PCC + brick steps',Math.round(st.strip.outLen)],
      ['Strip footing, inner',st.strip.inMm+' mm wide, 150 mm PCC + brick steps',Math.round(st.strip.inLen)],
      ['Plinth band',st.beams.plinth,Math.round(st.beams.len)],
      ['Lintel/roof band',st.beams.lintel,Math.round(st.beams.len)]],5,2.0,true);s+=t.svg;
  }
  // right column
  var rx=232,ry=22;
  var q=[
    ['Concrete, approx.',st.concreteM3+' m\u00B3'],['Steel, approx.',num(st.steelKg)+' kg'],['Wall length',Math.round(st.wallLenFt)+' ft'],['Roof area incl. veranda',num(quant(pl,S).roofArea)+' sq ft']];
  s+=TX(rx,ry,'APPROXIMATE QUANTITIES (+/- 20%)',3,'start',700);
  var t5=table(rx,ry+3,[{w:60,h:'Item'},{w:50,h:'Quantity'}],q,4.4,2.2,true);s+=t5.svg;
  ry+=3+t5.h+7;
  var nb2=notesBlock(rx,ry,'ROOF STRUCTURE',[st.roofNote+'.','Hip, ridge and valley members follow the lines on sheet A-3. Fix anchors at every purlin and rafter joint.'],2.3,3.3);
  s+=nb2.svg;ry+=nb2.h+6;
  // typical footing detail
  var fs=sys==='brick'?st.strip.outMm:(st.foot.length?st.foot[st.foot.length-1].fs:900),fd=sys==='brick'?150:(st.foot.length?st.foot[st.foot.length-1].fd:450);
  s+=TX(rx,ry,sys==='brick'?'TYPICAL STRIP FOOTING (NTS)':'TYPICAL FOOTING SECTION (NTS)',3,'start',700);
  var dx=rx+10,dy=ry+8,sc=0.045,wpx=fs*sc,hpx=fd*sc,gl=dy+8;
  s+=LN(dx-6,gl,dx+wpx+6,gl,0.4)+TX(dx-6,gl-1,'GL',2,'start');
  var colw=230*sc,cx=dx+(wpx-colw)/2;
  s+=RC(cx,gl-10,colw,10+20+0,'none','#111',0.4);
  s+=RC(dx,gl+20,wpx,hpx,'#eee','#111',0.5);
  s+=RC(dx-2,gl+20+hpx,wpx+4,100*sc,'#ddd','#111',0.3);
  s+=LN(dx+3,gl+20+hpx-2,dx+wpx-3,gl+20+hpx-2,0.5,'#111');
  s+=TX(dx+wpx+6,gl+20+hpx/2,fs+' wide, '+fd+' deep',2,'start');
  s+=TX(dx+wpx+6,gl+20+hpx+4,'100 mm PCC 1:4:8',2,'start');
  s+=TX(cx+colw+4,gl-3,sys==='brick'?'9\u2033 brick wall':'column starter',2,'start');
  s+=TX(dx+wpx+6,gl+8,'plinth level +'+ft(pl.plinth)+' (above GL)',2,'start');
  var nb3=notesBlock(rx,dy+60,'GENERAL STRUCTURAL NOTES',[
    'Sizes are preliminary rule-of-thumb values for a single-storey house with spans up to about 15 ft. They are not a code design.',
    'A licensed structural engineer must check loads, wind and seismic zone, soil and member design (IS 456, IS 800, IS 1893, IS 875) and stamp the drawings.',
    'Do not start construction from these sheets alone.'],2.2,3.2);
  s+=nb3.svg;
  return sheetFrame('S-3','STRUCTURAL SCHEDULES AND NOTES','NTS / TABLES',s,proj);
}
function buildSheets(S,sys,sbc,proj){
  var pl=planFor(S);
  var arr=[
    {id:'A-1',title:'Floor plan',svg:sheetPlan(pl,S,proj)},
    {id:'A-2',title:'Front and side elevations',svg:sheetElev(pl,S,proj)},
    {id:'A-3',title:'Roof plan (top view)',svg:sheetRoof(pl,S,proj)},
    {id:'S-1',title:'Foundation plan',svg:sheetFound(pl,S,sys,sbc,proj)},
    {id:'S-2',title:sys==='brick'?'Bands and roof layout':'Column and beam layout',svg:sheetFrame2(pl,S,sys,sbc,proj)},
    {id:'S-3',title:'Structural schedules and notes',svg:sheetSched(pl,S,sys,sbc,proj)},
    {id:'S-4',title:'Foundation and column base detail',svg:sheetBase(pl,S,sys,sbc,proj)}
  ];
  if(S.svc&&(S.svc.plumb||S.svc.tanks)) arr.push({id:'P-1',title:'Plumbing, drainage and tanks',svg:sheetServices(pl,S,proj,'plumb')});
  if(S.svc&&S.svc.elec) arr.push({id:'E-1',title:'Electrical layout',svg:sheetServices(pl,S,proj,'elec')});
  return arr;
}
var PILLAR_NAMES={turned:'turned timber',square:'square timber with brackets',masonry:'plastered masonry'};
function PILC(S){return (S.pillarV||'turned')==='masonry'?'#d9d2c0':'#8a6340';}
function pillarNote(S){
  var c=S.pillarC||'turned',v=S.pillarV||'turned',a=['Pillars: courtyard '+PILLAR_NAMES[c]+', veranda '+PILLAR_NAMES[v]+'.'];
  if(c!=='masonry'||v!=='masonry') a.push('Timber pillars: hardwood (teak or sal), at least 200 \u00D7 200 mm, on a stone base with a steel dowel. Confirm with a timber engineer.');
  return a;
}
function sheetServices(pl,S,proj,which){
  var sv=servicesData(pl,S),s='',pw=which==='plumb',f=S.svc||{};
  var ox=14+Math.max(0,-sv.minX)*FS,oy=24+Math.max(0,-sv.minY)*FS;
  s+=planGroup(pl,ox,oy,{plain:true});
  s+=svcDraw(sv,{X:function(x){return ox+x*FS;},Y:function(y){return oy+y*FS;},u:FS,lw:0.35,fs:2.2,labels:true,show:{plumb:pw&&f.plumb,tanks:pw&&f.tanks,elec:!pw&&f.elec}});
  var rx=Math.max(232,ox+sv.maxX*FS+10),ry=22,C=sv.counts,T=sv.tanks,t,y=ry,lg=function(x1,y1,col,w,dash,lbl){return LN(rx,y1,rx+10,y1,w,col,dash)+TX(rx+13,y1+0.8,lbl,2.4);};
  if(pw){
    s+=TX(rx,y,'FIXTURES',3,'start',700);
    t=table(rx,y+3,[{w:70,h:'Item'},{w:20,h:'Qty'}],[['WC',C.wc],['Shower',C.shower],['Wash basin',C.basin],['Kitchen sink',C.sink],['Taps and bib cocks',C.taps]],4.2,2.2,true);s+=t.svg;y+=3+t.h+5;
    s+=TX(rx,y,'PIPES AND TANKS (INDICATIVE)',3,'start',700);
    var rows=[['Cold supply, 25 mm and 20 mm',Math.round(sv.len.supply)+' ft'],['Pump line, sump to tank',Math.round(sv.len.sump)+' ft'],['Drain, 110 mm and 75 mm',Math.round(sv.len.drain)+' ft']];
    if(f.tanks) rows.push(['Overhead tank',num(T.over.cap)+' L, '+T.over.d.toFixed(1)+' ft dia'],['Underground sump',num(T.sump.cap)+' L, '+T.sump.w.toFixed(1)+' \u00D7 '+T.sump.h.toFixed(1)+' \u00D7 '+T.sump.depth+' ft'],['Septic tank, '+sv.users+' people',T.septic.w+' \u00D7 '+T.septic.h+' \u00D7 '+T.septic.depth+' ft, '+num(T.septic.cap)+' L'],['Soak pit',T.soak.d+' ft dia, '+T.soak.depth+' ft deep']);
    t=table(rx,y+3,[{w:62,h:'Item'},{w:100,h:'Size'}],rows,4.2,2.2,true);s+=t.svg;y+=3+t.h+5;
    s+=lg(0,y,'#2F7BD9',0.5,null,'Cold water supply')+lg(0,y+4.5,'#2F7BD9',0.6,'2 1','Pump line from sump')+lg(0,y+9,'#8A6A4A',0.9,null,'Soil and waste drain');y+=14;
    var nb=notesBlock(rx,y,'NOTES',['Sizes follow IS 2470 for the number of people shown.','Septic tank: two chambers, vent pipe 75 mm, at least 6 m from the water sump or borewell.','Slope soil and waste pipes about 1 in 40.','Overhead tank over the common bath block (west), sump in the north-east, as Vastu suggests.','Kitchen sink water can go to its own soak pit.','Pipes are drawn at floor level for clarity. A licensed plumber must confirm the design.'],2.2,3);s+=nb.svg;
  }else{
    s+=TX(rx,y,'POINTS AND EQUIPMENT',3,'start',700);
    t=table(rx,y+3,[{w:80,h:'Item'},{w:20,h:'Qty'}],[['Light points',C.lights],['Ceiling fans',C.fans],['Sockets (5 A and 15 A)',C.sockets],['AC points',C.ac],['Distribution board, 8 way',1],['Earthing pit',1]],4.2,2.2,true);s+=t.svg;y+=3+t.h+5;
    s+=TX(rx,y,'CIRCUITS (INDICATIVE)',3,'start',700);
    t=table(rx,y+3,[{w:60,h:'Circuit'},{w:60,h:'Copper wire, MCB'}],[['Lighting','1.5 mm\u00B2, 10 A'],['Power sockets','2.5 mm\u00B2, 16 A'],['Kitchen and geyser','4 mm\u00B2, 25 A'],['AC','4 mm\u00B2, 20 A'],['Main from meter','6 mm\u00B2, 40 A, with ELCB']],4.2,2.2,true);s+=t.svg;y+=3+t.h+5;
    s+=lg(0,y,'#E0A500',0.6,null,'Conduit and cable ('+Math.round(sv.len.elec)+' ft)');
    s+='<circle cx="'+(rx+5)+'" cy="'+(y+5.2)+'" r="1.4" fill="#fff" stroke="#E0A500" stroke-width="0.35"/>'+TX(rx+13,y+6,'Light point',2.4);
    s+='<circle cx="'+(rx+5)+'" cy="'+(y+9.7)+'" r="2.4" fill="none" stroke="#E0A500" stroke-width="0.3" stroke-dasharray="1 0.6"/>'+TX(rx+13,y+10.5,'Ceiling fan',2.4);
    s+=RC(rx+3.5,y+12.8,3,3,'#333')+TX(rx+13,y+15.2,'Distribution board (DB)',2.4);y+=19;
    var nb2=notesBlock(rx,y,'NOTES',['Conduits run concealed in the roof band and walls; shown on the plan for clarity.','DB in the south-east (kitchen or store). Meter near the main door.','Earth pit outside, close to the DB.','Layout is indicative. A licensed electrician must design circuits and loads.'],2.2,3);s+=nb2.svg;
  }
  return sheetFrame(pw?'P-1':'E-1',pw?'PLUMBING, DRAINAGE AND TANKS':'ELECTRICAL LAYOUT','1:100',s,proj);
}

