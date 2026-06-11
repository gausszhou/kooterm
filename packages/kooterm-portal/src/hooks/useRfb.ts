import { ref, shallowRef, type Ref } from 'vue';
import RFB from '@novnc/novnc/lib/rfb';
import { FrameCodec, FrameType } from '@kooterm/common';
import { WebSocketConnection, WebSocketDataChannel } from '@kooterm/common';
import { useRfbClipboard } from '@/hooks/useRfbClipboard';
import { getLogger } from 'loglevel';

const logger = getLogger('useRfb');

export function useRfb(screenRef: Ref<HTMLElement | undefined>) {
  const connected = ref(false);
  const connecting = ref(false);
  const networkRef = ref();

  let rfb!: RFB;
  let rfbClipboardClear!: () => void;
  const connection = shallowRef<WebSocketConnection>();
  let channel!: WebSocketDataChannel;

  const encode = (data: string | ArrayBuffer) => {
    const frame = FrameCodec.create(FrameType.VNC_DATA, channel.identifier, data);
    return frame.toBuffer();
  };

  const onChannelOpen = () => {
    logger.debug(channel.identifier, '数据通道打开');
    channel._send(FrameType.VNC_INIT, '');
    networkRef.value?.updateState();
  };

  const onChannelMessage = (event: Event) => {
    logger.debug(channel.identifier, '收到数据通道消息');
  };

  const onConnect = () => {
    logger.debug('VNC 连接成功');
    connected.value = true;
    connecting.value = false;
  };

  const onDisconnect = () => {
    logger.debug('VNC 连接断开');
    connected.value = false;
    connecting.value = false;
  };

  const onCredentialsRequired = (event: CustomEvent) => {
    console.warn('需要认证:', event.detail);
  };

  const onSecurityFailure = (event: CustomEvent) => {
    console.error('安全认证失败:', event.detail);
    connecting.value = false;
  };

  const onDesktopName = (event: CustomEvent) => {
    logger.debug('桌面名称:', event.detail.name);
  };

  const init = (url: string) => {
    if (!screenRef.value) return;
    connecting.value = true;
    connection.value = new WebSocketConnection(url);
    channel = connection.value.createDataChannel('vnc');
    channel.encode = encode;
    channel.addEventListener('open', onChannelOpen);
    channel.addEventListener('message', onChannelMessage);
    try {
      rfb = new RFB(screenRef.value, channel, {
        credentials: {
          username: 'default',
          password: 'vncpassword',
          target: 'default'
        },
        compress: true,
        quality: 6,
        encoding: 'Tight',
        resize: true,
      });
      rfbClipboardClear = useRfbClipboard(rfb);
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

  const destroy = () => {
    if (rfb) {
      rfb.disconnect();
    }
    if (rfbClipboardClear) {
      rfbClipboardClear();
    }
    if (channel) {
      channel.close();
    }
    if (connection.value) {
      connection.value.close();
    }
  };

  return {
    connected,
    connecting,
    networkRef,
    connection,
    init,
    destroy,
  };
}
