import { Terminal } from '@xterm/xterm';

/**
 * XTerm Copy/Paste support
 * https://github.com/xtermjs/xterm.js/issues/2478
 * @param terminal 
 */
export function useXTermClipboard(terminal: Terminal) {
  terminal.attachCustomKeyEventHandler(arg => {
    if (arg.type === 'keydown') {
      if (arg.ctrlKey && arg.shiftKey && arg.code === 'KeyC') {
        const selection = terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          return false;
        }
      }
      if (arg.ctrlKey && arg.shiftKey && arg.code === 'KeyV') {
        return false;
      }
    }
    return true;
  });
}
