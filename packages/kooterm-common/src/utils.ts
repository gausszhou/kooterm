// S->C: Unknown Server (82) - 12 bytes
// C->S: Unknown Client (82) - 12 bytes
// S->C: Bell - 3 bytes
// C->S: FramebufferUpdateRequest - 1 bytes
// S->C: Unknown Server (146) - 16 bytes
// C->S: Unknown Client (31) - 16 bytes
// S->C: FramebufferUpdate - 4 bytes
// C->S: SetEncodings - 1 bytes
// S->C: FileTransfer - 58 bytes
// C->S: SetPixelFormat - 20 bytes
// C->S: FramebufferUpdateRequest - 92 bytes

export function analyzeVNCMessage(data: Uint8Array, direction: string) {
  if (data.length >= 1) {
    const messageType = data[0];
    const directionStr = direction === 'client_to_server' ? 'C->S' : 'S->C';

    const messageTypes: Record<number, string> = {
      0: 'SetPixelFormat',
      1: 'SetEncodings',
      2: 'FramebufferUpdateRequest',
      3: 'KeyEvent',
      4: 'PointerEvent',
      5: 'ClientCutText',
      6: 'FileTransfer',
      7: 'SetScale',
      8: 'SetServerInput',
      9: 'SetSW',
      10: 'TextChat',
      11: 'KeyFrameRequest',
      12: 'KeepAlive',
      13: 'SetSession'
    };

    const serverMessageTypes: Record<number, string> = {
      0: 'FramebufferUpdate',
      1: 'SetColorMapEntries',
      2: 'Bell',
      3: 'ServerCutText',
      4: 'ResizeFrameBuffer',
      5: 'KeyFrameUpdate',
      6: 'FileTransfer',
      7: 'TextChat',
      8: 'KeepAlive',
      9: 'EndOfFileTransfer',
      10: 'Session'
    };

    let typeName = 'Unknown';
    if (direction === 'client_to_server') {
      typeName = messageTypes[messageType] || `Unknown Client (${messageType})`;
    } else {
      typeName = serverMessageTypes[messageType] || `Unknown Server (${messageType})`;
    }

    return `${directionStr}: ${typeName} - ${data.length} bytes`;
  }
}
