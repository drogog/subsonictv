const fs = require('fs');
const vm = require('vm');
const configContext = {};
vm.runInNewContext(fs.readFileSync('subsonic-tv/js/config.js','utf8'),configContext);
const c = configContext.SUBSONIC_CONFIG;
async function request(method, params = {}) {
  const url = new URL(c.url + '/rest/' + method + '.view');
  url.search = new URLSearchParams({u:c.username,t:c.token,s:c.salt,v:'1.15.0',c:c.client,f:'json',...params});
  const response = await fetch(url, {signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw Error('HTTP '+response.status);
  const result = (await response.json())['subsonic-response'];
  if (result.status !== 'ok') throw Error('Subsonic code '+result.error.code);
  return result;
}
(async () => {
  const data = await request('getArtists');
  const artists = (data.artists.index || []).flatMap(g => g.artist || []);
  console.log('Artists: '+artists.length);
  const artist = artists.find(a => a.albumCount > 0);
  if (!artist) throw Error('No artist with albums to test');
  const albums = (await request('getArtist',{id:artist.id})).artist.album || [];
  console.log('Albums for sample artist: '+albums.length);
  const tracks = (await request('getAlbum',{id:albums[0].id})).album.song || [];
  console.log('Tracks in sample album: '+tracks.length);
  console.log('Sample audio formats: '+[...new Set(tracks.map(t=>t.suffix))].join(', '));
  const page = await request('getAlbumList2',{type:'newest',size:8,offset:0});
  console.log('Home album page: '+(page.albumList2.album || []).length);
  const playlists = (await request('getPlaylists')).playlists.playlist || [];
  console.log('Playlists: '+playlists.length);
  const stations = (await request('getInternetRadioStations')).internetRadioStations.internetRadioStation || [];
  console.log('Radio stations: '+stations.length);
  console.log('Radio URL schemes: '+[...new Set(stations.map(s=>{try{return new URL(s.streamUrl).protocol;}catch(e){return 'invalid';}}))].join(', '));
  const sample = (await request('getRandomSongs',{size:200})).randomSongs.song || [];
  console.log('Mix candidates: '+sample.length);
  for (const field of ['starred','userRating','playCount','played']) {console.log('Candidates with '+field+': '+sample.filter(s=>s[field]!==undefined).length);}
  if (playlists.length) { console.log('Sample playlist entries: '+((await request('getPlaylist',{id:playlists[0].id})).playlist.entry || []).length); }
})().catch(() => {console.error('Live API smoke check failed (credentials omitted).');process.exitCode=1;});
