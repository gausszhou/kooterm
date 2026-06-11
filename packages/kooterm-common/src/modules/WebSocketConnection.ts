import { Frame, FrameCodec, FrameType } from '../index.js';
import { WebSocketDataChannel } from './WebSocketDataChannel.js';
import { log } from '../logger.js';

export class WebSocketConnection extends EventTarget implements WebSocket {
  ws: WebSocket;
  private identifier: number;
  private dataChannels: Map<string, WebSocketDataChannel> = new Map();
  private dataChannelIdentifiers: Map<number, string> = new Map();

  private keepAliveInterval = 0;
  private _lastPongTimestamp = 0;
  // 往返延迟
  private _rtt = 0;
  // 上传和下载流量
  private _upBytes = 0;
  private _downBytes = 0;
  // 上行和下行网速(最近 5 s)
  private _lastUpBytes = 0;
  private _lastDownBytes = 0;
  private _upSpeed = 0;
  private _downSpeed = 0;
  private speedTimer = 0;

  readonly CONNECTING = WebSocket.CONNECTING;
  readonly OPEN = WebSocket.OPEN;
  readonly CLOSING = WebSocket.CLOSING;
  readonly CLOSED = WebSocket.CLOSED;

  isConnected = false;

  set binaryType(type: BinaryType) {
    this.ws.binaryType = type;
  }

  get binaryType(): BinaryType {
    return this.ws.binaryType || 'arraybuffer';
  }

  get readyState() {
    return this.ws.readyState;
  }

  get url(): string {
    return this.ws.url;
  }

  get extensions(): string {
    return this.ws.extensions;
  }

  get protocol(): string {
    return this.ws.protocol;
  }

  get bufferedAmount(): number {
    return this.ws.bufferedAmount;
  }

  constructor(url: string, protocol?: string) {
    super();
    this.ws = this.createWebSocket(url, protocol);
    this.identifier = FrameCodec.randomIdentifier();
    this.listenPong();
    this.speedTimer = setInterval(() => {
      this._upSpeed = this._upBytes - this._lastUpBytes;
      this._downSpeed = this._downBytes - this._lastDownBytes;
      this._lastUpBytes = this._upBytes;
      this._lastDownBytes = this._downBytes;
    }, 1000);
    log.debug('创建 WebSocket 连接:', url, protocol);
  }

  // 网络延迟和速度
  get rtt(): number {
    return this._rtt;
  }

  get upBytes(): number {
    return this._upBytes;
  }

  get downBytes(): number {
    return this._downBytes;
  }

  get upSpeed(): number {
    return this._upSpeed;
  }

  get downSpeed(): number {
    return this._downSpeed;
  }

  get onopen(): ((this: WebSocket, ev: Event) => any) | null {
    return this.ws.onopen;
  }

  get onclose(): ((this: WebSocket, ev: CloseEvent) => any) | null {
    return this.ws.onclose;
  }

  get onerror(): ((this: WebSocket, ev: Event) => any) | null {
    return this.ws.onerror;
  }

  get onmessage(): ((this: WebSocket, ev: MessageEvent) => any) | null {
    return this.ws.onmessage;
  }

  set onopen(callback: (ev: Event) => any) {
    this.ws.onopen = ev => {
      this._onOpen(ev);
      callback(ev);
    };
  }

  set onmessage(callback: (ev: MessageEvent) => any) {
    this.ws.onmessage = async ev => {
      const event = await this._onMessage(ev);
      callback(event);
    };
  }

  set onerror(callback: (ev: Event) => any) {
    this.ws.onerror = ev => {
      this._onError(ev);
      callback(ev);
    };
  }

  set onclose(callback: (ev: CloseEvent) => any) {
    this.ws.onclose = ev => {
      this._onClose(ev);
      callback(ev);
    };
  }

  /**
   * 发送数据，原始发送，提供给子类调用
   * @param data
   */
  public send(data: string | ArrayBuffer) {
    const buff = this.encode(data);
    if (buff instanceof ArrayBuffer) {
      this._upBytes += buff.byteLength;
    }
    this.ws.send(buff);
  }

  /**
   * 编码数据，默认不做处理
   * @param data
   * @returns
   */
  public encode(data: string | ArrayBuffer): string | ArrayBuffer {
    return data;
  }

  public decode(data: Frame): Frame | ArrayBuffer | Uint8Array | string {
    return data;
  }

  public close() {
    this.clearDataChannels();
    this._stopKeepAlive();
    this.ws.close();
    clearInterval(this.speedTimer);
  }

  public reconnect(url: string, protocol?: string) {
    log.debug('重新连接到:', url, protocol);
    const oldWs = this.ws;
    this.ws = this.createWebSocket(url, protocol);
    this.identifier = FrameCodec.randomIdentifier();
    oldWs.close();
    clearInterval(this.speedTimer);
    this.speedTimer = setInterval(() => {
      this._upSpeed = this._upBytes - this._lastUpBytes;
      this._downSpeed = this._downBytes - this._lastDownBytes;
      this._lastUpBytes = this._upBytes;
      this._lastDownBytes = this._downBytes;
    }, 1000);
  }

  // === 自定义方法 ===

  /**
   * 发送数据 携带 Connection 标识符
   * @param type 帧类型
   * @param data 数据
   */
  private _send(opcode: FrameType, data: string | number | ArrayBuffer | Uint8Array) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    const frame = FrameCodec.create(opcode, this.identifier, data, 0);
    const buffer = frame.toBuffer();
    this._upBytes += buffer.byteLength;
    this.ws.send(buffer);
  }

  private _onOpen(e: Event) {
    this.isConnected = true;
    this._startKeepAlive();
    const event = new Event('open', {});
    this.dispatchEvent(event);
    this.getAllDataChannels().forEach(channel => {
      channel._onopen(event);
      channel.dispatchEvent(event);
    });
  }

  /**
   * 处理收到的消息
   * @param ev 消息事件
   */
  private _onMessage(ev: MessageEvent) {
    const frame = FrameCodec.decode(ev.data as ArrayBuffer);
    this._downBytes += ev.data.byteLength;
    log.debug(frame.identifier, FrameType[frame.type], frame.payloadLength);
    if (frame.identifier === this.identifier) {
      const event = new MessageEvent('message', { data: this.decode(frame) });
      this.dispatchEvent(event);
      return event;
    }
    const dataChannel = this.getDataChannelByIdentifier(frame.identifier);
    if (dataChannel) {
      const event = new MessageEvent('message', { data: frame });
      dataChannel.onmessage(event);
      dataChannel.dispatchEvent(event);
      return event;
    }
    return ev;
  }

  private _onError(ev: Event) {
    this.isConnected = false;
    this.getAllDataChannels().forEach(channel => {
      channel._onclose(ev);
    });
  }

  private _onClose(ev: CloseEvent) {
    this.isConnected = false;
    this._stopKeepAlive();
    const event = new CloseEvent('close', { code: ev.code, reason: ev.reason, wasClean: ev.wasClean });
    this.getAllDataChannels().forEach(channel => {
      channel.dispatchEvent(event);
    });
  }

  public _ping() {
    this._send(FrameType.PING, Date.now());
  }

  private _onPong(frame: Frame) {
    const pingTime = FrameCodec.buffer2number(frame.payload);
    this._lastPongTimestamp = Date.now();
    this._rtt = this._lastPongTimestamp - pingTime;
    console.log(`[Network] RTT: ${this._rtt}ms`);
    const event = new Event('pong', {});
    this.dispatchEvent(event);
    this.getAllDataChannels().forEach(channel => {
      channel.dispatchEvent(event);
    });
  }

  private _startKeepAlive() {
    clearInterval(this.keepAliveInterval);
    this._ping();
    this._lastPongTimestamp = Date.now();
    this.keepAliveInterval = setInterval(() => {
      this._checkKeepAlive();
      this._ping();
    }, 5000);
  }

  /**
   * 检查是否超时
   */
  private _checkKeepAlive() {
    const interval = Date.now() - this._lastPongTimestamp;
    if (interval > 3 * 5000) {
      const event = new Event('timeout', {});
      this.dispatchEvent(event);
      this.getAllDataChannels().forEach(channel => {
        channel.dispatchEvent(event);
      });
    }
  }

  private _stopKeepAlive() {
    clearInterval(this.keepAliveInterval);
  }

  listenPong() {
    this.addEventListener('message', async ev => {
      const frame = (ev as MessageEvent).data as Frame;
      if (!(frame instanceof Frame)) {
        log.warn('收到非 Frame 数据:', frame);
        return;
      }
      if (frame.type === FrameType.PONG) {
        this._onPong(frame);
      }
    });
  }

  /**
   * 创建 WebSocket 实例
   * @param url WebSocket 服务器 URL
   * @param protocol 可选的子协议
   * @returns WebSocket 实例
   */
  private createWebSocket(url: string, protocol?: string): WebSocket {
    const ws = new WebSocket(url, protocol);
    ws.binaryType = 'arraybuffer';
    ws.onopen = ev => {
      this._onOpen(ev);
    };
    ws.onmessage = ev => {
      this._onMessage(ev);
    };
    ws.onclose = ev => {
      this._onClose(ev);
    };
    ws.onerror = ev => {
      this._onError(ev);
    };
    return ws;
  }

  public createDataChannel(label: string): WebSocketDataChannel {
    let dataChannel = this.dataChannels.get(label);
    if (dataChannel) {
      return dataChannel;
    }
    dataChannel = new WebSocketDataChannel(this, label);
    this.dataChannels.set(label, dataChannel);
    this.dataChannelIdentifiers.set(dataChannel.identifier, label);
    return dataChannel;
  }

  public getDataChannel(label: string): WebSocketDataChannel | undefined {
    return this.dataChannels.get(label);
  }

  public getAllDataChannels(): WebSocketDataChannel[] {
    return Array.from(this.dataChannels.values());
  }

  private getDataChannelByIdentifier(identifier: number): WebSocketDataChannel | undefined {
    const label = this.dataChannelIdentifiers.get(identifier);
    if (label) {
      return this.dataChannels.get(label);
    }
    return undefined;
  }

  public closeDataChannel(label: string) {
    const dataChannel = this.dataChannels.get(label);
    if (dataChannel) {
      this.dataChannels.delete(label);
      this.dataChannelIdentifiers.delete(dataChannel.identifier);
    }
  }

  public clearDataChannels() {
    this.dataChannels.clear();
    this.dataChannelIdentifiers.clear();
  }
}

export function createNetworkInfo() {
  return {
    rtt: 0,
    upBytes: 0,
    downBytes: 0,
    upSpeed: 0,
    downSpeed: 0,
    isConnected: false,
    addEventListener: (..._: any[]) => {},
    removeEventListener: (..._: any[]) => {}
  };
}
