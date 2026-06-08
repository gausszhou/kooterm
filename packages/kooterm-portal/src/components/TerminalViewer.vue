<template>
  <div class="terminal-container">
    <div class="terminal-header">
      <div class="terminal-title">Kooterm</div>
      <div class="button-container">
        <button class="button refresh-button" @click="refresh">刷新</button>
      </div>
      <NetworkInfo ref="networkRef" :connection="connection"></NetworkInfo>
    </div>
    <div v-if="!connected" class="connection-status">
      <Loading v-if="connecting" message="正在连接终端服务器..." />
      <div v-else class="disconnected">
        <span>未连接</span>
      </div>
    </div>
    <div>
      <div ref="terminalRef" class="terminal"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Loading from '@/components/Loading.vue';
import NetworkInfo from '@/components/NetworkInfo.vue';
import { ref, onMounted, onUnmounted } from 'vue';
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
    fontFamily: "Consolas, 'Courier New', monospace",
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
  console.log('数据通道已关闭');
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
  padding: 0px 15px;
  border-bottom: 1px solid #333;
  gap: 10px;
}

.terminal {
  padding: 10px;
  height: calc(100svh - 50px);
  height: calc(100vh - 50px);
}

.terminal-title {
  font-weight: bold;
  color: #cccccc;
}

.button-container {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 5px;
}

.button {
  padding: 5px 10px;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  line-height: 20px;
  border: none;
  background-color: transparent;
}

.button:hover {
  background-color: #555;
}

.terminal-latency {
  color: #888;
  font-size: 12px;
}

.connection-status {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  text-align: center;
  z-index: 99;
}

.disconnected {
  color: #ccc;
}
</style>
