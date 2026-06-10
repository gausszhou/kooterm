<template>
  <div class="network-info">
    <div class="network-rtt">⏳ {{ state.rtt }}ms</div>
  </div>
</template>

<script lang="ts" setup>
import { createNetworkInfo } from '@/modules/WebSocketConnection';
import { reactive, watch } from 'vue';

const props = defineProps({
  connection: {
    default: () => createNetworkInfo()
  }
});

const state = reactive(createNetworkInfo());

const updateState = () => {
  state.rtt = props.connection.rtt;
};

const onPong = () => {
  updateState();
};

watch(() => props.connection, (conn, oldConn) => {
  if (oldConn && typeof oldConn.removeEventListener === 'function') {
    oldConn.removeEventListener('pong', onPong);
  }
  if (conn && typeof conn.addEventListener === 'function') {
    conn.addEventListener('pong', onPong);
  }
  updateState();
}, { immediate: true });

defineExpose({
  updateState
})
</script>

<style scoped>
.network-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  line-height: 16px;
}

.network-rtt {
  color: #888;
  min-width: 50px;
  text-align: right;
}
</style>
