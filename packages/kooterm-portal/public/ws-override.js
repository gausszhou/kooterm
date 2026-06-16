(function () {
  if (window.__wsProxyInstalled) return;
  window.__wsProxyInstalled = true;

  const NativeWebSocket = window.WebSocket;

  const pendingSessions = new Map();

  class ProxiedWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    CONNECTING = 0;
    OPEN = 1;
    CLOSING = 2;
    CLOSED = 3;

    url;
    readyState = ProxiedWebSocket.CONNECTING;
    protocol = '';
    extensions = '';
    bufferedAmount = 0;
    binaryType = 'arraybuffer';

    onopen = null;
    onclose = null;
    onerror = null;
    onmessage = null;

    #sessionId;
    #closed = false;

    constructor(url, protocols) {
      this.url = url;

      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
          throw new Error('Invalid WebSocket URL: ' + url);
        }
        const host = parsed.hostname;
        const port = parsed.port
          ? parseInt(parsed.port, 10)
          : parsed.protocol === 'wss:' ? 443 : 80;
        const path = parsed.pathname + parsed.search + parsed.hash;
        const protos = protocols
          ? Array.isArray(protocols) ? protocols : [protocols]
          : [];

        this.#sessionId = crypto.randomUUID();
        pendingSessions.set(this.#sessionId, this);

        window.addEventListener('message', this.#onMessage);

        window.parent.postMessage(
          { type: 'ws-open', sessionId: this.#sessionId, host, port, path, protocols: protos },
          '*'
        );
      } catch (e) {
        this.readyState = ProxiedWebSocket.CLOSED;
        queueMicrotask(() => {
          const event = new ErrorEvent('error', { error: e, message: e.message });
          this.onerror?.(event);
        });
      }
    }

    send(data) {
      if (this.readyState !== ProxiedWebSocket.OPEN || this.#closed) return;
      const buffer = data instanceof ArrayBuffer ? data
        : data instanceof Blob ? data
        : typeof data === 'string' ? new TextEncoder().encode(data).buffer
        : data.buffer || data;

      window.parent.postMessage(
        { type: 'ws-data', sessionId: this.#sessionId, data: buffer },
        '*'
      );
    }

    close(code, reason) {
      if (this.#closed) return;
      this.#closed = true;
      this.readyState = ProxiedWebSocket.CLOSING;
      window.parent.postMessage(
        { type: 'ws-close', sessionId: this.#sessionId, code: code || 1000, reason: reason || '' },
        '*'
      );
    }

    #onMessage = (event) => {
      const { type, sessionId } = event.data || {};
      if (sessionId !== this.#sessionId) return;

      if (type === 'ws-opened') {
        this.readyState = ProxiedWebSocket.OPEN;
        this.protocol = event.data.protocol || '';
        queueMicrotask(() => {
          this.onopen?.(new Event('open'));
        });
        return;
      }

      if (type === 'ws-message') {
        if (this.readyState !== ProxiedWebSocket.OPEN) return;
        const raw = event.data.data;
        const data = typeof raw === 'string' ? raw
          : raw instanceof ArrayBuffer ? raw
          : raw.buffer || raw;
        const me = new MessageEvent('message', { data });
        queueMicrotask(() => {
          this.onmessage?.(me);
        });
        return;
      }

      if (type === 'ws-closed') {
        this.readyState = ProxiedWebSocket.CLOSED;
        this.#closed = true;
        window.removeEventListener('message', this.#onMessage);
        pendingSessions.delete(this.#sessionId);
        const ce = new CloseEvent('close', {
          code: event.data.code || 1005,
          reason: event.data.reason || '',
          wasClean: true,
        });
        queueMicrotask(() => {
          this.onclose?.(ce);
        });
        return;
      }

      if (type === 'ws-error') {
        this.readyState = ProxiedWebSocket.CLOSED;
        this.#closed = true;
        window.removeEventListener('message', this.#onMessage);
        pendingSessions.delete(this.#sessionId);
        const ee = new ErrorEvent('error', { message: event.data.message || 'WebSocket error' });
        queueMicrotask(() => {
          this.onerror?.(ee);
        });
        return;
      }
    };
  }

  window.WebSocket = ProxiedWebSocket;
})();
