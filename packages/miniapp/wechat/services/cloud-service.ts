/**
 * 微信小程序云开发服务
 * 提供对微信云开发功能的封装
 */

interface CloudOptions {
  env?: string; // 云环境ID
  region?: string; // 区域
  traceUser?: boolean; // 是否跟踪用户
}

interface UploadCloudFileOptions {
  cloudPath: string; // 云存储路径
  filePath: string; // 本地文件路径
  header?: Record<string, string>; // 请求头
  onProgress?: (progress: number) => void; // 进度回调
  timeout?: number; // 超时时间
}

interface CloudFileInfo {
  fileID: string; // 文件ID
  tempFileURL?: string; // 临时访问地址
  size?: number; // 文件大小
  name?: string; // 文件名称
  type?: string; // 文件类型
  createTime?: number; // 创建时间
  maxAge?: number; // 临时链接有效期
}

/**
 * 云开发服务类
 */
class CloudService {
  private options: CloudOptions;
  private isInitialized: boolean = false;

  /**
   * 创建云开发服务实例
   * @param options 云开发选项
   */
  constructor(options: CloudOptions = {}) {
    this.options = {
      env: '',
      region: '',
      traceUser: true,
      ...options
    };

    // 自动初始化
    this.init();
  }

  /**
   * 初始化云开发环境
   * @param options 云开发选项
   * @returns 云开发服务实例
   */
  init(options?: CloudOptions): CloudService {
    // 如果已初始化且无新选项，则直接返回
    if (this.isInitialized && !options) {
      return this;
    }

    // 合并选项
    if (options) {
      this.options = { ...this.options, ...options };
    }

    // 检查wx和云开发是否可用
    if (typeof wx === 'undefined' || !wx.cloud) {
      console.error('微信云开发不可用');
      return this;
    }

    try {
      // 初始化云开发
      wx.cloud.init({
        env: this.options.env,
        traceUser: this.options.traceUser
      });
      this.isInitialized = true;
    } catch (error) {
      console.error('初始化云开发失败:', error);
    }

    return this;
  }

  /**
   * 设置云环境
   * @param env 云环境ID
   */
  setEnv(env: string): CloudService {
    this.options.env = env;
    if (this.isInitialized && wx.cloud) {
      wx.cloud.init({
        env,
        traceUser: this.options.traceUser
      });
    }
    return this;
  }

  /**
   * 获取云数据库实例
   * @param collectionName 集合名称
   * @returns 数据库集合对象
   */
  getCollection(collectionName: string): any {
    if (!this.checkAvailable()) return null;
    return wx.cloud.database().collection(collectionName);
  }

  /**
   * 上传文件到云存储
   * @param options 上传选项
   * @returns 上传结果
   */
  uploadFile(options: UploadCloudFileOptions): Promise<CloudFileInfo> {
    if (!this.checkAvailable()) {
      return Promise.reject(new Error('云开发不可用'));
    }

    if (!options.cloudPath || !options.filePath) {
      return Promise.reject(new Error('cloudPath和filePath不能为空'));
    }

    return new Promise((resolve, reject) => {
      const uploadTask = wx.cloud.uploadFile({
        cloudPath: options.cloudPath,
        filePath: options.filePath,
        header: options.header,
        success: (res: any) => {
          const fileInfo: CloudFileInfo = {
            fileID: res.fileID,
            size: 0,
            name: options.cloudPath.substring(options.cloudPath.lastIndexOf('/') + 1)
          };
          resolve(fileInfo);
        },
        fail: err => {
          reject(err);
        }
      });

      // 监听上传进度
      if (typeof options.onProgress === 'function') {
        uploadTask.onProgressUpdate(res => {
          options.onProgress!(res.progress / 100);
        });
      }
    });
  }

  /**
   * 分片上传大文件到云存储
   * @param options 上传选项
   * @param chunkSize 分片大小（单位：字节）
   * @returns 上传结果
   */
  async uploadFileByChinked(
    options: UploadCloudFileOptions,
    chunkSize: number = 4 * 1024 * 1024 // 默认4MB
  ): Promise<CloudFileInfo> {
    if (!this.checkAvailable()) {
      return Promise.reject(new Error('云开发不可用'));
    }

    if (!options.cloudPath || !options.filePath) {
      return Promise.reject(new Error('cloudPath和filePath不能为空'));
    }

    try {
      // 获取文件信息
      const fs = wx.getFileSystemManager();
      const fileInfo = await new Promise<WechatMiniprogram.Stats>((resolve, reject) => {
        fs.stat({
          path: options.filePath,
          success: res => resolve(res.stats),
          fail: reject
        });
      });

      if (!fileInfo || fileInfo.size <= chunkSize) {
        // 文件小于分片大小，直接上传
        return this.uploadFile(options);
      }

      // 分片上传
      const fileName = options.cloudPath.substring(options.cloudPath.lastIndexOf('/') + 1);
      const fileSize = fileInfo.size;
      const chunks = Math.ceil(fileSize / chunkSize);

      // 创建临时文件集合，记录分片信息
      const tempCollection = this.getCollection('__upload_chunks__');
      const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // 记录上传任务
      await tempCollection.add({
        data: {
          uniqueId,
          fileName,
          cloudPath: options.cloudPath,
          size: fileSize,
          chunks,
          status: 'uploading',
          completedChunks: 0,
          createTime: new Date()
        }
      });

      // 上传分片
      let completedChunks = 0;
      const chunkPromises = Array(chunks)
        .fill(0)
        .map(async (_, index) => {
          const start = index * chunkSize;
          const end = Math.min(start + chunkSize, fileSize);
          const chunkData = await new Promise<ArrayBuffer>((resolve, reject) => {
            fs.readFile({
              filePath: options.filePath,
              position: start,
              length: end - start,
              success: res => resolve(res.data as ArrayBuffer),
              fail: reject
            });
          });

          // 保存为临时文件
          const tempFilePath = `${wx.env.USER_DATA_PATH}/chunk_${uniqueId}_${index}`;
          await new Promise<void>((resolve, reject) => {
            fs.writeFile({
              filePath: tempFilePath,
              data: chunkData,
              success: () => resolve(),
              fail: reject
            });
          });

          // 上传分片
          const chunkCloudPath = `chunks/${uniqueId}/${index}`;
          const result = await wx.cloud.uploadFile({
            cloudPath: chunkCloudPath,
            filePath: tempFilePath
          });

          // 删除临时文件
          fs.unlink({
            filePath: tempFilePath,
            success: () => {},
            fail: () => {}
          });

          // 更新进度
          completedChunks++;
          if (options.onProgress) {
            options.onProgress(completedChunks / chunks);
          }

          // 更新任务状态
          await tempCollection.where({ uniqueId }).update({
            data: {
              completedChunks
            }
          });

          return result.fileID;
        });

      // 等待所有分片上传完成
      const chunkFileIDs = await Promise.all(chunkPromises);

      // 调用云函数合并文件
      const mergeResult = await wx.cloud.callFunction({
        name: 'mergeFiles',
        data: {
          fileIDs: chunkFileIDs,
          targetPath: options.cloudPath
        }
      });

      if (!mergeResult || !mergeResult.result || !mergeResult.result.fileID) {
        throw new Error('合并文件失败');
      }

      // 删除临时分片
      wx.cloud.deleteFile({
        fileList: chunkFileIDs
      });

      // 更新任务状态
      await tempCollection.where({ uniqueId }).update({
        data: {
          status: 'completed',
          fileID: mergeResult.result.fileID
        }
      });

      // 返回文件信息
      return {
        fileID: mergeResult.result.fileID,
        name: fileName,
        size: fileSize
      };
    } catch (error) {
      console.error('分片上传失败:', error);
      throw error;
    }
  }

  /**
   * 获取文件临时下载地址
   * @param fileID 文件ID
   * @param maxAge 有效期（单位：秒）
   * @returns 临时文件信息
   */
  getTempFileURL(fileID: string, maxAge: number = 3600): Promise<CloudFileInfo> {
    if (!this.checkAvailable()) {
      return Promise.reject(new Error('云开发不可用'));
    }

    if (!fileID) {
      return Promise.reject(new Error('fileID不能为空'));
    }

    return new Promise((resolve, reject) => {
      wx.cloud.getTempFileURL({
        fileList: [{ fileID, maxAge }],
        success: (res: any) => {
          if (res.fileList && res.fileList.length > 0) {
            const fileInfo = res.fileList[0];
            resolve({
              fileID: fileInfo.fileID,
              tempFileURL: fileInfo.tempFileURL,
              maxAge,
              createTime: Date.now()
            });
          } else {
            reject(new Error('获取临时文件地址失败'));
          }
        },
        fail: reject
      });
    });
  }

  /**
   * 批量获取文件临时下载地址
   * @param fileIDs 文件ID数组
   * @param maxAge 有效期（单位：秒）
   * @returns 临时文件信息数组
   */
  batchGetTempFileURL(fileIDs: string[], maxAge: number = 3600): Promise<CloudFileInfo[]> {
    if (!this.checkAvailable()) {
      return Promise.reject(new Error('云开发不可用'));
    }

    if (!fileIDs || !fileIDs.length) {
      return Promise.reject(new Error('fileIDs不能为空'));
    }

    return new Promise((resolve, reject) => {
      wx.cloud.getTempFileURL({
        fileList: fileIDs.map(fileID => ({ fileID, maxAge })),
        success: (res: any) => {
          if (res.fileList && res.fileList.length > 0) {
            const fileInfoList = res.fileList.map((item: any) => ({
              fileID: item.fileID,
              tempFileURL: item.tempFileURL,
              maxAge,
              createTime: Date.now()
            }));
            resolve(fileInfoList);
          } else {
            reject(new Error('批量获取临时文件地址失败'));
          }
        },
        fail: reject
      });
    });
  }

  /**
   * 下载文件
   * @param fileID 文件ID
   * @param tempFilePath 指定下载路径
   * @returns 下载结果
   */
  downloadFile(fileID: string, tempFilePath?: string): Promise<string> {
    if (!this.checkAvailable()) {
      return Promise.reject(new Error('云开发不可用'));
    }

    if (!fileID) {
      return Promise.reject(new Error('fileID不能为空'));
    }

    return new Promise((resolve, reject) => {
      wx.cloud.downloadFile({
        fileID,
        success: (res: any) => {
          resolve(res.tempFilePath);
        },
        fail: reject
      });
    });
  }

  /**
   * 删除文件
   * @param fileID 文件ID
   * @returns 删除结果
   */
  deleteFile(fileID: string): Promise<void> {
    if (!this.checkAvailable()) {
      return Promise.reject(new Error('云开发不可用'));
    }

    if (!fileID) {
      return Promise.reject(new Error('fileID不能为空'));
    }

    return new Promise((resolve, reject) => {
      wx.cloud.deleteFile({
        fileList: [fileID],
        success: () => {
          resolve();
        },
        fail: reject
      });
    });
  }

  /**
   * 批量删除文件
   * @param fileIDs 文件ID数组
   * @returns 删除结果
   */
  batchDeleteFile(
    fileIDs: string[]
  ): Promise<{ fileID: string; status: number; errMsg: string }[]> {
    if (!this.checkAvailable()) {
      return Promise.reject(new Error('云开发不可用'));
    }

    if (!fileIDs || !fileIDs.length) {
      return Promise.reject(new Error('fileIDs不能为空'));
    }

    return new Promise((resolve, reject) => {
      wx.cloud.deleteFile({
        fileList: fileIDs,
        success: (res: any) => {
          resolve(res.fileList);
        },
        fail: reject
      });
    });
  }

  /**
   * 检查云开发是否可用
   * @returns 是否可用
   */
  private checkAvailable(): boolean {
    if (!this.isInitialized) {
      console.error('云开发尚未初始化');
      return false;
    }

    if (typeof wx === 'undefined' || !wx.cloud) {
      console.error('微信云开发不可用');
      return false;
    }

    return true;
  }
}

export default CloudService;
export { CloudOptions, UploadCloudFileOptions, CloudFileInfo };
