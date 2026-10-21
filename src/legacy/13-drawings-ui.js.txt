/* ---------- drawings UI ---------- */
var sheetsCache=null,drawStale=false;
function sbcVal(){return Math.max(50,Math.min(400,+ST.sbc||150));}
function projName(){return ($('projName').value||'Courtyard house').slice(0,40);}
function genSheets(){
  var sh=buildSheets(ST,ST.sys,sbcVal(),projName());
  sheetsCache=sh;drawStale=false;
  $('sheetPrev').innerHTML=sh.map(function(s){return '<figure class="sheetfig"><figcaption>'+s.id+'  '+s.title+'</figcaption><div class="sheetbox">'+s.svg+'</div></figure>';}).join('');
  $('printArea').innerHTML=sh.map(function(s){return '<div class="sheet">'+s.svg+'</div>';}).join('');
  $('drawStatus').textContent='Generated '+sh.length+' sheets for '+num(planFor(ST).area)+' sq ft, '+SYSTEMS.filter(function(z){return z.v===ST.sys;})[0].n+'.';
}
$('bGen').addEventListener('click',function(){
  var b=this;b.disabled=true;$('drawStatus').textContent='Generating drawings...';
  setTimeout(function(){try{genSheets();}catch(e){$('drawStatus').textContent='Could not generate the drawings: '+e.message;}b.disabled=false;},30);
});
function isCapNative(){var C=window.Capacitor;return !!(C&&C.isNativePlatform&&C.isNativePlatform());}
function saveFile(name,mime,text){
  var C=window.Capacitor;
  if(isCapNative()&&C.Plugins&&C.Plugins.Filesystem&&C.Plugins.Share){
    return C.Plugins.Filesystem.writeFile({path:name,data:text,directory:'CACHE',encoding:'utf8'}).then(function(r){
      return C.Plugins.Share.share({title:name,url:r.uri,dialogTitle:'Save or share the drawings'});
    });
  }
  return new Promise(function(res){
    var blob=new Blob([text],{type:mime}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();res();},800);
  });
}
function downloadSet(){
  if(!sheetsCache||drawStale) genSheets();
  var css='@page{size:A3 landscape;margin:0}body{margin:0;background:#888}.sheet{width:420mm;height:297mm;margin:10px auto;background:#fff;page-break-after:always;break-after:page}.sheet svg{width:420mm;height:297mm;display:block}@media print{body{background:#fff}.sheet{margin:0}}';
  var html='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(projName())+' drawings</title><style>'+css+'</style></head><body>'+sheetsCache.map(function(x){return '<div class="sheet">'+x.svg+'</div>';}).join('')+'</body></html>';
  return saveFile('courtyard-house-drawings.html','text/html',html).then(function(){
    $('drawStatus').textContent=isCapNative()?'Saved. Open the file in Chrome and print it to PDF on A3.':'Downloaded courtyard-house-drawings.html. Open it and print to PDF on A3.';
  }).catch(function(){$('drawStatus').textContent='Saving is blocked here. Use the installed app or a normal browser tab.';});
}
$('bPrint').addEventListener('click',function(){
  if(isCapNative()){downloadSet();return;}
  if(!sheetsCache||drawStale) genSheets();
  try{window.print();}catch(e){$('drawStatus').textContent='Printing is blocked here. Use Download set instead, then print the file.';}
});
$('bDown').addEventListener('click',function(){downloadSet();});

