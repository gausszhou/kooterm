<template>
  <div class="vnc-container">
    <div class="terminal-header">
      <div class="terminal-title">Kooterm</div>
      <NetworkInfo ref="networkRef" :connection="connection"></NetworkInfo>
    </div>
    <!-- VNC 显示区域 -->
    <div ref="screenRef" class="vnc-screen"></div>
    <!-- 连接状态 -->
    <div v-if="!connected" class="connection-status">
      <Loading v-if="connecting" message="正在连接 VNC 服务器..." />
      <div v-else class="disconnected">
        <span>未连接</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import Loading from '@/components/Loading.vue';
import NetworkInfo from '@/components/NetworkInfo.vue';
import { default as NoVncClient, default as RFB } from '@novnc/novnc/lib/rfb';
import { FrameCodec, FrameType } from '@kooterm/common';
import { onMounted, onUnmounted, ref } from 'vue';
import { WebSocketConnection } from '@/modules/WebSocketConnection';
import { WebSocketDataChannel } from '@/modules/WebSocketDataChannel';
import { useRFBClipboard } from '@/hooks/useRFBClipbaord';
import { getLogger } from 'loglevel';

const logger = getLogger('VNCViewer');

// 配置参数（使用默认值）
const props = defineProps({
  url: {
    type: String,
    default: '/api/ws/vnc'
  },
  reconnect: {
    type: Boolean,
    default: true
  },
  reconnectDelay: {
    type: Number,
    default: 5000
  }
});

// 组件/元素引用
const networkRef = ref<typeof NetworkInfo>();
const screenRef = ref<HTMLDivElement>();
// 响应式数据
const connected = ref(false);
const connecting = ref(false);
// 非响应式数据
let rfb: NoVncClient;
let rfbClipboardClear: () => void;
let connection: WebSocketConnection;
let channel: WebSocketDataChannel;

const encode = (data: string | ArrayBuffer) => {
  const frame = FrameCodec.create(FrameType.VNC_DATA, channel.identifier, data);
  return frame.toBuffer();
};

const onChannelOpen = () => {
  console.log(channel.identifier, '数据通道打开');
  channel._send(FrameType.VNC_INIT, '');
  networkRef.value?.updateState();
};

const onChannelMessage = (event: Event) => {
  logger.debug(channel.identifier, '收到数据通道消息');
};

// 连接 VNC
const connect = () => {
  if (!screenRef.value) return;
  connecting.value = true;
  connection = new WebSocketConnection(props.url);
  channel = connection.createDataChannel('vnc');
  channel.encode = encode;
  channel.addEventListener('open', onChannelOpen);
  channel.addEventListener('message', onChannelMessage);
  try {
    rfb = new RFB(screenRef.value, channel, {
      credentials: {
        username: 'default',
        password: 'vncpassword',
        target: 'default'
      }
    });
    // 剪贴板
    rfbClipboardClear = useRFBClipboard(rfb);
    // 事件监听
    rfb.addEventListener('connect', onConnect);
    rfb.addEventListener('disconnect', onDisconnect);
    rfb.addEventListener('credentialsrequired', onCredentialsRequired);
    rfb.addEventListener('securityfailure', onSecurityFailure);
    rfb.addEventListener('desktopname', onDesktopName);
  } catch (error) {
    console.error('VNC 连接失败:', error);
    connecting.value = false;
  }
};

// 事件处理函数
const onConnect = () => {
  console.log('VNC 连接成功');
  connected.value = true;
  connecting.value = false;
};

const onDisconnect = () => {
  console.log('VNC 连接断开');
  connected.value = false;
  connecting.value = false;
};

const onCredentialsRequired = (event: CustomEvent) => {
  console.log('需要认证:', event.detail);
  // 如果需要密码但未提供，可以在这里处理
};

const onSecurityFailure = (event: CustomEvent) => {
  console.error('安全认证失败:', event.detail);
  connecting.value = false;
};

const onDesktopName = (event: CustomEvent) => {
  console.log('桌面名称:', event.detail.name);
};

const dispose = () => {
  if (rfb) {
    rfb.disconnect();
  }
  if (rfbClipboardClear) {
    rfbClipboardClear();
  }
  if (channel) {
    channel.close();
  }
  if (connection) {
    connection.close();
  }
};

// 组件挂载时连接
onMounted(() => {
  connect();
  window.addEventListener('beforeunload', () => {
    dispose();
  });
});

// 组件卸载时断开连接
onUnmounted(() => {
  dispose();
});
</script>

<style scoped>
.vnc-container {
  position: relative;
  width: 100%;
  height: 100vh;
  background: #000;
}

.terminal-header {
  height: 40px;
  background-color: #2d2d2d;
  padding: 0px 15px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
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
