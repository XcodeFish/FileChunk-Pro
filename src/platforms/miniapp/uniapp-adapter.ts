/* eslint-disable @typescript-eslint/no-unused-vars */
import { PlatformAdapter, FileChunk, PlatformFeatures, RequestOptions } from '../platform-base';

/**
 * UniApp平台环境信息
 */
interface UniAppEnvironment {
  /** 当前平台 */
  platform: string;
  /** 是否为H5环境 */
  isH5: boolean;
  /** 是否为App环境 */
  isApp: boolean;
  /** 是否为微信小程序环境 */
  isWeixin: boolean;
  /** 是否为支付宝小程序环境 */
  isAlipay: boolean;
  /** 是否为百度小程序环境 */
  isBaidu: boolean;
  /** 是否为字节跳动小程序环境 */
  isToutiao: boolean;
  /** 是否为QQ小程序环境 */
  isQQ: boolean;
  /** 是否为小程序环境 */
  isMiniProgram: boolean;
  /** 系统信息 */
  systemInfo: any;
}

/**
 * UniApp全局API接口
 */
interface UniAppStatic {
  getSystemInfoSync(): any;
  uploadFile(options: {
    url: string;
    filePath: string;
    name: string;
    formData?: Record<string, any>;
    header?: Record<string, string>;
    success?: (res: { statusCode: number; data: string }) => void;
    fail?: (err: { errMsg?: string }) => void;
    complete?: () => void;
  }): {
    onProgressUpdate: (
      callback: (res: {
        progress: number;
        totalBytesWritten: number;
        totalBytesExpectedToWrite: number;
      }) => void
    ) => void;
    abort: () => void;
  };
  request(options: any): any;
  getFileInfo(options: {
    filePath: string;
    success?: (res: { size: number }) => void;
    fail?: (err: { errMsg?: string }) => void;
    complete?: () => void;
  }): void;
  chooseImage(options: {
    count?: number;
    sizeType?: ('original' | 'compressed')[];
    sourceType?: ('album' | 'camera')[];
    success?: (res: {
      tempFilePaths: string[];
      tempFiles: Array<{ path: string; size: number }>;
    }) => void;
    fail?: (err: { errMsg?: string }) => void;
    complete?: () => void;
  }): void;
  chooseVideo(options: {
    sourceType?: ('album' | 'camera')[];
    compressed?: boolean;
    maxDuration?: number;
    camera?: 'back' | 'front';
    success?: (res: {
      tempFilePath: string;
      duration: number;
      size: number;
      height: number;
      width: number;
    }) => void;
    fail?: (err: { errMsg?: string }) => void;
    complete?: () => void;
  }): void;
  saveFile(options: {
    tempFilePath: string;
    success?: (res: { savedFilePath: string }) => void;
    fail?: (err: { errMsg?: string }) => void;
    complete?: () => void;
  }): void;
  getFileSystemManager(): {
    readFile(options: {
      filePath: string;
      encoding?: string;
      position?: number;
      length?: number;
      success?: (res: { data: ArrayBuffer | string }) => void;
      fail?: (err: { errMsg?: string }) => void;
      complete?: () => void;
    }): void;
    writeFile(options: {
      filePath: string;
      data: string | ArrayBuffer;
      encoding?: string;
      success?: (res: any) => void;
      fail?: (err: { errMsg?: string }) => void;
      complete?: () => void;
    }): void;
    unlink(options: {
      filePath: string;
      success?: (res: any) => void;
      fail?: (err: { errMsg?: string }) => void;
      complete?: () => void;
    }): void;
  };
}

// UniApp全局变量
declare const uni: UniAppStatic;
// 条件编译变量
declare const __NODE_JS__: boolean;
declare const __H5__: boolean;
declare const __APP__: boolean;
declare const __MP_WEIXIN__: boolean;
declare const __MP_ALIPAY__: boolean;
declare const __MP_BAIDU__: boolean;
declare const __MP_TOUTIAO__: boolean;
declare const __MP_QQ__: boolean;

/**
 * UniApp框架适配器
 * 提供多平台统一接口，支持App、H5和各类小程序环境
 */
export class UniAppAdapter extends PlatformAdapter {
  /** UniApp环境信息 */
  private env: UniAppEnvironment;
  /** 文件系统管理器(小程序) */
  private fs: any = null;

  /**
   * 构造函数
   */
  constructor() {
    super('UniApp');
    this.env = this.detectUniAppEnvironment();

    // 如果是小程序或App环境，初始化文件系统
    if (this.env.isMiniProgram || this.env.isApp) {
      try {
        this.fs = uni.getFileSystemManager();
      } catch (error) {
        console.warn('UniApp文件系统初始化失败', error);
      }
    }
  }

  /**
   * 检测UniApp运行环境
   */
  private detectUniAppEnvironment(): UniAppEnvironment {
    const systemInfo = uni.getSystemInfoSync();

    // 使用条件编译来精确检测环境
    /* #ifdef H5 */
    const isH5 = true;
    /* #endif */

    /* #ifdef APP-PLUS */
    const isApp = true;
    /* #endif */

    /* #ifdef MP-WEIXIN */
    const isWeixin = true;
    /* #endif */

    /* #ifdef MP-ALIPAY */
    const isAlipay = true;
    /* #endif */

    /* #ifdef MP-BAIDU */
    const isBaidu = true;
    /* #endif */

    /* #ifdef MP-TOUTIAO */
    const isToutiao = true;
    /* #endif */

    /* #ifdef MP-QQ */
    const isQQ = true;
    /* #endif */

    // 确定当前平台，这里用条件编译变量填充，未定义的变量会被设为undefined
    return {
      platform: systemInfo.platform,
      // 如果条件编译变量未定义，则使用系统信息判断
      isH5: isH5 || systemInfo.platform === 'web',
      isApp: isApp || systemInfo.platform === 'android' || systemInfo.platform === 'ios',
      isWeixin: isWeixin || (systemInfo.mp && systemInfo.mp.platform === 'mp-weixin'),
      isAlipay: isAlipay || (systemInfo.mp && systemInfo.mp.platform === 'mp-alipay'),
      isBaidu: isBaidu || (systemInfo.mp && systemInfo.mp.platform === 'mp-baidu'),
      isToutiao: isToutiao || (systemInfo.mp && systemInfo.mp.platform === 'mp-toutiao'),
      isQQ: isQQ || (systemInfo.mp && systemInfo.mp.platform === 'mp-qq'),
      isMiniProgram: !!systemInfo.mp,
      systemInfo
    };
  }

  /**
   * 检测当前环境是否支持UniApp适配器
   */
  public isSupported(): boolean {
    try {
      return typeof uni !== 'undefined';
    } catch {
      return false;
    }
  }

  /**
   * 检测平台特性
   */
  protected detectFeatures(): void {
    const { isH5, isApp, isMiniProgram } = this.env;

    if (isH5) {
      // H5环境特性检测
      this.features.webWorker = typeof Worker !== 'undefined';
      this.features.indexedDB = typeof indexedDB !== 'undefined';
      this.features.webCrypto =
        typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
      this.features.streams = typeof ReadableStream !== 'undefined';
      this.features.dragAndDrop = typeof document !== 'undefined' && 'ondragover' in document;
      this.features.folderUpload =
        typeof DataTransferItem !== 'undefined' &&
        typeof DataTransferItem.prototype.webkitGetAsEntry !== 'undefined';
      this.features.maxConcurrentRequests = 6;
      this.features.maxFileSize = Number.MAX_SAFE_INTEGER;
    } else if (isApp) {
      // App环境特性检测
      this.features.maxConcurrentRequests = 10;
      this.features.maxFileSize = Number.MAX_SAFE_INTEGER; // App环境通常没有文件大小限制
      // App环境特有特性
      if (this.env.systemInfo.platform === 'ios') {
        // iOS特有处理
      } else if (this.env.systemInfo.platform === 'android') {
        // Android特有处理
      }
    } else if (isMiniProgram) {
      // 小程序环境特性检测
      this.features.maxConcurrentRequests = 10;
      this.features.maxFileSize = 50 * 1024 * 1024; // 默认50MB

      // 微信小程序特殊处理
      if (this.env.isWeixin) {
        this.features.maxFileSize = 100 * 1024 * 1024; // 100MB
      }
    }

    // 通用特性
    this.features.chunkedUpload = true; // UniApp适配器支持分片上传
  }

  /**
   * 获取默认平台特性
   */
  protected getDefaultFeatures(): PlatformFeatures {
    return {
      chunkedUpload: true,
      webWorker: false,
      indexedDB: false,
      webCrypto: false,
      streams: false,
      dragAndDrop: false,
      folderUpload: false,
      maxConcurrentRequests: 6,
      maxFileSize: 50 * 1024 * 1024 // 默认50MB
    };
  }

  /**
   * 创建文件分片
   * 支持H5、App和小程序环境
   * @param file 文件对象
   * @param chunkSize 分片大小
   */
  public async createChunks(file: any, chunkSize: number): Promise<FileChunk[]> {
    if (this.env.isH5) {
      // H5环境
      return this.createH5Chunks(file, chunkSize);
    } else if (this.env.isApp || this.env.isMiniProgram) {
      // App和小程序环境
      return this.createNativeChunks(file, chunkSize);
    } else {
      throw new Error('不支持的平台环境');
    }
  }

  /**
   * H5环境创建文件分片
   */
  private createH5Chunks(file: File, chunkSize: number): FileChunk[] {
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
   * App和小程序环境创建文件分片
   */
  private async createNativeChunks(file: any, chunkSize: number): Promise<FileChunk[]> {
    try {
      // 获取文件信息
      const fileInfo = await this.getFileInfo(file);
      const filePath = file.path || file.tempFilePath || file;
      const fileSize = fileInfo.size;

      // 计算分片数量
      const totalChunks = Math.ceil(fileSize / chunkSize);
      const chunks: FileChunk[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);

        chunks.push({
          index: i,
          data: null, // 先不读取数据，避免内存压力
          start,
          end,
          size: end - start,
          path: filePath
        });
      }

      return chunks;
    } catch (error) {
      throw this.handleError(error as Error, { file });
    }
  }

  /**
   * 发送网络请求
   * 支持所有UniApp平台环境
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
    const { headers = {}, timeout, signal, onProgress, taskRef } = options;

    try {
      // 特殊处理分片上传
      if (data && data.isChunk) {
        return this.uploadChunk(url, data.chunk, data.formData, {
          headers,
          onProgress,
          taskRef
        });
      }

      // 普通请求（所有平台统一使用uni.request）
      return new Promise((resolve, reject) => {
        const requestTask = uni.request({
          url,
          method: method as any,
          data,
          header: headers,
          timeout,
          success: (res: any) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(res.data);
            } else {
              reject(new Error(`请求失败 (${res.statusCode})`));
            }
          },
          fail: (err: any) => {
            reject(new Error(err.errMsg || '请求失败'));
          }
        });

        // 保存请求引用
        if (taskRef) {
          taskRef(requestTask);
        }

        // 监听中止信号
        if (signal) {
          const abortHandler = () => {
            requestTask.abort();
            signal.removeEventListener('abort', abortHandler);
          };
          signal.addEventListener('abort', abortHandler);
        }
      });
    } catch (error) {
      throw this.handleError(error as Error, { url, method });
    }
  }

  /**
   * 上传文件分片
   * 根据环境使用不同的上传方式
   */
  private async uploadChunk(
    url: string,
    chunk: FileChunk,
    formData: Record<string, any> = {},
    options: {
      headers?: Record<string, string>;
      onProgress?: (progress: number) => void;
      taskRef?: (task: any) => void;
    } = {}
  ): Promise<any> {
    const { headers, onProgress, taskRef } = options;

    try {
      if (this.env.isH5) {
        // H5环境使用XMLHttpRequest
        const form = new FormData();

        // 添加其他表单数据
        Object.entries(formData).forEach(([key, value]) => {
          form.append(key, value);
        });

        // 添加分片数据
        form.append('file', chunk.data as Blob);

        // 使用XMLHttpRequest支持进度监听
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          // 进度监听
          if (onProgress) {
            xhr.upload.onprogress = e => {
              if (e.lengthComputable) {
                onProgress(Math.round((e.loaded / e.total) * 100));
              }
            };
          }

          xhr.open('POST', url);

          // 设置请求头
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              xhr.setRequestHeader(key, value);
            });
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch {
                resolve(xhr.responseText);
              }
            } else {
              reject(new Error(`上传失败 (${xhr.status}): ${xhr.statusText}`));
            }
          };

          xhr.onerror = () => reject(new Error('网络错误'));

          // 保存请求引用
          if (taskRef) {
            taskRef(xhr);
          }

          xhr.send(form);
        });
      } else {
        // App和小程序环境使用uni.uploadFile

        // 如果分片未加载数据，先读取或优化
        if (!chunk.tempPath && chunk.path) {
          chunk = await this.optimizeChunk(chunk);
        }

        return new Promise((resolve, reject) => {
          const uploadTask = uni.uploadFile({
            url,
            filePath: (chunk.tempPath || chunk.path)!,
            name: 'file',
            formData,
            header: headers,
            success: res => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  resolve(JSON.parse(res.data));
                } catch {
                  resolve(res.data);
                }
              } else {
                reject(new Error(`上传失败 (${res.statusCode})`));
              }
            },
            fail: err => {
              reject(new Error(err.errMsg || '上传失败'));
            }
          });

          // 进度监听
          if (onProgress) {
            uploadTask.onProgressUpdate(res => {
              onProgress(res.progress);
            });
          }

          // 保存请求引用
          if (taskRef) {
            taskRef(uploadTask);
          }
        });
      }
    } catch (error) {
      throw this.handleError(error as Error, { chunk });
    }
  }

  /**
   * 优化分片处理
   * 读取分片数据并写入临时文件
   */
  private async optimizeChunk(chunk: FileChunk): Promise<FileChunk> {
    try {
      if (!this.fs) {
        // 没有文件系统，直接返回原始分片
        return chunk;
      }

      // 读取文件片段
      const data = await this.readFile(chunk.path, chunk.start, chunk.size);

      // 生成临时文件路径
      // 注意：不同平台可能有不同的路径规则
      let tempFilePath: string;

      /* #ifdef APP-PLUS */
      tempFilePath = `_doc/temp_upload_${chunk.index}_${Date.now()}`;
      /* #endif */

      /* #ifdef MP-WEIXIN */
      const fs = uni.getFileSystemManager();
      tempFilePath = `${(uni as any).env.USER_DATA_PATH}/temp_upload_${chunk.index}_${Date.now()}`;
      /* #endif */

      /* #ifdef MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ */
      tempFilePath = `temp_upload_${chunk.index}_${Date.now()}`;
      /* #endif */

      // 写入临时文件
      await new Promise<void>((resolve, reject) => {
        this.fs.writeFile({
          filePath: tempFilePath || `temp_${Date.now()}`, // 提供默认值防止未定义
          data,
          success: () => resolve(),
          fail: (err: any) => reject(new Error(err.errMsg || '写入临时文件失败'))
        });
      });

      // 返回优化后的分片
      return {
        ...chunk,
        tempPath: tempFilePath,
        data: null // 释放内存
      };
    } catch (error) {
      console.error('优化分片失败:', error);
      return chunk; // 失败时返回原始分片
    }
  }

  /**
   * 读取文件数据
   * @param file 文件对象或路径
   * @param start 起始位置
   * @param end 结束位置或大小
   */
  public async readFile(file: any, start: number = 0, end?: number): Promise<ArrayBuffer | string> {
    try {
      if (this.env.isH5) {
        // H5环境
        if (file instanceof Blob) {
          const blob = end ? file.slice(start, end) : file.slice(start);
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsArrayBuffer(blob);
          });
        } else {
          throw new Error('不支持的文件类型');
        }
      } else {
        // App和小程序环境
        if (!this.fs) {
          throw new Error('文件系统不可用');
        }

        const filePath = typeof file === 'string' ? file : file.path || file.tempFilePath;
        if (!filePath) {
          throw new Error('文件路径无效');
        }

        return new Promise((resolve, reject) => {
          const size = end !== undefined ? end - start : undefined;
          this.fs.readFile({
            filePath,
            position: start,
            length: size,
            success: (res: { data: ArrayBuffer | string }) => resolve(res.data),
            fail: (err: { errMsg?: string }) => reject(new Error(err.errMsg || '读取文件失败'))
          });
        });
      }
    } catch (error) {
      throw this.handleError(error as Error, { file, start, end });
    }
  }

  /**
   * 获取文件信息
   * @param file 文件对象
   */
  public async getFileInfo(file: any): Promise<{
    name: string;
    size: number;
    type: string;
    lastModified: number;
  }> {
    try {
      if (this.env.isH5) {
        // H5环境
        if (file instanceof File) {
          return {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified
          };
        } else {
          throw new Error('不支持的文件类型');
        }
      } else {
        // App和小程序环境
        const filePath = typeof file === 'string' ? file : file.path || file.tempFilePath;
        if (!filePath) {
          throw new Error('文件路径无效');
        }

        // 获取文件信息
        return new Promise((resolve, reject) => {
          uni.getFileInfo({
            filePath,
            success: res => {
              // UniApp只提供部分信息
              resolve({
                name: file.name || filePath.substring(filePath.lastIndexOf('/') + 1),
                size: res.size,
                type: file.type || this.getTypeByExtension(filePath),
                lastModified: file.lastModified || Date.now()
              });
            },
            fail: err => reject(new Error(err.errMsg || '获取文件信息失败'))
          });
        });
      }
    } catch (error) {
      throw this.handleError(error as Error, { file });
    }
  }

  /**
   * 根据扩展名猜测文件类型
   * @param filePath 文件路径
   */
  private getTypeByExtension(filePath: string): string {
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.zip': 'application/zip'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * 选择文件
   * @param options 选择文件选项
   */
  public async selectFile(
    options: {
      accept?: string;
      multiple?: boolean;
      directory?: boolean;
    } = {}
  ): Promise<any[]> {
    const { accept, multiple = false } = options;
    // directory参数在UniApp中不支持，忽略此选项

    try {
      if (this.env.isH5) {
        // H5环境
        return new Promise((resolve, reject) => {
          const input = document.createElement('input');
          input.type = 'file';

          if (accept) {
            input.accept = accept;
          }

          if (multiple) {
            input.multiple = true;
          }

          input.style.display = 'none';
          document.body.appendChild(input);

          input.onchange = () => {
            const files = Array.from(input.files || []);
            document.body.removeChild(input);
            resolve(files);
          };

          input.onerror = () => {
            document.body.removeChild(input);
            reject(new Error('选择文件失败'));
          };

          input.click();
        });
      } else {
        // App和小程序环境
        const count = multiple ? 9 : 1; // UniApp大多数平台限制9个

        // 根据文件类型过滤
        let fileType = 'all';
        if (accept) {
          if (accept.includes('image/')) {
            fileType = 'image';
          } else if (accept.includes('video/')) {
            fileType = 'video';
          }
        }

        try {
          if (fileType === 'image') {
            return new Promise((resolve, reject) => {
              uni.chooseImage({
                count,
                sizeType: ['original', 'compressed'],
                sourceType: ['album', 'camera'],
                success: res => resolve(res.tempFiles),
                fail: err => {
                  // 用户取消选择不视为错误
                  if (err.errMsg?.includes('cancel')) {
                    resolve([]);
                  } else {
                    reject(new Error(err.errMsg));
                  }
                }
              });
            });
          } else if (fileType === 'video') {
            return new Promise((resolve, reject) => {
              uni.chooseVideo({
                sourceType: ['album', 'camera'],
                compressed: false,
                success: res => {
                  // 转换为统一格式
                  resolve([
                    {
                      path: res.tempFilePath,
                      size: res.size,
                      name: res.tempFilePath.substring(res.tempFilePath.lastIndexOf('/') + 1),
                      type: 'video/*',
                      duration: res.duration
                    }
                  ]);
                },
                fail: err => {
                  // 用户取消选择不视为错误
                  if (err.errMsg?.includes('cancel')) {
                    resolve([]);
                  } else {
                    reject(new Error(err.errMsg));
                  }
                }
              });
            });
          } else {
            // UniApp没有统一的文件选择API，根据平台使用不同方法
            /* #ifdef APP-PLUS */
            // App环境可以使用plus.io选择文件
            return new Promise((resolve, reject) => {
              // 这里需要使用原生的plus API，简化实现
              resolve([]);
            });
            /* #endif */

            /* #ifdef MP-WEIXIN */
            // 微信小程序可以使用wx.chooseMessageFile
            if (this.env.isWeixin) {
              return new Promise((resolve, reject) => {
                const wx = uni as any;
                if (typeof wx.chooseMessageFile === 'function') {
                  wx.chooseMessageFile({
                    count,
                    type: 'file',
                    success: (res: any) => resolve(res.tempFiles),
                    fail: (err: any) => {
                      // 用户取消选择不视为错误
                      if (err.errMsg?.includes('cancel')) {
                        resolve([]);
                      } else {
                        reject(new Error(err.errMsg));
                      }
                    }
                  });
                } else {
                  // 降级到选择图片
                  uni.chooseImage({
                    count,
                    success: res => resolve(res.tempFiles),
                    fail: err => {
                      if (err.errMsg?.includes('cancel')) {
                        resolve([]);
                      } else {
                        reject(new Error(err.errMsg));
                      }
                    }
                  });
                }
              });
            }
            /* #endif */

            // 其他平台降级到选择图片
            return new Promise((resolve, reject) => {
              uni.chooseImage({
                count,
                success: res => resolve(res.tempFiles),
                fail: err => {
                  if (err.errMsg?.includes('cancel')) {
                    resolve([]);
                  } else {
                    reject(new Error(err.errMsg));
                  }
                }
              });
            });
          }
        } catch (error: any) {
          // 用户取消选择不视为错误
          if (error.errMsg?.includes('cancel')) {
            return [];
          }
          throw error;
        }
      }
    } catch (error) {
      throw this.handleError(error as Error, options);
    }
  }

  /**
   * 清理临时文件
   * @param chunks 文件分片列表
   */
  public async cleanupTempFiles(chunks: FileChunk[]): Promise<void> {
    if (!this.fs || this.env.isH5) {
      return;
    }

    for (const chunk of chunks) {
      if (chunk.tempPath) {
        try {
          await new Promise<void>(resolve => {
            this.fs.unlink({
              filePath: chunk.tempPath as string,
              success: () => resolve(),
              fail: () => resolve() // 忽略删除失败
            });
          });
        } catch (e) {
          // 忽略清理错误
          console.warn('清理临时文件失败', e);
        }
      }
    }
  }
}
