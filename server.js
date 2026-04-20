const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const API_TOKEN = (process.env.BANKROLL_API_TOKEN || '').trim();
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bankroll-log.json');

const DEFAULT_STATE = Object.freeze({
  bets: [],
  lessons: [],
  startingBankroll: 86.12,
  goalBankroll: 600
});

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function parseAmount(value, fallback = 0) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : fallback;
}

function getLocalDateString(date = new Date()) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().split('T')[0];
}

function normalizeBet(rawBet = {}) {
  const result = rawBet.result || 'pending';
  const stake = parseAmount(rawBet.stake);
  const hasReturnValue = rawBet.return !== undefined && rawBet.return !== null && rawBet.return !== '';
  const normalizedReturn = hasReturnValue
    ? parseAmount(rawBet.return)
    : (result === 'push' ? stake : 0);

  return {
    id: rawBet.id ?? Date.now(),
    date: rawBet.date || getLocalDateString(),
    startTime: rawBet.startTime || '',
    sport: rawBet.sport || 'Other',
    team: rawBet.team || '',
    type: rawBet.type || 'Moneyline',
    parlayLegs: rawBet.type === 'Parlay' && [2, 3, '2', '3'].includes(rawBet.parlayLegs)
      ? Number(rawBet.parlayLegs)
      : null,
    stake,
    odds: rawBet.odds || '',
    edge: rawBet.edge || '',
    result,
    return: normalizedReturn,
    notes: rawBet.notes || ''
  };
}

function normalizeLesson(rawLesson = {}) {
  return {
    id: rawLesson.id ?? Date.now(),
    date: rawLesson.date || getLocalDateString(),
    text: rawLesson.text || '',
    checkboxes: rawLesson.checkboxes || {}
  };
}

function normalizeState(rawState = {}) {
  return {
    bets: Array.isArray(rawState.bets) ? rawState.bets.map(normalizeBet) : [],
    lessons: Array.isArray(rawState.lessons) ? rawState.lessons.map(normalizeLesson) : [],
    startingBankroll: parseAmount(rawState.startingBankroll, DEFAULT_STATE.startingBankroll),
    goalBankroll: parseAmount(rawState.goalBankroll, DEFAULT_STATE.goalBankroll)
  };
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(DEFAULT_STATE, null, 2), 'utf8');
  }
}

async function readState() {
  await ensureDataFile();

  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch {
    return normalizeState(DEFAULT_STATE);
  }
}

async function writeState(nextState) {
  await ensureDataFile();
  const normalizedState = normalizeState(nextState);
  const tempFile = `${DATA_FILE}.tmp`;

  await fs.writeFile(tempFile, JSON.stringify(normalizedState, null, 2), 'utf8');
  await fs.rename(tempFile, DATA_FILE);

  return normalizedState;
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(response, statusCode, payload) {
  setCorsHeaders(response);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  setCorsHeaders(response);
  response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(message);
}

function isAuthorized(request) {
  if (!API_TOKEN) {
    return true;
  }

  const authHeader = request.headers.authorization || '';
  return authHeader === `Bearer ${API_TOKEN}`;
}

async function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk.toString();

      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });

    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function serveStaticFile(response, filePath) {
  const resolvedPath = path.resolve(ROOT_DIR, filePath);

  if (!resolvedPath.startsWith(ROOT_DIR)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  try {
    const fileBuffer = await fs.readFile(resolvedPath);
    const extension = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';

    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });
    response.end(fileBuffer);
  } catch {
    sendText(response, 404, 'Not found');
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);

  try {
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      setCorsHeaders(response);
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname === '/api/state' && !isAuthorized(request)) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/state') {
      const state = await readState();
      sendJson(response, 200, { state });
      return;
    }

    if (request.method === 'PUT' && url.pathname === '/api/state') {
      const rawBody = await readRequestBody(request);
      const payload = rawBody ? JSON.parse(rawBody) : DEFAULT_STATE;
      const state = await writeState(payload);
      sendJson(response, 200, { state });
      return;
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      await serveStaticFile(response, 'index.html');
      return;
    }

    if (request.method === 'GET') {
      const relativePath = url.pathname.replace(/^\/+/, '');
      await serveStaticFile(response, relativePath);
      return;
    }

    sendText(response, 405, 'Method not allowed');
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error.message || 'Internal server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Bankroll Log running on ${HOST}:${PORT}`);
});
