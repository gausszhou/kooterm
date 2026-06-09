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

let state = reactive(createNetworkInfo());
let timer = 0;

const updateState = () => {
  state.rtt = props.connection.rtt;
};

onMounted(() => {
  updateState();
  timer = setInterval(() => {
    updateState();
  }, 1000);
});

onUnmounted(() => {
  clearInterval(timer);
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
