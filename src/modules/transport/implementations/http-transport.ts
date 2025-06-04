/* eslint-disable @typescript-eslint/no-unused-vars */
import { FileChunk } from '../interfaces';
import { BaseModule } from '../../../core/module-base';
import { ChunkStrategy } from '../chunk-strategy';
import { ConcurrencyManager } from '../concurrency-manager';
import { ChunkIterator } from '../chunk-iterator';
import { PlatformAdapter } from '../../../platforms/platform-base';

/**
 * HTTP传输模块选项
 */
export interface HttpTransportOptions {
  /**
   * 上传目标URL
   */
  target: string;

  /**
   * 检查文件是否已存在的URL
   */
  checkUrl?: string;

  /**
   * 合并分片的URL
   */
  mergeUrl?: string;

  /**
   * 文件下载URL基础路径
   */
  baseUrl?: string;

  /**
   * 分片大小(字节)，默认2MB
   */
  chunkSize?: number;

  /**
   * 并发上传数，默认3
   */
  concurrency?: number;

  /**
   * 是否自动重试
   */
  autoRetry?: boolean;

  /**
   * 最大重试次数
   */
  maxRetries?: number;

  /**
   * 重试延迟(毫秒)
   */
  retryDelay?: number;

  /**
   * 上传超时时间(毫秒)
   */
  timeout?: number;

  /**
   * 自定义请求头
   */
  headers?: Record<string, string>;

  /**
   * 请求拦截器
   */
  requestInterceptor?: (config: any) => Promise<any>;

  /**
   * 响应拦截器
   */
  responseInterceptor?: (response: any) => Promise<any>;

  /**
   * 自定义上传URL生成函数
   */
  generateUploadUrl?: (
    file: File,
    chunkIndex: number,
    totalChunks: number
  ) => string | Promise<string>;

  /**
   * 启用秒传功能
   */
  enableQuickUpload?: boolean;

  /**
   * 是否启用惰性加载分片
   */
  lazyLoadChunks?: boolean;

  /**
   * 每个chunk的上传进度回调函数
   */
  onChunkProgress?: (chunkIndex: number, progress: number) => void;

  /**
   * 分片上传完成回调函数
   */
  onChunkComplete?: (chunkIndex: number) => void;

  /**
   * 分片上传错误回调函数
   */
  onChunkError?: (chunkIndex: number, error: Error) => void;
}

/**
 * 上传任务状态
 */
export type UploadStatus =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'paused'
  | 'completed'
  | 'error'
  | 'canceled';

/**
 * 上传任务信息
 */
export interface UploadTask {
  /**
   * 任务ID
   */
  id: string;

  /**
   * 上传的文件
   */
  file: File;

  /**
   * 任务状态
   */
  status: UploadStatus;

  /**
   * 上传进度（0-100）
   */
  progress: number;

  /**
   * 开始时间
   */
  startTime: number;

  /**
   * 结束时间（如果已完成）
   */
  endTime: number | null;

  /**
   * 上传结果（如果成功）
   */
  result: any | null;

  /**
   * 错误信息（如果失败）
   */
  error: { message: string; code: string } | null;
}

/**
 * HTTP传输模块实现类
 */
export class HttpTransport extends BaseModule {
  private options: HttpTransportOptions;
  private chunkStrategy: ChunkStrategy;
  private concurrencyManager: ConcurrencyManager;

  // 上传状态
  private tasks: Map<string, UploadTask> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private isPaused: boolean = false;
  private currentFileUrl: string | null = null;

  // 断点续传存储
  private retryCountMap: Map<number, number> = new Map();

  /**
   * 创建HTTP传输模块实例
   */
  constructor(options: HttpTransportOptions) {
    super({
      id: 'transport',
      name: '文件传输模块',
      version: '1.0.0',
      dependencies: ['platform']
    });

    // 默认配置与用户选项合并
    this.options = {
      chunkSize: 2 * 1024 * 1024, // 2MB
      concurrency: 3,
      autoRetry: true,
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      enableQuickUpload: true,
      lazyLoadChunks: false,
      ...options
    };

    // 确保必要的选项已提供
    if (!this.options.target) {
      throw new Error('上传目标URL必须提供');
    }

    // 设置默认的检查和合并URL
    if (!this.options.checkUrl) {
      this.options.checkUrl = `${this.options.target}/check`;
    }

    if (!this.options.mergeUrl) {
      this.options.mergeUrl = `${this.options.target}/merge`;
    }

    // 创建分片策略
    this.chunkStrategy = new ChunkStrategy({
      minChunkSize: 512 * 1024, // 512KB
      maxChunkSize: 10 * 1024 * 1024, // 10MB
      initialChunkSize: this.options.chunkSize
    });

    // 创建并发管理器
    this.concurrencyManager = new ConcurrencyManager({
      maxConcurrency: this.options.concurrency
    });
  }

  /**
   * 模块初始化，连接到微内核
   */
  protected async onInit(): Promise<void> {
    this.emit('transport:initialized', {
      module: 'transport',
      options: this.options
    });

    return Promise.resolve();
  }

  /**
   * 开始文件上传
   * @param file 要上传的文件
   * @returns Promise<string> 上传成功后的文件URL
   */
  async uploadFile(file: File): Promise<string> {
    // 获取平台适配器
    //TODO: 需要优化 暂时绕过类型检查 当PlatformAdapter完善后需要修改这里
    const platform = this.getModule('platform') as unknown as PlatformAdapter;

    try {
      // 生成上传任务ID
      const taskId = this.generateTaskId(file);

      // 创建上传任务
      const task: UploadTask = {
        id: taskId,
        file: file,
        status: 'preparing',
        progress: 0,
        startTime: Date.now(),
        endTime: null,
        result: null,
        error: null
      };

      // 注册任务
      this.tasks.set(taskId, task);

      // 更新状态并触发事件
      this.updateTaskStatus(taskId, 'preparing');

      // 重置暂停状态
      this.isPaused = false;

      // 发送开始事件
      this.emit('transport:start', { taskId, file });

      // 计算文件哈希（用于秒传和断点续传）
      let fileHash: string;

      // 尝试从平台适配器获取哈希计算功能
      if (typeof platform.calculateHash === 'function') {
        fileHash = await platform.calculateHash(file);
        this.emit('transport:hashComplete', { hash: fileHash, taskId });
      } else {
        // 使用默认哈希方法（基于文件名和大小的简单哈希）
        fileHash = `${file.name}_${file.size}_${file.lastModified}`;
        this.emit('transport:hashComplete', {
          hash: fileHash,
          taskId,
          warning: '使用简单哈希，不适合生产环境'
        });
      }

      // 检查文件是否已存在（秒传）
      if (this.options.enableQuickUpload) {
        const quickUploadResult = await this.checkFileExists(fileHash, file, platform);

        if (quickUploadResult.exists) {
          this.currentFileUrl = quickUploadResult.url || null;
          this.updateTaskStatus(taskId, 'completed', 100, {
            url: quickUploadResult.url,
            hash: fileHash
          });

          this.emit('transport:quickUploadSuccess', {
            taskId,
            url: quickUploadResult.url,
            hash: fileHash
          });

          return quickUploadResult.url || '';
        }

        // 获取已上传的分片信息
        const uploadedChunks = new Set(quickUploadResult.uploadedChunks || []);

        // 如果有断点续传的数据，通知进度
        if (uploadedChunks.size > 0) {
          this.emit('transport:resumeFromCheckpoint', {
            taskId,
            uploadedChunks: Array.from(uploadedChunks)
          });
        }

        // 确定最佳分片大小
        const optimalChunkSize = this.chunkStrategy.getOptimalChunkSize(file.size);

        // 创建文件分片
        const chunks = await platform.createChunks(file, optimalChunkSize);

        // 创建分片迭代器，优化内存使用
        const chunkIterator = new ChunkIterator(chunks, {
          lazyLoad: this.options.lazyLoadChunks,
          enableCache: true
        });

        // 从已上传分片中恢复状态
        if (uploadedChunks.size > 0) {
          chunkIterator.recoverFromUploaded(uploadedChunks);
        }

        // 上传分片
        this.updateTaskStatus(taskId, 'uploading');
        await this.uploadChunks(chunkIterator, uploadedChunks, fileHash, platform, taskId);

        // 如果上传被取消或失败，抛出错误
        const currentTask = this.tasks.get(taskId);
        if (!currentTask) {
          throw new Error('任务已被移除');
        }

        if (currentTask.status === 'canceled') {
          throw new Error('上传已取消');
        }

        if (currentTask.status === 'error') {
          throw new Error(currentTask.error?.message || '上传失败');
        }

        // 所有分片上传成功，发送合并请求
        const mergeResult = await this.mergeChunks(fileHash, chunks.length, file.name, platform);

        // 更新任务状态
        this.currentFileUrl = mergeResult.url;
        this.updateTaskStatus(taskId, 'completed', 100, {
          url: mergeResult.url,
          hash: fileHash
        });

        return mergeResult.url;
      } else {
        // 不启用秒传，直接上传全部内容
        const optimalChunkSize = this.chunkStrategy.getOptimalChunkSize(file.size);
        const chunks = await platform.createChunks(file, optimalChunkSize);

        // 创建分片迭代器
        const chunkIterator = new ChunkIterator(chunks, {
          lazyLoad: this.options.lazyLoadChunks
        });

        // 上传分片
        this.updateTaskStatus(taskId, 'uploading');
        await this.uploadChunks(chunkIterator, new Set(), fileHash, platform, taskId);

        // 检查上传状态
        const currentTask = this.tasks.get(taskId);
        if (!currentTask) {
          throw new Error('任务已被移除');
        }

        if (currentTask.status === 'canceled') {
          throw new Error('上传已取消');
        }

        if (currentTask.status === 'error') {
          throw new Error(currentTask.error?.message || '上传失败');
        }

        // 发送合并请求
        const mergeResult = await this.mergeChunks(fileHash, chunks.length, file.name, platform);

        // 更新任务状态
        this.currentFileUrl = mergeResult.url;
        this.updateTaskStatus(taskId, 'completed', 100, {
          url: mergeResult.url,
          hash: fileHash
        });

        return mergeResult.url;
      }
    } catch (error: any) {
      // 处理上传过程中的错误
      this.handleError(error);
      throw error;
    }
  }

  /**
   * 上传文件分片
   */
  private async uploadChunks(
    chunkIterator: ChunkIterator,
    uploadedChunks: Set<number>,
    fileHash: string,
    platform: PlatformAdapter,
    taskId: string
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // 计算总分片数和已完成分片数
      const totalChunks = chunkIterator.getTotalChunks();
      let completedChunks = uploadedChunks.size;

      // 更新初始进度
      const initialProgress = Math.floor((completedChunks / totalChunks) * 100);
      if (initialProgress > 0) {
        this.updateTaskProgress(taskId, initialProgress);
      }

      // 处理下一批分片的函数
      const processNextChunks = async () => {
        // 如果上传被暂停，暂停处理
        if (this.isPaused) return;

        // 获取当前任务
        const currentTask = this.tasks.get(taskId);
        if (!currentTask || currentTask.status === 'canceled' || currentTask.status === 'error') {
          return reject(new Error(currentTask?.error?.message || '上传已停止'));
        }

        // 获取当前活跃的上传数量
        let activeUploads = 0;

        // 不断获取新的分片，直到达到并发限制或没有更多分片
        while (chunkIterator.hasNext() && activeUploads < this.concurrencyManager.concurrency) {
          const chunk = chunkIterator.next();

          if (!chunk) break;

          // 跳过已上传的分片
          if (uploadedChunks.has(chunk.index)) continue;

          activeUploads++;

          // 创建中止控制器
          const abortController = new AbortController();
          const chunkKey = `${taskId}_${chunk.index}`;
          this.abortControllers.set(chunkKey, abortController);

          // 使用并发管理器控制上传
          this.concurrencyManager.execute(async () => {
            try {
              // 记录开始时间用于网速估算
              const startTime = Date.now();

              // 上传分片
              await this.uploadChunk(
                chunk,
                fileHash,
                totalChunks,
                platform,
                abortController.signal,
                taskId
              );

              // 计算上传速度并更新分片策略
              const endTime = Date.now();
              const duration = (endTime - startTime) / 1000; // 秒
              const speed = chunk.size / duration; // 字节/秒

              // 更新分片策略的网络速度
              this.chunkStrategy.updateNetworkSpeed(speed);

              // 标记分片已完成
              uploadedChunks.add(chunk.index);
              completedChunks++;

              // 触发分片完成事件
              if (this.options.onChunkComplete) {
                this.options.onChunkComplete(chunk.index);
              }

              this.emit('transport:chunkSuccess', {
                taskId,
                chunkIndex: chunk.index,
                speed,
                remainingChunks: totalChunks - completedChunks
              });

              // 更新进度
              const progress = Math.floor((completedChunks / totalChunks) * 100);
              this.updateTaskProgress(taskId, progress);

              // 清除中止控制器引用
              this.abortControllers.delete(chunkKey);

              // 处理下一批分片
              processNextChunks();

              // 检查是否全部完成
              if (completedChunks === totalChunks) {
                resolve();
              }
            } catch (error: any) {
              // 如果是因暂停而中止，不算错误
              if (this.isPaused && error.name === 'AbortError') return;

              // 触发分片错误事件
              if (this.options.onChunkError) {
                this.options.onChunkError(chunk.index, error);
              }

              this.emit('transport:chunkError', {
                taskId,
                chunkIndex: chunk.index,
                error: error.message,
                retryable: this.isRetryableError(error)
              });

              // 尝试重试上传分片
              if (this.options.autoRetry && this.isRetryableError(error)) {
                const retryCount = this.retryCountMap.get(chunk.index) || 0;

                if (retryCount < this.options.maxRetries!) {
                  // 增加重试计数
                  this.retryCountMap.set(chunk.index, retryCount + 1);

                  // 计算退避延迟
                  const delay = this.calculateRetryDelay(retryCount);

                  this.emit('transport:chunkRetry', {
                    taskId,
                    chunkIndex: chunk.index,
                    retryCount: retryCount + 1,
                    delay
                  });

                  // 等待后重试
                  await new Promise(r => setTimeout(r, delay));

                  // 重新创建中止控制器
                  const newController = new AbortController();
                  this.abortControllers.set(chunkKey, newController);

                  try {
                    // 重试上传分片
                    await this.uploadChunk(
                      chunk,
                      fileHash,
                      totalChunks,
                      platform,
                      newController.signal,
                      taskId
                    );

                    // 标记分片已完成
                    uploadedChunks.add(chunk.index);
                    completedChunks++;

                    // 触发分片完成事件
                    if (this.options.onChunkComplete) {
                      this.options.onChunkComplete(chunk.index);
                    }

                    // 更新进度
                    const progress = Math.floor((completedChunks / totalChunks) * 100);
                    this.updateTaskProgress(taskId, progress);

                    // 清除中止控制器引用
                    this.abortControllers.delete(chunkKey);

                    // 处理下一批分片
                    processNextChunks();

                    // 检查是否全部完成
                    if (completedChunks === totalChunks) {
                      resolve();
                    }
                  } catch (retryError: any) {
                    // 如果重试仍然失败，继续处理下一批
                    this.abortControllers.delete(chunkKey);
                    processNextChunks();
                  }
                } else {
                  // 超过最大重试次数，更新任务状态
                  this.updateTaskStatus(taskId, 'error', undefined, undefined, {
                    message: `分片${chunk.index}上传失败，已重试${retryCount}次：${error.message}`,
                    code: 'CHUNK_UPLOAD_FAILED'
                  });

                  reject(new Error(`分片${chunk.index}上传失败，已达到最大重试次数`));
                }
              } else {
                // 非可重试错误或不自动重试，更新任务状态
                this.updateTaskStatus(taskId, 'error', undefined, undefined, {
                  message: `分片${chunk.index}上传失败：${error.message}`,
                  code: 'CHUNK_UPLOAD_FAILED'
                });

                reject(error);
              }
            }
          });
        }
      };

      // 开始处理分片
      processNextChunks();
    });
  }

  /**
   * 上传单个分片
   */
  private async uploadChunk(
    chunk: FileChunk,
    hash: string,
    totalChunks: number,
    platform: PlatformAdapter,
    signal: AbortSignal,
    taskId: string
  ): Promise<any> {
    // 构建表单数据
    const formData = new FormData();
    formData.append('chunk', chunk.data);
    formData.append('hash', hash);
    formData.append('index', chunk.index.toString());
    formData.append('total', totalChunks.toString());

    // 生成上传URL
    let uploadUrl = this.options.target;
    if (this.options.generateUploadUrl) {
      uploadUrl = await Promise.resolve(
        this.options.generateUploadUrl(
          this.tasks.get(taskId)?.file as File,
          chunk.index,
          totalChunks
        )
      );
    }

    // 准备请求配置
    let requestConfig: any = {
      url: uploadUrl,
      method: 'POST',
      data: formData,
      headers: this.options.headers || {},
      timeout: this.options.timeout,
      signal
    };

    // 应用请求拦截器
    if (this.options.requestInterceptor) {
      requestConfig = await this.options.requestInterceptor(requestConfig);
    }

    // 使用平台适配器执行请求
    let response = await platform.request(
      requestConfig.url,
      requestConfig.method,
      requestConfig.data,
      {
        headers: requestConfig.headers,
        timeout: requestConfig.timeout,
        signal: requestConfig.signal
      }
    );

    // 应用响应拦截器
    if (this.options.responseInterceptor) {
      response = await this.options.responseInterceptor(response);
    }

    return response;
  }

  /**
   * 检查文件是否已存在
   */
  private async checkFileExists(
    hash: string,
    file: File,
    platform: PlatformAdapter
  ): Promise<{ exists: boolean; url?: string; uploadedChunks?: number[] }> {
    try {
      // 准备请求数据
      const requestData = {
        hash,
        size: file.size,
        name: file.name,
        type: file.type
      };

      // 构建请求配置
      let requestConfig: any = {
        url: this.options.checkUrl as string,
        method: 'POST',
        data: requestData,
        headers: {
          'Content-Type': 'application/json',
          ...this.options.headers
        }
      };

      // 应用请求拦截器
      if (this.options.requestInterceptor) {
        requestConfig = await this.options.requestInterceptor(requestConfig);
      }

      // 发送请求
      let response = await platform.request(
        requestConfig.url,
        requestConfig.method,
        requestConfig.data,
        { headers: requestConfig.headers }
      );

      // 应用响应拦截器
      if (this.options.responseInterceptor) {
        response = await this.options.responseInterceptor(response);
      }

      // 默认返回结构
      const defaultResult = { exists: false, uploadedChunks: [] };

      // 如果没有响应数据，返回默认结果
      if (!response || typeof response !== 'object') {
        return defaultResult;
      }

      // 处理响应结果
      if (response.exists && response.url) {
        this.currentFileUrl = response.url;
        return { exists: true, url: response.url };
      }

      // 返回已上传的分片信息
      return {
        exists: false,
        uploadedChunks: Array.isArray(response.uploadedChunks) ? response.uploadedChunks : []
      };
    } catch (error) {
      // 检查失败时不中断，仅记录日志
      console.warn('秒传检查失败:', error);
      return { exists: false, uploadedChunks: [] };
    }
  }

  /**
   * 合并请求处理
   */
  private async mergeChunks(
    hash: string,
    totalChunks: number,
    fileName: string,
    platform: PlatformAdapter
  ): Promise<{ url: string }> {
    // 准备请求数据
    const requestData = {
      hash,
      totalChunks,
      fileName
    };

    // 构建请求配置
    let requestConfig: any = {
      url: this.options.mergeUrl as string,
      method: 'POST',
      data: requestData,
      headers: {
        'Content-Type': 'application/json',
        ...this.options.headers
      }
    };

    // 应用请求拦截器
    if (this.options.requestInterceptor) {
      requestConfig = await this.options.requestInterceptor(requestConfig);
    }

    // 发送请求
    let response = await platform.request(
      requestConfig.url,
      requestConfig.method,
      requestConfig.data,
      { headers: requestConfig.headers }
    );

    // 应用响应拦截器
    if (this.options.responseInterceptor) {
      response = await this.options.responseInterceptor(response);
    }

    // 检查响应
    if (!response || !response.url) {
      throw new Error('合并请求失败: 服务器响应不包含URL');
    }

    // 触发合并成功事件
    this.emit('transport:mergeSuccess', {
      hash,
      url: response.url,
      fileName
    });

    return { url: response.url };
  }

  /**
   * 生成唯一的任务ID
   */
  private generateTaskId(_file: File): string {
    return `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 更新任务状态
   */
  private updateTaskStatus(
    taskId: string,
    status: UploadStatus,
    progress?: number,
    result?: any,
    error?: { message: string; code: string }
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = status;

    if (progress !== undefined) {
      task.progress = progress;
    }

    if (result !== undefined) {
      task.result = result;
    }

    if (error !== undefined) {
      task.error = error;
    }

    // 如果状态是最终状态，记录结束时间
    if (status === 'completed' || status === 'error' || status === 'canceled') {
      task.endTime = Date.now();
    }

    // 触发状态变更事件
    this.emit('transport:statusChanged', {
      taskId,
      status,
      progress: task.progress,
      result: task.result,
      error: task.error
    });

    // 触发特定状态事件
    if (status === 'completed') {
      this.emit('transport:success', { taskId, result: task.result });
    } else if (status === 'error') {
      this.emit('transport:error', { taskId, error: task.error });
    } else if (status === 'canceled') {
      this.emit('transport:canceled', { taskId });
    }
  }

  /**
   * 更新任务进度
   */
  private updateTaskProgress(taskId: string, progress: number): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.progress = progress;

    // 触发进度事件
    this.emit('transport:progress', { taskId, progress });
  }

  /**
   * 处理错误
   */
  private handleError(error: any): void {
    console.error('HTTP传输模块错误:', error);
    this.emit('transport:error', {
      message: error.message || '上传失败',
      code: error.code || 'UPLOAD_ERROR',
      original: error
    });
  }

  /**
   * 检查错误是否可重试
   */
  private isRetryableError(error: any): boolean {
    // 网络错误通常可以重试
    if (
      error.name === 'NetworkError' ||
      error.message?.includes('network') ||
      error.message?.includes('internet') ||
      error.message?.includes('connection') ||
      error.message?.includes('timeout') ||
      error.message?.includes('abort') ||
      error.name === 'AbortError' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT'
    ) {
      return true;
    }

    // 服务器错误通常可以重试
    if (error.status >= 500 || error.statusCode >= 500) {
      return true;
    }

    // 特定的客户端错误可以重试
    if (error.status === 429 || error.statusCode === 429) {
      // Too Many Requests
      return true;
    }

    return false;
  }

  /**
   * 计算重试延迟
   * 使用指数退避策略，每次重试延迟增加
   */
  private calculateRetryDelay(retryCount: number): number {
    const baseDelay = this.options.retryDelay || 1000;
    const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15之间的随机数，添加一点随机性

    // 指数退避: 基础延迟 * (2^重试次数) * 随机因子
    return Math.min(
      baseDelay * Math.pow(2, retryCount) * jitter,
      30000 // 最大延迟30秒
    );
  }

  /**
   * 暂停上传
   */
  pause(): void {
    this.isPaused = true;

    // 中止所有活跃的请求
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }

    // 更新所有uploading状态的任务为paused
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === 'uploading') {
        this.updateTaskStatus(taskId, 'paused');
      }
    }

    // 触发暂停事件
    this.emit('transport:paused', {
      timestamp: Date.now(),
      tasks: Array.from(this.tasks.values()).map(task => ({
        id: task.id,
        status: task.status,
        progress: task.progress
      }))
    });
  }

  /**
   * 恢复上传
   */
  resume(): void {
    this.isPaused = false;

    // 恢复所有暂停的任务
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === 'paused') {
        // 重新开始上传过程
        this.updateTaskStatus(taskId, 'uploading');

        // 实际恢复需要在start方法中重新处理
        this.emit('transport:resumed', { taskId });

        // 这里无法自动继续上传，用户需要重新调用uploadFile
      }
    }
  }

  /**
   * 取消上传
   */
  cancel(): void {
    // 中止所有活跃的请求
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }

    // 更新所有非最终状态的任务为canceled
    for (const [taskId, task] of this.tasks.entries()) {
      if (['uploading', 'preparing', 'paused'].includes(task.status)) {
        this.updateTaskStatus(taskId, 'canceled');
      }
    }

    // 清空中止控制器集合
    this.abortControllers.clear();

    // 触发取消事件
    this.emit('transport:cancelAll', {
      timestamp: Date.now(),
      taskCount: this.tasks.size
    });
  }

  /**
   * 取消指定的上传任务
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // 如果任务已经处于最终状态，不能取消
    if (['completed', 'error', 'canceled'].includes(task.status)) {
      return false;
    }

    // 中止任务相关的所有请求
    for (const [key, controller] of this.abortControllers.entries()) {
      if (key.startsWith(`${taskId}_`)) {
        controller.abort();
        this.abortControllers.delete(key);
      }
    }

    // 更新任务状态
    this.updateTaskStatus(taskId, 'canceled');

    // 触发任务取消事件
    this.emit('transport:taskCanceled', { taskId });

    return true;
  }

  /**
   * 获取文件URL
   */
  getFileUrl(): string | null {
    return this.currentFileUrl;
  }

  /**
   * 获取上传任务信息
   */
  getTask(taskId: string): UploadTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有上传任务
   */
  getAllTasks(): UploadTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取当前的分片策略
   */
  getChunkStrategy(): ChunkStrategy {
    return this.chunkStrategy;
  }

  /**
   * 获取并发管理器统计信息
   */
  getConcurrencyStats(): any {
    return this.concurrencyManager.getStats();
  }

  /**
   * 模块销毁时清理资源
   */
  protected async onDestroy(): Promise<void> {
    // 取消所有上传
    this.cancel();

    // 停止并发管理器的自适应调整
    this.concurrencyManager.destroy();

    // 清空任务列表
    this.tasks.clear();

    return Promise.resolve();
  }
}
