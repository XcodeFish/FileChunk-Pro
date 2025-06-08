/**
 * 微信小程序平台适配器
 * 封装微信小程序特有API和功能
 */

interface PlatformOptions {
  maxConcurrentUploads?: number;
  maxRetryTimes?: number;
  retryDelay?: number;
  [key: string]: any;
}

interface FileInfo {
  path: string;
  size?: number;
  name?: string;
  type?: string;
  fileType?: string;
  duration?: number;
  width?: number;
  height?: number;
}

interface ChooseFileOptions {
  count?: number;
  mediaType?: string[];
  sourceType?: string[];
  maxDuration?: number;
  sizeType?: string[];
  extension?: string[];
  chooseMessageFile?: boolean;
  type?: string;
  [key: string]: any;
}

interface ReadStreamOptions {
  position?: number;
  length?: number;
  onProgress?: (progress: number) => void;
}

export class WechatPlatform {
  options: PlatformOptions;
  systemInfo: WechatMiniprogram.SystemInfo | null;
  networkType: string;
  tempFiles: Map<string, any>;
  onNetworkChange?: (isConnected: boolean, networkType: string) => void;

  constructor(options: PlatformOptions = {}) {
    this.options = {
      maxConcurrentUploads: 5,
      maxRetryTimes: 3,
      retryDelay: 1000,
      ...options
    };

    this.systemInfo = null;
    this.networkType = 'unknown';
    this.tempFiles = new Map();

    // 初始化
    this.init();
  }

  /**
   * 初始化平台适配器
   */
  init(): void {
    // 获取系统信息
    this.getSystemInfo();
    // 监听网络状态
    this.startNetworkListener();
  }

  /**
   * 获取系统信息
   * @returns {Object} 微信小程序系统信息
   */
  getSystemInfo(): WechatMiniprogram.SystemInfo | Record<string, never> {
    if (this.systemInfo) return this.systemInfo;

    try {
      this.systemInfo = wx.getSystemInfoSync();
      return this.systemInfo;
    } catch (error) {
      console.error('获取系统信息失败:', error);
      return {};
    }
  }

  /**
   * 启动网络状态监听
   */
  startNetworkListener(): void {
    // 获取当前网络状态
    wx.getNetworkType({
      success: res => {
        this.networkType = res.networkType;
      }
    });

    // 监听网络状态变化
    wx.onNetworkStatusChange(res => {
      this.networkType = res.networkType;
      // 触发网络状态变化事件
      if (typeof this.onNetworkChange === 'function') {
        this.onNetworkChange(res.isConnected, res.networkType);
      }
    });
  }

  /**
   * 选择文件
   * @param {Object} options 选择文件配置
   * @returns {Promise<Array>} 文件列表
   */
  chooseFile(options: ChooseFileOptions = {}): Promise<FileInfo[]> {
    const defaultOptions = {
      count: 1, // 默认选择一个文件
      mediaType: ['image', 'video'], // 默认类型
      sourceType: ['album', 'camera'], // 默认来源
      maxDuration: 60, // 拍摄视频最长时间，单位秒
      sizeType: ['original', 'compressed'], // 所选的图片的尺寸
      extension: [] // 根据文件拓展名过滤，仅 startChooseFile 有效
    };

    const mergedOptions = { ...defaultOptions, ...options };

    // 优先使用新版文件选择API
    if (wx.chooseMedia) {
      return new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: mergedOptions.count,
          mediaType: mergedOptions.mediaType as ('image' | 'video')[],
          sourceType: mergedOptions.sourceType as ('album' | 'camera')[],
          maxDuration: mergedOptions.maxDuration,
          sizeType: mergedOptions.sizeType as ('original' | 'compressed')[],
          success: res => {
            // 将文件信息格式化为标准格式
            const files = res.tempFiles.map(item => ({
              path: item.tempFilePath,
              size: item.size,
              name: this.getFileName(item.tempFilePath),
              type: this.getFileType(item.tempFilePath),
              fileType: item.fileType || this.getFileTypeByPath(item.tempFilePath),
              duration: item.duration || 0,
              width: item.width || 0,
              height: item.height || 0
            }));
            resolve(files);
          },
          fail: reject
        });
      });
    } else if (wx.chooseMessageFile && options.chooseMessageFile) {
      // 使用从聊天中选择文件的方式
      return new Promise((resolve, reject) => {
        wx.chooseMessageFile({
          count: mergedOptions.count,
          type: (mergedOptions.type as 'all' | 'video' | 'image' | 'file') || 'all',
          extension: mergedOptions.extension,
          success: res => {
            const files = res.tempFiles.map(item => ({
              path: item.path,
              size: item.size,
              name: item.name,
              type: this.getFileType(item.path),
              fileType: this.getFileTypeByPath(item.path)
            }));
            resolve(files);
          },
          fail: reject
        });
      });
    } else {
      // 兼容旧版本选择图片接口
      return new Promise((resolve, reject) => {
        wx.chooseImage({
          count: mergedOptions.count,
          sizeType: mergedOptions.sizeType as ('original' | 'compressed')[],
          sourceType: mergedOptions.sourceType as ('album' | 'camera')[],
          success: res => {
            const files = res.tempFilePaths.map((path, index) => ({
              path,
              size: res.tempFiles ? res.tempFiles[index].size : 0,
              name: this.getFileName(path),
              type: 'image',
              fileType: 'image'
            }));
            resolve(files);
          },
          fail: reject
        });
      });
    }
  }

  /**
   * 从文件路径获取文件名
   * @param {String} path 文件路径
   * @returns {String} 文件名
   */
  getFileName(path: string): string {
    if (!path) return '';
    return path.substring(path.lastIndexOf('/') + 1);
  }

  /**
   * 从文件路径获取文件类型
   * @param {String} path 文件路径
   * @returns {String} 文件MIME类型
   */
  getFileType(path: string): string {
    if (!path) return '';

    const extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain'
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * 从文件路径获取文件类型简称
   * @param {String} path 文件路径
   * @returns {String} 文件类型简称
   */
  getFileTypeByPath(path: string): string {
    if (!path) return '';

    const extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase();

    // 图片类型
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
      return 'image';
    }

    // 视频类型
    if (['mp4', 'mov', 'wmv', 'avi', 'flv', 'f4v', 'm4v'].includes(extension)) {
      return 'video';
    }

    // 音频类型
    if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(extension)) {
      return 'audio';
    }

    // 文档类型
    return 'file';
  }

  /**
   * 创建文件读取流
   * @param {String} filePath 文件路径
   * @param {Object} options 选项
   * @returns {Promise<any>} 文件内容
   */
  createFileReadStream(filePath: string, options: ReadStreamOptions = {}): Promise<ArrayBuffer> {
    const fs = wx.getFileSystemManager();
    const defaultOptions = {
      position: 0,
      length: 0 // 0表示读取整个文件
    };

    const mergedOptions = { ...defaultOptions, ...options };

    return new Promise((resolve, reject) => {
      fs.readFile({
        filePath,
        position: mergedOptions.position,
        length: mergedOptions.length,
        success: res => {
          resolve(res.data as ArrayBuffer);
        },
        fail: err => {
          reject(err);
        }
      });
    });
  }

  /**
   * 读取文件内容
   * @param {String} filePath 文件路径
   * @param {Boolean} base64Encode 是否Base64编码
   * @returns {Promise<any>} 文件内容
   */
  readFile(filePath: string, base64Encode = false): Promise<string | ArrayBuffer> {
    const fs = wx.getFileSystemManager();

    return new Promise((resolve, reject) => {
      fs.readFile({
        filePath,
        encoding: base64Encode ? 'base64' : undefined,
        success: res => {
          resolve(res.data);
        },
        fail: err => {
          reject(err);
        }
      });
    });
  }

  /**
   * 读取文件片段
   * @param {String} filePath 文件路径
   * @param {Number} start 起始位置
   * @param {Number} end 结束位置
   * @returns {Promise<ArrayBuffer>} 文件内容
   */
  readFileChunk(filePath: string, start: number, end: number): Promise<ArrayBuffer> {
    const fs = wx.getFileSystemManager();

    return new Promise((resolve, reject) => {
      fs.readFile({
        filePath,
        position: start,
        length: end - start,
        success: res => {
          resolve(res.data as ArrayBuffer);
        },
        fail: err => {
          reject(err);
        }
      });
    });
  }

  /**
   * 发送网络请求
   * @param {String} url 请求地址
   * @param {Object} options 请求选项
   * @returns {Promise<any>} 响应数据
   */
  request(url: string, options: Record<string, any> = {}): Promise<any> {
    const defaultOptions = {
      method: 'GET',
      data: {},
      header: {},
      timeout: 60000
    };

    const mergedOptions = { ...defaultOptions, ...options };

    return new Promise((resolve, reject) => {
      const requestTask = wx.request({
        url,
        method: mergedOptions.method as any,
        data: mergedOptions.data,
        header: mergedOptions.header,
        timeout: mergedOptions.timeout,
        success: res => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            reject({
              code: res.statusCode,
              message: `请求失败: ${res.statusCode}`,
              data: res.data
            });
          }
        },
        fail: err => {
          reject({
            code: -1,
            message: err.errMsg || '网络请求失败',
            error: err
          });
        }
      });

      // 返回请求任务，便于取消
      if (typeof options.getRequestTask === 'function') {
        options.getRequestTask(requestTask);
      }
    });
  }

  /**
   * 上传文件
   * @param {String} url 上传地址
   * @param {Object} options 上传选项
   * @returns {Promise<any>} 上传结果
   */
  uploadFile(url: string, options: Record<string, any>): Promise<any> {
    if (!options.filePath) {
      return Promise.reject(new Error('filePath is required'));
    }

    const defaultOptions = {
      name: 'file',
      header: {},
      formData: {},
      timeout: 60000
    };

    const mergedOptions = { ...defaultOptions, ...options };

    return new Promise((resolve, reject) => {
      const uploadTask = wx.uploadFile({
        url,
        filePath: mergedOptions.filePath,
        name: mergedOptions.name,
        header: mergedOptions.header,
        formData: mergedOptions.formData,
        timeout: mergedOptions.timeout,
        success: res => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              // 尝试解析JSON响应
              const data = JSON.parse(res.data);
              resolve(data);
            } catch (e) {
              // 如果不是JSON，直接返回数据
              resolve(res.data);
            }
          } else {
            reject({
              code: res.statusCode,
              message: `上传失败: ${res.statusCode}`,
              data: res.data
            });
          }
        },
        fail: err => {
          reject({
            code: -1,
            message: err.errMsg || '上传文件失败',
            error: err
          });
        }
      });

      // 注册上传进度回调
      if (typeof mergedOptions.onProgress === 'function') {
        uploadTask.onProgressUpdate(res => {
          mergedOptions.onProgress({
            progress: res.progress / 100,
            totalBytesSent: res.totalBytesSent,
            totalBytesExpectedToSend: res.totalBytesExpectedToSend
          });
        });
      }

      // 返回上传任务，便于取消
      if (typeof mergedOptions.getTask === 'function') {
        mergedOptions.getTask(uploadTask);
      }
    });
  }

  /**
   * 保存临时文件
   * @param {ArrayBuffer|String} data 文件数据
   * @param {String} extension 扩展名
   * @returns {Promise<String>} 临时文件路径
   */
  saveTempFile(data: ArrayBuffer | string, extension = ''): Promise<string> {
    const fs = wx.getFileSystemManager();
    const tempFilePath = `${wx.env.USER_DATA_PATH}/temp_${Date.now()}${extension}`;

    return new Promise((resolve, reject) => {
      fs.writeFile({
        filePath: tempFilePath,
        data,
        encoding: typeof data === 'string' ? 'utf8' : 'binary',
        success: () => {
          // 记录临时文件，便于后续清理
          this.tempFiles.set(tempFilePath, Date.now());
          resolve(tempFilePath);
        },
        fail: err => {
          reject(err);
        }
      });
    });
  }

  /**
   * 清理临时文件
   * @param {Number} maxAge 最大保留时间(毫秒)
   * @returns {Promise<void>}
   */
  cleanTempFiles(maxAge = 3600000): Promise<void> {
    const fs = wx.getFileSystemManager();
    const now = Date.now();
    const expiredFiles: string[] = [];

    // 查找过期的临时文件
    this.tempFiles.forEach((createTime, filePath) => {
      if (now - createTime > maxAge) {
        expiredFiles.push(filePath);
      }
    });

    // 删除过期文件
    return Promise.all(
      expiredFiles.map(
        filePath =>
          new Promise<void>(resolve => {
            fs.unlink({
              filePath,
              success: () => {
                this.tempFiles.delete(filePath);
                resolve();
              },
              fail: () => {
                this.tempFiles.delete(filePath);
                resolve();
              }
            });
          })
      )
    ).then(() => {});
  }

  /**
   * 获取网络状态
   * @returns {Object} 网络状态信息
   */
  getNetworkStatus(): { isConnected: boolean; networkType: string } {
    return {
      isConnected: this.networkType !== 'none',
      networkType: this.networkType
    };
  }

  /**
   * 检查文件是否存在
   * @param {String} filePath 文件路径
   * @returns {Promise<Boolean>} 文件是否存在
   */
  checkFileExists(filePath: string): Promise<boolean> {
    const fs = wx.getFileSystemManager();

    return new Promise(resolve => {
      fs.access({
        path: filePath,
        success: () => resolve(true),
        fail: () => resolve(false)
      });
    });
  }

  /**
   * 获取文件信息
   * @param {String} filePath 文件路径
   * @returns {Promise<Object>} 文件信息
   */
  getFileInfo(filePath: string): Promise<WechatMiniprogram.Stats> {
    const fs = wx.getFileSystemManager();

    return new Promise((resolve, reject) => {
      fs.stat({
        path: filePath,
        success: res => {
          resolve(res.stats);
        },
        fail: err => {
          reject(err);
        }
      });
    });
  }
}

export default WechatPlatform;
