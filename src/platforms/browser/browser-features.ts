import { PlatformFeatures } from '../../types';

/**
 * 浏览器特性检测工具类
 */
export class BrowserFeaturesDetector {
  /**
   * 检测浏览器支持的特性
   */
  public static detect(): PlatformFeatures {
    return {
      chunkedUpload: BrowserFeaturesDetector.detectChunkedUpload(),
      webWorker: BrowserFeaturesDetector.detectWebWorker(),
      indexedDB: BrowserFeaturesDetector.detectIndexedDB(),
      webCrypto: BrowserFeaturesDetector.detectWebCrypto(),
      streams: BrowserFeaturesDetector.detectStreams(),
      dragAndDrop: BrowserFeaturesDetector.detectDragAndDrop(),
      folderUpload: BrowserFeaturesDetector.detectFolderUpload(),
      maxConcurrentRequests: BrowserFeaturesDetector.detectMaxConnections(),
      maxFileSize: Number.MAX_SAFE_INTEGER
    };
  }

  /**
   * 检测是否支持分片上传
   */
  private static detectChunkedUpload(): boolean {
    return typeof Blob !== 'undefined' && typeof Blob.prototype.slice !== 'undefined';
  }

  /**
   * 检测是否支持Web Worker
   */
  private static detectWebWorker(): boolean {
    return typeof Worker !== 'undefined';
  }

  /**
   * 检测是否支持IndexedDB
   */
  private static detectIndexedDB(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  /**
   * 检测是否支持Web Crypto API
   */
  private static detectWebCrypto(): boolean {
    return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
  }

  /**
   * 检测是否支持Streams API
   */
  private static detectStreams(): boolean {
    return typeof ReadableStream !== 'undefined';
  }

  /**
   * 检测是否支持拖放上传
   */
  private static detectDragAndDrop(): boolean {
    return typeof FileReader !== 'undefined' && 'draggable' in document.createElement('div');
  }

  /**
   * 检测是否支持文件夹上传
   */
  private static detectFolderUpload(): boolean {
    return 'webkitdirectory' in document.createElement('input');
  }

  /**
   * 检测浏览器最大并发连接数
   */
  private static detectMaxConnections(): number {
    const isChrome = navigator.userAgent.indexOf('Chrome') !== -1;
    const isFirefox = navigator.userAgent.indexOf('Firefox') !== -1;
    const isSafari =
      navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Chrome') === -1;

    if (isChrome) return 6;
    if (isFirefox) return 6;
    if (isSafari) return 6;

    return 4; // 默认保守值
  }

  /**
   * 检测是否为移动设备浏览器
   */
  public static isMobileBrowser(): boolean {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;

    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent.toLowerCase()
    );
  }

  /**
   * 检测浏览器供应商和版本
   */
  public static getBrowserInfo(): { vendor: string; version: string } {
    const userAgent = navigator.userAgent;
    let vendor = 'unknown';
    let version = 'unknown';

    if (userAgent.indexOf('Chrome') !== -1) {
      vendor = 'Chrome';
      const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
      if (match && match[1]) version = match[1];
    } else if (userAgent.indexOf('Firefox') !== -1) {
      vendor = 'Firefox';
      const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
      if (match && match[1]) version = match[1];
    } else if (userAgent.indexOf('Safari') !== -1) {
      vendor = 'Safari';
      const match = userAgent.match(/Version\/(\d+\.\d+)/);
      if (match && match[1]) version = match[1];
    } else if (userAgent.indexOf('MSIE') !== -1 || userAgent.indexOf('Trident/') !== -1) {
      vendor = 'Internet Explorer';
      const match = userAgent.match(/MSIE (\d+\.\d+)/);
      if (match && match[1]) version = match[1];
    } else if (userAgent.indexOf('Edge') !== -1) {
      vendor = 'Edge';
      const match = userAgent.match(/Edge\/(\d+\.\d+)/);
      if (match && match[1]) version = match[1];
    }

    return { vendor, version };
  }

  /**
   * 检测是否支持特定格式的文件类型
   * @param mimeType MIME类型
   */
  public static supportsMimeType(mimeType: string): boolean {
    const input = document.createElement('input');
    input.type = 'file';

    // 检测是否支持该MIME类型
    const accept = input.accept;
    input.accept = mimeType;

    const isSupported = input.accept === mimeType;
    input.accept = accept; // 恢复原值

    return isSupported;
  }
}
