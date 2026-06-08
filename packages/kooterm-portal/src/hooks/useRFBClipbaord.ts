import { updateSystemClipboard } from '@/utils/clipboard';
import NoVncClient from '@novnc/novnc/lib/rfb';
import { getLogger } from 'loglevel';

const logger = getLogger('RFBClipboard');
logger.setLevel('debug');

export function useRFBClipboard(rfb: NoVncClient) {
  let isConnected = false;
  // 监听连接状态
  const onConnect = () => isConnected = true;
  // 监听断开状态
  const onDisconnect = () =>  isConnected = false;

  // 设置剪贴板接收回调
  const onClipboard = (e: CustomEvent) => {
    const text = e.detail.text as string;
    logger.info('Received clipboard from remote:', text);
    updateSystemClipboard(text);
  };

  // 设置页面接受回调
  const onFocus = async () => {
    if (isConnected) {
      const text = await navigator.clipboard.readText();
      rfb.clipboardPasteFrom(text);
      console.log('Sent clipboard to remote:', text.substring(0, 50) + '...');
    }
  };

  rfb.addEventListener('connect', onConnect);
  rfb.addEventListener('disconnect', onDisconnect);
  rfb.addEventListener('clipboard', onClipboard);
  window.addEventListener('focus', onFocus);

  return () => {
    rfb.removeEventListener('clipboard', onClipboard);
    rfb.removeEventListener('connect', onConnect);
    rfb.removeEventListener('disconnect', onDisconnect);
    window.removeEventListener('focus', onFocus);
  };
}
