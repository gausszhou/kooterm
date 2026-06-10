import http from 'http';

export function getClientIp(req: http.IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  const xri = req.headers['x-real-ip'];
  if (typeof xri === 'string' && xri) return xri;
  return req.socket.remoteAddress || 'unknown';
}
