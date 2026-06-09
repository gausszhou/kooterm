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
import { ref, onMounted, onUnmounted } from 'vue';
import { useTerminal } from '@/hooks/useTerminal';

const props = defineProps({
  url: {
    type: String,
    default: '/api/ws/terminal'
  }
});

const terminalRef = ref<HTMLElement>();
const { connected, connecting, networkRef, statusClass, statusText, connection, refresh, init, destroy } = useTerminal(terminalRef);

onMounted(() => init(props.url));
onUnmounted(destroy);
</script>

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
  padding: 5px;
  height: calc(100svh - 50px);
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
