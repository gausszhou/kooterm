<template>
  <div class="network-info">
    <div class="network-rtt">⏳ {{ state.rtt }}ms</div>
  </div>
</template>

<script lang="ts" setup>
import { createNetworkInfo } from '@/modules/WebSocketConnection';
import { onMounted, onUnmounted, reactive } from 'vue';

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

onMounted(() => {
  updateState();
  if (props.connection && typeof props.connection.addEventListener === 'function') {
    props.connection.addEventListener('pong', onPong);
  }
});

onUnmounted(() => {
  if (props.connection && typeof props.connection.removeEventListener === 'function') {
    props.connection.removeEventListener('pong', onPong);
  }
});

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
