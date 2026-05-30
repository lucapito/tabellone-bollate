// proxy.js — Server proxy per il tabellone di Bollate Centro
// Richiede Node.js (v18+) — avvia con: node proxy.js

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const VIAGGIATRENO_BASE = 'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno';
const STATION_ID = 'S01756'; // Bollate Centro

// ── Helper: richiesta HTTPS verso ViaggiaTreno ──────────────────────────────
function fetchViaggiaTreno(apiPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.viaggiatreno.it',
      path: `/infomobilita/resteasy/viaggiatreno${apiPath}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TabelloneBollate/1.0)',
        'Accept': 'application/json',
      },
      timeout: 8000,
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { resolve(body); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ── Helper: risposta JSON con CORS ──────────────────────────────────────────
function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-cache',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// ── Helper: serve file statici ──────────────────────────────────────────────
function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ── Server principale ───────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    res.end();
    return;
  }

  // ── API: arrivi ──────────────────────────────────────────────────────────
  if (pathname === '/api/arrivi') {
    try {
      const ts = Date.now();
      const data = await fetchViaggiaTreno(`/arrivi/${STATION_ID}/${ts}`);
      sendJSON(res, 200, data);
    } catch (e) {
      sendJSON(res, 502, { error: e.message });
    }
    return;
  }

  // ── API: partenze ────────────────────────────────────────────────────────
  if (pathname === '/api/partenze') {
    try {
      const ts = Date.now();
      const data = await fetchViaggiaTreno(`/partenze/${STATION_ID}/${ts}`);
      sendJSON(res, 200, data);
    } catch (e) {
      sendJSON(res, 502, { error: e.message });
    }
    return;
  }

  // ── API: dettaglio singolo treno ─────────────────────────────────────────
  if (pathname.startsWith('/api/treno/')) {
    try {
      const parts = pathname.split('/');
      const codOrigine = parts[3];
      const numTreno = parts[4];
      const ts = Date.now();
      const data = await fetchViaggiaTreno(`/andamentoTreno/${codOrigine}/${numTreno}/${ts}`);
      sendJSON(res, 200, data);
    } catch (e) {
      sendJSON(res, 502, { error: e.message });
    }
    return;
  }

  // ── Serve index.html ─────────────────────────────────────────────────────
  if (pathname === '/' || pathname === '/index.html') {
    serveFile(res, path.join(__dirname, 'index.html'), 'text/html; charset=utf-8');
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   Tabellone Bollate Centro — Proxy attivo    ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log(`  ║   Apri il browser su:                        ║`);
  console.log(`  ║   http://localhost:${PORT}                       ║`);
  console.log('  ║                                              ║');
  console.log('  ║   Da altri dispositivi in rete:              ║');
  console.log(`  ║   http://<IP-del-tuo-PC>:${PORT}                 ║`);
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('  Premi Ctrl+C per fermare il server.');
  console.log('');
});
