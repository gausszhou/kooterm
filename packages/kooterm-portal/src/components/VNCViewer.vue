<template>
  <div class="vnc-container">
    <div class="terminal-header">
            <div class="header-left">
        <span class="terminal-title">KooTerm</span>
      </div>
      <NetworkInfo ref="networkRef" :connection="connection"></NetworkInfo>
    </div>
    <!-- VNC 显示区域 -->
    <div ref="screenRef" class="vnc-screen"></div>
    <!-- 连接状态 -->
    <div v-if="!connected" class="connection-status">
      <Loading v-if="connecting" message="Connecting to VNC server..." />
      <div v-else class="disconnected">
        <span>Disconnected</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import Loading from '@/components/Loading.vue';
import NetworkInfo from '@/components/NetworkInfo.vue';
import { onMounted, onUnmounted, ref } from 'vue';
import { useVnc } from '@/hooks/useVnc';

const props = defineProps({
  url: {
    type: String,
    default: '/api/ws/vnc'
  }
});

const screenRef = ref<HTMLDivElement>();
const { connected, connecting, networkRef, connection, init, destroy } = useVnc(screenRef);

onMounted(() => {
  init(props.url);
  window.addEventListener('beforeunload', destroy);
});

onUnmounted(() => {
  destroy();
});
</script>

<style scoped>
.vnc-container {
  position: relative;
  width: 100%;
  height: 100vh;
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

.vnc-screen {
  width: 100%;
  height: calc(100svh - 50px);
  height: calc(100vh - 50px);
  min-height: 400px;
}

.terminal-title {
  font-weight: bold;
  color: #cccccc;
}

.connection-status {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  text-align: center;
}

.connection-status .disconnected {
  color: #ccc;
}
</style>
