<template>
  <div class="vnc-container">
    <StatusBar
      title="KooTerm"
      :connected="connected"
      :connecting="connecting"
      :connection="connection"
    />
    <div ref="screenRef" class="vnc-screen"></div>
    <div v-if="!connected" class="connection-status">
      <Loading v-if="connecting" message="Connecting to VNC server..." />
      <div v-else class="disconnected">
        <span>Disconnected</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import StatusBar from '@/components/StatusBar.vue';
import Loading from '@/components/Loading.vue';
import { onMounted, onUnmounted, ref } from 'vue';
import { useRfb } from '@/hooks/useRfb';

const props = defineProps({
  url: {
    type: String,
    default: '/portal-direct-api/ws/vnc'
  }
});

const screenRef = ref<HTMLDivElement>();
const { connected, connecting, connection, init, destroy } = useRfb(screenRef);

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

.vnc-screen {
  width: 100%;
  height: calc(100svh - 50px);
  height: calc(100vh - 50px);
  min-height: 400px;
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
