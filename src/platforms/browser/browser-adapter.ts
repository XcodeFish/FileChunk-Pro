/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-nocheck
import { PlatformAdapter } from '../platform-base';
import { FileChunk, FileInfo, RequestOptions, SelectFileOptions } from '../../types';

/**
 * 浏览器平台适配器
 * 处理浏览器环境下的文件操作、网络请求等功能
 */
export class BrowserAdapter extends PlatformAdapter {
  /**
   * 构造函数
   */
  constructor() {
    super('browser');
  }

  /**
   * 检测当前环境是否为浏览器
   */
  public isSupported(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  /**
   * 创建文件分片
   * @param file 需要分片的文件
   * @param chunkSize 分片大小(字节)
   */
  public createChunks(file: File, chunkSize: number): FileChunk[] {
    if (!this.features.chunkedUpload) {
      throw this.handleError(new Error('当前浏览器不支持文件分片'), { file, chunkSize });
    }

    const chunks: FileChunk[] = [];
    let start = 0;
    let index = 0;

    while (start < file.size) {
      const end = Math.min(start + chunkSize, file.size);
      chunks.push({
        index: index++,
        data: file.slice(start, end),
        start,
        end,
        size: end - start
      });
      start = end;
    }

    return chunks;
  }

  /**
   * 发送网络请求
   * @param url 请求地址
   * @param method 请求方法
   * @param data 请求数据
   * @param options 请求选项
   */
  public async request(
    url: string,
    method: string,
    data?: any,
    options: RequestOptions = {}
  ): Promise<any> {
    try {
      const fetchOptions: RequestInit = {
        method,
        headers: options.headers || {},
        signal: options.signal,
        credentials: 'same-origin'
      };

      if (data) {
        if (data instanceof FormData) {
          fetchOptions.body = data;
        } else if (typeof data === 'object') {
          fetchOptions.headers = {
            'Content-Type': 'application/json',
            ...fetchOptions.headers
          };
          fetchOptions.body = JSON.stringify(data);
        } else {
          fetchOptions.body = data;
        }
      }

      // 支持上传进度回调
      if (
        options.onProgress &&
        method.toUpperCase() === 'POST' &&
        typeof XMLHttpRequest !== 'undefined'
      ) {
        return this.requestWithProgress(url, fetchOptions, data, options);
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`请求失败 (${response.status}): ${errorText}`);
      }

      try {
        return await response.json();
      } catch (_e) {
        return await response.text();
      }
    } catch (error) {
      throw this.handleError(error as Error, { url, method, data, options });
    }
  }

  /**
   * 支持进度回调的请求
   * @param url 请求地址
   * @param fetchOptions fetch选项
   * @param data 请求数据
   * @param options 请求选项
   */
  private requestWithProgress(
    url: string,
    fetchOptions: RequestInit,
    data: any,
    options: RequestOptions
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(fetchOptions.method || 'GET', url, true);

      // 设置请求头
      if (fetchOptions.headers) {
        Object.entries(fetchOptions.headers).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value as string);
        });
      }

      // 设置超时
      if (options.timeout) {
        xhr.timeout = options.timeout;
      }

      // 设置中断信号
      if (options.signal) {
        options.signal.addEventListener('abort', () => xhr.abort());
      }

      // 进度监听
      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable && options.onProgress) {
          const progress = Math.round((e.loaded / e.total) * 100);
          options.onProgress(progress);
        }
      });

      // 请求完成
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          let response;
          try {
            response = JSON.parse(xhr.responseText);
          } catch (_e) {
            response = xhr.responseText;
          }
          resolve(response);
        } else {
          reject(
            this.handleError(new Error(`请求失败 (${xhr.status}): ${xhr.responseText}`), {
              url,
              status: xhr.status
            })
          );
        }
      });

      // 错误处理
      xhr.addEventListener('error', () => {
        reject(this.handleError(new Error('网络连接错误'), { url }));
      });

      xhr.addEventListener('timeout', () => {
        reject(this.handleError(new Error('请求超时'), { url, timeout: options.timeout }));
      });

      // 发送请求
      if (fetchOptions.body) {
        xhr.send(fetchOptions.body as any);
      } else {
        xhr.send();
      }

      // 提供引用给调用者
      if (options.taskRef) {
        options.taskRef(xhr);
      }
    });
  }

  /**
   * 读取文件数据
   * @param file 文件对象
   * @param start 起始位置
   * @param end 结束位置
   */
  public readFile(file: File, start = 0, end?: number): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = e => {
        resolve(e.target?.result as ArrayBuffer);
      };

      reader.onerror = () => {
        reject(this.handleError(new Error('文件读取失败'), { file, start, end }));
      };

      const blob = end ? file.slice(start, end) : file.slice(start);
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * 获取文件信息
   * @param file 文件对象
   */
  public async getFileInfo(file: File): Promise<FileInfo> {
    try {
      return {
        name: file.name,
        size: file.size,
        type: file.type || this.getMimeTypeByExtension(file.name),
        lastModified: file.lastModified || Date.now()
      };
    } catch (error) {
      throw this.handleError(error as Error, { file });
    }
  }

  /**
   * 选择文件
   * @param options 选择文件选项
   */
  public selectFile(options: SelectFileOptions = {}): Promise<File[]> {
    return new Promise((resolve, reject) => {
      try {
        const input = document.createElement('input');
        input.type = 'file';

        if (options.accept) {
          input.accept = options.accept;
        }

        if (options.multiple) {
          input.multiple = true;
        }

        if (options.directory && 'webkitdirectory' in input) {
          input.setAttribute('webkitdirectory', '');
          input.setAttribute('directory', '');
        }

        input.style.display = 'none';
        document.body.appendChild(input);

        const handleChange = () => {
          const files = Array.from(input.files || []);
          document.body.removeChild(input);
          resolve(files);
        };

        const handleFocus = () => {
          // 检测取消选择文件
          setTimeout(() => {
            if (!input.files || input.files.length === 0) {
              document.body.removeChild(input);
              resolve([]);
            }
          }, 300);
        };

        input.addEventListener('change', handleChange);
        input.addEventListener('blur', handleFocus);

        input.click();
      } catch (error) {
        reject(this.handleError(error as Error, options));
      }
    });
  }

  /**
   * 检测浏览器特性
   */
  protected detectFeatures(): void {
    this.features = {
      chunkedUpload: typeof Blob !== 'undefined' && typeof Blob.prototype.slice !== 'undefined',
      webWorker: typeof Worker !== 'undefined',
      indexedDB: typeof indexedDB !== 'undefined',
      webCrypto: typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined',
      streams: typeof ReadableStream !== 'undefined',
      dragAndDrop:
        typeof FileReader !== 'undefined' && 'draggable' in document.createElement('div'),
      folderUpload: 'webkitdirectory' in document.createElement('input'),
      maxConcurrentRequests: this.detectMaxConnections(),
      maxFileSize: Number.MAX_SAFE_INTEGER
    };

    this.eventBus.emit('featuresDetected', this.features);
  }

  /**
   * 探测浏览器最大并发连接数
   */
  private detectMaxConnections(): number {
    // 简单估计值，不同浏览器有不同限制
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
   * 根据文件扩展名获取MIME类型
   * @param filename 文件名
   */
  private getMimeTypeByExtension(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      pdf: 'application/pdf',
      txt: 'text/plain',
      html: 'text/html',
      css: 'text/css',
      js: 'text/javascript',
      json: 'application/json',
      xml: 'application/xml',
      zip: 'application/zip',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      webm: 'video/webm',
      ogg: 'audio/ogg',
      svg: 'image/svg+xml'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }
}
