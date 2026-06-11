const PROXY_PREFIX = '/tcp-proxy/';
const TIMEOUT_MS = 10000;

const pendingRequests = new Map();
const proxySessions = new Map();

function parseUrl(url) {
  const parsed = new URL(url, self.location.origin);
  const pathWithHost = parsed.pathname;

  if (!pathWithHost.startsWith(PROXY_PREFIX)) return null;

  const rest = pathWithHost.slice(PROXY_PREFIX.length);
  const slashIndex = rest.indexOf('/');
  if (slashIndex === -1) {
    return { host: rest, port: 80, path: '/' };
  }

  const hostPort = rest.slice(0, slashIndex);
  const path = rest.slice(slashIndex) + parsed.search + parsed.hash;

  const colonIndex = hostPort.lastIndexOf(':');
  if (colonIndex === -1) {
    return { host: hostPort, port: 80, path };
  }

  return {
    host: hostPort.slice(0, colonIndex),
    port: parseInt(hostPort.slice(colonIndex + 1), 10),
    path,
  };
}

function getHeader(headers, name) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return '';
}

function rewriteHtml(html, targetHost, targetPort) {
  const prefix = `${PROXY_PREFIX}${targetHost}:${targetPort}`;
  return html.replace(
    /((?:href|src|action|poster|data)=["'])(\/(?!\/|portal-direct-assets\/))/g,
    `$1${prefix}$2`
  );
}

function isTextResponse(contentType) {
  return contentType && (
    contentType.includes('text/html') ||
    contentType.includes('text/css') ||
    contentType.includes('application/javascript') ||
    contentType.includes('text/javascript')
  );
}

function shouldBypassProxy(pathname) {
  return pathname.startsWith('/api') ||
    pathname.startsWith('/portal-direct-assets/') ||
    pathname === '/tcp-proxy-sw.js';
}

self.addEventListener('fetch', (event) => {
  const parsed = parseUrl(event.request.url);
  if (parsed) {
    event.respondWith(handleRequest(event, parsed));
    return;
  }

  const url = new URL(event.request.url);
  if (shouldBypassProxy(url.pathname)) return;

  const session = proxySessions.get(event.clientId);
  if (session) {
    event.respondWith(handleRequest(event, {
      host: session.host,
      port: session.port,
      path: url.pathname + url.search + url.hash,
    }));
  }
});

async function handleRequest(event, { host, port, path }) {
  const requestId = crypto.randomUUID();
  const request = event.request;

  let body = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const clients = await self.clients.matchAll({ type: 'window' });
  if (clients.length === 0) {
    return new Response('No client available', { status: 502 });
  }

  const msg = {
    type: 'tcp-request',
    id: requestId,
    method: request.method,
    path,
    headers,
    body: body ? Array.from(new Uint8Array(body)) : null,
  };

  for (const client of clients) {
    client.postMessage(msg);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(new Response('Gateway Timeout (10s)', { status: 504 }));
    }, TIMEOUT_MS);

    pendingRequests.set(requestId, { resolve, timer, host, port, clientId: event.resultingClientId || event.clientId });
  });
}

self.addEventListener('message', (event) => {
  const { type, id } = event.data;

  if (type === 'tcp-response') {
    const pending = pendingRequests.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    pendingRequests.delete(id);

    const { status, statusText, headers, body } = event.data;
    const responseBody = body ? new Uint8Array(body) : null;

    const contentType = getHeader(headers, 'content-type');
    if (pending.clientId && contentType.includes('text/html')) {
      proxySessions.set(pending.clientId, { host: pending.host, port: pending.port });
    }

    if (responseBody && isTextResponse(contentType)) {
      const text = new TextDecoder().decode(responseBody);
      const rewritten = rewriteHtml(text, pending.host, pending.port);
      resolve(pending.resolve, new Response(rewritten, {
        status,
        statusText,
        headers: new Headers(headers),
      }));
    } else {
      resolve(pending.resolve, new Response(responseBody, {
        status,
        statusText,
        headers: new Headers(headers),
      }));
    }
  }

  if (type === 'tcp-error') {
    const pending = pendingRequests.get(event.data.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    pendingRequests.delete(event.data.id);
    resolve(pending.resolve, new Response('Bad Gateway', { status: 502 }));
  }
});

function resolve(promiseResolve, response) {
  promiseResolve(response);
}
