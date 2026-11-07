const fs = require('fs');
fs.mkdirSync('.preview',{recursive:true});
fs.copyFileSync('subsonic-tv/icon.svg','.preview/icon.svg');
const css = fs.readFileSync('subsonic-tv/css/main.css','utf8');
let html = fs.readFileSync('subsonic-tv/index.html','utf8').replace('<link rel="stylesheet" href="css/main.css">','<style>'+css+'</style>');
const mock = `var SUBSONIC_CONFIG={url:'preview',username:'preview',token:'preview',salt:'preview'};
var names=['Late night stories','A little closer','The quiet hours','Colour in motion','Somewhere, someday','After the rain','Open windows','Good company'];
var colours=['#80515c','#4e716a','#4b567e','#ab744e','#6e4d77','#4d6c87','#7b8655','#98694e'];
var MusicAPI={url:function(method,params){var c=colours[Number(params.id)%8];return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="'+c+'"/><circle cx="130" cy="90" r="80" fill="none" stroke="#ffffff" stroke-opacity=".25" stroke-width="24"/><path d="M0 160L200 50V200H0" fill="#101014" fill-opacity=".3"/></svg>');},request:function(method,params,cb){var t=setTimeout(function(){cb(null,{albumList2:{album:names.map(function(n,i){return {id:String(i),coverArt:String(i),name:n,artist:['Various Artists','The Evening Sessions','Piano Works','Sunday Club'][i%4]};})}});},10);return {cancel:function(){clearTimeout(t);}};}};`;
html=html.replace(/<script src="js\/[^\"]+"><\/script>/g,'');
html=html.replace(/<script src="\$WEBAPIS[^\"]+"><\/script>/g,'');
const modules=['settings-store','format','native-audio','listening','player','catalog','mix','seed-mix','settings-ui','visualizer','turntable','artwork','music-panel','app'].map(name=>'<script>'+fs.readFileSync('subsonic-tv/js/'+name+'.js','utf8')+'</script>').join('');
const previewActions=`setTimeout(function(){
  if(location.hash==='#midnight'){AppSettings.set('theme',2);AppSettings.set('focus',2);AppSettings.apply();function key(code){document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:code,which:code,bubbles:true}));}key(10009);for(var m=0;m<8;m++){key(40);}}
  if(location.hash.indexOf('#mix')===0){
    AppSettings.set('theme',location.hash==='#mix-dock'?1:location.hash==='#mix-midnight'?2:0);AppSettings.apply();
    MusicPlayer.enqueue([{id:'0',title:'Late night stories',artist:'The Evening Sessions',album:'The quiet hours',artistId:'artist',albumId:'album',genre:'Jazz',coverArt:'0',suffix:'flac'}],false);
    document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:406,which:406,bubbles:true}));
    MusicPanel.actions(MusicPlayer.status().track,0);
    setTimeout(function(){MusicPanel.handle({keyCode:40});MusicPanel.handle({keyCode:40});MusicPanel.handle({keyCode:13});},50);
  }
  if(location.hash==='#server'||location.hash==='#servers'){
    var first={url:'http://music.example:4533/music',username:'listener',token:'00000000000000000000000000000000',salt:'preview'};
    AppSettings.saveServer(first);AppSettings.saveServer({url:'https://second.example',username:'listener',token:'00000000000000000000000000000000',salt:'preview'});
    Object.keys(first).forEach(function(k){SUBSONIC_CONFIG[k]=first[k];});
    SettingsPanel.open(null,location.hash==='#server'?'server':'servers');
  }
  if(location.hash==='#search'){MusicPanel.search();}
  if(location.hash==='#queue'){MusicPlayer.enqueue(names.map(function(n,i){return {id:String(i),title:n,artist:'The Evening Sessions'};}),false);MusicPanel.queue();}
  if(location.hash==='#listening'){SettingsPanel.open(null,'playback');}
  if(location.hash==='#lp'){AppSettings.set('display',3);ArtworkView.update({track:{title:'Late night stories',artist:'Various Artists',coverArt:'0'},format:'FLAC · 16-bit / 44.1 kHz',state:'Playing',time:142,duration:300});ArtworkView.open();}
  if(location.hash==='#dock'||location.hash==='#player'){AppSettings.set('theme',location.hash==='#dock'?1:0);AppSettings.apply();document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:406,which:406,bubbles:true}));document.getElementById('track-title').textContent='Late night stories';document.getElementById('track-artist').textContent='Various Artists · The evening sessions';document.getElementById('track-format').textContent='FLAC · 16-bit / 44.1 kHz';document.getElementById('playback-state').textContent='';document.getElementById('queue-control').textContent='Queue · 4 / 12';document.getElementById('toggle-control').setAttribute('aria-label','Pause');document.getElementById('toggle-control').innerHTML='<svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';document.getElementById('playback-time').textContent='2:22 / 5:00';document.getElementById('progress-fill').style.width='47%';document.getElementById('cover').className='';document.getElementById('cover').src=MusicAPI.url('getCoverArt',{id:'0'});}
  if(location.hash.indexOf('#viz')===0){AppSettings.set('display',2);AppSettings.set('visualizer',Number(location.hash.slice(4))||0);MusicPlayer.analysisAvailable=function(){return true;};MusicPlayer.analysisStatus=function(){return 'Preview sample';};MusicPlayer.spectrum=function(){var a=new Uint8Array(512);for(var j=0;j<a.length;j++){a[j]=Math.max(0,200-0.2*j+40*Math.sin(j/16));}return a;};MusicPlayer.waveform=function(){var a=new Uint8Array(1024);for(var j=0;j<a.length;j++){a[j]=128+75*Math.sin(j/23)*Math.sin(j/170);}return a;};ArtworkView.update({track:{title:'Late night stories',artist:'Various Artists',coverArt:'0'},format:'FLAC · 16-bit / 44.1 kHz',state:'Playing'});ArtworkView.open();}
  if(location.hash==='#letters'){function press(code){document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:code,which:code,bubbles:true}));}press(10009);press(40);press(13);setTimeout(function(){press(38);},100);}
  if(location.hash==='#settings'||location.hash==='#keyboard'||location.hash==='#quality'){SettingsPanel.open();}
  if(location.hash==='#about'||location.hash==='#visual-settings'){SettingsPanel.open();for(var a=0;a<(location.hash==='#about'?11:7);a++){SettingsPanel.handle({keyCode:40});}SettingsPanel.handle({keyCode:13});if(location.hash==='#visual-settings'){for(var a=0;a<3;a++){SettingsPanel.handle({keyCode:40});}}}
  if(location.hash==='#quality'){for(var i=0;i<6;i++){SettingsPanel.handle({keyCode:40});}SettingsPanel.handle({keyCode:13});}
  if(location.hash==='#keyboard'){SettingsPanel.handle({keyCode:13});SettingsPanel.handle({keyCode:13});}
  if(location.hash==='#cover'||location.hash==='#ambient'){AppSettings.set('display',location.hash==='#ambient'?1:0);ArtworkView.update({track:{title:'Late night stories',artist:'Various Artists',coverArt:'0'},format:'OGG stream · from FLAC · Source: 16-bit / 44.1 kHz / 828 kbps',state:'Playing'});ArtworkView.open();}
},100);`;
html=html.replace('</body>',()=>'<script>'+mock+'</script>'+modules+'<script>'+previewActions+'</script></body>');
fs.writeFileSync('.preview/index.html',html);
console.log('Credential-free layout preview prepared.');
