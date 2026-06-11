import { describe, it, expect } from 'vitest';
import { analyzeVNCMessage } from '@kooterm/common';

describe('analyzeVNCMessage', () => {
  it('should identify client SetPixelFormat', () => {
    const result = analyzeVNCMessage(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), 'client_to_server');
    expect(result).toContain('C->S');
    expect(result).toContain('SetPixelFormat');
    expect(result).toContain('10 bytes');
  });

  it('should identify client SetEncodings', () => {
    const result = analyzeVNCMessage(new Uint8Array([1]), 'client_to_server');
    expect(result).toContain('SetEncodings');
  });

  it('should identify server FramebufferUpdate', () => {
    const result = analyzeVNCMessage(new Uint8Array([0, 1, 2, 3]), 'server_to_client');
    expect(result).toContain('S->C');
    expect(result).toContain('FramebufferUpdate');
    expect(result).toContain('4 bytes');
  });

  it('should identify server Bell', () => {
    const result = analyzeVNCMessage(new Uint8Array([2]), 'server_to_client');
    expect(result).toContain('Bell');
  });

  it('should label unknown client message types', () => {
    const result = analyzeVNCMessage(new Uint8Array([0xFF]), 'client_to_server');
    expect(result).toContain('Unknown Client');
    expect(result).toContain('255');
  });

  it('should label unknown server message types', () => {
    const result = analyzeVNCMessage(new Uint8Array([0xFE]), 'server_to_client');
    expect(result).toContain('Unknown Server');
    expect(result).toContain('254');
  });

  it('should handle empty data', () => {
    const result = analyzeVNCMessage(new Uint8Array(0), 'client_to_server');
    expect(result).toBeUndefined();
  });

  it('should handle single byte data', () => {
    const result = analyzeVNCMessage(new Uint8Array([3]), 'client_to_server');
    expect(result).toContain('KeyEvent');
  });

  it('should handle server CutText', () => {
    const result = analyzeVNCMessage(new Uint8Array([3]), 'server_to_client');
    expect(result).toContain('ServerCutText');
  });
});
