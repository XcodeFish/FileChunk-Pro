/**
 * 微信小程序文件上传组件
 * 提供高性能分片上传功能
 */

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 上传地址
    url: {
      type: String,
      value: ''
    },
    // 上传请求header
    header: {
      type: Object,
      value: {}
    },
    // 文件类型筛选
    accept: {
      type: String,
      value: '*'
    },
    // 文件类型，可选image、video、audio、all
    mediaType: {
      type: Array,
      value: ['image', 'video']
    },
    // 文件来源，可选album、camera
    sourceType: {
      type: Array,
      value: ['album', 'camera']
    },
    // 是否多选
    multiple: {
      type: Boolean,
      value: false
    },
    // 最多可选数量
    count: {
      type: Number,
      value: 9
    },
    // 分片大小（字节）
    chunkSize: {
      type: Number,
      value: 5 * 1024 * 1024 // 默认5MB
    },
    // 并发上传数
    concurrency: {
      type: Number,
      value: 3
    },
    // 重试次数
    maxRetries: {
      type: Number,
      value: 3
    },
    // 自动上传
    autoUpload: {
      type: Boolean,
      value: true
    },
    // 显示文件列表
    showFileList: {
      type: Boolean,
      value: true
    },
    // 开启断点续传
    resumable: {
      type: Boolean,
      value: true
    },
    // 使用云存储
    useCloudStorage: {
      type: Boolean,
      value: false
    },
    // 云环境ID
    cloudEnv: {
      type: String,
      value: ''
    },
    // 秒传功能
    fastUpload: {
      type: Boolean,
      value: true
    },
    // 上传图片尺寸
    sizeType: {
      type: Array,
      value: ['original', 'compressed']
    },
    // 上传按钮文本
    uploadText: {
      type: String,
      value: '选择文件'
    },
    // 禁用状态
    disabled: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    files: [],
    uploading: false,
    platform: null,
    fileAdapter: null,
    progress: 0,
    totalProgress: 0,
    uploadTasks: [],
    activeUploads: 0
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached() {
      this.initPlatform();
    },
    detached() {
      this.cancelAllUploads();
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 初始化平台适配器
    initPlatform() {
      const { WechatPlatform, FileAdapter } = require('../../utils/index.js');
      this.platform = new WechatPlatform();
      this.fileAdapter = new FileAdapter(this.platform);
      this.setData({ platform: this.platform, fileAdapter: this.fileAdapter });
    },

    // 选择文件
    handleChooseFile() {
      if (this.data.disabled || this.data.uploading) return;

      const { multiple, count, mediaType, sourceType, sizeType } = this.data;

      this.platform
        .chooseFile({
          count: multiple ? count : 1,
          mediaType,
          sourceType,
          sizeType
        })
        .then(files => {
          // 格式化文件信息
          const fileList = files.map((file, index) => ({
            uid: `file-${Date.now()}-${index}`,
            name: file.name || this.platform.getFileName(file.path),
            path: file.path,
            size: file.size || 0,
            type: file.type || this.platform.getFileType(file.path),
            status: 'ready',
            progress: 0,
            uploadTask: null
          }));

          // 添加到文件列表
          const newFiles = [...this.data.files, ...fileList];
          this.setData({ files: newFiles });

          // 触发文件变化事件
          this.triggerEvent('change', { files: newFiles });

          // 自动上传
          if (this.data.autoUpload) {
            this.uploadFiles(fileList);
          }
        })
        .catch(error => {
          this.triggerEvent('error', { error });
          wx.showToast({
            title: '选择文件失败',
            icon: 'none'
          });
        });
    },

    // 上传文件列表
    uploadFiles(files = null) {
      if (this.data.disabled) return;

      // 获取待上传的文件
      const targetFiles = files || this.data.files.filter(file => file.status === 'ready');
      if (!targetFiles.length) return;

      this.setData({ uploading: true });
      this.triggerEvent('start', { files: targetFiles });

      // 创建上传任务
      const tasks = targetFiles.map(file => this.uploadFile(file));
      this.setData({ uploadTasks: [...this.data.uploadTasks, ...tasks] });

      // 监控所有上传任务
      Promise.allSettled(tasks).then(results => {
        const succeeded = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').map(r => r.reason);

        this.setData({ uploading: false });
        this.triggerEvent('complete', { succeeded, failed });
      });
    },

    // 上传单个文件
    async uploadFile(file) {
      try {
        // 更新文件状态
        this.updateFileStatus(file.uid, 'uploading');

        // 根据配置选择不同的上传方式
        let result;
        if (this.data.useCloudStorage) {
          result = await this.uploadToCloud(file);
        } else {
          result = await this.uploadToServer(file);
        }

        // 更新文件状态为成功
        this.updateFileStatus(file.uid, 'success', { result });
        this.triggerEvent('success', { file, result });

        return { file, result };
      } catch (error) {
        // 更新文件状态为失败
        this.updateFileStatus(file.uid, 'error', { error });
        this.triggerEvent('error', { file, error });
        throw error;
      }
    },

    // 上传到服务器
    async uploadToServer(file) {
      const { url, header, chunkSize, concurrency, maxRetries, resumable, fastUpload } = this.data;

      // 非空校验
      if (!url) {
        throw new Error('上传地址不能为空');
      }

      // 初始化上传参数
      let hash = '';
      if (fastUpload || resumable) {
        // 计算文件哈希用于秒传和断点续传
        wx.showLoading({ title: '计算文件特征值' });
        hash = await this.fileAdapter.calculateHash(file.path);
        wx.hideLoading();
      }

      // 检查是否可以秒传
      if (fastUpload && hash) {
        const checkResult = await this.checkFileExists(hash, file);
        if (checkResult.exists) {
          return checkResult.url;
        }

        // 获取已上传的分片
        const uploadedChunks = new Set(checkResult.uploadedChunks || []);
        if (uploadedChunks.size > 0) {
          // 断点续传
          this.triggerEvent('resume', { file, uploadedChunks });
        }
      }

      // 创建分片
      const chunks = await this.fileAdapter.createChunks(file.path, chunkSize);
      const totalChunks = chunks.length;

      // 创建并发上传队列
      const uploadQueue = [];
      let completedChunks = 0;

      // 更新进度函数
      const updateProgress = () => {
        const progress = Math.floor((completedChunks / totalChunks) * 100);
        this.setData({ progress });
        this.triggerEvent('progress', { file, progress });
      };

      // 创建上传任务
      for (let i = 0; i < chunks.length; i++) {
        uploadQueue.push(async () => {
          // 已上传的分片跳过
          if (resumable && hash && uploadedChunks && uploadedChunks.has(i)) {
            completedChunks++;
            updateProgress();
            return { index: i, success: true };
          }

          // 重试机制
          let retries = 0;
          while (retries <= maxRetries) {
            try {
              const res = await this.uploadChunk(chunks[i], i, totalChunks, hash, url, header);
              completedChunks++;
              updateProgress();
              return { index: i, success: true, result: res };
            } catch (error) {
              retries++;
              if (retries > maxRetries) {
                throw error;
              }
              // 等待一段时间后重试
              await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            }
          }
        });
      }

      // 执行并发上传
      const results = [];
      const executing = new Set();

      for (const uploadTask of uploadQueue) {
        if (executing.size >= concurrency) {
          // 等待某个任务完成
          await Promise.race(executing);
        }

        // 创建任务Promise并添加到执行集合
        const taskPromise = uploadTask()
          .then(result => {
            executing.delete(taskPromise);
            results.push(result);
            return result;
          })
          .catch(error => {
            executing.delete(taskPromise);
            throw error;
          });

        executing.add(taskPromise);
      }

      // 等待所有任务完成
      await Promise.all(executing);

      // 合并请求
      return await this.mergeChunks(hash, totalChunks, file.name, url, header);
    },

    // 上传分片
    async uploadChunk(chunk, index, totalChunks, hash, url, header) {
      return new Promise((resolve, reject) => {
        const uploadTask = wx.uploadFile({
          url: `${url}/chunk`,
          filePath: chunk.path,
          name: 'file',
          formData: {
            hash: hash,
            index: index.toString(),
            total: totalChunks.toString()
          },
          header: header,
          success: res => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const data = JSON.parse(res.data);
                resolve(data);
              } catch (e) {
                resolve(res.data);
              }
            } else {
              reject(new Error(`上传分片失败(${res.statusCode})`));
            }
          },
          fail: err => {
            reject(err);
          }
        });

        // 保存上传任务
        this.data.uploadTasks.push(uploadTask);
      });
    },

    // 合并分片
    async mergeChunks(hash, totalChunks, fileName, url, header) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: `${url}/merge`,
          method: 'POST',
          data: {
            hash: hash,
            fileName: fileName,
            totalChunks: totalChunks
          },
          header: {
            'content-type': 'application/json',
            ...header
          },
          success: res => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(res.data);
            } else {
              reject(new Error(`合并请求失败(${res.statusCode})`));
            }
          },
          fail: err => {
            reject(err);
          }
        });
      });
    },

    // 检查文件是否已存在（秒传）
    async checkFileExists(hash, file) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: `${this.data.url}/check`,
          method: 'POST',
          data: {
            hash: hash,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type
          },
          header: {
            'content-type': 'application/json',
            ...this.data.header
          },
          success: res => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(res.data);
            } else {
              resolve({ exists: false, uploadedChunks: [] });
            }
          },
          fail: () => {
            resolve({ exists: false, uploadedChunks: [] });
          }
        });
      });
    },

    // 上传到微信云存储
    async uploadToCloud(file) {
      if (!this.data.cloudEnv) {
        throw new Error('云环境ID不能为空');
      }

      return new Promise((resolve, reject) => {
        // 构建云存储路径
        const cloudPath = `uploads/${Date.now()}-${file.name}`;

        const uploadTask = wx.cloud.uploadFile({
          cloudPath,
          filePath: file.path,
          config: {
            env: this.data.cloudEnv
          },
          success: res => {
            resolve({
              fileID: res.fileID,
              url: res.fileID
            });
          },
          fail: err => {
            reject(err);
          }
        });

        // 保存上传任务
        this.data.uploadTasks.push(uploadTask);

        // 监听上传进度
        uploadTask.onProgressUpdate(res => {
          const progress = res.progress;
          this.setData({ progress });
          this.triggerEvent('progress', { file, progress });
        });
      });
    },

    // 更新文件状态
    updateFileStatus(uid, status, extraData = {}) {
      const fileList = [...this.data.files];
      const fileIndex = fileList.findIndex(file => file.uid === uid);

      if (fileIndex > -1) {
        fileList[fileIndex] = {
          ...fileList[fileIndex],
          status,
          ...extraData
        };

        this.setData({ files: fileList });
      }
    },

    // 取消上传
    cancelUpload(uid) {
      const fileList = [...this.data.files];
      const fileIndex = fileList.findIndex(file => file.uid === uid);

      if (fileIndex > -1) {
        // 取消上传任务
        const uploadTask = fileList[fileIndex].uploadTask;
        if (uploadTask && typeof uploadTask.abort === 'function') {
          uploadTask.abort();
        }

        // 更新文件状态
        fileList[fileIndex].status = 'canceled';
        this.setData({ files: fileList });

        this.triggerEvent('cancel', { file: fileList[fileIndex] });
      }
    },

    // 取消所有上传
    cancelAllUploads() {
      // 中止所有上传任务
      this.data.uploadTasks.forEach(task => {
        if (task && typeof task.abort === 'function') {
          task.abort();
        }
      });

      // 更新文件状态
      const fileList = this.data.files.map(file => {
        if (file.status === 'uploading') {
          return { ...file, status: 'canceled' };
        }
        return file;
      });

      this.setData({
        files: fileList,
        uploading: false,
        uploadTasks: [],
        progress: 0,
        totalProgress: 0
      });

      this.triggerEvent('cancelAll');
    },

    // 重试上传
    retryUpload(uid) {
      const fileList = [...this.data.files];
      const fileIndex = fileList.findIndex(file => file.uid === uid);

      if (fileIndex > -1 && ['error', 'canceled'].includes(fileList[fileIndex].status)) {
        // 更新文件状态
        fileList[fileIndex].status = 'ready';
        fileList[fileIndex].progress = 0;
        this.setData({ files: fileList });

        // 开始上传
        this.uploadFiles([fileList[fileIndex]]);
      }
    },

    // 移除文件
    removeFile(uid) {
      const fileList = [...this.data.files];
      const fileIndex = fileList.findIndex(file => file.uid === uid);

      if (fileIndex > -1) {
        // 如果正在上传则先取消
        if (fileList[fileIndex].status === 'uploading') {
          this.cancelUpload(uid);
        }

        // 从列表中移除
        fileList.splice(fileIndex, 1);
        this.setData({ files: fileList });

        this.triggerEvent('remove', { uid });
      }
    },

    // 预览文件
    previewFile(uid) {
      const file = this.data.files.find(file => file.uid === uid);

      if (file && file.path) {
        if (/\.(png|jpg|jpeg|gif|webp)$/i.test(file.path)) {
          wx.previewImage({
            urls: [file.path],
            current: file.path
          });
        } else if (/\.(mp4|mov|m4v|3gp|avi)$/i.test(file.path)) {
          wx.openVideoPlayerPluginOverlay({
            videoUrl: file.path
          });
        } else {
          wx.showToast({
            title: '不支持预览该类型文件',
            icon: 'none'
          });
        }
      }
    }
  }
});
