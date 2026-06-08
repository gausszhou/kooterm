
export enum FrameType {
  PING = 0x01,
  PONG = 0x02,
  TERMINAL_INIT = 0x11,
  TERMINAL_REFRESH = 0x12,
  TERMINAL_DATA = 0x13,
  VNC_INIT = 0x21,
  VNC_DATA = 0x22,
}