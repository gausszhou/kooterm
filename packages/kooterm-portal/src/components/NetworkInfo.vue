<template>
  <div class="network-info">
    <span class="network-speed">↑ {{ fmtSpeed(state.upSpeed) }}</span>
    <span class="network-speed">↓ {{ fmtSpeed(state.downSpeed) }}</span>
    <span class="network-rtt">⏳ {{ state.rtt }}ms</span>
  </div>
</template>

<script lang="ts" setup>
import { createNetworkInfo } from '@kooterm/common';
import { reactive, watch, onUnmounted } from 'vue';

const props = defineProps({
  connection: {
    default: () => createNetworkInfo()
  }
});

const state = reactive(createNetworkInfo());

const fmtSpeed = (bytes: number): string => {
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + ' MB';
  if (bytes >= 1_000) return (bytes / 1_000).toFixed(0) + ' KB';
  return bytes + ' B';
};

const updateState = () => {
  const c = props.connection;
  if (!c) return;
  state.rtt = c.rtt;
  state.upSpeed = c.upSpeed;
  state.downSpeed = c.downSpeed;
  state.upBytes = c.upBytes;
  state.downBytes = c.downBytes;
  state.isConnected = c.isConnected;
};

const onPong = () => updateState();

let currentConn: any = null;
let speedTimer: ReturnType<typeof setInterval> | null = null;

const startSpeedPoll = (conn: any) => {
  stopSpeedPoll();
  if (!conn) return;
  speedTimer = setInterval(() => updateState(), 1000);
};

const stopSpeedPoll = () => {
  if (speedTimer !== null) {
    clearInterval(speedTimer);
    speedTimer = null;
  }
};

watch(() => props.connection, (conn, oldConn) => {
  if (oldConn && typeof oldConn.removeEventListener === 'function') {
    oldConn.removeEventListener('pong', onPong);
  }
  if (conn && typeof conn.addEventListener === 'function') {
    conn.addEventListener('pong', onPong);
  }
  startSpeedPoll(conn);
  currentConn = conn;
  updateState();
}, { immediate: true });

onUnmounted(() => {
  stopSpeedPoll();
  if (currentConn && typeof currentConn.removeEventListener === 'function') {
    currentConn.removeEventListener('pong', onPong);
  }
});

defineExpose({ updateState })
</script>

<style scoped>
.network-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 16px;
}

.network-speed {
  color: #888;
  min-width: 40px;
}

.network-rtt {
  color: #666;
  min-width: 50px;
  text-align: right;
}
</style>
