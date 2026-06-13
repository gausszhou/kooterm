<template>
  <div class="tcp-container">
    <div class="terminal-header">
      <div class="header-left">
        <span class="terminal-title">KooTerm</span>
      </div>
      <div class="header-right">
        <span class="connection-dot" :class="statusClass"></span>
        <span class="connection-label">{{ statusText }}</span>
        <span v-if="error" class="error-label">{{ error }}</span>
        <NetworkInfo ref="networkRef" :connection="connection"></NetworkInfo>
      </div>
    </div>
    <div class="address-bar">
      <input
        v-model="address"
        class="address-input"
        placeholder="4096"
        @keydown.enter="handleConnect"
      />
      <button class="button connect-button" @click="handleConnect" :disabled="connecting">
        {{ connected ? '断开' : '连接' }}
      </button>
    </div>
    <div class="iframe-wrapper">
      <iframe
        v-if="connected"
        ref="iframeRef"
        :src="iframeSrc"
        class="tcp-iframe"
        sandbox="allow-same-origin allow-scripts"
      ></iframe>
      <div v-else class="iframe-placeholder">
        <span v-if="connecting">连接中...</span>
        <span v-else>输入端口并点击连接</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import NetworkInfo from '@/components/NetworkInfo.vue';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useTcpProxy } from '@/hooks/useTcpProxy';

const props = defineProps({
  url: {
    type: String,
    default: '/portal-direct-api/ws/tcp',
  },
});

const DEFAULT_PORT = '4096';
const TARGET_HOST = 'debian-xfce-vnc';

const address = ref(DEFAULT_PORT);
const iframeRef = ref<HTMLIFrameElement>();

const { connected, connecting, connection, networkRef, error, init, destroy } = useTcpProxy();

const iframeSrc = computed(() => {
  if (!connected.value) return '';
  return `/tcp-proxy/${TARGET_HOST}:${address.value}/`;
});

const statusClass = computed(() => {
  if (connecting.value) return 'connecting';
  return connected.value ? 'connected' : 'disconnected';
});

const statusText = computed(() => {
  if (connecting.value) return 'Connecting...';
  return connected.value ? 'Connected' : 'Disconnected';
});

function parseAddress(raw: string): { host: string; port: number } | null {
  const port = parseInt(raw.trim(), 10);
  if (isNaN(port) || port <= 0 || port > 65535) return null;
  return { host: TARGET_HOST, port };
}

function handleConnect() {
  if (connected.value) {
    destroy();
    return;
  }

  const target = parseAddress(address.value);
  if (!target) {
    error.value = 'Invalid port number';
    return;
  }

  // 持久化到 URL
  const url = new URL(window.location.href);
  url.searchParams.set('port', address.value);
  history.replaceState(null, '', url.toString());

  init(props.url, target.host, target.port);
}

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  const saved = params.get('port');
  if (saved) {
    address.value = saved;
  }
});

onUnmounted(() => {
  destroy();
});
</script>

<style scoped>
.tcp-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 32px;
  background-color: #141414;
  padding: 0 8px;
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

.error-label {
  font-size: 12px;
  color: #f44336;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.address-bar {
  display: flex;
  align-items: center;
  height: 40px;
  background-color: #1a1a1a;
  padding: 4px 8px;
  gap: 8px;
  border-bottom: 1px solid #333;
}

.address-input {
  flex: 1;
  height: 28px;
  padding: 0 8px;
  background-color: #0a0a0a;
  border: 1px solid #444;
  border-radius: 3px;
  color: #e0e0e0;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
  outline: none;
}

.address-input:focus {
  border-color: #666;
}

.button {
  height: 28px;
  padding: 0 12px;
  color: #ccc;
  border: 1px solid #555;
  border-radius: 3px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  background-color: transparent;
  line-height: 28px;
  white-space: nowrap;
}

.button:hover:not(:disabled) {
  background-color: #555;
  color: #fff;
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.iframe-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.tcp-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background-color: #fff;
}

.iframe-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  font-size: 14px;
}
</style>
