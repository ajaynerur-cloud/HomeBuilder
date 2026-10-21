/* ---------- soil, DIY build plan, optimised area, sheet S-4 ---------- */
var SOILS=[
  {v:'medium',n:'Medium soil, red or brown (not black)',sbc:150,dig:1.2,cush:0},
  {v:'hard',n:'Hard murum or gravel',sbc:250,dig:1.0,cush:0},
  {v:'soft',n:'Soft clay or loose sand',sbc:100,dig:1.5,cush:0},
  {v:'bc',n:'Black cotton (expanding) soil',sbc:100,dig:1.5,cush:0.6}
];
function soilInfo(v){return SOILS.filter(function(z){return z.v===v;})[0]||SOILS[0];}
function mft(m){return ft(m/0.3048);}
function m2(v){return (Math.round(v*100)/100).toFixed(2);}
var PLATES={
  'SHS 100×100×4':{p:250,t:12,bolt:'4 × M16 × 400',b:16},
  'SHS 125×125×5':{p:300,t:16,bolt:'4 × M20 × 450',b:20},
  'SHS 150×150×6':{p:350,t:20,bolt:'4 × M20 × 500',b:20},
  'ISMB 200':{p:400,t:20,bolt:'4 × M24 × 500',b:24}
};
function secW(sec){var m=sec.match(/(\d+)×(\d+)/);return m?+m[1]:200;}
function diyPlan(pl,S,sys,soilKey,sbc){
  var st=structure(pl,S,sys,sbc),so=soilInfo(soilKey),F2=0.0929,q=quant(pl,S);
  var dig=so.dig,cush=so.cush,exc=dig+cush,pcc=0.10,PED_TOP=0.30,FFL=Math.round(pl.plinth*0.3048*100)/100;
  var d={st:st,so:so,sbc:sbc,sys:sys,dig:dig,cush:cush,exc:exc,pcc:pcc,pedTop:PED_TOP,ffl:FFL,groups:[],strip:null};
  var excV=0,pccV=0,ftV=0,pedV=0,i;
  if(sys==='brick'){
    var sp=st.strip,wl=st.wallLenFt*0.3048;
    d.strip={outMm:sp.outMm,inMm:sp.inMm,steps:3};
    var trench=(wl*(Math.max(sp.outMm,sp.inMm)/1000+0.3))*exc;
    excV=trench;pccV=wl*(sp.outMm/1000)*0.15;ftV=0;pedV=wl*0.23*0.15;
  }else{
    st.foot.forEach(function(f){
      var fs=f.fs/1000,fd=f.fd/1000,cols=st.cols.filter(function(c){return c.fmark===f.mark;});
      var secMax=0,secName='';
      cols.forEach(function(c){var w=sys==='ms'?(PLATES[c.sec]?PLATES[c.sec].p:300):230;if(w>=secMax){secMax=w;secName=c.sec;}});
      var plate=sys==='ms'?(PLATES[secName]||PLATES['SHS 125×125×5']):null;
      var ped=sys==='ms'?Math.max(350,Math.ceil((plate.p+100)/50)*50):230;
      var topF=dig-pcc-fd,pedH=topF+PED_TOP;
      var g={mark:f.mark,qty:f.qty,fs:f.fs,fd:f.fd,pit:f.fs+400,sec:secName,plate:plate,ped:ped,pedH:pedH,topF:topF,
        excEach:(f.fs/1000+0.4)*(f.fs/1000+0.4)*exc,bars:f.bars};
      d.groups.push(g);
      excV+=g.excEach*f.qty;pccV+=f.qty*(fs+0.2)*(fs+0.2)*pcc;ftV+=f.qty*fs*fs*fd;
      pedV+=sys==='ms'?f.qty*(ped/1000)*(ped/1000)*pedH:0;
    });
    pedV+=0;
  }
  var beamV=st.wallLenFt*0.3048*0.23*0.30;
  var fcon=ftV+pedV+beamV;
  var brickM3=(q.A.out+q.A.ct+(sys==='brick'?q.A.in:0))*F2*0.23+(sys==='brick'?0:q.A.in*F2*0.115);
  var mortarBrick=brickM3*0.30,platM3=2*(q.A.out+q.A.ct+q.A.in)*F2*0.012;
  var cost=costFor(pl,S,sys,S.finish,S.region);
  var peri=(2*(pl.W+pl.D)+(pl.jag?pl.edgeLen:0))*0.3048,plinthBricks=Math.round(peri*Math.max(0,FFL-0.30)*0.23*500*1.05);
  d.plinthBricks=plinthBricks;
  d.mat={exc:excV,pcc:pccV,fcon:fcon,ftV:ftV,pedV:pedV,beamV:beamV,
    cementFound:fcon*8+pccV*3.4,sandFound:fcon*0.42+pccV*0.47,aggFound:fcon*0.84+pccV*0.94,
    rebar:ftV*70+pedV*150+beamV*130,
    cementWall:mortarBrick*5.5+platM3*7.3,sandWall:mortarBrick*1.09+platM3*1.02,
    bricks:cost.bricks+plinthBricks,msKg:st.steelKg,brickM3:brickM3};
  d.mat.cementTotal=d.mat.cementFound+d.mat.cementWall;
  return d;
}
function diySteps(d,pl,S){
  var g=d.groups[d.groups.length-1],n=d.st.cols.length,sys=d.sys,steps=[];
  var pit=g?(g.pit/1000).toFixed(1)+' m':'';
  steps.push('Before you dig: get a soil test, or dig one trial pit to '+m2(d.exc+0.3)+' m ('+mft(d.exc+0.3)+') and look for firm soil and water. Check local building rules, and have a structural engineer confirm the sizes.');
  steps.push('Set out the house with pegs and string. Check every corner with the 3-4-5 rule and equal diagonals. Mark each '+(sys==='brick'?'wall line':'column centre')+' from sheet S-1. Fix one permanent level mark: ground level 0.00, floor level +'+m2(d.ffl)+' m ('+mft(d.ffl)+').');
  if(sys==='brick'){
    steps.push('Dig trenches '+((Math.max(d.strip.outMm,d.strip.inMm)/1000)+0.3).toFixed(2)+' m wide and '+m2(d.exc)+' m ('+mft(d.exc)+') deep under all walls. Keep spoil at least 1 m from the edge.');
    steps.push('Ram the bottom flat. Pour 150 mm PCC 1:4:8, then build three brick steps in cement mortar 1:6 up to plinth level +0.30 m, with a damp-proof course on top.');
  }else{
    steps.push('Dig '+n+' pits, one per column. Each pit is the footing size plus 0.4 m, for example '+pit+' square, and '+m2(d.exc)+' m ('+mft(d.exc)+') deep below ground. In loose soil slope the sides or support them with planks, and never stand in a deep pit alone.');
    if(d.cush>0) steps.push('Black cotton soil: lay a '+d.cush.toFixed(1)+' m sand cushion in 150 mm layers, watered and rammed, before anything else. Ask an engineer about under-reamed piles instead.');
    steps.push('Ram the bottom flat and level. Pour 100 mm PCC 1:4:8 about 100 mm wider than the footing on each side. Check levels with a water level.');
    steps.push('Place the footing steel on 50 mm cover blocks, one grid of bars each way (see schedule). '+(sys==='ms'?'Add the pedestal cage (4-12φ bars with 8φ rings at 150 mm) and the shuttering for the pedestal, then bolt a drilled plywood template to the top so the four anchor bolts hang at the exact plate positions. Pour the footing and pedestal in M20 concrete, finishing the pedestal top at +'+m2(d.pedTop)+' m ('+mft(d.pedTop)+') above ground.':'Add the column starter bars (4-12φ) with a 600 mm lap. Pour the footing in M20 concrete.'));
    steps.push('Keep the concrete wet for at least 7 days (14 is better). Remove pedestal shuttering after 2 to 3 days. Then backfill around the pedestals in 150 mm layers, rammed.');
  }
  steps.push('Cast the plinth beam 230 × 300 between '+(sys==='brick'?'the walls':'the pedestals')+' with its top at +0.30 m ('+mft(0.30)+'). Use 4-12φ bars and 8φ rings at 150 mm, M20 concrete, on a levelled bed with plastic sheet underneath. Treat the soil with anti-termite chemical before the floor fill.');
  if(d.ffl>0.5) steps.push('Because the floor is '+m2(d.ffl)+' m ('+mft(d.ffl)+') above ground, build a 9 inch brick plinth wall from the plinth beam up to about '+m2(d.ffl-0.10)+' m all round'+(pl.jag?', and along the front and sides of the jagali':'')+'. Face it with stone or plaster and finish the top with coping stone.');
  if(pl.jag){var nR=Math.max(2,Math.ceil(pl.plinth/0.55));steps.push('Jagali: fill the platform with rammed murum or sand in 150 mm layers, lay 75 mm PCC, then the red oxide or stone floor. Build '+(nR-1)+' steps at the door, each about '+Math.round(pl.plinth*304.8/nR)+' mm high and 300 mm deep. Set the timber pillars on stone bases bolted down with steel dowels'+(pl.jag.ledges?', and build the seating ledges 450 mm high with stone tops':'')+'.');}
  if(pl.split){
    var wl=pl.segs.filter(function(g){return g.kind==='wing'||g.kind==='low';})[0],rs=pl.split.steps;
    steps.push('Steps to the door: build '+rs+' steps, each about '+Math.round(pl.plinth*304.8/rs)+' mm high and 300 mm deep, straight from the ground to the door sill, with a paved ground-level strip in front. Raise the jagali on both sides of the steps to '+m2((wl?wl.h:1)*0.3048)+' m ('+ft(wl?wl.h:1)+') and face the kerbs on both sides of the steps in brick, stone or plaster. '+(pl.split.all?'Do the same at each side exit.':'The side and back platforms stay at the same lower height.')+' Fill each level to its own height before laying the floor.');
  }
  if(sys==='ms'){
    steps.push('Order the steel. Cut each column to length, weld the base plate all round (6 mm fillet) and the cap plate, and brush off the slag. Give two coats of red oxide primer before leaving the workshop. Use a welder with a proper track record.');
    steps.push('Erect the columns on a 30 mm bed of non-shrink grout over the plate. Keep each column plumb with two temporary braces, tighten the nuts after 3 days of grout curing, and weld the roof beams and cleats. Never leave an unbraced frame standing overnight.');
  }
  steps.push('Build the brick walls: 9 inch outside and around the courtyard, 4.5 inch inside, in cement mortar 1:6, with first-class bricks soaked beforehand. '+(sys==='brick'?'Add the RCC bands at lintel and roof level.':'Tie each wall to the columns with 6φ bars at 450 mm spacing, welded to the column and laid into the mortar joints.')+' Add RCC lintels over every opening wider than 4 ft.');
  steps.push('Make the roof: '+d.st.roofNote+'. Check every joint and fix the cover only after the frame is inspected.');
  steps.push('Fill inside the plinth with clean earth in 150 mm layers rammed, put 75 mm PCC and the floor finish so the finished floor sits at +'+m2(d.ffl)+' m ('+mft(d.ffl)+') above ground. Seal around the base plates.');
  steps.push('Plaster 12 mm inside and 15 mm outside, install electrical and plumbing, and finish. Cure plaster for 7 days.');
  return steps;
}
function sheetBase(pl,S,sys,sbc,proj){
  var d=diyPlan(pl,S,sys,S.soil,sbc),s='',SC=58,cx=92,gy=24+1.25*SC;
  function Y(m){return gy-m*SC;}
  var g=d.groups.length?d.groups[d.groups.length-1]:null;
  var fsM=g?g.fs/1000:d.strip.outMm/1000,fdM=g?g.fd/1000:0.15,pedM=g?g.ped/1000:0.23;
  var topF=d.dig-d.pcc-fdM;
  // earth line, excavation
  s+=LN(cx-80,Y(0),cx+80,Y(0),0.6)+TX(cx-80,Y(0)-1.2,'NATURAL GROUND LEVEL  \u00B10.00',2.2,'start',700);
  var pitW=(fsM+0.4)*SC;
  s+=RC(cx-pitW/2,Y(0),pitW,d.exc*SC,'#f5efe6','#777',0.3,'2 1.2');
  if(d.cush>0) s+=RC(cx-pitW/2,Y(-d.dig),pitW,d.cush*SC,'#eadfc2','#777',0.25)+TX(cx+pitW/2+1.5,Y(-d.dig-d.cush/2)+0.8,'sand cushion '+d.cush.toFixed(1)+' m',2,'start');
  // PCC and footing
  var pccW=(fsM+0.2)*SC;
  s+=RC(cx-pccW/2,Y(-(d.dig-d.pcc)),pccW,d.pcc*SC,'#ddd','#111',0.4);
  if(sys==='brick'){
    var sw=fsM*SC,stepH=0.15;
    s+=RC(cx-sw/2,Y(-(d.dig-0.15)),sw,0.15*SC,'#ddd','#111',0.4);
    var base=-(d.dig-0.15),w2=[fsM-0.14,fsM-0.28,0.23];
    for(var k=0;k<3;k++){var ww=Math.max(0.23,w2[k])*SC;s+=RC(cx-ww/2,Y(base+stepH*(k+1)),ww,stepH*SC,'#e9c9b5','#111',0.35);}
    var topStep=base+stepH*3;
    s+=RC(cx-0.115*SC,Y(0.15),0.23*SC,(0.15-topStep)*SC,'#e9c9b5','#111',0.35);
    s+=RC(cx-0.115*SC,Y(0.30),0.23*SC,0.15*SC,'#bbb','#111',0.4)+TX(cx+0.115*SC+2,Y(0.22)+0.8,'plinth band 230 × 150',2,'start');
    s+=LN(cx-0.2*SC,Y(0.15)-0.2,cx+0.2*SC,Y(0.15)-0.2,0.8,'#111');
    s+=RC(cx-0.115*SC,Y(1.2),0.23*SC,(1.2-0.30)*SC,'#e9c9b5','#111',0.35)+TX(cx+0.115*SC+2,Y(0.8),'9\u2033 brick wall',2,'start');
    s+=TX(cx-pitW/2-2,Y(-(d.dig-0.07))+0.8,'PCC 1:4:8, 150 mm',2,'end');
    s+=TX(cx-sw/2-2,Y(-(d.dig-0.3))+0.8,'brick footing steps',2,'end');
  }else{
    var fw=fsM*SC;
    s+=RC(cx-fw/2,Y(-topF),fw,fdM*SC,'#e8e8e2','#111',0.5);
    s+=LN(cx-fw/2+2.5,Y(-(topF+fdM))-0.3,cx+fw/2-2.5,Y(-(topF+fdM))-0.3,0.7,'#111');
    var by=Y(-(topF+fdM))-0.3;for(var b2=0;b2<6;b2++) s+='<circle cx="'+r2(cx-fw/2+4+(fw-8)*b2/5)+'" cy="'+r2(by-1)+'" r="0.5" fill="#111"/>';
    s+=TX(cx-pitW/2-2,Y(-(d.dig-d.pcc/2))+0.8,'PCC 1:4:8, 100 mm',2,'end');
    s+=TX(cx-fw/2-2,Y(-(topF+fdM/2))+0.8,'footing '+g.fs+' × '+g.fs+' × '+g.fd+', M20',2,'end');
    var colW,pedTopY=Y(0.30);
    if(sys==='ms'){
      var pw=pedM*SC;
      s+=RC(cx-pw/2,pedTopY,pw,(topF+0.30)*SC,'#e8e8e2','#111',0.5);
      s+=LN(cx-pw/2+1.6,pedTopY+2,cx-pw/2+1.6,Y(-topF)-1,0.5,'#111','1.6 0.8')+LN(cx+pw/2-1.6,pedTopY+2,cx+pw/2-1.6,Y(-topF)-1,0.5,'#111','1.6 0.8');
      s+=TX(cx-pw/2-2,Y(-topF/2+0.1)+0.8,'pedestal '+g.ped+' × '+g.ped+' RCC',2,'end');
      var pl2=g.plate,plW=pl2.p/1000*SC;
      s+=RC(cx-plW/2,Y(0.30)-0.03*SC,plW,0.03*SC,'#cfcfcf','#555',0.25);
      s+=RC(cx-plW/2,Y(0.30)-0.03*SC-Math.max(1.1,pl2.t/1000*SC),plW,Math.max(1.1,pl2.t/1000*SC),'#8fa0b5','#111',0.4);
      var bx=plW/2-1.2;
      [-1,1].forEach(function(sd){
        s+=LN(cx+sd*bx,Y(0.30)-0.03*SC-3,cx+sd*bx,Y(0.30-0.45)+0,0.9,'#111');
        s+=RC(cx+sd*bx-1.2,Y(0.30)-0.03*SC-Math.max(1.1,pl2.t/1000*SC)-1.1,2.4,1.1,'#555','#111',0.2);
      });
      colW=secW(g.sec)/1000*SC;
      s+=RC(cx-colW/2,Y(1.25),colW,Y(0.30)-0.03*SC-Math.max(1.1,pl2.t/1000*SC)-Y(1.25),'#cfd8e3','#111',0.5);
      s+=LN(cx-colW/2-2,Y(1.25)+3,cx+colW/2+2,Y(1.25)-1,0.4);
      s+=TX(cx+colW/2+3,Y(0.9),g.sec+' column',2.1,'start',700);
      s+=TX(cx+plW/2+3,Y(0.30)-0.03*SC-1.2,'base plate '+pl2.p+' × '+pl2.p+' × '+pl2.t,2,'start');
      s+=TX(cx+plW/2+3,Y(0.30)+2.2,'anchor bolts '+pl2.bolt,2,'start');
      s+=TX(cx+plW/2+3,Y(0.30)-0.03*SC+0.2,'grout 30 mm',2,'start');
    }else{
      colW=0.23*SC;
      s+=RC(cx-colW/2,Y(1.25),colW,Y(-topF)-Y(1.25),'#e8e8e2','#111',0.5);
      s+=LN(cx-colW/2+1.1,Y(1.2),cx-colW/2+1.1,Y(-topF)-1,0.5,'#111','1.6 0.8')+LN(cx+colW/2-1.1,Y(1.2),cx+colW/2-1.1,Y(-topF)-1,0.5,'#111','1.6 0.8');
      s+=TX(cx+colW/2+3,Y(0.9),'RCC column 230 × 230, 4-12φ',2.1,'start',700);
      s+=TX(cx+colW/2+3,Y(-topF/2),'starter bars lapped 600',2,'start');
    }
    // plinth beam
    if(true){
      var bw=0.55*SC,bx0=cx+(sys==='ms'?pedM*SC/2:colW/2);
      s+=RC(bx0,Y(0.30),bw,0.30*SC,'#f1f1ea','#111',0.4,'1.2 0.8');
      s+=TX(bx0+1,Y(0.15)+0.8,'plinth beam 230 × 300',1.9,'start');
    }
  }
  // floor level
  s+=LN(cx-80,Y(d.ffl),cx+80,Y(d.ffl),0.35,'#111','4 1.5 1 1.5')+TX(cx+80,Y(d.ffl)-1.2,'FINISHED FLOOR LEVEL  +'+m2(d.ffl)+' m',2.2,'end',700);
  // dimensions on the left/right
  var dxr=cx+78;
  s+=dimV(Y(0),Y(-d.exc),dxr,8,m2(d.exc)+' m dig ('+mft(d.exc)+')',2.1);
  if(sys!=='brick'){
    s+=dimV(Y(0.30),Y(-topF),dxr,16,'pedestal '+m2(topF+0.30)+' m',2.1);
    s+=dimV(Y(0),Y(0.30),dxr,24,'0.30 m above ground',2.1);
  }
  s+=TX(cx,gy+d.exc*SC+9,sys==='ms'?'TYPICAL MS COLUMN BASE (NOT TO SCALE)':(sys==='rcc'?'TYPICAL RCC COLUMN FOOTING (NOT TO SCALE)':'TYPICAL STRIP FOOTING (NOT TO SCALE)'),2.8,'middle',700);
  // right tables
  var tx=214,ty=22,rows,t;
  var L=[['Natural ground level','0.00',''],['Finished floor level','+'+m2(d.ffl),mft(d.ffl)]];
  L=[['Natural ground level (NGL)','0.00','0\u2032-0\u2033'],['Finished floor level','+'+m2(d.ffl),mft(d.ffl)],['Top of plinth beam'+(sys==='ms'?' and pedestal':''),'+0.30',mft(0.30)]];
  if(sys!=='brick') L.push(['Top of footing','\u2212'+m2(topF),'\u2212'+mft(topF)]);
  L.push(['Bottom of PCC','\u2212'+m2(d.dig),'\u2212'+mft(d.dig)]);
  if(d.cush>0) L.push(['Bottom of sand cushion','\u2212'+m2(d.exc),'\u2212'+mft(d.exc)]);
  else L.push(['Bottom of dig','\u2212'+m2(d.exc),'\u2212'+mft(d.exc)]);
  t=table(tx,ty+4,[{w:86,h:'Level'},{w:26,h:'m'},{w:34,h:'ft-in'}],L,4.4,2.2,true);
  s+=TX(tx,ty,'LEVELS (RELATIVE TO GROUND)',3,'start',700)+t.svg;
  var y=ty+4+t.h+7;
  if(sys==='brick'){
    rows=[['Outer and courtyard walls',d.strip.outMm+' wide','150 PCC + 3 steps'],['Inner walls',d.strip.inMm+' wide','150 PCC + 3 steps']];
    t=table(tx,y+4,[{w:56,h:'Strip footing'},{w:36,h:'Width, mm'},{w:54,h:'Build-up'}],rows,4.6,2.1,true);
  }else{
    rows=d.groups.map(function(q){return [q.mark,q.qty,q.fs+' × '+q.fs+' × '+q.fd,(q.pit/1000).toFixed(1)+' m',m2(q.excEach*q.qty)+' m\u00B3'];});
    t=table(tx,y+4,[{w:12,h:'Mark'},{w:10,h:'Qty'},{w:42,h:'Footing, mm'},{w:38,h:'Pit size'},{w:44,h:'Soil to dig'}],rows,4.6,2.1,true);
  }
  s+=TX(tx,y,sys==='brick'?'STRIP FOOTINGS':'PITS AND FOOTINGS',3,'start',700)+t.svg;
  y+=4+t.h+7;
  if(sys==='ms'){
    rows=d.groups.map(function(q){return [q.mark,q.sec,q.plate.p+' × '+q.plate.p+' × '+q.plate.t,q.plate.bolt,q.ped+' sq, '+m2(q.pedH)+' m high'];});
    t=table(tx,y+4,[{w:11,h:'Mark'},{w:30,h:'Column'},{w:34,h:'Base plate'},{w:30,h:'Anchor bolts'},{w:41,h:'Pedestal'}],rows,4.6,1.9,true);
    s+=TX(tx,y,'MS COLUMN BASES',3,'start',700)+t.svg;y+=4+t.h+7;
  }
  var mt=d.mat;
  rows=[['Soil to dig',m2(mt.exc)+' m\u00B3'],['Foundation concrete M20 + PCC',m2(mt.fcon+mt.pcc)+' m\u00B3'],['Cement, all work',Math.round(mt.cementTotal)+' bags (50 kg)'],['Sand, all work',m2(mt.sandFound+mt.sandWall)+' m\u00B3'],['Stone aggregate, foundation',m2(mt.aggFound)+' m\u00B3'],['Rebar, foundation',num(mt.rebar)+' kg'],['Bricks',num(mt.bricks)],['Structural steel',num(mt.msKg)+' kg']];
  t=table(tx,y+4,[{w:86,h:'Item'},{w:60,h:'Approx. quantity'}],rows,4.2,2.0,true);
  s+=TX(tx,y,'MATERIALS (+/- 20%)',3,'start',700)+t.svg;
  y+=4+t.h+6;
  var nb=notesBlock(tx,y,'NOTES',['Dig to firm soil. If you find soft soil, water or fill at this depth, go deeper or ask an engineer.','Cure concrete 7 days minimum. Do not erect steel or load the foundation sooner.','Assumed soil bearing '+sbc+' kN/m\u00B2: '+d.so.n+'.'],2.0,3.0);
  s+=nb.svg;
  return sheetFrame('S-4','FOUNDATION AND COLUMN BASE DETAIL','NTS',s,proj);
}

/* optimised area suggestion */
var sugCache={};
function suggestFor(S){
  var cfg0=normCfg(Object.assign({},S,{custom:null}));
  var key=[cfg0.beds,cfg0.att,cfg0.pooja?1:0,cfg0.store?1:0,cfg0.k,cfg0.cy,cfg0.exits.s?1:0,cfg0.exits.w?1:0,cfg0.backOff].join('_');
  if(sugCache[key]) return sugCache[key];
  var base={beds:cfg0.beds,att:cfg0.att,pooja:cfg0.pooja,store:cfg0.store,k:cfg0.k,cy:cfg0.cy,exits:cfg0.exits,backOff:cfg0.backOff},best=null,bestScore=1e9,a;
  var start=Math.max(500,Math.floor((minAreaFor(Object.assign({area:800},base))-150)/25)*25);
  for(a=start;a<=1600;a+=25){
    var pl=buildPlan(Object.assign({area:a},base));
    var small=0,tight=0;
    pl.sched.forEach(function(r){if(r.fit==='small') small++;else if(r.fit==='tight') tight++;});
    var sc=small*4+tight+(pl.dropped?6:0)+(pl.eff<0.74?(0.74-pl.eff)*20:0);
    if(sc<bestScore-1e-9){bestScore=sc;best={area:pl.area,cfgArea:a,builtup:pl.builtup,W:pl.W,D:pl.D,court:pl.court,eff:pl.eff,small:small,tight:tight,dropped:pl.dropped};}
    if(small===0&&tight<=1&&!pl.dropped&&pl.eff>=0.74){best={area:pl.area,cfgArea:a,builtup:pl.builtup,W:pl.W,D:pl.D,court:pl.court,eff:pl.eff,small:small,tight:tight,dropped:false};break;}
  }
  sugCache[key]=best;
  return best;
}

