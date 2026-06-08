import { Terminal } from 'xterm';

/**
 * XTerm Copy/Paste support
 * https://github.com/xtermjs/xterm.js/issues/2478
 * @param terminal 
 */
export function useXTermClipboard(terminal: Terminal) {
  // 复制
  terminal.attachCustomKeyEventHandler(arg => {
    if (arg.ctrlKey && arg.code === 'KeyC' && arg.type === 'keydown') {
      const selection = terminal.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
        return false;
      }
    }
    return true;
  });

  terminal.attachCustomKeyEventHandler(arg => {
    if (arg.ctrlKey && arg.code === 'KeyV' && arg.type === 'keydown') {
      return false;
    }
    return true;
  });
}
