/* ---------- DIY build guide ---------- */
function htmlTable(h,rows){return '<div class="tw"><table><tr>'+h.map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr>'+rows.map(function(r){return '<tr>'+r.map(function(c){return '<td>'+c+'</td>';}).join('')+'</tr>';}).join('')+'</table></div>';}
function renderDIY(){
  var pl=planFor(ST),sb=sbcVal(),d=diyPlan(pl,ST,'ms',ST.soil,sb),g=d.groups[d.groups.length-1],h='',mt=d.mat;
  var key=[
    ['Dig depth below ground',m2(d.exc)+' m ('+mft(d.exc)+')'+(d.cush>0?', including a '+d.cush.toFixed(1)+' m sand cushion':'')],
    ['Pit size, largest footing',(g.pit/1000).toFixed(1)+' m square ('+mft(g.pit/1000)+')'],
    ['Footing, largest',g.fs+' × '+g.fs+' × '+g.fd+' mm, M20 concrete, on 100 mm PCC'],
    ['Concrete pedestal, total height',m2(g.pedH)+' m ('+mft(g.pedH)+')'],
    ['Pedestal showing above ground','0.30 m ('+mft(0.30)+')'],
    ['Finished floor above ground','+'+m2(d.ffl)+' m ('+mft(d.ffl)+')'+(pl.jag?', raised for the jagali':'')],
    ['Steel columns',d.st.cols.length+' columns: '+d.st.colSec.map(function(c){return c.qty+' × '+c.sec;}).join(', ')]
  ];
  h+='<div class="diysec">The numbers you need</div>'+htmlTable(['Item','Value'],key);
  var L=[['Natural ground level (NGL)','0.00','0\u2032-0\u2033'],['Finished floor level','+'+m2(d.ffl),mft(d.ffl)],['Top of pedestal and plinth beam','+0.30',mft(0.30)],['Top of footing (largest)','\u2212'+m2(g.topF),'\u2212'+mft(g.topF)],['Bottom of PCC','\u2212'+m2(d.dig),'\u2212'+mft(d.dig)]];
  if(d.cush>0) L.push(['Bottom of sand cushion','\u2212'+m2(d.exc),'\u2212'+mft(d.exc)]);
  h+='<div class="diysec">Levels, measured from the ground</div>'+htmlTable(['Level','m','ft-in'],L);
  h+='<div class="diysec">Pits and footings</div>'+htmlTable(['Mark','Qty','Footing, mm','Pit size','Soil to dig'],d.groups.map(function(q){return [q.mark,q.qty,q.fs+' × '+q.fs+' × '+q.fd,(q.pit/1000).toFixed(1)+' m','\u2248 '+m2(q.excEach*q.qty)+' m\u00B3'];}));
  h+='<div class="diysec">Column bases</div>'+htmlTable(['Mark','Column','Base plate, mm','Anchor bolts','Pedestal'],d.groups.map(function(q){return [q.mark,q.sec,q.plate.p+' × '+q.plate.p+' × '+q.plate.t,q.plate.bolt,q.ped+' × '+q.ped+' mm, '+m2(q.pedH)+' m tall'];}));
  h+='<div class="diysec">Materials, rough totals (plus or minus 20%)</div>'+htmlTable(['Item','Quantity'],[
    ['Soil to dig',m2(mt.exc)+' m\u00B3'],['Foundation concrete M20 and PCC',m2(mt.fcon+mt.pcc)+' m\u00B3'],['Cement, all work',num(mt.cementTotal)+' bags of 50 kg'],['Sand, all work',m2(mt.sandFound+mt.sandWall)+' m\u00B3'],['Stone aggregate, foundation',m2(mt.aggFound)+' m\u00B3'],['Rebar, foundation',num(mt.rebar)+' kg'],['Bricks',num(mt.bricks)],['Structural steel, columns and roof frame',num(mt.msKg)+' kg']]);
  h+='<div class="diysec">Build order</div><ol class="steps">'+diySteps(d,pl,ST).map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ol>';
  h+='<div class="diysec">Adjust for your soil</div><ul class="safe"><li>Soft clay, loose sand or filled ground: dig to '+m2(soilInfo('soft').dig)+' m or deeper until you reach firm soil, and use the larger footings the 100 kN/m\u00B2 setting gives.</li><li>Black cotton soil swells and shrinks. Go to '+m2(soilInfo('bc').dig)+' m with a 0.6 m sand cushion below it, or ask an engineer about under-reamed piles.</li><li>High water table: pump the pit, pour PCC quickly, and ask an engineer before you continue.</li><li>Sloping plot: set the 0.00 level at the highest corner of the house and keep the same footing depth below the ground at every column.</li></ul>';
  h+='<div class="diysec">Stay safe</div><ul class="safe"><li>Do not stand in a pit deeper than waist height unless the sides are sloped or supported, and never work in a pit alone.</li><li>Wear a hard hat, eye protection, gloves and boots. Use a proper welding mask, and keep the cables and cylinders dry and clear of the walkways.</li><li>Brace every column the same day you erect it. Wind can topple an unbraced steel frame.</li><li>Get the building permit and the soil test first. Keep the receipts and photos of each stage for the approval record.</li></ul>';
  $('diyBody').innerHTML=h;
}
$('soil').innerHTML=SOILS.map(function(z){return '<option value="'+z.v+'">'+z.n+'</option>';}).join('');
$('soil').addEventListener('change',function(){ST.soil=this.value;ST.sbc=soilInfo(ST.soil).sbc;$('sbc').value=ST.sbc;update(true);});
$('sbc').addEventListener('input',function(){var v=parseFloat(this.value);if(!isNaN(v)&&v>=50){ST.sbc=Math.min(400,v);update(true);}});

