<template>
  <div class="tcp-container">
    <div class="terminal-header">
      <div class="header-left">
        <span class="terminal-title">{{ title }}</span>
      </div>
      <div class="header-right">
        <span class="connection-dot" :class="statusClass"></span>
        <span class="connection-label">{{ statusText }}</span>
        <span v-if="error" class="error-label">{{ error }}</span>
        <NetworkInfo ref="networkRef" :connection="connection"></NetworkInfo>
      </div>
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
        <span>{{ connecting ? '连接中...' : '连接失败' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import NetworkInfo from '@/components/NetworkInfo.vue';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useTcpProxy } from '@/hooks/useTcpProxy';

const props = defineProps({
  title: {
    type: String,
    default: 'TCP',
  },
  port: {
    type: Number,
    required: true,
  },
  host: {
    type: String,
    default: 'debian-xfce-vnc',
  },
  wsUrl: {
    type: String,
    default: '/portal-direct-api/ws/tcp',
  },
});

const iframeRef = ref<HTMLIFrameElement>();

const { connected, connecting, connection, networkRef, error, init, destroy } = useTcpProxy();

const iframeSrc = computed(() => {
  if (!connected.value) return '';
  return `/tcp-proxy/${props.host}:${props.port}/`;
});

const statusClass = computed(() => {
  if (connecting.value) return 'connecting';
  return connected.value ? 'connected' : 'disconnected';
});

const statusText = computed(() => {
  if (connecting.value) return 'Connecting...';
  return connected.value ? 'Connected' : 'Disconnected';
});

onMounted(() => {
  init(props.wsUrl, props.host, props.port);
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
