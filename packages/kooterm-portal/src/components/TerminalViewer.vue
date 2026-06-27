<template>
  <div class="terminal-page-container">
    <StatusBar
      title="KooTerm"
      :connected="connected"
      :connecting="connecting"
      :connection="connection"
    />
    <div ref="terminalRef" class="terminal-container"></div>
  </div>
</template>

<script setup lang="ts">
import StatusBar from '@/components/StatusBar.vue';
import { ref, onMounted, onUnmounted } from 'vue';
import { useTerminal } from '@/hooks/useTerminal';

const props = defineProps({
  url: {
    type: String,
    default: '/portal-direct-api/ws/terminal'
  }
});

const terminalRef = ref<HTMLElement>();
const { connected, connecting, connection, init, destroy } = useTerminal(terminalRef);

onMounted(() => init(props.url));
onUnmounted(destroy);
</script>

<style scoped>
.terminal-page-container {
  width: 100%;
  height: 100%;
}

.terminal-container {
  padding: 8px;
  height: calc(100vh - 36px);
  background-color: #0a0a0a;
}
</style>
