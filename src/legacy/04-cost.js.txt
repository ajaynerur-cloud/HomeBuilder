/* ---------- quantities and cost ---------- */
var RT=JSON.parse(JSON.stringify(DEF_RATES));
var quantCache={};
function quant(pl,S){
  var key=pl.key+'|'+S.shape+'|'+S.pitch+'|'+S.over+'|'+S.rise;
  if(quantCache[key]) return quantCache[key];
  var R=mkRoof(pl,S),A={out:0,ct:0,in:0};
  pl.units.forEach(function(u){
    var mx=u.o==='H'?(u.i+0.5)/2:u.p/2,my=u.o==='H'?u.p/2:(u.i+0.5)/2;
    var h=R.wallH(u.o,mx,my),a=0;
    switch(u.k){
      case 'wall':a=0.5*h;break;
      case 'door':case 'main':a=0.5*Math.max(0,h-7);break;
      case 'open':a=0.5*Math.max(0,h-7.5);break;
      case 'win':a=0.5*(3+Math.max(0,h-6.5));break;
      case 'vent':a=0.5*(5.5+Math.max(0,h-7));break;
    }
    A[u.c]+=a;
  });
  var rm=roofMesh(pl,S,null,null);
  var res={A:A,roofArea:rm.area+platRoof(pl,S,null,null)};
  quantCache[key]=res;
  return res;
}
function costFor(pl,S,sys,fm,rg){
  var q=quant(pl,S),fl=(S.shape==='flat');
  var a9=q.A.out+q.A.ct,ain=q.A.in;
  var brickRate=RT.b9;
  var items=[];
  var bu=pl.builtup,ver=pl.verArea;
  items.push(['Foundation and plinth',RT.found[sys]*(bu+0.5*ver)]);
  items.push(['Structure (frame or bands)',RT.frame[sys]*bu]);
  var wo=wallSel(S).out,wi=wallSel(S).inn,outAac=wo==='aac',inAac=wi==='aac',outFly=wo==='fly',inFly=wi==='fly',outGl=wo==='glass',inGl=wi==='glass',inDry=wi==='gyp'||wi==='wpc',inGyp=wi==='gyp';
  var MAT=materialsFor(pl,S,sys,q),pf=specOf(S,'paintG').f;
  var wallOut=a9*(outGl?RT.glassW:outAac?RT.aac9:outFly?RT.fa9:brickRate),wallIn=inDry?MAT.dry.cost:ain*(inGl?RT.glassP:inAac?RT.aac4:inFly?(sys==='brick'?RT.fa9:RT.fa45):(sys==='brick'?RT.b9:RT.b45));
  items.push([(wo==='brick'&&wi==='brick')?'Brickwork':'Walls: '+({brick:'brick',fly:'fly-ash brick',aac:'AAC',glass:'glass'}[wo])+' outside, '+({brick:'brick',fly:'fly-ash brick',aac:'AAC',gyp:'gypsum board',wpc:'WPC board',glass:'glass'}[wi])+' inside',wallOut+wallIn]);
  var plOut=outGl?0:2*a9*(RT.plaster*(outAac?0.8:outFly?0.85:1)+RT.paint*pf*fm),plIn=inGl?0:inDry?(inGyp?2*ain*RT.paint*pf*fm:0):2*ain*(RT.plaster*(inAac?0.8:inFly?0.85:1)+RT.paint*pf*fm);
  items.push(['Plaster and paint',plOut+plIn]);
  if(inDry&&sys==='brick'&&MAT.dry.trusses) items.push(['Steel roof trusses over dry partitions',MAT.dry.trusses*RT.truss]);
  var rr=fl?RT.roof.flat:RT.roof[S.cover];
  items.push(['Roof',q.roofArea*rr]);
  if(pl.jag){
    var Hj=pl.plinth,kerb=0,fill=0,cope=0,stepsN=0;
    pl.segs.forEach(function(g){
      var hz=(g.side==='N'||g.side==='S'),len=hz?g.x1-g.x0:g.y1-g.y0;
      if(g.kind==='gap'){kerb+=2*pl.vd*((pl.segs.filter(function(q){return q.kind==='wing';})[0]||{h:0}).h)*190+(hz?g.x1-g.x0:g.y1-g.y0)*pl.vd*45;return;}
      kerb+=len*g.h*190;fill+=(g.x1-g.x0)*(g.y1-g.y0)*g.h*38;cope+=len*420;
    });
    pl.strips.forEach(function(st){
      var hz=(st.side==='N'||st.side==='S'),e0=hz?(pl.sides.w?0:1):(pl.sides.n?0:1),e1=hz?(pl.sides.e?0:1):(pl.sides.s?0:1);
      var sg=pl.segs.filter(function(g){return g.side===st.side;});
      kerb+=(e0*pl.vd*(sg.length?sg[0].h:Hj)+e1*pl.vd*(sg.length?sg[sg.length-1].h:Hj))*190;
    });
    var SSc=stepSets(pl);
    SSc.steps.forEach(function(q){stepsN+=Math.max(2,Math.ceil(q.H/0.55))-1;});
    SSc.door.forEach(function(q){stepsN+=Math.max(1,Math.ceil(q.rise/0.55))-1;});
    SSc.stairs.forEach(function(q){stepsN+=q.N-1;});
    var jag=kerb+fill+cope+pl.builtup*Math.max(0,Hj-1.5)*38+2*(pl.W+pl.D)*Math.max(0,Hj-1.5)*190+stepsN*5500+(pl.jag.ledges&&pl.sides.n&&!pl.split?28000:0);
    items.push(['Jagali platform and raised plinth',jag*fm]);
  }
  items.push(['Flooring: '+specOf(S,'floorF').n.toLowerCase(),bu*RT.floor*specOf(S,'floorF').f*fm+ver*RT.floor*fm+pl.courtArea*FIX.court+FIX.drain]);
  var woodF=specOf(S,'woodT').f,wfF=specOf(S,'winFrame').f*specOf(S,'winGlass').f*(specOf(S,'winFrame').v==='wood'?woodF:1),dw=FIX.main*specOf(S,'mainDoor').f+pl.nDoor*FIX.door*specOf(S,'inDoor').f*(specOf(S,'inDoor').v==='panel'?woodF:specOf(S,'inDoor').v==='flush'?(0.85+0.15*woodF):1)+pl.nWin*FIX.win*wfF+pl.nVent*FIX.vent*specOf(S,'winFrame').f;
  items.push(['Doors and windows',dw*fm]);
  var fx=FIX.kit*specOf(S,'kitchenC').f,bfF=specOf(S,'bathFit').f;
  pl.rooms.forEach(function(r){
    if(r.t!=='wet') return;
    fx+=(/\+/.test(r.n)?FIX.bathwc:(/WC/.test(r.n)?FIX.wc:FIX.bath))*bfF;
  });
  items.push(['Kitchen, bath and WC',fx*fm]);
  var sv0=svcOn(S)?servicesData(pl,S):null,sf=S.svc||{};
  var ef=1-(sf.plumb?0.25:0)-(sf.elec?0.3:0);
  items.push(['Electrical and water',(bu*RT.elec*fm*ef*specOf(S,'elecG').f+FIX.pump)]);
  items.push(['Site works and septic',FIX.site*(0.7+0.3*bu/1000)*(sf.tanks?0.4:1)]);
  if(sf.plumb) items.push(['Plumbing pipework and fittings',(sv0.len.supply+sv0.len.drain)*95*fm]);
  if(sf.elec) items.push(['Electrical wiring, DB and points',(sv0.len.elec*70+(sv0.counts.lights+sv0.counts.fans+sv0.counts.sockets)*650*specOf(S,'elecG').f+15000)*fm]);
  if(sf.tanks){
    var us=sv0.users;
    items.push(['Septic tank and soak pit',(42000+Math.max(0,us-5)*3000+(us>10?6000:0)+12000)*fm]);
    items.push(['Water tanks and stand',(sv0.tanks.over.cap*7+10000+sv0.tanks.sump.cap*20+8000+sv0.len.sump*95)*fm]);
  }
  var pc=S.pillarC||'turned',pv=S.pillarV||'turned',Cr0=pl.center;
  if(pl.pillars.length) items.push(['Courtyard pillars and beams',(pl.pillars.length*PILLAR_COST[pc]+2*(Cr0.w+Cr0.h)*(pc==='masonry'?350:650))*fm]);
  var vn=pl.vd>0?vPillarCount(pl):0,vlen=0;
  if(vn){pl.strips.forEach(function(st){vlen+=(st.side==='N'||st.side==='S')?st.x1-st.x0:st.y1-st.y0;});items.push(['Veranda pillars and beam',(vn*PILLAR_COST[pv]+vlen*(pv==='masonry'?350:650))*fm]);}
  if(S.wetOut&&pl.outhouse){var OC=pl.outhouse,owr=wallSel(S).out,wr=owr==='aac'?RT.aac9:owr==='fly'?RT.fa45:RT.b45,owa=OC.wallLen*OC.wallH;
    items.push(['Bath and WC block outside',owa*wr+2*owa*(RT.plaster+RT.paint*pf*fm)+OC.area*(RT.found.brick+RT.roof.flat+RT.floor*1.4*fm)+(FIX.bath+FIX.wc+2*FIX.door)*fm+OC.gap*3*150+8000]);}
    var cu=specOf(S,'curtains');if(cu.f>0){var gA=(outGl?a9:0)+(inGl?ain:0),cA=gA>0?gA:pl.nWin*4*7;items.push(['Curtains: '+cu.n.toLowerCase()+(gA>0?' on the glass walls':' on the windows'),cA*RT.curtain*cu.f*fm]);}
  var ad=S.addons||{};
  if(ad.ceiling){var ca=pl.rooms.filter(function(r){return /entry|living|din/.test(r.id||'')||r.t==='din'||r.t==='entry';}).reduce(function(s3,r){return s3+r.w*r.h;},0);items.push(['False ceiling',ca*RT.ceiling*fm]);}
  ADDONS.forEach(function(a){if(a[2]&&ad[a[0]]) items.push([a[1],a[2]]);});
  if(ad.compound&&+S.compoundFt>0) items.push(['Compound wall, '+num(+S.compoundFt)+' running ft',+S.compoundFt*RT.compound]);
var sub=0;items.forEach(function(i){sub+=i[1];});
  items.push(['Contingency (5%)',sub*0.05]);
  items.forEach(function(i){i[1]=i[1]*rg;});
  var total=0;items.forEach(function(i){total+=i[1];});
  var months=pl.months*({brick:1,rcc:1.2,ms:0.8}[sys])*(inDry&&outAac?0.9:inDry?0.93:outAac?0.95:1)+(fl?0.5:0);
  return {items:items,total:total,perSqft:total/pl.area,months:months,bricks:MAT.bricks,blocks:MAT.blocks,boards:inDry?MAT.dry.sheets:0,boardKind:wi,roofArea:q.roofArea,mat:MAT};
}

/* ---------- walls and the materials they need ---------- */
function wallSel(S){
  if(S.wallOut||S.wallIn) return {out:['brick','fly','aac','glass'].indexOf(S.wallOut)>=0?S.wallOut:'brick',inn:['brick','fly','aac','gyp','wpc','glass'].indexOf(S.wallIn)>=0?S.wallIn:'brick'};
  var m={brick:['brick','brick'],aac:['aac','aac'],gyp:['brick','gyp'],aacgyp:['aac','gyp']}[S.walls||'brick']||['brick','brick'];return {out:m[0],inn:m[1]};
}
var FT2M2=0.09290304,FTM=0.3048;
function materialsFor(pl,S,sys,q){
  q=q||quant(pl,S);var ws=wallSel(S),a9=q.A.out+q.A.ct,ain=q.A.in,B=BRICKS.filter(function(b){return b.v===S.brick&&b.v!=='fly';})[0]||BRICKS[1],BF=BRICKS.filter(function(b){return b.v==='fly';})[0];
  var tube=MS_TUBES.filter(function(t){return t.v===S.tube;})[0]||MS_TUBES[2],sp=(+S.studSp===400?400:600)/1000,wt=WPC_T.indexOf(+S.wpcT)>=0?+S.wpcT:12;
  var runs=pl._inRuns;if(!runs){runs=[];try{runs=wallRuns(pl).filter(function(r){return r.cls==='in';});}catch(e){}pl._inRuns=runs;}
  var Lin=runs.reduce(function(s2,r){return s2+r.len;},0)||1,Hin=ain/Lin,out={rows:[],bricks:0,blocks:0};
  var cement=0,sand=0,add=function(item,qty,unit,note,key){out.rows.push([item,qty,unit,note||'',key||'']);};
  var masonry=function(area,thick,label,BB){var B0=B;if(BB) B=BB; // brick wall: count by the chosen size with 10 mm joints, mortar 1:6
    var vol=area*FT2M2*thick/1000,per=1/((B.L+10)*(B.W+10)*(B.H+10)*1e-9),n=vol*per,mort=Math.max(0,vol-n*B.L*B.W*B.H*1e-9),dry=mort*1.27;
    cement+=dry/7/0.0347;sand+=dry*6/7;out.bricks+=Math.round(n*1.05);B=B0;return Math.round(n*1.05);};
  var plaster=function(area,mm,mix){var dry=area*FT2M2*mm/1000*1.27;cement+=dry/(1+mix)/0.0347;sand+=dry*mix/(1+mix);};
  function glassRows(area,t,where){var m2=area*FT2M2,H=(Hin||9)*FTM,panels=Math.ceil(m2/(1.2*H)*1.03);add('Toughened glass '+t+' mm',+(m2*1.03).toFixed(1),'m²',panels+' panels about 1.2 m wide, '+where,'glass'+t);add('Aluminium frame (mullions, head and sill)',Math.round(panels*(H+2.4)),'m','a mullion between panels plus head and sill','alu');add('Structural silicone',Math.ceil(panels*2*H/3),'tubes','about 3 m of joint a tube','silicone');}
  var outB=ws.out==='fly'?BF:B,inB=ws.inn==='fly'?BF:B,outT=ws.out==='aac'?200:outB.L,inT=sys==='brick'&&(ws.inn==='brick'||ws.inn==='fly')?inB.L:inB.W;
  if(ws.out==='brick'||ws.out==='fly'){var nb=masonry(a9,outT,'',outB);add((ws.out==='fly'?'Fly-ash bricks':'Bricks')+', outer and courtyard walls',nb,'nos',outB.n+', wall '+outT+' mm, 5% extra','brick_'+outB.v);}
  else if(ws.out==='aac'){var bo=Math.round(a9*FT2M2/0.12*1.05);out.blocks+=bo;add('AAC blocks 600 × 200 × 200 mm',bo,'nos','outer and courtyard walls, 5% extra','aac200');add('AAC block adhesive (40 kg bags)',Math.ceil(bo/30),'bags','thin bed, about 30 blocks a bag','aacglue');}
  else{glassRows(a9,'12','outer and courtyard walls');}
  if(ws.inn==='brick'||ws.inn==='fly'){var ni=masonry(ain,inT,'',inB);add((ws.inn==='fly'?'Fly-ash bricks':'Bricks')+', inner walls',ni,'nos',inB.n+', wall '+inT+' mm, 5% extra','brick_'+inB.v);}
  else if(ws.inn==='aac'){var bi=Math.round(ain*FT2M2/0.12*1.05);out.blocks+=bi;add('AAC blocks 600 × 200 × 100 mm',bi,'nos','inner walls, 5% extra','aac100');add('AAC block adhesive (40 kg bags)',Math.ceil(bi/60),'bags','about 60 blocks a bag','aacglue');}
  else if(ws.inn==='glass') glassRows(ain,'10','inner partitions');
  // plaster: outside 15 mm 1:6, inside 12 mm 1:4 (AAC 10 mm)
  if(ws.out!=='glass'){plaster(a9,ws.out==='aac'?10:ws.out==='fly'?12:15,6);plaster(a9,ws.out==='aac'?10:12,4);}if(ws.inn==='brick'||ws.inn==='aac'||ws.inn==='fly') plaster(2*ain,ws.inn==='aac'?10:12,4);
  // dry partitions: boards on both faces of a welded MS square-tube frame
  out.dry={cost:0,sheets:0,trusses:0};
  if(ws.inn==='gyp'||ws.inn==='wpc'){
    var faceM2=2*ain*FT2M2,sheets=Math.ceil(faceM2/(1.22*2.44)*1.08),Hm=Hin*FTM,rowsN=Math.max(1,Math.ceil(Hm/1.2)-1),studM=0,trackM=0,nogM=0,welds=0,studs=0;
    runs.forEach(function(r){var Lm=r.len*FTM,n=Math.ceil(Lm/sp)+1;studs+=n;studM+=n*Hm;trackM+=2*Lm;nogM+=rowsN*Lm;welds+=2*n+rowsN*2*(n-1);});
    var totM=(studM+trackM+nogM)*1.05,kgm=4*tube.t*(tube.a-tube.t)*7.85e-3,kg=totM*kgm,len6=Math.ceil(totM/6),anchors=Math.ceil(trackM/0.6),screws=sheets*28;
    var sheetRate=ws.inn==='gyp'?RT.gypSheet:RT['wpc'+wt];
    out.dry={cost:sheets*sheetRate+kg*RT.msKg+ain*RT.dryLab,sheets:sheets,kg:kg,len6:len6,studs:studs,welds:welds,trusses:sys==='brick'?runs.length:0};
    add(ws.inn==='gyp'?'Gypsum boards 1220 × 2440 × 12.5 mm':'WPC boards 1220 × 2440 × '+wt+' mm',sheets,'sheets','both faces of '+Math.round(ain)+' sq ft of partition, 8% extra',ws.inn==='gyp'?'gypsheet':'wpc'+wt);
    add('MS square tube '+tube.a+' × '+tube.a+' × '+tube.t.toFixed(1)+' mm',Math.round(totM),'m',len6+' lengths of 6 m, '+Math.round(kg)+' kg ('+kgm.toFixed(2)+' kg/m)','');out.rows.push(['MS tube by weight',Math.round(kg),'kg','for pricing','mstube']);
    add('Studs (vertical members)',studs,'nos','at '+Math.round(sp*1000)+' mm centres, '+Hm.toFixed(2)+' m tall, plus one at every end');
    add('Top and bottom tracks',Math.round(trackM),'m','one along the floor and one under the roof band, on every partition');
    add('Noggins (horizontal members)',Math.round(nogM),'m',rowsN+' row'+(rowsN>1?'s':'')+', every 1.2 m of height, to back the board joints');
    add('Weld joints',welds,'nos',tube.t>=2?'fillet weld all round each joint, 3 mm leg':'stitch weld each joint, two 25 mm runs (thin wall: avoid burning through)');
    add('Anchor fasteners',anchors,'nos','tracks fixed to floor and roof band every 600 mm','anchors');
    add(ws.inn==='gyp'?'Drywall screws 25 mm':'Self-drilling screws with washers',screws,'nos','about every 250 mm along studs and noggins','screws');
    if(ws.inn==='gyp'){add('Joint tape',Math.round(faceM2*1.4),'m','paper or fibre mesh','tape');add('Jointing compound',Math.round(faceM2*0.35),'kg','two coats over joints and screw heads','compound');}
    if(sys==='brick') add('Steel roof trusses',runs.length,'nos','with load-bearing brick, a truss over each dry partition carries the roof');
  }
  // the outside bath and WC block: half-brick walls in the outer wall material
  if(S.wetOut&&pl.outhouse){var oa=pl.outhouse.wallLen*pl.outhouse.wallH;if(ws.out==='aac'){var ob=Math.round(oa*FT2M2/0.12*1.05);add('AAC blocks 600 × 200 × 100 mm, bath block',ob,'nos','outside bath and WC','aac100');}else{var obb=ws.out==='fly'?BF:B,nob=masonry(oa,obb.W,'',obb);add((ws.out==='fly'?'Fly-ash bricks':'Bricks')+', bath block',nob,'nos','outside bath and WC, half-brick walls','brick_'+obb.v);}plaster(2*oa,12,5);}
  // roof and floor
  var ra=q.roofArea*FT2M2,cov=S.shape==='flat'?'flat':S.cover;
  if(cov==='tile'||cov==='rcctile') add('Mangalore roof tiles',Math.ceil(ra*15*1.05),'nos','about 15 a square metre, 5% extra','tile_roof');
  if(cov==='sheet') add('Metal roof sheets',Math.ceil(q.roofArea*1.1),'sq ft','with laps','sheet_roof');
  if(cov==='flat'||cov==='rcctile'){var cm=ra*0.125;add('Concrete for roof slab',+cm.toFixed(1),'m³','125 mm slab','concrete');add('Steel bars for roof slab',Math.round(cm*80),'kg','about 80 kg a cubic metre','rebar');}
  var fa=(pl.builtup||pl.area)*FT2M2,ff=specOf(S,'floorF').v;
  if(ff==='vit'){add('Floor tiles 600 × 600 mm',Math.ceil(fa/0.36*1.05),'nos','built-up area, 5% extra','floortile');add('Tile adhesive (20 kg bags)',Math.ceil(fa/5),'bags','about 5 m² a bag','tileglue');}
  else add('Flooring: '+specOf(S,'floorF').n.toLowerCase(),+(fa*1.05).toFixed(1),'m²','built-up area, 5% extra','floor_'+ff);
  // windows and doors: wood is listed by volume of the chosen species
  var wf=specOf(S,'winFrame').v,wsp=specOf(S,'woodT'),md=specOf(S,'mainDoor').v,idr=specOf(S,'inDoor').v,nW=pl.nWin||0,nD=pl.nDoor||0;
  if(wf==='wood'){add('Wood for window frames and shutters ('+wsp.n.toLowerCase()+')',+(nW*1.1).toFixed(1),'cft',nW+' windows about 4 × 4 ft, about 1.1 cft each','wood_'+wsp.v);add('Window glass and hardware',nW,'nos','glass, hinges, stays and bolts','win_hw');}
  else add({upvc:'uPVC',alu:'Aluminium',steel:'MS steel'}[wf]+' windows, about 4 × 4 ft',nW,'nos','frame, shutters, glass and hardware','win_'+wf);
  if(md==='teak'||md==='sal'){add('Wood for main door ('+md+')',6,'cft','frame and 40 mm panelled shutter','wood_'+md);add('Main door hardware and lock',1,'nos','','mdoor_hw');}
  else add({wpc:'WPC',steel:'Steel safety'}[md]+' main door',1,'nos','with frame','mdoor_'+md);
  if(idr==='panel'){add('Wood for inside doors ('+wsp.n.toLowerCase()+')',+(nD*3.2).toFixed(1),'cft',nD+' panel doors, frame and shutter about 3.2 cft each','wood_'+wsp.v);add('Door hardware',nD,'nos','hinges, tower bolts, handles','door_hw');}
  else if(idr==='flush'){add('Flush door shutters',nD,'nos','','idoor_flush');add('Wood for door frames ('+wsp.n.toLowerCase()+')',+(nD*1.2).toFixed(1),'cft','about 1.2 cft a frame','wood_'+wsp.v);add('Door hardware',nD,'nos','hinges, tower bolts, handles','door_hw');}
  else add('WPC inside doors',nD,'nos','with WPC frames','idoor_wpc');
  add('Cement (50 kg bags)',Math.ceil(cement),'bags','masonry mortar and plaster','cement');add('Sand',+sand.toFixed(1),'m³','masonry and plaster','sand');
  out.cement=Math.ceil(cement);out.sand=sand;return out;
}
/* ---------- budget: find the smallest set of changes that brings the estimate under a target ---------- */
var BUDGET_LEVERS=null;
function budgetPlans(S,target,max){
  var pl=planFor(S),fins=[0.85,1,1.3].filter(function(f){return f<=S.finish+1e-9;}),covers=S.shape==='flat'?[S.cover]:['tile','sheet','rcctile'];
  var walls=[];['brick','fly','aac'].forEach(function(o){['brick','fly','aac','gyp'].forEach(function(i){walls.push(o+'/'+i);});});if(walls.indexOf(wallSel(S).out+'/'+wallSel(S).inn)<0) walls.push(wallSel(S).out+'/'+wallSel(S).inn);var cw=wallSel(S).out+'/'+wallSel(S).inn;var _w0=0,syss=['brick','rcc','ms'],pils=[S.pillarC||'turned','masonry'].filter(function(v,i,a){return a.indexOf(v)===i;}),shapes=S.shape==='flat'?['flat','double']:[S.shape];
  var out=[],seen={};
  shapes.forEach(function(sh){covers.concat(sh!=='flat'&&S.shape==='flat'?['tile','sheet']:[]).forEach(function(cv){walls.forEach(function(wm){syss.forEach(function(sy){fins.forEach(function(fn){pils.forEach(function(pc){
    var S2=Object.assign({},S,{shape:sh,cover:sh==='flat'?S.cover:cv,wallOut:wm.split('/')[0],wallIn:wm.split('/')[1],sys:sy,finish:fn,pillarC:pc,pillarV:pc==='masonry'?'masonry':S.pillarV}),key=[sh,S2.cover,wm,sy,fn,pc].join('|');if(seen[key]) return;seen[key]=1;
    var c=costFor(pl,S2,sy,fn,S.region),score=0,ch=[];
    if(sh!==S.shape){score+=2;ch.push('roof shape: '+SHAPES.filter(function(x){return x.v===sh;})[0].n);}
    if(S2.cover!==S.cover){score+=1;ch.push('roof: '+COVERS.filter(function(x){return x.v===S2.cover;})[0].n);}
    if(wm!==cw){score+=1;ch.push('walls: '+WALL_OUT.filter(function(x){return x.v===wm.split('/')[0];})[0].n+' outside, '+WALL_IN.filter(function(x){return x.v===wm.split('/')[1];})[0].n.toLowerCase()+' inside');}
    if(sy!==S.sys){score+=1.5;ch.push('structure: '+SYSTEMS.filter(function(x){return x.v===sy;})[0].n);}
    if(fn!==S.finish){score+=2*Math.round((S.finish-fn)/0.15);ch.push('finish: '+(fn<0.9?'Basic':fn<1.1?'Standard':'Premium'));}
    if(pc!==(S.pillarC||'turned')){score+=0.5;ch.push('pillars: plastered');}
    out.push({S:{shape:sh,cover:S2.cover,wallOut:S2.wallOut,wallIn:S2.wallIn,sys:sy,finish:fn,pillarC:pc,pillarV:S2.pillarV},total:c.total,score:score,changes:ch,months:c.months});
  });});});});});});
  var ok=out.filter(function(o){return o.total<=target*1e5;}).sort(function(a,b){return a.score-b.score||b.total-a.total;});
  var pick=[],sig={};ok.forEach(function(o){if(pick.length>=(max||3)) return;var k=o.changes.slice().sort().join(';');if(sig[k]) return;sig[k]=1;pick.push(o);});
  var cheapest=out.reduce(function(a,b){return b.total<a.total?b:a;},out[0]);
  return {plans:pick,cheapest:cheapest,area:pl.area};
}
function renderBudget(pl,r){
  var el=$('budget');if(!el) return;var t=ST.budget,under=r.total<=t*1e5;
  el.innerHTML='<div class="bud-row"><label for="budIn">Budget</label><span class="bud-in">₹<input id="budIn" type="number" min="1" max="500" step="0.5" value="'+t+'"> lakh</span><span class="bud-st '+(under?'ok':'over')+'">'+(under?'Under budget by '+lakh(t*1e5-r.total).replace('₹ ','₹'):'Over budget by '+lakh(r.total-t*1e5).replace('₹ ','₹'))+'</span></div>'+
    '<div class="bud-row"><button class="b pri" type="button" id="budFit">Fit my budget</button><button class="b" type="button" data-a="800">800 sq ft under ₹20 lakh</button><button class="b" type="button" data-a="1100">1,100 sq ft under ₹20 lakh</button></div><div id="budOut"></div>';
  $('budIn').addEventListener('change',function(){ST.budget=+this.value||20;update(true);});
  $('budFit').addEventListener('click',function(){showBudgetPlans();});
  Array.prototype.forEach.call(el.querySelectorAll('button[data-a]'),function(b){b.addEventListener('click',function(){ST.area=+b.getAttribute('data-a');ST.budget=20;var res=budgetPlans(ST,20,1);if(res.plans.length){Object.assign(ST,res.plans[0].S);update();setTimeout(function(){showBudgetPlans('Applied the plan with the fewest changes for '+num(+b.getAttribute('data-a'))+' sq ft.');},60);}else{update();setTimeout(function(){showBudgetPlans();},60);}});});
}
function showBudgetPlans(msg){
  var res=budgetPlans(ST,ST.budget,3),o=$('budOut');if(!o) return;
  if(!res.plans.length){o.innerHTML='<p class="hint bud-none">Even the leanest choices come to '+lakh(res.cheapest.total)+' at this size and location. Try a smaller footprint, a narrower pathway, fewer rooms, or the village or small town rate.</p>';return;}
  o.innerHTML=(msg?'<p class="hint">'+msg+'</p>':'')+res.plans.map(function(p,i){return '<div class="bud-plan"><div><b>'+lakh(p.total)+'</b> <span class="hint">'+p.months.toFixed(1)+' months</span><br><span class="hint">'+(p.changes.length?p.changes.join(', '):'No changes needed')+'</span></div><button class="b" type="button" data-i="'+i+'">Apply</button></div>';}).join('')+'<p class="hint">Plans are ranked by how little they change your choices. Gypsum or WPC partitions and AAC blocks keep the look of the house; metal sheet roofs are cheapest but hotter, so add insulation under them.</p>';
  Array.prototype.forEach.call(o.querySelectorAll('button[data-i]'),function(b){b.addEventListener('click',function(){Object.assign(ST,res.plans[+b.getAttribute('data-i')].S);update();});});
}

/* ---------- materials card ---------- */
function renderMaterials(pl,r){
  var el=$('matCard');if(!el) return;var M=r.mat||materialsFor(pl,ST,ST.sys),dry=ST.wallIn==='gyp'||ST.wallIn==='wpc',sel=function(id,opts,val){return '<select id="'+id+'" class="mat-in">'+opts.map(function(o){return '<option value="'+o[0]+'"'+(String(o[0])===String(val)?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select>';};
  var h='<div class="mat-set"><label>Clay brick size '+sel('matBrick',BRICKS.filter(function(b){return b.v!=='fly';}).map(function(b){return [b.v,b.n];}),ST.brick)+'</label>';
  if(dry){h+='<label>MS square tube '+sel('matTube',MS_TUBES.map(function(t){return [t.v,t.a+' × '+t.a+' mm, '+t.t.toFixed(1)+' mm thick'];}),ST.tube)+'</label><label>Stud spacing '+sel('matSp',[[400,'400 mm (16 in)'],[600,'600 mm (24 in)']],ST.studSp)+'</label>';if(ST.wallIn==='wpc') h+='<label>WPC board '+sel('matWpc',WPC_T.map(function(t){return [t,t+' mm thick'];}),ST.wpcT)+'</label>';}
  h+='</div><table class="mat-tab"><tr><th>Material</th><th>Quantity</th><th>Unit</th><th>Notes</th></tr>'+M.rows.map(function(x){return '<tr><td>'+esc(x[0])+'</td><td class="num">'+(typeof x[1]==='number'?num(x[1]):esc(x[1]))+'</td><td>'+esc(x[2])+'</td><td class="hint">'+esc(x[3])+'</td></tr>';}).join('')+'</table>';
  if(dry) h+='<p class="hint">Frame: studs at '+ST.studSp+' mm centres between a floor track and a top track, noggins every 1.2 m of height, every joint welded. Leave gaps in the frame for door frames and box it with extra studs either side. Screw boards about every 250 mm, staggering joints on the two faces.</p>';
  h+='<p class="hint">Quantities come from the model\'s wall areas and lengths. Openings are not subtracted, which roughly covers cutting waste; confirm with your contractor.</p>';
  el.innerHTML=h;
  [['matBrick','brick'],['matTube','tube'],['matSp','studSp'],['matWpc','wpcT']].forEach(function(p){var s2=$(p[0]);if(s2) s2.addEventListener('change',function(){ST[p[1]]=p[1]==='studSp'||p[1]==='wpcT'?+this.value:this.value;update(true);});});
}
