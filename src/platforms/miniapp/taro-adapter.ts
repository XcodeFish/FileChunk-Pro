import { PlatformAdapter, FileChunk, PlatformFeatures, RequestOptions } from '../platform-base';

// 定义Taro类型，以避免导入错误
interface TaroStatic {
  getEnv(): string;
  getFileSystemManager(): any;
  env: {
    USER_DATA_PATH: string;
  };
  request(options: any): any;
  uploadFile(options: {
    url: string;
    filePath: string;
    name: string;
    formData?: Record<string, any>;
    header?: Record<string, string>;
    success: (res: { statusCode: number; data: string }) => void;
    fail: (err: { errMsg?: string }) => void;
    complete?: () => void;
  }): {
    progress?: (
      callback: (res: {
        progress: number;
        totalBytesWritten: number;
        totalBytesExpectedToWrite: number;
      }) => void
    ) => void;
    abort: () => void;
  };
  getFileInfo(options: {
    filePath: string;
    success: (res: { size: number; digest?: string }) => void;
    fail: (err: { errMsg?: string }) => void;
  }): void;
  chooseImage(options: {
    count: number;
    sizeType?: ('original' | 'compressed')[];
    sourceType?: ('album' | 'camera')[];
    success?: (res: {
      tempFilePaths: string[];
      tempFiles: Array<{ path: string; size: number; name?: string; type?: string }>;
    }) => void;
    fail?: (err: { errMsg?: string }) => void;
  }): Promise<{
    tempFilePaths: string[];
    tempFiles: Array<{ path: string; size: number; name?: string; type?: string }>;
  }>;
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
  }): Promise<{
    tempFilePath: string;
    duration: number;
    size: number;
    height: number;
    width: number;
  }>;
  chooseMessageFile?(options: {
    count: number;
    type: 'all' | 'video' | 'image' | 'file';
    success?: (res: {
      tempFiles: Array<{ path: string; size: number; name: string; type: string }>;
    }) => void;
    fail?: (err: { errMsg?: string }) => void;
  }): Promise<{ tempFiles: Array<{ path: string; size: number; name: string; type: string }> }>;
}

// 将Taro声明为全局变量
declare const Taro: TaroStatic;

/**
 * Taro框架平台特性检测结果
 */
interface TaroEnvironment {
  /** 当前运行平台 */
  platform: string;
  /** 是否为H5环境 */
  isH5: boolean;
  /** 是否为微信小程序环境 */
  isWeapp: boolean;
  /** 是否为支付宝小程序环境 */
  isAlipay: boolean;
  /** 是否为百度小程序环境 */
  isSwan: boolean;
  /** 是否为字节小程序环境 */
  isTt: boolean;
  /** 是否为QQ小程序环境 */
  isQq: boolean;
  /** 是否为京东小程序环境 */
  isJd: boolean;
  /** 是否为快手小程序环境 */
  isKs: boolean;
  /** 是否为小程序环境 */
  isMiniapp: boolean;
  /** Taro环境变量 */
  taroEnv?: string;
}

/**
 * Taro框架适配器
 * 提供多平台统一接口，支持微信小程序、H5等Taro支持的平台
 */
export class TaroAdapter extends PlatformAdapter {
  /** Taro环境信息 */
  private env: TaroEnvironment;
  /** 文件系统管理器(小程序) */
  private fs: any = null;

  /**
   * 构造函数
   */
  constructor() {
    super('Taro');
    this.env = this.detectTaroEnvironment();

    // 如果是小程序环境，初始化文件系统
    if (this.env.isMiniapp && !this.env.isH5) {
      try {
        this.fs = Taro.getFileSystemManager();
      } catch (error) {
        console.warn('Taro文件系统初始化失败', error);
      }
    }
  }

  /**
   * 检测Taro运行环境
   */
  private detectTaroEnvironment(): TaroEnvironment {
    // 获取Taro运行环境变量
    let taroEnv: string | undefined;
    try {
      taroEnv = process.env.TARO_ENV;
    } catch {
      // 忽略错误，使用undefined作为默认值
      taroEnv = undefined;
    }

    // 判断当前平台
    const platform = Taro.getEnv();

    const env: TaroEnvironment = {
      platform,
      isH5: platform === 'WEB',
      isWeapp: platform === 'WEAPP',
      isAlipay: platform === 'ALIPAY',
      isSwan: platform === 'SWAN',
      isTt: platform === 'TT',
      isQq: platform === 'QQ',
      isJd: platform === 'JD',
      isKs: platform === 'KS',
      isMiniapp: platform !== 'WEB',
      taroEnv
    };

    return env;
  }

  /**
   * 检测当前环境是否支持Taro适配器
   */
  public isSupported(): boolean {
    try {
      return typeof Taro !== 'undefined';
    } catch {
      return false;
    }
  }

  /**
   * 检测平台特性
   */
  protected detectFeatures(): void {
    const { isH5, isMiniapp } = this.env;

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
    } else if (isMiniapp) {
      // 小程序环境特性检测
      this.features.maxConcurrentRequests = 10;
      this.features.maxFileSize = 50 * 1024 * 1024; // 默认50MB，实际根据不同小程序平台限制

      // 微信小程序特殊处理
      if (this.env.isWeapp) {
        // 微信小程序有更高的文件大小限制
        this.features.maxFileSize = 100 * 1024 * 1024; // 100MB
      }
    }

    // 通用特性
    this.features.chunkedUpload = true; // Taro适配器支持分片上传
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
   * 支持H5和小程序环境
   * @param file 文件对象
   * @param chunkSize 分片大小
   */
  public async createChunks(file: any, chunkSize: number): Promise<FileChunk[]> {
    if (this.env.isH5) {
      // H5环境分片处理
      return this.createH5Chunks(file, chunkSize);
    } else {
      // 小程序环境分片处理
      return this.createMiniappChunks(file, chunkSize);
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
   * 小程序环境创建文件分片
   * 使用临时文件路径处理
   */
  private async createMiniappChunks(file: any, chunkSize: number): Promise<FileChunk[]> {
    try {
      // 获取文件信息
      const fileInfo = await this.getFileInfo(file);
      const filePath = file.path;
      const fileSize = fileInfo.size;

      // 计算分片
      const totalChunks = Math.ceil(fileSize / chunkSize);
      const chunks: FileChunk[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);

        chunks.push({
          index: i,
          data: null, // 小程序环境下先不读取数据，避免内存压力
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
   * 支持H5和小程序环境
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

      // 普通请求
      if (this.env.isH5 && 'fetch' in window) {
        // H5环境使用fetch API
        const controller = signal ? undefined : new AbortController();
        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: signal || controller?.signal
        };

        // 处理请求体
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

        // 保存请求引用
        if (taskRef) {
          taskRef({ abort: () => controller?.abort() });
        }

        // 发送请求
        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          throw new Error(`请求失败 (${response.status}): ${response.statusText}`);
        }

        try {
          return await response.json();
        } catch {
          return await response.text();
        }
      } else {
        // 小程序环境使用Taro.request
        return new Promise((resolve, reject) => {
          const requestTask = Taro.request({
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
            fail: (error: any) => {
              reject(new Error(error.errMsg || '请求失败'));
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
      }
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
        // H5环境下使用FormData和fetch
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
        // 小程序环境下使用Taro.uploadFile

        // 如果分片未加载数据，先读取数据块
        if (!chunk.tempPath && chunk.path) {
          chunk = await this.optimizeChunk(chunk);
        }

        return new Promise((resolve, reject) => {
          const uploadTask = Taro.uploadFile({
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

          // 修正uploadTask.progress调用
          if (onProgress && typeof uploadTask?.progress === 'function') {
            uploadTask.progress(
              (res: {
                progress: number;
                totalBytesWritten: number;
                totalBytesExpectedToWrite: number;
              }) => {
                onProgress(res.progress);
              }
            );
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
   * 优化小程序分片处理
   * 读取分片数据并写入临时文件
   */
  private async optimizeChunk(chunk: FileChunk): Promise<FileChunk> {
    try {
      if (!this.fs) {
        throw new Error('文件系统不可用');
      }

      // 读取文件片段
      const data = await this.readFile(chunk.path, chunk.start, chunk.size);

      // 写入临时文件
      const tempFilePath = `${Taro.env.USER_DATA_PATH}/upload_temp_${chunk.index}_${Date.now()}`;

      await new Promise<void>((resolve, reject) => {
        this.fs.writeFile({
          filePath: tempFilePath,
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
        // H5环境下使用File API
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
        // 小程序环境下使用文件系统API
        if (!this.fs) {
          throw new Error('文件系统不可用');
        }

        const filePath = typeof file === 'string' ? file : file.path;
        if (!filePath) {
          throw new Error('文件路径无效');
        }

        return new Promise((resolve, reject) => {
          const size = end || end === 0 ? end : undefined;
          this.fs.readFile({
            filePath,
            position: start,
            length: size,
            success: (res: { data: ArrayBuffer }) => resolve(res.data),
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
        // 小程序环境
        const filePath = typeof file === 'string' ? file : file.path;
        if (!filePath) {
          throw new Error('文件路径无效');
        }

        // 获取文件信息
        return new Promise((resolve, reject) => {
          Taro.getFileInfo({
            filePath,
            success: (res: { size: number }) => {
              // 小程序只提供部分信息，其他信息需从file对象获取或设置默认值
              resolve({
                name: file.name || filePath.substring(filePath.lastIndexOf('/') + 1),
                size: res.size,
                type: file.type || '',
                lastModified: file.lastModified || Date.now()
              });
            },
            fail: (err: { errMsg?: string }) => reject(new Error(err.errMsg || '获取文件信息失败'))
          });
        });
      }
    } catch (error) {
      throw this.handleError(error as Error, { file });
    }
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
    const { accept, multiple = false, directory = false } = options;

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

          if (directory && 'webkitdirectory' in input) {
            (input as any).webkitdirectory = true;
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
        // 小程序环境
        const count = multiple ? 100 : 1; // 微信小程序最多一次选择100个文件

        // 根据文件类型过滤
        let fileType: 'all' | 'video' | 'image' | 'file' = 'all';
        if (accept) {
          if (accept.includes('image/')) {
            fileType = 'image';
          } else if (accept.includes('video/')) {
            fileType = 'video';
          }
        }

        try {
          if (fileType === 'image') {
            const res = await Taro.chooseImage({
              count,
              sizeType: ['original', 'compressed'],
              sourceType: ['album', 'camera']
            });
            return res.tempFiles;
          } else if (fileType === 'video') {
            const res = await Taro.chooseVideo({
              sourceType: ['album', 'camera'],
              compressed: false,
              maxDuration: 60
            });
            // 转换为统一格式
            return [
              {
                path: res.tempFilePath,
                size: res.size,
                name: res.tempFilePath.substring(res.tempFilePath.lastIndexOf('/') + 1),
                type: 'video/*',
                duration: res.duration
              }
            ];
          } else if (this.env.isWeapp && typeof Taro.chooseMessageFile === 'function') {
            // 微信小程序选择任意文件类型
            const res = await Taro.chooseMessageFile({
              count,
              type: 'file'
            });
            return res.tempFiles;
          } else {
            throw new Error('当前平台不支持选择此类型文件');
          }
        } catch (error: any) {
          // 用户取消选择不应视为错误
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
   * 在上传完成或失败后调用，释放存储空间
   * @param chunks 文件分片列表
   */
  public async cleanupTempFiles(chunks: FileChunk[]): Promise<void> {
    if (!this.env.isMiniapp || !this.fs) {
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
