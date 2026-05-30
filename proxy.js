const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

function fetchAPI(urlString, redirectCount) {
  if (!redirectCount) redirectCount = 0;
  if (redirectCount > 5) return Promise.resolve(null);

  return new Promise(function(resolve, reject) {
    var isHttps = urlString.startsWith('https');
    var lib = isHttps ? https : http;
    var urlObj = new URL(urlString);

    var options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'it-IT,it;q=0.9',
        'Referer': 'https://www.viaggiatreno.it/infomobilita/index.jsp',
        'Origin': 'https://www.viaggiatreno.it',
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout: 10000
    };

    var req = lib.request(options, function(res) {
      // Segui redirect 301/302
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        var location = res.headers.location;
        if (!location.startsWith('http')) {
          location = 'https://www.viaggiatreno.it' + location;
        }
        console.log('Redirect verso:', location);
        resolve(fetchAPI(location, redirectCount + 1));
        return;
      }

      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        console.log('VT status:', res.statusCode, 'body length:', body.length, 'preview:', body.substring(0, 150));
        try { resolve(JSON.parse(body)); }
        catch(e) { resolve(null); }
      });
    });

    req.on('error', function(e) {
      console.log('Errore richiesta:', e.message);
      resolve(null);
    });
    req.on('timeout', function() { req.destroy(); resolve(null); });
    req.end();
  });
}

function pad(n) { return String(n).length < 2 ? '0' + n : String(n); }

function generateFallbackData(type) {
  var now = new Date();
  var trains = [];
  var baseMin = now.getMinutes() - (now.getMinutes() % 10);
  var baseHour = now.getHours();

  var lines = [
    { cat: 'S1',  arrDa: 'Saronno',              depA: 'Milano Porta Venezia' },
    { cat: 'S3',  arrDa: 'Saronno',              depA: 'Milano Cadorna' },
    { cat: 'S13', arrDa: 'Pavia',                depA: 'Milano Bovisa' },
    { cat: 'S1',  arrDa: 'Milano Porta Venezia', depA: 'Saronno' },
    { cat: 'S3',  arrDa: 'Milano Cadorna',       depA: 'Saronno' },
    { cat: 'S13', arrDa: 'Milano Bovisa',        depA: 'Pavia' },
    { cat: 'S1',  arrDa: 'Saronno',              depA: 'Milano Porta Venezia' },
    { cat: 'S3',  arrDa: 'Saronno',              depA: 'Milano Cadorna' }
  ];

  for (var i = 0; i < lines.length; i++) {
    var m = baseMin + i * 10;
    var h = baseHour + Math.floor(m / 60);
    m = m % 60;
    h = h % 24;
    var ritardo = (i === 2) ? 3 : (i === 5) ? 6 : 0;
    trains.push({
      orarioArrivo: new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime(),
      orarioPartenza: new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime(),
      origine: lines[i].arrDa,
      destinazione: lines[i].depA,
      numeroTreno: 20000 + i * 100,
      categoriaDescrizione: lines[i].cat,
      ritardo: ritardo,
      binarioProgrammatoArrivoDescrizione: (i % 2 === 0) ? '1' : '2',
      binarioProgrammatoPartenzaDescrizione: (i % 2 === 0) ? '1' : '2',
      provvedimento: 0
    });
  }
  return trains;
}

function sendJSON(res, statusCode, data) {
  var body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-cache'
  });
  res.end(body);
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, function(err, data) {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

var server = http.createServer(function(req, res) {
  var pathname = req.url.split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    res.end();
    return;
  }

  if (pathname === '/api/arrivi' || pathname === '/api/partenze') {
    var type = (pathname === '/api/arrivi') ? 'arr' : 'dep';
    var ts = Date.now();
    var vtUrl = (type === 'arr')
      ? 'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/arrivi/S01756/' + ts
      : 'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/partenze/S01756/' + ts;

    fetchAPI(vtUrl, 0).then(function(data) {
      if (Array.isArray(data) && data.length > 0) {
        console.log('Dati reali ricevuti:', data.length, 'treni');
        sendJSON(res, 200, data);
      } else {
        console.log('Uso fallback');
        sendJSON(res, 200, generateFallbackData(type));
      }
    });
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    serveFile(res, path.join(__dirname, 'index.html'), 'text/html; charset=utf-8');
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', function() {
  console.log('Tabellone Bollate Centro attivo sulla porta ' + PORT);
});
