<template>
  <div class="status-bar">
    <div class="header-left">
      <span class="bar-title">{{ title }}</span>
    </div>
    <div class="header-right">
      <span v-if="error" class="error-label">{{ error }}</span>
      <span class="connection-dot" :class="statusClass"></span>
      <span class="connection-label">{{ statusText }}</span>
      <NetworkInfo ref="networkRef" :connection="connection"></NetworkInfo>
    </div>
  </div>
</template>

<script setup lang="ts">
import NetworkInfo from './NetworkInfo.vue';
import { computed, ref } from 'vue';

const props = defineProps({
  title: { type: String, default: '' },
  connected: { type: Boolean, default: false },
  connecting: { type: Boolean, default: false },
  error: { type: String, default: '' },
  connection: { type: Object, default: null },
});

const networkRef = ref();

defineExpose({ networkRef });

const statusClass = computed(() => {
  if (props.connecting) return 'connecting';
  return props.connected ? 'connected' : 'disconnected';
});

const statusText = computed(() => {
  if (props.connecting) return 'Connecting...';
  return props.connected ? 'Connected' : 'Disconnected';
});
</script>

<style scoped>
.status-bar {
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

.bar-title {
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
</style>
