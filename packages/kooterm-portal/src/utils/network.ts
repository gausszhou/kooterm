/**
 * 将字节数转换为易读的网速格式
 * @param bytes - 字节数
 * @param decimals - 小数位数，默认为2
 * @returns 格式化的网速字符串（如：1.23 MB/s）
 */
export function formatNetworkSpeed(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B/s';
  
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new Error('输入必须为非负有限数字');
  }

  const k = 1024;
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s', 'PB/s', 'EB/s', 'ZB/s', 'YB/s'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  // 处理超出单位范围的情况
  if (i >= units.length) {
    return `${bytes.toExponential(decimals)} B/s`;
  }
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${units[i]}`;
}
