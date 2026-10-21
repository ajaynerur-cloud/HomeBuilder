/* ---------- Claude API (bring your own key) ---------- */
var AI={key:'',model:'claude-sonnet-5-5'};
try{AI.key=localStorage.getItem('chp_key')||'';AI.model=localStorage.getItem('chp_model')||AI.model;}catch(e){}
function aiSync(){
  $('aiKey').value=AI.key;$('aiModel').value=AI.model;
  $('aiState').textContent=AI.key?('Key saved on this device, model '+AI.model+'.'):'No key saved yet.';
}
$('aiSave').addEventListener('click',function(){
  AI.key=$('aiKey').value.trim();AI.model=$('aiModel').value;
  try{localStorage.setItem('chp_key',AI.key);localStorage.setItem('chp_model',AI.model);}catch(e){}
  aiSync();
});
$('aiClear').addEventListener('click',function(){
  AI.key='';try{localStorage.removeItem('chp_key');}catch(e){}aiSync();
});
function zoneOf(r,pl){
  var dx=(r.x+r.w/2)-pl.W/2,dy=(r.y+r.h/2)-pl.D/2,sx=pl.W/6,sy=pl.D/6,ew=dx<-sx?'W':(dx>sx?'E':''),ns=dy<-sy?'N':(dy>sy?'S':'');
  return (ns+ew)||'centre';
}
function describeDesign(){
  var pl=planFor(ST),sb=sbcVal(),st=structure(pl,ST,ST.sys,sb),c=costFor(pl,ST,ST.sys,ST.finish,ST.region);
  return {
    footprint_ft:pl.W+' x '+pl.D,area_sqft:pl.area,courtyard_ft:pl.court.w+' x '+pl.court.h,corridor_ft:pl.corr?pl.k:0,courtyard_size_choice:ST.cy,veranda_ft:pl.W+' x '+pl.vd,
    north_is_up:true,main_entrance:'north wall, near the north-east end',
    rooms:pl.rooms.filter(function(r){return !r.hidden&&r.id&&r.t!=='pass';}).map(function(r){return {name:r.n,size_ft:r.w+' x '+r.h,area_sqft:rArea(r),zone:zoneOf(r,pl),vastu:vastuOf(r,pl.W,pl.D).status};}),
    jagali:ST.jag.on?{platform_height_ft:ST.jag.h,depth_ft:ST.jag.d,seating_ledges:ST.jag.ledges,sides:ST.jag.sides,split:ST.jag.split.on?ST.jag.split:null}:null,
    pillars:{courtyard:ST.pillarC,veranda:ST.pillarV},
    services:{plumbing_lines:!!ST.svc.plumb,electrical_lines:!!ST.svc.elec,septic_and_water_tanks:!!ST.svc.tanks,people:svcOn(ST)?servicesData(planFor(ST),ST).users:null,septic_side:ST.sept},
    edits:ST.edits&&ST.edits.key===planBase(ST).key?{operations:ST.edits.ops.length,notes:designChecks(planFor(ST),ST).map(function(c){return c.msg;}).slice(0,8)}:null,
    exits:{back_south:!!ST.exits.s,east_side:!!ST.exits.e,west_side:!!ST.exits.w,back_door_shift_ft:pl.sight?Math.round(pl.sight.offset*10)/10:null,doors_see_each_other:pl.sight?pl.sight.visible:null},
    roof:{shape:ST.shape,cover:ST.shape==='flat'?'RCC slab':ST.cover,pitch_deg:ST.shape==='flat'?0:pitchEff(planFor(ST),ST),overhang_ft:ST.over,rise_limit_ft:ST.rise},
    structure:{system:ST.sys,assumed_sbc_kN_m2:sb,columns:st.cols.length,max_span_ft:st.maxSpan||null,footing_sizes_mm:st.foot.map(function(f){return f.fs+' x '+f.fs+' x '+f.fd+' (x'+f.qty+')';}),
      column_sections:st.colSec.map(function(c){return c.sec+' (x'+c.qty+', max '+Math.round(c.P)+' kN)';}),strip_footing_mm:st.strip?[st.strip.outMm,st.strip.inMm]:null,
      beams:st.beams,roof_structure:st.roofNote,total_load_kN:Math.round(st.total),concrete_m3:st.concreteM3,steel_kg:st.steelKg},
    cost_inr:{total:Math.round(c.total),per_sqft:Math.round(c.perSqft),months:Math.round(c.months*10)/10}
  };
}
function claudeCall(system,user,maxTokens){
  if(!AI.key) return Promise.reject(new Error('Add your Anthropic API key under API settings first.'));
  var body={model:AI.model,max_tokens:maxTokens||1400,system:system,messages:[{role:'user',content:user}]};
  var p;
  if(window.native&&window.native.claude){
    p=window.native.claude(AI.key,body);
  }else{
    p=fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':AI.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify(body)})
      .then(function(r){return r.text().then(function(t){return {status:r.status,text:t};});});
  }
  return p.then(function(res){
    var j;try{j=JSON.parse(res.text);}catch(e){throw new Error('Unexpected reply from the API (status '+res.status+').');}
    if(res.status!==200) throw new Error((j&&j.error&&j.error.message)||('API error '+res.status));
    return (j.content||[]).filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join('\n');
  });
}
var SYS_PROMPT='You are a careful assistant to an Indian residential architect and structural engineer. You receive JSON describing a PRELIMINARY single-storey courtyard house (north is up, sizes in feet). Be specific and brief. Use plain text with short numbered lists, no markdown tables. Flag real risks, never say the design is code-compliant or safe to build, and always say a licensed architect and structural engineer must verify and stamp it. Do not invent data that is not in the JSON.';
function aiRun(kind){
  var out=$('aiOut'),st=$('aiStatus');
  var task={
    design:'Review this layout. Cover: Vastu zoning of each room, circulation and privacy, light and ventilation, courtyard and corridor proportions, room sizes that look tight or generous, and 5 concrete improvements.',
    struct:'Review the preliminary structure. Cover: load path, column spacing and footing sizes against the assumed bearing capacity, roof framing for the chosen roof shape and cover, anything missing for wind, seismic, termite and damp protection, and a checklist of questions to take to the structural engineer.',
    note:'Draft a one-page covering note for a municipal building plan approval: project summary, areas, number of rooms, structural system, roof, and the list of attached drawings (A-1 floor plan, A-2 elevations, A-3 roof plan, S-1 foundation plan, S-2 framing, S-3 schedules). Leave placeholders in square brackets for owner name, plot number, survey number and architect registration.'
  }[kind];
  var data=JSON.stringify(describeDesign());
  st.textContent='Asking Claude...';out.textContent='';
  ['aiDesign','aiStruct','aiNote'].forEach(function(id){$(id).disabled=true;});
  claudeCall(SYS_PROMPT,task+'\n\nDATA:\n'+data,1500).then(function(t){
    out.textContent=t;st.textContent='Done. This is an AI review of preliminary data, not an engineer\u2019s approval.';
  }).catch(function(e){
    var m=e.message||String(e);
    if(/fetch|network|load failed|blocked/i.test(m)) m='The network call was blocked. The AI review works in the installed Windows and Android apps and in a normal browser tab, but not inside this preview.';
    st.textContent=m;
  }).then(function(){['aiDesign','aiStruct','aiNote'].forEach(function(id){$(id).disabled=false;});});
}
$('aiDesign').addEventListener('click',function(){aiRun('design');});
$('aiStruct').addEventListener('click',function(){aiRun('struct');});
$('aiNote').addEventListener('click',function(){aiRun('note');});
aiSync();

var pending=false,pend3d=false;
function update(costOnly){
  if(!costOnly) pend3d=true;
  if(sheetsCache&&!drawStale){drawStale=true;$('drawStatus').textContent='Options changed. Generate the drawings again.';}
  clampState();save();syncControls();
  if(pending)return;
  pending=true;
  requestAnimationFrame(function(){
    pending=false;
    var pl=planFor(ST);
    if(EDIT.lastKey!==pl.key){EDIT.sel=null;EDIT.lastKey=pl.key;if(EDIT.reselect) edReselect(pl);}
    EDIT.reselect=null;
    if(pend3d){build3D();drawPlan(pl);pend3d=false;}
    edRender();
    renderCost();
    syncControls();
  });
}
function syncControls(){
  syncCustom();
  Array.prototype.forEach.call($('segExit').children,function(b){b.setAttribute('aria-pressed',String(!!ST.exits[b.getAttribute('data-k')]));});
  Array.prototype.forEach.call($('jagSides').children,function(b){b.setAttribute('aria-pressed',String(!!ST.jag.sides[b.getAttribute('data-k')]));});
  $('exitBox').style.display=ST.exits.s?'':'none';
  $('backOff').value=ST.backOff;$('backOffV').textContent=' '+(ST.backOff>0?'+':'')+f1(ST.backOff)+' ft';
  var jgOn=!!ST.jag.on;
  Array.prototype.forEach.call($('segJag').children,function(b){b.setAttribute('aria-pressed',String((b.getAttribute('data-v')==='1')===jgOn));});
  $('jagBox').style.display=jgOn?'':'none';$('jagH').value=String(ST.jag.h);
  if(document.activeElement!==$('jagD')) $('jagD').value=ST.jag.d;
  $('jagL').firstChild.setAttribute('aria-pressed',String(!!ST.jag.ledges));
  Array.prototype.forEach.call($('jagSplit').children,function(b){b.setAttribute('aria-pressed',String((b.getAttribute('data-v')==='1')===!!ST.jag.split.on));});
  Array.prototype.forEach.call($('splitScope').children,function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-v')===ST.jag.split.scope));});
  Array.prototype.forEach.call($('splitSteps').children,function(b){b.setAttribute('aria-pressed',String(+b.getAttribute('data-v')===ST.jag.split.steps));});
  $('splitBox').style.display=ST.jag.split.on?'grid':'none';$('splitH').value=String(ST.jag.split.h);
  var effH=Math.min(ST.jag.h,Math.round(ST.jag.split.steps*0.65*10)/10);
  $('splitNote').textContent='Door level is '+ft(effH)+' above the ground, so each of the '+ST.jag.split.steps+' steps is about '+Math.round(effH*12/ST.jag.split.steps)+' in high.'+(effH<ST.jag.h?' With '+ST.jag.split.steps+' steps the door level stays at '+ft(effH)+' or lower'+(ST.jag.split.steps===2?'. Choose 4 steps for a higher door level.':'.'):'')+' Front only keeps the side and back platforms at the lower height all along.';
  $('soil').value=ST.soil;if(document.activeElement!==$('sbc')) $('sbc').value=ST.sbc;
  segMark('segSize',ST.area);segMark('segBeds',ST.beds);segMark('segAtt',ST.att);segMark('segCorr',ST.corr);segMark('segCy',ST.cy);segMark('segShape',ST.shape);segMark('segSys',ST.sys);
  segMark('segPilC',ST.pillarC);segMark('segPilV',ST.pillarV);segMark('segSept',ST.sept);
  Array.prototype.forEach.call($('segSvc').children,function(b){b.setAttribute('aria-pressed',String(!!ST.svc[b.getAttribute('data-k')]));});
  var svOn=svcOn(ST);$('svcBox').style.display=svOn?'grid':'none';
  $('users').value=ST.users;$('usersV').textContent=ST.users?String(ST.users):'Auto';
  $('bXray').setAttribute('aria-pressed',String(!!ST.xray));$('bXray').textContent=ST.xray?'Solid walls':'See-through walls';
  if(svOn){var sv9=servicesData(planFor(ST),ST),T9=sv9.tanks;$('svcHint').textContent='For '+sv9.users+' people: septic tank '+T9.septic.w+' × '+T9.septic.h+' ft ('+num(T9.septic.cap)+' L), soak pit '+T9.soak.d+' ft, overhead tank '+num(T9.over.cap)+' L over the west bath block, sump '+num(T9.sump.cap)+' L in the north-east. Pipes are drawn at floor level and conduits at ceiling level.';}
  else $('svcHint').textContent='Show plumbing lines, electrical lines, and the septic and water tanks in the 3D model, plan, drawings and cost.';
  Array.prototype.forEach.call($('segAtt').children,function(b){b.disabled=(+b.getAttribute('data-v')>ST.beds)||(ST.wetOut&&+b.getAttribute('data-v')>0);b.title=ST.wetOut&&+b.getAttribute('data-v')>0?'Bath and WC are outside the house, so there are no attached baths.':'';});
  Array.prototype.forEach.call($('segExtra').children,function(b){var kk=b.getAttribute('data-k');b.setAttribute('aria-pressed',String(!!ST[kk]));});
  var wn=$('wetNote');if(!wn){wn=document.createElement('p');wn.id='wetNote';wn.className='hint';$('segExtra').parentNode.insertBefore(wn,$('segExtra').nextSibling);}var ohG=ST.wetOut?((planFor(ST).outhouse||{}).gap||6):6;wn.textContent=ST.wetOut?'The bath and WC are in a separate block '+ohG+' ft outside the house on the '+(facingOf()==='W'?'south':'west')+' side (Vastu: west, or south), reached from the wash and utility room. Attached baths are off, so nothing wet stays indoors.':'';
  Array.prototype.forEach.call($('segExtra').children,function(b){b.setAttribute('aria-pressed',String(!!ST[b.getAttribute('data-k')]));});
  var flat=ST.shape==='flat';
  $('area').value=ST.area;$('areaV').textContent=num(ST.area)+' sq ft';
  $('cover').value=ST.cover;$('cover').disabled=flat;
  $('pitch').value=ST.pitch;$('pitch').disabled=flat;$('pitchV').textContent=flat?'n/a':ST.pitch+'°';
  $('over').value=ST.over;$('overV').textContent=ST.over+' ft';
  $('rise').value=ST.rise;$('riseV').textContent=ST.rise+' ft';$('rise').disabled=flat;
  (function(){
    if(flat){$('riseHint').textContent='Not used for a flat roof.';return;}
    var pl9=planFor(ST),R9=mkRoof(pl9,ST),eff=R9.eff,t9=Math.round(R9.top*10)/10;
    $('riseHint').textContent='Tallest point of the roof: '+t9+' ft above the floor ('+(Math.round((t9-9)*10)/10)+' ft above a standard 9 ft eave). '+(eff<ST.pitch-0.05?'The pitch is held to '+eff+'° so the walls do not look like a second storey. Raise the limit for a steeper roof. ':'')+(eff<15?'Below 15° tiles can leak; consider sheet or an RCC tile slab. ':'');
  })();
  $('finish').value=String(ST.finish);$('region').value=String(ST.region);
  $('shapeHint').textContent=SHAPES.filter(function(s){return s.v===ST.shape;})[0].d;
  $('sysHint').textContent=SYSTEMS.filter(function(s){return s.v===ST.sys;})[0].d;
  segMark('segFace',ST.facing);var fF=facingOf(),dn=function(l){return DIRNAME[absDir(l,fF)];};
  $('faceHint').textContent=fF==='N'?'Entrance in the north: the classic Vastu choice. South entrances are not offered, as Vastu advises against them.':'Entrance in the '+DIRNAME[fF]+'. The plan is drawn with the entrance at the top, so check the north arrow. Rooms are placed for true directions: pooja north-east, kitchen south-east, master bedroom south-west.';
  var ex0=$('segExit').children;if(ex0.length>=3){ex0[0].textContent='Back exit ('+dn('S')+')';ex0[0].disabled=fF!=='N';ex0[0].title=fF!=='N'?'A back exit is available with a north entrance.':'';ex0[1].textContent=dn('E').charAt(0).toUpperCase()+dn('E').slice(1)+' side exit';ex0[2].textContent=dn('W').charAt(0).toUpperCase()+dn('W').slice(1)+' side exit';}
  var js0=$('jagSides').children;if(js0.length>=4){js0[0].textContent='Front ('+dn('N')+')';js0[1].textContent='Back ('+dn('S')+')';js0[2].textContent=dn('E').charAt(0).toUpperCase()+dn('E').slice(1)+' side';js0[3].textContent=dn('W').charAt(0).toUpperCase()+dn('W').slice(1)+' side';}
  if($('planNote')) $('planNote').textContent=(fF==='N'?'North is up. ':'The entrance ('+DIRNAME[fF]+') is at the top; the green arrow points north. ')+'Layout follows Vastu: entry in the '+DIRNAME[fF]+', pooja in the north-east, kitchen in the south-east, master bedroom in the south-west, open courtyard at the centre.';
  renderSpecs();
  segMark('segWallOut',ST.wallOut);segMark('segWallIn',ST.wallIn);
  Array.prototype.forEach.call($('segSys').children,function(b){var gB=b.getAttribute('data-v')==='brick'&&ST.wallOut==='glass';b.disabled=gB;b.title=gB?'Glass outer walls need a column frame (RCC or steel), so load-bearing brick is not available.':'';});
  var dryIn=ST.wallIn==='gyp'||ST.wallIn==='wpc';$('wallsHint').textContent=WALL_OUT.filter(function(w){return w.v===ST.wallOut;})[0].d+' Inside: '+WALL_IN.filter(function(w){return w.v===ST.wallIn;})[0].d+(dryIn&&ST.sys==='brick'?' With load-bearing brick, the dry partitions cannot carry the roof, so a steel truss over each one is added to the cost.':'');
}
function sizeHint(){
  var pl=planFor(ST);
  $('sizeHint').textContent=pl.W+' × '+pl.D+' ft footprint ('+num(pl.area)+' sq ft). Courtyard '+f1(pl.court.w)+' × '+f1(pl.court.h)+' ft'+(pl.corr?', with a '+pl.k+' ft walkway all around it.':', no walkway.')+(pl.grownFrom?' The footprint grew from '+num(pl.grownFrom)+' sq ft so the walkway and courtyard fit with usable rooms.':'');
  renderGrow(pl);
}
/* when the chosen size is below what the rooms, courtyard and walkway need, say so clearly and offer what would make it smaller */
var growT=null;
function renderGrow(pl){
  var tools=$('planTools');if(!tools) return;var host=$('growNote');
  if(!host){host=document.createElement('div');host.id='growNote';host.className='grow-note';tools.appendChild(host);}
  var grown=!!pl.grownFrom&&pl.area>ST.area+12;$('sizeHint').classList.toggle('grown',grown);
  if(!grown){host.style.display='none';host.innerHTML='';return;}
  host.style.display='';host.innerHTML='<b>'+num(ST.area)+' sq ft is too small for these rooms, this courtyard and this walkway,</b> so the plan stays at the smallest size that fits: '+num(pl.area)+' sq ft. <span id="growAlt" class="hint">Checking what would make it smaller…</span>';
  clearTimeout(growT);growT=setTimeout(function(){
    var el=$('growAlt');if(!el) return;var cur=planFor(ST),alts=[];
    if(ST.cy==='L') alts.push(['Medium courtyard',{cy:'M'}]);if(ST.cy!=='S') alts.push(['Small courtyard',{cy:'S'}]);
    if(ST.corr>3) alts.push(['3 ft walkway',{corr:3}]);if(ST.corr>0) alts.push(['No walkway',{corr:0}]);
    if(ST.store) alts.push(['Without the store room',{store:false}]);if(ST.beds>1) alts.push([(ST.beds-1)+' bedroom'+(ST.beds-1>1?'s':''),{beds:ST.beds-1,att:Math.min(ST.att,ST.beds-1)}]);
    var opts=[];alts.forEach(function(a){try{var p2=planFor(Object.assign({},ST,a[1]));if(p2.area<cur.area-10) opts.push({l:a[0],c:a[1],a:p2.area});}catch(e){}});
    if(!opts.length){el.textContent='These choices cannot get smaller. Try fewer rooms.';return;}
    el.innerHTML='Smaller options: '+opts.map(function(o,i){return '<button class="b sm" type="button" data-g="'+i+'">'+esc(o.l)+' → '+num(o.a)+' sq ft</button>';}).join(' ');
    Array.prototype.forEach.call(el.querySelectorAll('button[data-g]'),function(b){b.addEventListener('click',function(){Object.assign(ST,opts[+b.getAttribute('data-g')].c);update();});});
  },120);
}
var _renderCost=renderCost;
renderCost=function(){_renderCost();sizeHint();renderDIY();$('sightHint').textContent=sightText(planFor(ST));};
syncRates();
syncControls();
init3D();
update();
