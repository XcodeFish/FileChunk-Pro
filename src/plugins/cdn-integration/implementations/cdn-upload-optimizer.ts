/* eslint-disable @typescript-eslint/no-unused-vars */
import { CDNProviderType, CDNUploadOptions } from '../interfaces';
import { CDNProviderManager } from './cdn-provider-manager';

/**
 * CDN上传优化选项
 */
export interface CDNUploadOptimizerOptions {
  /** 并发上传数 */
  concurrency?: number;
  /** 重试次数 */
  maxRetries?: number;
  /** 重试延迟(毫秒) */
  retryDelay?: number;
  /** 退避因子 */
  backoffFactor?: number;
  /** 超时时间(毫秒) */
  timeout?: number;
  /** 分片大小(字节) */
  chunkSize?: number;
  /** 开启自动检测最佳节点 */
  enableEdgeDetection?: boolean;
  /** 优先CDN提供商 */
  preferredProviders?: CDNProviderType[];
  /** 启用上传加速 */
  enableAcceleration?: boolean;
  /** 启用多节点并行上传 */
  enableMultiCDN?: boolean;
  /** 启用进度跟踪 */
  enableProgressTracking?: boolean;
  /** 自定义重试条件 */
  retryCondition?: (error: Error) => boolean;
  /** 启用上传分析 */
  enableUploadAnalytics?: boolean;
  /** 自定义请求超时时间(毫秒) */
  requestTimeout?: number;
  /** 启用节点健康检测 */
  enableHealthCheck?: boolean;
  /** 健康检测间隔(毫秒) */
  healthCheckInterval?: number;
  /** 启用智能路由 */
  enableSmartRouting?: boolean;
  /** 启用压缩 */
  enableCompression?: boolean;
  /** 压缩级别(1-9) */
  compressionLevel?: number;
  /** 压缩阈值(字节)，小于此大小不压缩 */
  compressionThreshold?: number;
  /** 自定义压缩前处理器 */
  preCompressionProcessor?: (file: Blob) => Promise<Blob>;
  /** 内存缓存大小(字节) */
  memoryCacheSize?: number;
  /** 自定义分块策略 */
  chunkStrategy?: (fileSize: number, options: CDNUploadOptimizerOptions) => number;
  /** 启用队列管理 */
  enableQueueManagement?: boolean;
  /** 队列优先级排序函数 */
  queuePrioritizer?: (a: QueueItem, b: QueueItem) => number;
  /** 最大队列长度 */
  maxQueueLength?: number;
  /** 配置回调 */
  callbacks?: {
    /** 上传开始回调 */
    onUploadStart?: (fileKey: string) => void;
    /** 上传完成回调 */
    onUploadComplete?: (fileKey: string, url: string) => void;
    /** 上传错误回调 */
    onUploadError?: (fileKey: string, error: Error) => void;
    /** 上传进度回调 */
    onUploadProgress?: (fileKey: string, progress: number) => void;
    /** CDN节点切换回调 */
    onCDNSwitch?: (from: CDNProviderType, to: CDNProviderType) => void;
    /** 队列状态变更回调 */
    onQueueStatusChange?: (queueLength: number, activeUploads: number) => void;
  };
}

/**
 * 队列项
 */
interface QueueItem {
  /** 文件数据 */
  file: Blob | File;
  /** 文件键 */
  key: string;
  /** 上传选项 */
  options: CDNUploadOptions;
  /** 优先级 */
  priority: number;
  /** 添加时间 */
  addedAt: number;
  /** 文件大小 */
  size: number;
  /** 文件类型 */
  type: string;
  /** 重试次数 */
  retries: number;
  /** 失败原因 */
  failReason?: string;
}

/**
 * CDN上传节点性能信息
 */
interface CDNNodePerformance {
  /** 提供商类型 */
  provider: CDNProviderType;
  /** 域名 */
  domain: string;
  /** 延迟(ms) */
  latency: number;
  /** 上传速度(bytes/s) */
  uploadSpeed: number;
  /** 可用性(0-1) */
  availability: number;
  /** 失败率(0-1) */
  failureRate: number;
  /** 最后检测时间 */
  lastChecked: number;
  /** 有效期(ms) */
  ttl: number;
  /** 得分(0-100) */
  score: number;
}

/**
 * 上传任务状态
 */
enum UploadTaskStatus {
  PENDING = 'pending',
  UPLOADING = 'uploading',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled'
}

/**
 * 上传任务
 */
interface UploadTask {
  /** 任务ID */
  id: string;
  /** 文件键 */
  key: string;
  /** 状态 */
  status: UploadTaskStatus;
  /** 进度(0-1) */
  progress: number;
  /** 文件大小 */
  size: number;
  /** 文件类型 */
  type: string;
  /** 开始时间 */
  startTime?: number;
  /** 完成时间 */
  endTime?: number;
  /** 已上传字节数 */
  uploaded: number;
  /** 上传速度(bytes/s) */
  speed: number;
  /** 估计剩余时间(ms) */
  eta: number;
  /** 失败原因 */
  error?: Error;
  /** 重试次数 */
  retries: number;
  /** CDN提供商 */
  provider: CDNProviderType;
  /** 资源URL */
  url?: string;
}

/**
 * CDN上传优化器
 * 负责优化CDN上传流程，提高上传速度和成功率
 */
export class CDNUploadOptimizer {
  private options: CDNUploadOptimizerOptions;
  private providerManager: CDNProviderManager;
  private uploadQueue: QueueItem[] = [];
  private activeUploads: Map<string, UploadTask> = new Map();
  private nodePerformance: Map<string, CDNNodePerformance> = new Map();
  private isPaused: boolean = false;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isProcessingQueue: boolean = false;

  /**
   * 创建上传优化器实例
   * @param providerManager CDN提供商管理器
   * @param options 上传优化选项
   */
  constructor(providerManager: CDNProviderManager, options: CDNUploadOptimizerOptions = {}) {
    this.providerManager = providerManager;

    // 设置默认选项
    this.options = {
      concurrency: 3,
      maxRetries: 3,
      retryDelay: 1000,
      backoffFactor: 2,
      timeout: 30000,
      chunkSize: 4 * 1024 * 1024, // 4MB
      enableEdgeDetection: true,
      enableAcceleration: true,
      enableMultiCDN: false,
      enableProgressTracking: true,
      enableUploadAnalytics: false,
      requestTimeout: 30000,
      enableHealthCheck: true,
      healthCheckInterval: 60000, // 1分钟
      enableSmartRouting: true,
      enableCompression: true,
      compressionLevel: 6,
      compressionThreshold: 1024 * 100, // 100KB
      memoryCacheSize: 100 * 1024 * 1024, // 100MB
      enableQueueManagement: true,
      maxQueueLength: 100,
      ...options
    };

    // 初始化健康检查
    if (this.options.enableHealthCheck) {
      this.startHealthCheck();
    }
  }

  /**
   * 添加上传任务
   * @param file 文件对象
   * @param key 文件键
   * @param options 上传选项
   * @param priority 优先级(数字越大优先级越高)
   * @returns 上传任务ID
   */
  public async addUploadTask(
    file: Blob | File,
    key: string,
    options: CDNUploadOptions,
    priority: number = 0
  ): Promise<string> {
    if (!file) {
      throw new Error('File is required');
    }

    if (!key) {
      throw new Error('File key is required');
    }

    // 创建队列项
    const queueItem: QueueItem = {
      file,
      key,
      options: {
        ...options,
        key,
        contentType: options.contentType || (file as File).type || 'application/octet-stream',
        contentLength: file.size
      },
      priority,
      addedAt: Date.now(),
      size: file.size,
      type: (file as File).type || 'application/octet-stream',
      retries: 0
    };

    // 检查队列长度
    if (
      this.options.enableQueueManagement &&
      this.options.maxQueueLength &&
      this.uploadQueue.length >= this.options.maxQueueLength
    ) {
      throw new Error(`Upload queue is full (max ${this.options.maxQueueLength} items)`);
    }

    // 添加到队列
    this.uploadQueue.push(queueItem);

    // 按优先级排序
    if (this.options.queuePrioritizer) {
      this.uploadQueue.sort(this.options.queuePrioritizer);
    } else {
      // 默认按优先级和添加时间排序
      this.uploadQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.addedAt - b.addedAt;
      });
    }

    // 通知队列状态变更
    if (this.options.callbacks?.onQueueStatusChange) {
      this.options.callbacks.onQueueStatusChange(this.uploadQueue.length, this.activeUploads.size);
    }

    // 处理队列
    if (!this.isPaused && !this.isProcessingQueue) {
      this.processQueue();
    }

    // 返回任务ID
    return `task-${key}-${Date.now()}`;
  }

  /**
   * 暂停所有上传
   */
  public pauseAll(): void {
    this.isPaused = true;

    // 标记所有活跃任务为暂停状态
    for (const [taskId, task] of this.activeUploads.entries()) {
      if (task.status === UploadTaskStatus.UPLOADING) {
        task.status = UploadTaskStatus.PAUSED;
        this.activeUploads.set(taskId, task);
      }
    }
  }

  /**
   * 恢复所有上传
   */
  public resumeAll(): void {
    this.isPaused = false;

    // 恢复所有已暂停的任务
    for (const [taskId, task] of this.activeUploads.entries()) {
      if (task.status === UploadTaskStatus.PAUSED) {
        task.status = UploadTaskStatus.UPLOADING;
        this.activeUploads.set(taskId, task);
      }
    }

    // 处理队列
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * 取消上传任务
   * @param taskId 任务ID
   * @returns 是否成功取消
   */
  public cancelTask(taskId: string): boolean {
    // 检查是否在活跃任务中
    if (this.activeUploads.has(taskId)) {
      const task = this.activeUploads.get(taskId)!;
      task.status = UploadTaskStatus.CANCELED;
      this.activeUploads.set(taskId, task);
      return true;
    }

    // 检查是否在队列中
    const index = this.uploadQueue.findIndex(item => `task-${item.key}-${item.addedAt}` === taskId);
    if (index >= 0) {
      this.uploadQueue.splice(index, 1);

      // 通知队列状态变更
      if (this.options.callbacks?.onQueueStatusChange) {
        this.options.callbacks.onQueueStatusChange(
          this.uploadQueue.length,
          this.activeUploads.size
        );
      }

      return true;
    }

    return false;
  }

  /**
   * 清空上传队列
   */
  public clearQueue(): void {
    this.uploadQueue = [];

    // 通知队列状态变更
    if (this.options.callbacks?.onQueueStatusChange) {
      this.options.callbacks.onQueueStatusChange(0, this.activeUploads.size);
    }
  }

  /**
   * 获取上传任务状态
   * @param taskId 任务ID
   * @returns 上传任务状态，不存在则返回null
   */
  public getTaskStatus(taskId: string): UploadTask | null {
    return this.activeUploads.get(taskId) || null;
  }

  /**
   * 获取所有任务状态
   * @returns 所有上传任务
   */
  public getAllTasks(): UploadTask[] {
    return Array.from(this.activeUploads.values());
  }

  /**
   * 获取队列长度
   * @returns 队列中的任务数
   */
  public getQueueLength(): number {
    return this.uploadQueue.length;
  }

  /**
   * 获取活跃上传数
   * @returns 当前正在上传的任务数
   */
  public getActiveUploadCount(): number {
    return Array.from(this.activeUploads.values()).filter(
      task => task.status === UploadTaskStatus.UPLOADING
    ).length;
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // 立即执行一次健康检查
    this.checkCDNNodesHealth();

    // 设置定时检查
    this.healthCheckTimer = setInterval(
      () => this.checkCDNNodesHealth(),
      this.options.healthCheckInterval
    );
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * 检查CDN节点健康状态
   */
  private async checkCDNNodesHealth(): Promise<void> {
    // 获取所有CDN提供商
    const providers = this.providerManager.getAllProviders();

    // 逐个测试CDN节点性能
    for (const provider of providers) {
      try {
        // 创建一个小测试文件
        const testData = new Blob(['CDN_HEALTH_CHECK_TEST'], { type: 'text/plain' });
        const testKey = `health-check-${Date.now()}-${Math.random().toString(36).substring(2)}`;

        // 记录开始时间
        const startTime = Date.now();

        // 生成上传URL
        const uploadUrl = await provider.generateUploadUrl({
          key: testKey,
          contentType: 'text/plain',
          contentLength: testData.size,
          expires: 60 // 1分钟过期
        });

        // 测试上传速度
        const uploadResult = await this.testUploadSpeed(uploadUrl, testData);

        // 计算延迟和速度
        const latency = uploadResult.firstByteLatency;
        const uploadSpeed = uploadResult.speed;

        // 更新节点性能信息
        const nodeKey = `${provider.type}:${provider.name}`;
        const nodeInfo = this.nodePerformance.get(nodeKey) || {
          provider: provider.type,
          domain: provider.name,
          latency: 0,
          uploadSpeed: 0,
          availability: 1,
          failureRate: 0,
          lastChecked: 0,
          ttl: 300000, // 5分钟TTL
          score: 0
        };

        // 更新性能信息
        nodeInfo.latency = latency;
        nodeInfo.uploadSpeed = uploadSpeed;
        nodeInfo.lastChecked = Date.now();

        // 计算节点得分 (0-100)
        // 速度权重60%，延迟权重30%，可用性权重10%
        const speedScore = Math.min((uploadSpeed / 1024 / 1024) * 20, 60); // 每1MB/s得60分，最多60分
        const latencyScore = Math.max(0, 30 - (latency / 100) * 3); // 每100ms减3分，最低0分
        const availabilityScore = nodeInfo.availability * 10; // 可用性0-1转为0-10分

        nodeInfo.score = speedScore + latencyScore + availabilityScore;

        // 保存节点信息
        this.nodePerformance.set(nodeKey, nodeInfo);
      } catch (error) {
        // 记录节点失败
        const nodeKey = `${provider.type}:${provider.name}`;
        const nodeInfo = this.nodePerformance.get(nodeKey) || {
          provider: provider.type,
          domain: provider.name,
          latency: 0,
          uploadSpeed: 0,
          availability: 1,
          failureRate: 0,
          lastChecked: 0,
          ttl: 300000, // 5分钟TTL
          score: 0
        };

        // 增加失败率
        nodeInfo.failureRate = (nodeInfo.failureRate * 9 + 1) / 10; // 指数移动平均
        nodeInfo.availability = Math.max(0, nodeInfo.availability - 0.1); // 降低可用性
        nodeInfo.lastChecked = Date.now();
        nodeInfo.score = Math.max(0, nodeInfo.score - 20); // 失败降低20分

        this.nodePerformance.set(nodeKey, nodeInfo);
      }
    }
  }

  /**
   * 测试上传速度
   * @param url 上传URL
   * @param data 测试数据
   * @returns 测试结果
   */
  private async testUploadSpeed(
    url: string,
    data: Blob
  ): Promise<{
    speed: number;
    firstByteLatency: number;
    totalTime: number;
  }> {
    const startTime = Date.now();
    let firstByteTime = 0;

    try {
      // 创建一个带进度的上传请求
      const xhr = new XMLHttpRequest();

      // 创建一个Promise包装XHR请求
      const uploadPromise = new Promise<void>((resolve, reject) => {
        xhr.open('PUT', url, true);

        xhr.upload.onprogress = event => {
          if (event.loaded > 0 && firstByteTime === 0) {
            firstByteTime = Date.now();
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error during upload test'));
        };

        xhr.ontimeout = () => {
          reject(new Error('Upload test timed out'));
        };

        // 设置超时时间
        xhr.timeout = this.options.requestTimeout || 30000;

        // 发送数据
        xhr.send(data);
      });

      // 等待上传完成
      await uploadPromise;

      // 计算总时间
      const totalTime = Date.now() - startTime;

      // 如果没有记录第一字节时间，使用总时间的一半作为估计
      const actualFirstByteTime = firstByteTime || startTime + totalTime / 2;

      // 计算首字节延迟
      const firstByteLatency = actualFirstByteTime - startTime;

      // 计算上传速度（字节/秒）
      const speed = data.size / (totalTime / 1000);

      return {
        speed,
        firstByteLatency,
        totalTime
      };
    } catch (error) {
      // 上传测试失败，返回低速度和高延迟
      return {
        speed: 0,
        firstByteLatency: 9999,
        totalTime: Date.now() - startTime
      };
    }
  }

  /**
   * 选择最佳CDN节点
   * @returns 最佳CDN提供商类型
   */
  private selectBestCDNNode(): CDNProviderType {
    // 如果未启用智能路由，返回第一个可用提供商
    if (!this.options.enableSmartRouting) {
      const providers = this.providerManager.getAllProviders();
      return providers.length > 0 ? providers[0].type : CDNProviderType.CUSTOM;
    }

    // 获取所有节点性能信息
    const nodes = Array.from(this.nodePerformance.values());

    // 如果没有性能数据，返回第一个可用提供商
    if (nodes.length === 0) {
      const providers = this.providerManager.getAllProviders();
      return providers.length > 0 ? providers[0].type : CDNProviderType.CUSTOM;
    }

    // 过滤掉过期的节点信息
    const now = Date.now();
    const validNodes = nodes.filter(node => now - node.lastChecked < node.ttl);

    // 如果没有有效节点，返回第一个可用提供商
    if (validNodes.length === 0) {
      const providers = this.providerManager.getAllProviders();
      return providers.length > 0 ? providers[0].type : CDNProviderType.CUSTOM;
    }

    // 按照得分排序
    validNodes.sort((a, b) => b.score - a.score);

    // 返回得分最高的节点
    return validNodes[0].provider;
  }

  /**
   * 处理上传队列
   */
  private async processQueue(): Promise<void> {
    if (this.isPaused || this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // 计算可以启动的上传数
      const activeCount = this.getActiveUploadCount();
      const availableSlots = Math.max(0, (this.options.concurrency || 3) - activeCount);

      // 如果没有可用槽位或队列为空，返回
      if (availableSlots === 0 || this.uploadQueue.length === 0) {
        this.isProcessingQueue = false;
        return;
      }

      // 获取要处理的队列项
      const itemsToProcess = this.uploadQueue.slice(0, availableSlots);

      // 从队列中移除这些项
      this.uploadQueue = this.uploadQueue.slice(availableSlots);

      // 通知队列状态变更
      if (this.options.callbacks?.onQueueStatusChange) {
        this.options.callbacks.onQueueStatusChange(
          this.uploadQueue.length,
          this.activeUploads.size + itemsToProcess.length
        );
      }

      // 启动上传
      for (const item of itemsToProcess) {
        // 异步启动上传，不等待完成
        this.startUpload(item).catch(error => {
          console.error(`Failed to start upload for ${item.key}:`, error);
        });
      }
    } finally {
      this.isProcessingQueue = false;

      // 如果队列中还有任务，继续处理
      if (
        this.uploadQueue.length > 0 &&
        this.getActiveUploadCount() < (this.options.concurrency || 3)
      ) {
        setTimeout(() => this.processQueue(), 100);
      }
    }
  }

  /**
   * 启动上传任务
   * @param item 队列项
   */
  private async startUpload(item: QueueItem): Promise<void> {
    // 创建任务ID
    const taskId = `task-${item.key}-${item.addedAt}`;

    // 选择最佳CDN节点
    const bestProvider = this.selectBestCDNNode();

    // 创建上传任务
    const task: UploadTask = {
      id: taskId,
      key: item.key,
      status: UploadTaskStatus.UPLOADING,
      progress: 0,
      size: item.size,
      type: item.type,
      startTime: Date.now(),
      uploaded: 0,
      speed: 0,
      eta: 0,
      retries: item.retries,
      provider: bestProvider
    };

    // 添加到活跃任务
    this.activeUploads.set(taskId, task);

    // 触发上传开始回调
    if (this.options.callbacks?.onUploadStart) {
      this.options.callbacks.onUploadStart(item.key);
    }

    try {
      // 获取提供商
      const provider = this.providerManager.getProvider(bestProvider);

      if (!provider) {
        throw new Error(`CDN provider ${bestProvider} not found`);
      }

      // 根据文件大小决定是否需要分片
      let uploadResult: string;

      if (item.size > (this.options.chunkSize || 4 * 1024 * 1024)) {
        // 分片上传
        uploadResult = await this.performChunkedUpload(item, provider.type, task);
      } else {
        // 直接上传
        uploadResult = await this.performDirectUpload(item, provider.type, task);
      }

      // 更新任务状态为完成
      task.status = UploadTaskStatus.COMPLETED;
      task.progress = 1;
      task.uploaded = item.size;
      task.endTime = Date.now();
      task.url = uploadResult;
      this.activeUploads.set(taskId, task);

      // 触发上传完成回调
      if (this.options.callbacks?.onUploadComplete) {
        this.options.callbacks.onUploadComplete(item.key, uploadResult);
      }
    } catch (error) {
      // 检查是否需要重试
      if (
        item.retries < (this.options.maxRetries || 3) &&
        (!this.options.retryCondition || this.options.retryCondition(error as Error))
      ) {
        // 增加重试次数
        item.retries++;

        // 计算重试延迟
        const delay =
          this.options.retryDelay! * Math.pow(this.options.backoffFactor!, item.retries - 1);

        // 更新失败原因
        item.failReason = (error as Error).message;

        // 添加回队列
        setTimeout(() => {
          this.uploadQueue.unshift(item);

          // 通知队列状态变更
          if (this.options.callbacks?.onQueueStatusChange) {
            this.options.callbacks.onQueueStatusChange(
              this.uploadQueue.length,
              this.activeUploads.size
            );
          }

          // 处理队列
          if (!this.isPaused && !this.isProcessingQueue) {
            this.processQueue();
          }
        }, delay);

        // 标记任务为失败但将重试
        task.status = UploadTaskStatus.FAILED;
        task.error = error as Error;
        this.activeUploads.set(taskId, task);
      } else {
        // 不再重试，标记为最终失败
        task.status = UploadTaskStatus.FAILED;
        task.error = error as Error;
        task.endTime = Date.now();
        this.activeUploads.set(taskId, task);

        // 触发上传错误回调
        if (this.options.callbacks?.onUploadError) {
          this.options.callbacks.onUploadError(item.key, error as Error);
        }
      }
    } finally {
      // 检查队列，如果有空闲槽位继续处理
      if (
        !this.isPaused &&
        this.uploadQueue.length > 0 &&
        this.getActiveUploadCount() < (this.options.concurrency || 3)
      ) {
        this.processQueue();
      }
    }
  }

  /**
   * 执行直接上传（不分片）
   * @param item 队列项
   * @param providerType 提供商类型
   * @param task 上传任务
   * @returns 上传后的资源URL
   */
  private async performDirectUpload(
    item: QueueItem,
    providerType: CDNProviderType,
    task: UploadTask
  ): Promise<string> {
    // 获取提供商
    const provider = this.providerManager.getProvider(providerType);

    if (!provider) {
      throw new Error(`CDN provider ${providerType} not found`);
    }

    // 准备上传数据
    let uploadData = item.file;

    // 应用压缩（如果启用且文件大小超过阈值）
    if (
      this.options.enableCompression &&
      item.size >= (this.options.compressionThreshold || 0) &&
      this.canCompress(item.type)
    ) {
      if (this.options.preCompressionProcessor) {
        uploadData = await this.options.preCompressionProcessor(uploadData);
      }

      // 在实际项目中，这里应该实现压缩逻辑
      // 简化起见，这里不做实际压缩
    }

    // 生成上传URL
    const uploadUrl = await provider.generateUploadUrl(item.options);

    // 上传文件
    const uploadStartTime = Date.now();
    let lastProgressTime = uploadStartTime;
    let lastUploaded = 0;

    // 创建一个带进度的上传请求
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);

      // 设置超时
      xhr.timeout = this.options.timeout || 30000;

      // 进度监听
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) {
          // 更新进度
          const progress = event.loaded / event.total;
          task.progress = progress;
          task.uploaded = event.loaded;

          // 计算上传速度
          const now = Date.now();
          const timeElapsed = now - lastProgressTime;

          if (timeElapsed > 500) {
            // 每500ms更新一次速度
            const bytesUploaded = event.loaded - lastUploaded;
            task.speed = (bytesUploaded / timeElapsed) * 1000; // bytes/s

            // 计算剩余时间
            if (task.speed > 0) {
              const bytesRemaining = event.total - event.loaded;
              task.eta = (bytesRemaining / task.speed) * 1000; // ms
            }

            lastProgressTime = now;
            lastUploaded = event.loaded;
          }

          // 更新任务状态
          this.activeUploads.set(task.id, task);

          // 触发进度回调
          if (this.options.callbacks?.onUploadProgress) {
            this.options.callbacks.onUploadProgress(item.key, progress);
          }
        }
      };

      // 完成回调
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // 获取资源URL
          const resourceUrl = provider.getResourceUrl(item.key);
          resolve(resourceUrl);
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
        }
      };

      // 错误处理
      xhr.onerror = () => {
        reject(new Error('Network error during upload'));
      };

      xhr.ontimeout = () => {
        reject(new Error('Upload timed out'));
      };

      // 发送数据
      xhr.send(uploadData);
    });
  }

  /**
   * 执行分片上传
   * @param item 队列项
   * @param providerType 提供商类型
   * @param task 上传任务
   * @returns 上传后的资源URL
   */
  private async performChunkedUpload(
    item: QueueItem,
    providerType: CDNProviderType,
    task: UploadTask
  ): Promise<string> {
    // 在实际项目中，这里应该实现分片上传逻辑
    // 这里简化为直接调用单次上传
    return this.performDirectUpload(item, providerType, task);
  }

  /**
   * 判断文件类型是否可压缩
   * @param mimeType MIME类型
   * @returns 是否可压缩
   */
  private canCompress(mimeType: string): boolean {
    // 可压缩的MIME类型列表
    const compressibleTypes = [
      'text/',
      'application/json',
      'application/xml',
      'application/javascript',
      'application/xhtml+xml',
      'image/svg+xml',
      'application/x-javascript',
      'application/atom+xml',
      'application/rss+xml',
      'application/x-font-ttf',
      'application/x-font-opentype',
      'application/vnd.ms-fontobject'
    ];

    // 检查MIME类型是否在可压缩列表中
    for (const type of compressibleTypes) {
      if (mimeType.includes(type)) {
        return true;
      }
    }

    // 已压缩的文件类型不再压缩
    const alreadyCompressedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'audio/',
      'video/',
      'application/zip',
      'application/gzip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/pdf'
    ];

    for (const type of alreadyCompressedTypes) {
      if (mimeType.includes(type)) {
        return false;
      }
    }

    // 默认可压缩
    return true;
  }

  /**
   * 销毁实例，清理资源
   */
  public destroy(): void {
    // 停止健康检查
    this.stopHealthCheck();

    // 清空队列和活跃任务
    this.uploadQueue = [];
    this.activeUploads.clear();

    // 标记所有上传为取消状态
    for (const task of this.activeUploads.values()) {
      task.status = UploadTaskStatus.CANCELED;
    }
  }
}
