
export enum FrameType {
  PING = 0x01,
  PONG = 0x02,
  TERMINAL_INIT = 0x11,
  TERMINAL_REFRESH = 0x12,
  TERMINAL_DATA = 0x13,
  TERMINAL_RESIZE = 0x14,
  VNC_INIT = 0x21,
  VNC_DATA = 0x22,
  TCP_INIT = 0x31,
  TCP_DATA = 0x32,
  TCP_ERROR = 0x33,
}

export enum TcpErrorType {
  REFUSED = 0x01,
  TIMEOUT = 0x02,
  RESET = 0x03,
  CLOSED = 0x04,
  OTHER = 0xFF,
}