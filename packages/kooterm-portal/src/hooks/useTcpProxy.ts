import { ref, shallowRef } from 'vue';
import { TcpProxy, WsProxy, type TcpTunnel, type WsSession, type WebSocketConnection, TcpErrorType, HttpCodec } from '@kooterm/common';
import { getLogger } from 'loglevel';

const logger = getLogger('useTcpProxy');

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const r = new Uint8Array(a.length + b.length);
  r.set(a, 0);
  r.set(b, a.length);
  return r;
}

const ERROR_LABELS: Record<number, string> = {
  [TcpErrorType.REFUSED]: 'Connection refused',
  [TcpErrorType.TIMEOUT]: 'Connection timed out',
  [TcpErrorType.RESET]: 'Connection reset',
  [TcpErrorType.CLOSED]: 'Connection closed',
  [TcpErrorType.OTHER]: 'Connection error',
};

interface WsSessionEntry {
  session: WsSession;
  source: MessageEventSource | null;
  origin: string;
}

export function useTcpProxy() {
  const connected = ref(false);
  const connecting = ref(false);
  const connection = shallowRef<WebSocketConnection>();
  const networkRef = ref();
  const error = ref<string>('');

  let proxy: TcpProxy | null = null;
  let wsProxy: WsProxy | null = null;
  let swRegistration: ServiceWorkerRegistration | null = null;
  let targetHost = '';
  let targetPort = 0;
  const pendingAborts = new Set<() => void>();
  const wsSessions = new Map<string, WsSessionEntry>();

  const onSwMessage = async (event: MessageEvent) => {
    const { type, id, method, path: reqPath, headers, body } = event.data;

    if (type !== 'tcp-request' || !proxy) return;

    const allHeaders: Record<string, string> = { ...headers };
    if (!Object.keys(allHeaders).some(k => k.toLowerCase() === 'host')) {
      const portStr = targetPort === 80 || targetPort === 443 ? '' : `:${targetPort}`;
      allHeaders['Host'] = `${targetHost}${portStr}`;
    }
    if (!Object.keys(allHeaders).some(k => k.toLowerCase() === 'connection')) {
      allHeaders['Connection'] = 'close';
    }

    const raw = HttpCodec.encodeRequest(method, reqPath, allHeaders, body ? new Uint8Array(body) : undefined);
    logger.info(`[TCP Proxy] >>> [${id}] ${method} ${targetHost}:${targetPort}${reqPath} (${raw.length} bytes)`);

    let tunnel: TcpTunnel | null = null;
    let buffer = new Uint8Array(0);
    let headersSent = false;
    let done = false;

    const cleanup = () => {
      if (done) return;
      done = true;
      pendingAborts.delete(abort);
      tunnel?.close();
    };

    const sendError = (message: string) => {
      if (done) return;
      cleanup();
      logger.error(`[TCP Proxy] <<< [${id}] Error: ${message}`);
      event.source.postMessage({ type: 'tcp-error', id, message });
    };

    const abort = () => sendError('Request aborted');
    pendingAborts.add(abort);

    try {
      tunnel = await proxy.createTunnel(targetHost, targetPort);
      logger.info(`[TCP Proxy] [${id}] KTP tunnel created, identifier=${tunnel.identifier}`);

      tunnel.onError = (type, msg) => {
        if (type === TcpErrorType.CLOSED && headersSent) {
          cleanup();
          logger.info(`[TCP Proxy] <<< [${id}] TCP CLOSED, stream done`);
          event.source.postMessage({ type: 'tcp-done', id });
        } else if (!headersSent) {
          sendError(ERROR_LABELS[type] || msg);
        } else {
          sendError(`Stream error: ${msg}`);
        }
      };

      tunnel.onData = (chunk) => {
        if (done) return;

        if (!headersSent) {
          buffer = concat(buffer, chunk);
          const parsed = HttpCodec.parseHeaders(buffer);
          if (!parsed) return;

          headersSent = true;
          logger.info(`[TCP Proxy] <<< [${id}] ${parsed.statusCode} ${parsed.statusText}`);

          event.source.postMessage({
            type: 'tcp-response-headers',
            id,
            status: parsed.statusCode,
            statusText: parsed.statusText,
            headers: parsed.headers,
          });

          const bodyStart = parsed.headerLength;
          const remaining = buffer.slice(bodyStart);
          if (remaining.length > 0) {
            logger.info(`[TCP Proxy] <<< [${id}] chunk ${remaining.length} bytes (buffered)`);
            event.source.postMessage({
              type: 'tcp-chunk',
              id,
              data: Array.from(remaining),
            });
          }
          buffer = new Uint8Array(0);
          return;
        }

        logger.info(`[TCP Proxy] <<< [${id}] chunk ${chunk.length} bytes`);
        event.source.postMessage({
          type: 'tcp-chunk',
          id,
          data: Array.from(chunk),
        });
      };

      tunnel.send(raw);
      logger.info(`[TCP Proxy] [${id}] TCP_DATA sent (${raw.length} bytes)`);
    } catch (err: any) {
      sendError(err.message);
    }
  };

  function postToFrame(source: MessageEventSource | null, data: any) {
    if (source && 'postMessage' in source) {
      (source as any).postMessage(data, window.location.origin);
    }
  }

  const onWindowMessage = async (event: MessageEvent) => {
    const { type, sessionId, host, port, path, protocols, data, code, reason } = event.data || {};
    if (!type || !type.startsWith('ws-')) return;

    if (!proxy || !wsProxy) return;

    if (type === 'ws-open') {
      const url = `ws://${host}:${port}${path}`;
      try {
        const session = await wsProxy.connect(url, protocols);
        wsSessions.set(sessionId, { session, source: event.source, origin: event.origin });

        session.onmessage = (msg) => {
          const entry = wsSessions.get(sessionId);
          if (!entry) return;
          const payload = msg instanceof Uint8Array ? msg.buffer : msg;
          postToFrame(entry.source, { type: 'ws-message', sessionId, data: payload });
        };

        session.onclose = (c, r) => {
          wsSessions.delete(sessionId);
          postToFrame(event.source, { type: 'ws-closed', sessionId, code: c, reason: r });
        };

        session.onerror = (err) => {
          wsSessions.delete(sessionId);
          postToFrame(event.source, { type: 'ws-error', sessionId, message: err.message });
        };

        postToFrame(event.source, { type: 'ws-opened', sessionId, protocol: '' });
        logger.info(`[WS Proxy] opened ${sessionId} ${url}`);
      } catch (err: any) {
        logger.error(`[WS Proxy] open failed ${sessionId}: ${err.message}`);
        postToFrame(event.source, { type: 'ws-error', sessionId, message: err.message });
      }
      return;
    }

    if (type === 'ws-data') {
      const entry = wsSessions.get(sessionId);
      if (entry) {
        const payload = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        entry.session.send(payload);
      }
      return;
    }

    if (type === 'ws-close') {
      const entry = wsSessions.get(sessionId);
      if (entry) {
        entry.session.close(code || 1000, reason || '');
        wsSessions.delete(sessionId);
      }
      return;
    }
  };

  const init = async (url: string, host: string, port: number) => {
    connecting.value = true;
    error.value = '';

    if (!navigator.serviceWorker) {
      error.value = 'Service Worker unavailable (requires HTTPS or localhost)';
      connected.value = false;
      connecting.value = false;
      return;
    }

    try {
      swRegistration = await navigator.serviceWorker.register('/tcp-proxy-sw.js');
      navigator.serviceWorker.addEventListener('message', onSwMessage);
      logger.info('Service Worker registered');

      proxy = new TcpProxy(url);
      wsProxy = new WsProxy(proxy);
      connection.value = proxy.connection;
      targetHost = host;
      targetPort = port;

      window.addEventListener('message', onWindowMessage);

      connected.value = true;
      connecting.value = false;
      logger.info('TCP proxy connected:', `${host}:${port}`);
    } catch (err: any) {
      logger.error('TCP proxy init failed:', err.message);
      error.value = err.message;
      connected.value = false;
      connecting.value = false;
    }
  };

  const destroy = () => {
    for (const abort of pendingAborts) abort();
    pendingAborts.clear();

    for (const [id, entry] of wsSessions) {
      entry.session.close(1001, 'Proxy destroyed');
    }
    wsSessions.clear();

    window.removeEventListener('message', onWindowMessage);

    if (proxy) {
      proxy.close();
      proxy = null;
    }
    if (swRegistration) {
      swRegistration.unregister();
      swRegistration = null;
    }
    if (navigator.serviceWorker) {
      navigator.serviceWorker.removeEventListener('message', onSwMessage);
    }
    connected.value = false;
    connecting.value = false;
    error.value = '';
    logger.info('TCP proxy destroyed');
  };

  return {
    connected,
    connecting,
    connection,
    networkRef,
    error,
    init,
    destroy,
  };
}
