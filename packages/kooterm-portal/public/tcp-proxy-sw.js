// TCP Proxy Service Worker
//
// 两种代理模式：
//   1. /tcp-proxy/{host}:{port}/* — URL 前缀匹配，用于 iframe 加载远程页面。
//      对 HTML 响应做 URL 重写和 ws-override 注入。
//   2. session 代理 — 对已代理 iframe 的非 /tcp-proxy/* 子请求，
//      直接流式透传，不做任何改写。

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

const WS_OVERRIDE_SCRIPT = '<script src="/ws-override.js"></script>';

function rewriteHtml(html, targetHost, targetPort) {
  const prefix = `${PROXY_PREFIX}${targetHost}:${targetPort}`;
  let result = html.replace(
    /((?:href|src|action|poster|data)=["'])(\/(?!["']|\/|portal-direct-assets\/|portal-direct-api\/|tcp-proxy-sw\.js))/g,
    `$1${prefix}$2`
  );
  if (!result.includes(WS_OVERRIDE_SCRIPT)) {
    result = result.replace('</head>', `${WS_OVERRIDE_SCRIPT}\n</head>`);
  }
  return result;
}

// 是否缓冲文本响应（全量接收后再输出）。
// 仅用于 /tcp-proxy/* 请求：HTML 需 rewrite，JS/CSS 缓冲后原样输出。
// session 代理请求不缓冲，直接流式透传。
function isTextResponse(contentType) {
  return contentType && (
    contentType.includes('text/html') ||
    contentType.includes('text/css') ||
    contentType.includes('application/javascript') ||
    contentType.includes('text/javascript')
  );
}

function shouldBypassProxy(pathname) {
  return     pathname.startsWith('/portal-direct-api/') ||
    pathname.startsWith('/portal-direct-assets/') ||
    pathname === '/' ||
    pathname === '/tcp-proxy-sw.js' ||
    pathname === '/ws-override.js' ||
    pathname === '/terminal' ||
    pathname === '/desktop' ||
    pathname === '/vnc' ||
    pathname === '/opencode' ||
    pathname === '/openvscode' ||
    pathname === '/health';
}

self.addEventListener('fetch', (event) => {
  const parsed = parseUrl(event.request.url);
  if (parsed) {
    event.respondWith(handleRequest(event, parsed, true));
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
    }, false));
  }
});

async function handleRequest(event, { host, port, path }, fromProxyPrefix) {
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
      chunks: null,
      isHtml: false,
      fromProxyPrefix: !!fromProxyPrefix,
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
    if (pending.clientId && contentType && contentType.includes('text/html')) {
      proxySessions.set(pending.clientId, { host: pending.host, port: pending.port });
    }

    pending.headers = headers;
    pending.isHtml = contentType && contentType.includes('text/html');
    pending.contentLength = parseInt(getHeader(headers, 'content-length'), 10) || 0;
    pending.receivedBytes = 0;

    // 仅 /tcp-proxy/* 的文本响应需要缓冲（HTML rewrite / JS CSS 原样透传）
    // session 代理的子资源全部直接流式输出
    if (pending.fromProxyPrefix && isTextResponse(contentType)) {
      pending.chunks = [];
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

  // 将缓冲的文本响应输出到流。
  // HTML：合并后 rewrite（URL 重写 + ws-override 注入）再输出。
  // JS/CSS：缓冲的分块依次原样输出，不做改写。
  function flushResponse(p) {
    if (!p.chunks) return;

    if (p.isHtml) {
      const total = p.receivedBytes;
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of p.chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      const text = new TextDecoder().decode(merged);
      const rewritten = rewriteHtml(text, p.host, p.port);
      p.controller.enqueue(new TextEncoder().encode(rewritten));
    } else {
      for (const c of p.chunks) {
        p.controller.enqueue(c);
      }
    }
    p.controller.close();
  }

  if (type === 'tcp-chunk') {
    const chunk = new Uint8Array(event.data.data);

    if (pending.chunks) {
      pending.chunks.push(chunk);
      pending.receivedBytes += chunk.length;

      if (pending.contentLength > 0 && pending.receivedBytes >= pending.contentLength) {
        pendingRequests.delete(id);
        flushResponse(pending);
      }
      return;
    }

    pending.controller.enqueue(chunk);
    return;
  }

  if (type === 'tcp-done') {
    pendingRequests.delete(id);
    if (pending.chunks) {
      if (pending.contentLength > 0 && pending.receivedBytes < pending.contentLength) {
        pending.controller.error(new Error('Incomplete response'));
      } else {
        flushResponse(pending);
      }
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
