/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-nocheck
import { PlatformAdapter } from '../platform-base';
import { FileChunk, FileInfo, RequestOptions, SelectFileOptions } from '../../types';

/**
 * 微信小程序平台适配器
 * 处理微信小程序环境下的文件操作、网络请求等功能
 */
export class WechatAdapter extends PlatformAdapter {
  /**
   * 构造函数
   */
  constructor() {
    super('wechat-miniapp');
  }

  /**
   * 检测当前环境是否为微信小程序
   */
  public isSupported(): boolean {
    return typeof wx !== 'undefined' && typeof wx.uploadFile === 'function';
  }

  /**
   * 创建文件分片
   * @param file 需要分片的文件（微信小程序环境下为文件路径）
   * @param chunkSize 分片大小(字节)
   */
  public async createChunks(file: string, chunkSize: number): Promise<FileChunk[]> {
    try {
      // 获取文件信息
      const fileInfo = await this.getFileSystemInfo(file);
      const fileSize = fileInfo.size;

      // 创建分片信息
      const totalChunks = Math.ceil(fileSize / chunkSize);
      const chunks: FileChunk[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);

        chunks.push({
          index: i,
          data: null, // 微信小程序环境下不直接加载数据
          start,
          end,
          size: end - start,
          path: file
        });
      }

      return chunks;
    } catch (error) {
      throw this.handleError(error, { file, chunkSize });
    }
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
      // 处理特殊的分片上传请求
      if (data && data.isChunk) {
        return this.uploadChunk(url, data.chunk, {
          formData: data.formData,
          headers: options.headers,
          onProgress: options.onProgress,
          taskRef: options.taskRef
        });
      }

      // 普通请求
      return new Promise((resolve, reject) => {
        const requestTask = wx.request({
          url,
          method: method as any,
          data,
          header: options.headers,
          timeout: options.timeout,
          success: res => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(res.data);
            } else {
              reject(
                this.handleError(new Error(`请求失败 (${res.statusCode})`), {
                  url,
                  statusCode: res.statusCode
                })
              );
            }
          },
          fail: err => {
            reject(this.handleError(new Error(err.errMsg), { url, err }));
          }
        });

        // 提供请求任务引用给调用者
        if (options.taskRef) {
          options.taskRef(requestTask);
        }

        // 处理中止请求
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            requestTask.abort();
          });
        }
      });
    } catch (error) {
      throw this.handleError(error, { url, method, data });
    }
  }

  /**
   * 上传分片
   * @param url 上传地址
   * @param chunk 分片数据
   * @param options 上传选项
   */
  private async uploadChunk(
    url: string,
    chunk: FileChunk,
    options: {
      formData?: Record<string, any>;
      headers?: Record<string, string>;
      onProgress?: (progress: number) => void;
      taskRef?: (task: any) => void;
    } = {}
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // 优先使用临时文件路径，如果没有则读取文件片段
      const filePath = chunk.tempPath || chunk.path;

      const uploadTask = wx.uploadFile({
        url,
        filePath,
        name: 'file', // 服务器接收文件的字段名
        formData: options.formData || {},
        header: options.headers || {},
        success: res => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              // 尝试解析JSON
              const data = JSON.parse(res.data);
              resolve(data);
            } catch (e) {
              resolve(res.data);
            }
          } else {
            reject(
              this.handleError(new Error(`上传失败 (${res.statusCode})`), {
                url,
                statusCode: res.statusCode
              })
            );
          }
        },
        fail: err => {
          reject(this.handleError(new Error(err.errMsg), { url, err }));
        }
      });

      // 提供上传任务引用给调用者
      if (options.taskRef) {
        options.taskRef(uploadTask);
      }

      // 进度回调
      if (options.onProgress) {
        uploadTask.onProgressUpdate(res => {
          options.onProgress(res.progress / 100);
        });
      }
    });
  }

  /**
   * 读取文件数据
   * @param filePath 文件路径
   * @param start 起始位置
   * @param end 结束位置
   */
  public async readFile(filePath: string, start = 0, end?: number): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      try {
        const fs = wx.getFileSystemManager();

        fs.readFile({
          filePath,
          position: start,
          length: end ? end - start : undefined,
          success: res => {
            resolve(res.data);
          },
          fail: err => {
            reject(this.handleError(new Error(err.errMsg), { filePath, start, end }));
          }
        });
      } catch (error) {
        reject(this.handleError(error, { filePath, start, end }));
      }
    });
  }

  /**
   * 获取文件信息
   * @param filePath 文件路径
   */
  public async getFileInfo(filePath: string): Promise<FileInfo> {
    try {
      const fileSystemInfo = await this.getFileSystemInfo(filePath);
      const pathParts = filePath.split('/');
      const fileName = pathParts[pathParts.length - 1];

      return {
        name: fileName,
        size: fileSystemInfo.size,
        type: this.getMimeTypeByExtension(fileName),
        lastModified: fileSystemInfo.lastModified || Date.now()
      };
    } catch (error) {
      throw this.handleError(error, { filePath });
    }
  }

  /**
   * 选择文件
   * @param options 选择文件选项
   */
  public async selectFile(options: SelectFileOptions = {}): Promise<string[]> {
    try {
      return new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: options.multiple ? 9 : 1,
          mediaType: ['image', 'video', 'file'],
          success: res => {
            const tempFiles = res.tempFiles.map(file => file.tempFilePath);
            resolve(tempFiles);
          },
          fail: err => {
            // 用户取消不视为错误
            if (err.errMsg.indexOf('cancel') !== -1) {
              resolve([]);
            } else {
              reject(this.handleError(new Error(err.errMsg), options));
            }
          }
        });
      });
    } catch (error) {
      throw this.handleError(error, options);
    }
  }

  /**
   * 获取文件系统信息
   * @param filePath 文件路径
   */
  private async getFileSystemInfo(filePath: string): Promise<{
    size: number;
    createTime: number;
    lastModified: number;
  }> {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager();

      fs.stat({
        path: filePath,
        success: res => {
          // 兼容两种返回格式
          const stats = res.stats || res.stat;
          resolve({
            size: stats.size,
            createTime: stats.createTime,
            lastModified: stats.lastAccessedTime || stats.lastModifiedTime || Date.now()
          });
        },
        fail: err => {
          reject(new Error(err.errMsg));
        }
      });
    });
  }

  /**
   * 文件系统操作 - 写入临时文件
   * @param data 数据
   * @param extension 文件扩展名
   */
  public async writeTemporaryFile(data: ArrayBuffer, extension = ''): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const fs = wx.getFileSystemManager();
        const tempFilePath = `${wx.env.USER_DATA_PATH}/upload_temp_${Date.now()}${extension}`;

        fs.writeFile({
          filePath: tempFilePath,
          data,
          success: () => {
            resolve(tempFilePath);
          },
          fail: err => {
            reject(this.handleError(new Error(err.errMsg), { extension }));
          }
        });
      } catch (error) {
        reject(this.handleError(error, { extension }));
      }
    });
  }

  /**
   * 优化内存使用 - 为分片创建临时文件
   * @param chunk 分片对象
   */
  public async optimizeForMemory(chunk: FileChunk): Promise<FileChunk> {
    try {
      // 读取文件片段
      const data = await this.readFile(chunk.path, chunk.start, chunk.end);

      // 写入临时文件
      const extension = '.tmp';
      const tempPath = await this.writeTemporaryFile(data, extension);

      // 更新分片信息
      return {
        ...chunk,
        tempPath
      };
    } catch (error) {
      throw this.handleError(error, { chunk });
    }
  }

  /**
   * 检测平台特性
   */
  protected detectFeatures(): void {
    this.features = {
      chunkedUpload: true, // 通过文件系统API实现
      webWorker: false, // 小程序不支持
      indexedDB: false, // 小程序不支持
      webCrypto: false, // 小程序不支持
      streams: false, // 小程序不支持
      dragAndDrop: false, // 小程序不支持
      folderUpload: false, // 小程序不支持
      maxConcurrentRequests: 10, // 微信小程序并发限制
      maxFileSize: 100 * 1024 * 1024 // 微信小程序通常限制100MB
    };

    // 尝试获取实际的上传大小限制
    try {
      if (wx.getAccountInfoSync) {
        const accountInfo = wx.getAccountInfoSync();
        const miniProgramVersion = accountInfo.miniProgram.version || '';

        // 基于版本判断限制
        if (miniProgramVersion >= '2.15.0') {
          this.features.maxFileSize = 200 * 1024 * 1024; // 新版本支持更大文件
        }
      }
    } catch (e) {
      // 忽略错误，使用默认值
    }

    this.eventBus.emit('featuresDetected', this.features);
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
      wav: 'audio/wav'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }
}
