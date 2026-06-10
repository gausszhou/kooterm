import { updateSystemClipboard } from '@/utils/clipboard';
import NoVncClient from '@novnc/novnc/lib/rfb';
import { getLogger } from 'loglevel';

const logger = getLogger('RfbClipboard');
logger.setLevel('debug');

export function useRfbClipboard(rfb: NoVncClient) {
  let isConnected = false;
  const onConnect = () => isConnected = true;
  const onDisconnect = () =>  isConnected = false;

  const onClipboard = (e: CustomEvent) => {
    const text = e.detail.text as string;
    logger.info('Received clipboard from remote:', text);
    updateSystemClipboard(text);
  };

  const onFocus = async () => {
    if (isConnected) {
      const text = await navigator.clipboard.readText();
      rfb.clipboardPasteFrom(text);
      logger.debug('Sent clipboard to remote:', text.substring(0, 50) + '...');
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
