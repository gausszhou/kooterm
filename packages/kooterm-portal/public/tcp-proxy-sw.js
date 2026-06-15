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
    /((?:href|src|action|poster|data)=["'])(\/(?!["']|\/|portal-direct-assets\/|portal-direct-api\/|tcp-proxy-sw\.js))/g,
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
  return     pathname.startsWith('/portal-direct-api') ||
    pathname.startsWith('/portal-direct-assets/') ||
    pathname === '/' ||
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

    pendingRequests.set(requestId, {
      resolve,
      timer,
      host,
      port,
      clientId: event.resultingClientId || event.clientId,
      controller: null,
      textChunks: null,
    });
  });
}

self.addEventListener('message', (event) => {
  const { type, id } = event.data;
  const pending = pendingRequests.get(id);
  if (!pending) return;

  if (type === 'tcp-response-headers') {
    clearTimeout(pending.timer);

    const { status, statusText, headers } = event.data;

    const contentType = getHeader(headers, 'content-type');
    if (pending.clientId && contentType.includes('text/html')) {
      proxySessions.set(pending.clientId, { host: pending.host, port: pending.port });
    }

    pending.headers = headers;
    pending.textResponse = isTextResponse(contentType);
    pending.contentLength = parseInt(getHeader(headers, 'content-length'), 10) || 0;
    pending.receivedBytes = 0;
    if (pending.textResponse) {
      pending.textChunks = [];
    }

    const stream = new ReadableStream({
      start(controller) {
        pending.controller = controller;
      },
      cancel() {
        pendingRequests.delete(id);
      },
    });

    const response = new Response(stream, {
      status,
      statusText,
      headers: new Headers(headers),
    });
    pending.resolve(response);
    return;
  }

  function flushTextResponse(p) {
    if (!p.textResponse || !p.textChunks) return;
    const total = p.receivedBytes;
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of p.textChunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const text = new TextDecoder().decode(merged);
    const rewritten = rewriteHtml(text, p.host, p.port);
    p.controller.enqueue(new TextEncoder().encode(rewritten));
    p.controller.close();
  }

  if (type === 'tcp-chunk') {
    const chunk = new Uint8Array(event.data.data);

    if (pending.textResponse) {
      pending.textChunks.push(chunk);
      pending.receivedBytes += chunk.length;

      if (pending.contentLength > 0 && pending.receivedBytes >= pending.contentLength) {
        pendingRequests.delete(id);
        flushTextResponse(pending);
      }
      return;
    }

    pending.controller.enqueue(chunk);
    return;
  }

  if (type === 'tcp-done') {
    pendingRequests.delete(id);
    if (pending.textResponse) {
      flushTextResponse(pending);
    } else {
      pending.controller.close();
    }
    return;
  }

  if (type === 'tcp-error') {
    pendingRequests.delete(id);

    if (pending.controller) {
      pending.controller.error(new Error('Stream error'));
    } else {
      pending.resolve(new Response('Bad Gateway', { status: 502 }));
    }
    return;
  }
});
