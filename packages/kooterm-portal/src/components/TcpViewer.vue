<template>
  <div class="tcp-container">
    <StatusBar
      :title="title"
      :connected="connected"
      :connecting="connecting"
      :error="error"
      :connection="connection"
    />
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
import StatusBar from '@/components/StatusBar.vue';
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
  wsUrl: {
    type: String,
    default: '/portal-direct-api/ws/tcp',
  },
});

const targetHost = 'localhost';

const iframeRef = ref<HTMLIFrameElement>();

const { connected, connecting, connection, error, init, destroy } = useTcpProxy();

const iframeSrc = computed(() => {
  if (!connected.value) return '';
  return `/tcp-proxy/${targetHost}:${props.port}/`;
});

onMounted(() => {
  init(props.wsUrl, targetHost, props.port);
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
