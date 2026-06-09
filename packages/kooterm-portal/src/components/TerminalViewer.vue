<template>
  <div class="terminal-container">
    <div class="terminal-header">
      <div class="header-left">
        <span class="terminal-title">Kooterm</span>
      </div>
      <div class="header-right">
        <span class="connection-dot" :class="statusClass"></span>
        <span class="connection-label">{{ statusText }}</span>
        <NetworkInfo ref="networkRef" :connection="connection"></NetworkInfo>
        <button class="button refresh-button" @click="refresh">Refresh</button>
      </div>
    </div>
    <div>
      <div ref="terminalRef" class="terminal"></div>
    </div>
  </div>
</template>

<script setup lang="ts">

import NetworkInfo from '@/components/NetworkInfo.vue';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { Frame, FrameType } from '@kooterm/common';
import { WebSocketConnection } from '@/modules/WebSocketConnection';
import { WebSocketDataChannel } from '@/modules/WebSocketDataChannel';
import { useXTermClipboard } from '@/hooks/useXTermClipboard';

const props = defineProps({
  url: {
    type: String,
    default: '/api/ws/terminal'
  }
});

// 组件/元素引用
const networkRef = ref<typeof NetworkInfo>();
const terminalRef = ref<HTMLElement>();
// 响应式数据
const connected = ref(false);
const connecting = ref(false);
const statusClass = computed(() => {
  if (connecting.value) return 'connecting';
  return connected.value ? 'connected' : 'disconnected';
});

const statusText = computed(() => {
  if (connecting.value) return 'Connecting...';
  return connected.value ? 'Connected' : 'Disconnected';
});

// 非响应式数据
let terminal: Terminal;
let fitAddon: FitAddon;
let connection: WebSocketConnection;
let channel: WebSocketDataChannel;

// ====== 终端事件处理 ======
const onData = (data: string) => {
  channel._send(FrameType.TERMINAL_DATA, data);
};

const onResize = () => {
  fitAddon.fit();
};

const initTerminal = () => {
  terminal = new Terminal({
    theme: {
      background: '#1e1e1e',
      foreground: '#ffffff',
      cursor: '#ffffff'
    },
    fontSize: 14,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
    cursorBlink: true
  });
  // 复制
  useXTermClipboard(terminal)

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  // 监听终端输入
  terminal.onData(onData);

  if (terminalRef.value) {
    terminal.open(terminalRef.value);
    setTimeout(() => {
      fitAddon.fit();
    }, 100);
  }
  window.addEventListener('resize', onResize);
};

const destroyTerminal = () => {
  if (terminal) {
    terminal.dispose();
  }
  window.removeEventListener('resize', onResize);
};

// ====== WebSocket 事件处理 ======

const onConnectionPong = () => {};

const onConnectionTimeout = () => {
  console.log('连接超时');
  connection.reconnect(props.url);
};


const onChannelOpen = () => {
  channel._send(FrameType.TERMINAL_INIT, '');
  connected.value = true;
  connecting.value = false;
    networkRef.value?.updateState();
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
  }
};

const initWebSocket = () => {
  connecting.value = true;
  connection = new WebSocketConnection(props.url);
  connection.addEventListener('pong', onConnectionPong);
  connection.addEventListener('timeout', onConnectionTimeout);
  channel = connection.createDataChannel('default');
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
  if (connection) {
    connection.close();
  }
};

// UI 交互
const refresh = () => {
  terminal.reset();
  channel._send(FrameType.TERMINAL_REFRESH, '');
};

onMounted(() => {
  initTerminal();
  initWebSocket();
  window.addEventListener('beforeunload', () => {
    destroyTerminal();
    destroyWebSocket();
  });
});

onUnmounted(() => {
  destroyTerminal();
  destroyWebSocket();
});
</script>

<style>
/* 导入xterm.js样式 */
@import 'xterm/css/xterm.css';
</style>

<style scoped>
.terminal-container {
  width: 100%;
  height: 100%;
}

.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 40px;
  background-color: #2d2d2d;
  padding: 0 15px;
  border-bottom: 1px solid #333;
  gap: 10px;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
}

.header-left {
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.terminal-title {
  font-weight: 600;
  color: #e0e0e0;
  font-size: 14px;
  letter-spacing: 0.5px;
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.connection-dot.connected {
  background-color: #4caf50;
  box-shadow: 0 0 4px #4caf50;
}

.connection-dot.connecting {
  background-color: #ffc107;
  box-shadow: 0 0 4px #ffc107;
  animation: pulse 1s ease-in-out infinite;
}

.connection-dot.disconnected {
  background-color: #f44336;
  box-shadow: 0 0 4px #f44336;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.connection-label {
  font-size: 12px;
  color: #aaa;
}

.terminal {
  padding: 10px;
  height: calc(100svh - 50px);
  height: calc(100vh - 50px);
}

.button {
  padding: 4px 8px;
  color: #ccc;
  border: 1px solid #555;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  background-color: transparent;
  line-height: 20px;
}

.button:hover {
  background-color: #555;
  color: #fff;
}
</style>
