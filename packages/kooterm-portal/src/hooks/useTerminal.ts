import { ref, shallowRef, computed, type Ref } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { Frame, FrameType, WebSocketConnection, WebSocketDataChannel } from '@kooterm/common';
import { useXTermClipboard } from '@/hooks/useXTermClipboard';

export function useTerminal(terminalRef: Ref<HTMLElement | undefined>) {
  const connected = ref(false);
  const connecting = ref(false);
  const networkRef = ref();

  const statusClass = computed(() => {
    if (connecting.value) return 'connecting';
    return connected.value ? 'connected' : 'disconnected';
  });

  const statusText = computed(() => {
    if (connecting.value) return 'Connecting...';
    return connected.value ? 'Connected' : 'Disconnected';
  });

  const SESSION_KEY = 'kooterm_ssh_session';

  let terminal: Terminal;
  let fitAddon: FitAddon;
  const connection = shallowRef<WebSocketConnection>();
  let channel: WebSocketDataChannel;
  let resizeObs: ResizeObserver;
  let resizeDisposable: { dispose: () => void };

  function getSessionId(): string {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  const sendResize = (cols?: number, rows?: number) => {
    if (!terminal || !channel || channel.readyState !== WebSocket.OPEN) return;
    cols ??= terminal.cols;
    rows ??= terminal.rows;
    const buffer = new Uint8Array(4);
    const view = new DataView(buffer.buffer);
    view.setUint16(0, cols);
    view.setUint16(2, rows);
    channel._send(FrameType.TERMINAL_RESIZE, buffer);
  };

  const onData = (data: string) => {
    if (!channel || channel.readyState !== WebSocket.OPEN) return;
    channel._send(FrameType.TERMINAL_DATA, data);
  };

  const onConnectionTimeout = (url: string) => {
    connection.value?.reconnect(url);
  };

  const onChannelOpen = () => {
    connected.value = true;
    connecting.value = false;
    networkRef.value?.updateState();
    try { channel._send(FrameType.TERMINAL_INIT, getSessionId()); } catch (e) { console.error('TERMINAL_INIT send failed:', e); }
  };

  const onChannelClose = () => {
    connected.value = false;
    connecting.value = false;
  };

  const onChannelMessage = (event: Event) => {
    const frame = (event as MessageEvent).data as Frame;
    if (frame.type === FrameType.TERMINAL_DATA) {
      const text = new TextDecoder().decode(frame.payload);
      terminal.write(text);
    } else if (frame.type === FrameType.TERMINAL_INIT || frame.type === FrameType.TERMINAL_REFRESH) {
      requestAnimationFrame(() => {
        fitAddon.fit();
        sendResize();
      });
    }
  };

  const initTerminal = () => {
    terminal = new Terminal({
      allowProposedApi: true,
      theme: {
        background: '#0a0a0a',
        foreground: '#ffffff',
        cursor: '#ffffff',
      },
      fontSize: 14,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
      cursorBlink: true,
      convertEol: true,
    });

    useXTermClipboard(terminal);

    terminal.loadAddon(new ClipboardAddon());
    terminal.loadAddon(new Unicode11Addon());
    terminal.unicode.activeVersion = '11';

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.onData(onData);
    terminal.onResize(({ cols, rows }) => sendResize(cols, rows));

    resizeObs = new ResizeObserver(() => fitAddon.fit());

    if (terminalRef.value) {
      terminal.open(terminalRef.value);
      resizeObs.observe(terminalRef.value);
      requestAnimationFrame(() => fitAddon.fit());
    }
  };

  const destroyTerminal = () => {
    if (resizeDisposable) resizeDisposable.dispose();
    if (resizeObs) resizeObs.disconnect();
    if (terminal) terminal.dispose();
  };

  const initWebSocket = (url: string) => {
    connecting.value = true;
    connection.value = new WebSocketConnection(url);

    connection.value.addEventListener('timeout', () => onConnectionTimeout(url));
    channel = connection.value.createDataChannel('default');
    channel.addEventListener('open', onChannelOpen);
    channel.addEventListener('close', onChannelClose);
    channel.addEventListener('message', onChannelMessage);
  };

  const destroyWebSocket = () => {
    if (channel) {
      channel.removeEventListener('open', onChannelOpen);
      channel.removeEventListener('close', onChannelClose);
      channel.removeEventListener('message', onChannelMessage);
    }
    if (connection.value) connection.value.close();
  };

  const refresh = () => {
    if (!terminal || !channel || channel.readyState !== WebSocket.OPEN) return;
    terminal.reset();
    channel._send(FrameType.TERMINAL_REFRESH, getSessionId());
  };

  const init = (url: string) => {
    initTerminal();
    initWebSocket(url);
  };

  const destroy = () => {
    destroyTerminal();
    destroyWebSocket();
  };

  return {
    connected,
    connecting,
    networkRef,
    statusClass,
    statusText,
    connection,
    refresh,
    init,
    destroy,
  };
}
