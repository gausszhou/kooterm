import { ref, shallowRef } from 'vue';
import { TcpProxy, type TcpTunnel, type WebSocketConnection, TcpErrorType, HttpCodec } from '@kooterm/common';
import { getLogger } from 'loglevel';

const logger = getLogger('useTcpProxy');

function formatBytes(data: Uint8Array, head = 512, tail = 512): string {
  if (data.length <= head + tail) return new TextDecoder().decode(data);
  const h = new TextDecoder().decode(data.slice(0, head));
  const t = new TextDecoder().decode(data.slice(-tail));
  return `${h}\n... (${data.length - head - tail} bytes omitted) ...\n${t}`;
}

const ERROR_LABELS: Record<number, string> = {
  [TcpErrorType.REFUSED]: 'Connection refused',
  [TcpErrorType.TIMEOUT]: 'Connection timed out',
  [TcpErrorType.RESET]: 'Connection reset',
  [TcpErrorType.CLOSED]: 'Connection closed',
  [TcpErrorType.OTHER]: 'Connection error',
};

export function useTcpProxy() {
  const connected = ref(false);
  const connecting = ref(false);
  const connection = shallowRef<WebSocketConnection>();
  const networkRef = ref();
  const error = ref<string>('');

  let proxy: TcpProxy | null = null;
  let swRegistration: ServiceWorkerRegistration | null = null;
  let targetHost = '';
  let targetPort = 0;
  const pendingAborts = new Set<() => void>();

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
    logger.info(`[TCP Proxy] >>> Raw:\n${formatBytes(raw)}`);

    let tunnel: TcpTunnel | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let resolved = false;

    const sendError = (message: string) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      pendingAborts.delete(abort);
      logger.error(`[TCP Proxy] <<< [${id}] Error: ${message}`);
      event.source.postMessage({ type: 'tcp-error', id, message });
      tunnel?.close();
    };

    const abort = () => sendError('Request aborted');
    pendingAborts.add(abort);

    try {
      tunnel = await proxy.createTunnel(targetHost, targetPort);
      logger.info(`[TCP Proxy] [${id}] KTP tunnel created, identifier=${tunnel.identifier}`);

      tunnel.onError = (type, msg) => sendError(ERROR_LABELS[type] || msg);

      const responsePromise = HttpCodec.collectResponse(
        (cb) => { tunnel!.onData = cb; },
        (cb) => { proxy!.connection.addEventListener('close', () => cb()); }
      );
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Request timeout')), 10000);
      });

      tunnel.send(raw);
      logger.info(`[TCP Proxy] [${id}] TCP_DATA sent (${raw.length} bytes)`);

      const response = await Promise.race([responsePromise, timeoutPromise]);

      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      pendingAborts.delete(abort);

      logger.info(`[TCP Proxy] <<< [${id}] ${response.statusCode} ${response.statusText} (${response.body.length} bytes)`);
      event.source.postMessage({
        type: 'tcp-response',
        id,
        status: response.statusCode,
        statusText: response.statusText,
        headers: response.headers,
        body: Array.from(response.body),
      });
      tunnel.close();
    } catch (err: any) {
      sendError(err.message);
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
      connection.value = proxy.connection;
      targetHost = host;
      targetPort = port;

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
