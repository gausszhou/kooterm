/**
 * 剪贴板更新回退方案
 * @param text 
 */
function fallbackClipboardUpdate(text: string): void {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();

  try {
    document.execCommand('copy');
  } catch (error) {
    console.error('Fallback clipboard update failed:', error);
  }

  document.body.removeChild(textArea);
}

/**
 * 更新系统剪贴板
 * @param text 
 */
export async function updateSystemClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackClipboardUpdate(text);
    }
  } catch (error) {
    fallbackClipboardUpdate(text);
  }
}
