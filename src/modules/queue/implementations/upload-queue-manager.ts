/**
 * 上传队列管理器
 * 实现文件上传队列的核心功能，包括队列优先级管理、状态跟踪、事件系统等
 */

import { FileChunkKernel } from '../../../core/kernel';
import {
  PersistentQueue,
  QueueEventHandler,
  QueueEvents,
  QueueItem,
  QueueManagerOptions,
  QueueState,
  QueueStateSummary,
  QueueItemStatus,
  SerializedQueueItem
} from '../interfaces';

/**
 * 上传队列管理器实现类
 */
export class UploadQueueManager implements PersistentQueue {
  /**
   * 默认选项
   * @private
   */
  private static readonly DEFAULT_OPTIONS: QueueManagerOptions = {
    maxQueueSize: 100,
    persistQueue: true,
    autoResume: true,
    queueKey: 'filechunk_upload_queue',
    processingKey: 'filechunk_processing'
  };

  /**
   * 队列管理选项
   * @private
   */
  private options: Required<QueueManagerOptions>;

  /**
   * 上传队列
   * @private
   */
  private queue: QueueItem[] = [];

  /**
   * 当前处理的项目
   * @private
   */
  private processing: QueueItem | null = null;

  /**
   * 队列状态
   * @private
   */
  private state: QueueState = {
    status: QueueItemStatus.IDLE,
    isOnline: true,
    processingItem: null,
    activeUploads: 0,
    totalQueued: 0
  };

  /**
   * 事件监听器映射
   * @private
   */
  private listeners: Map<string, QueueEventHandler[]> = new Map();

  /**
   * 微内核实例引用
   * @private
   */
  private kernel: FileChunkKernel | null = null;

  /**
   * 存储模块引用
   * @private
   */
  private storage: any = null;

  /**
   * 构造函数
   * @param options 队列管理选项
   */
  constructor(options: QueueManagerOptions = {}) {
    this.options = {
      ...UploadQueueManager.DEFAULT_OPTIONS,
      ...options,
      // 确保必填项有默认值
      prioritySort: options.prioritySort || this.defaultPrioritySort
    } as Required<QueueManagerOptions>;
  }

  /**
   * 默认优先级排序函数
   * @param a 队列项A
   * @param b 队列项B
   * @private
   */
  private defaultPrioritySort(a: QueueItem, b: QueueItem): number {
    // 默认按添加时间排序
    return a.metadata.addedAt - b.metadata.addedAt;
  }

  /**
   * 初始化队列管理器
   * @param kernel 微内核实例
   */
  async init(kernel: FileChunkKernel): Promise<void> {
    this.kernel = kernel;

    try {
      // 获取存储模块
      this.storage = kernel.getModule('storage');

      // 初始化网络监听
      this.setupNetworkListeners();

      // 恢复持久化的队列
      if (this.options.persistQueue) {
        await this.restoreQueue();
      }
    } catch (error) {
      console.error('队列管理器初始化失败:', error);
      throw error;
    }
  }

  /**
   * 将文件添加到上传队列
   * @param file 要上传的文件
   * @param metadata 文件元数据
   * @returns 队列项ID
   */
  async addToQueue<T = File>(file: T, metadata: Record<string, any> = {}): Promise<string> {
    // 生成队列项唯一ID
    const queueId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 获取文件属性（使用类型断言确保类型安全）
    const fileObj = file as unknown as {
      name?: string;
      size?: number;
      type?: string;
    };

    // 创建队列项
    const queueItem: QueueItem<T> = {
      id: queueId,
      file,
      metadata: {
        ...metadata,
        addedAt: Date.now(),
        fileName: fileObj.name || 'unknown',
        fileSize: fileObj.size || 0,
        fileType: fileObj.type || 'application/octet-stream'
      },
      status: QueueItemStatus.QUEUED,
      progress: 0,
      error: null,
      retries: 0,
      result: null
    };

    // 队列长度检查
    if (this.queue.length >= this.options.maxQueueSize) {
      throw new Error(`上传队列已满 (最大${this.options.maxQueueSize}项)`);
    }

    // 添加到队列
    this.queue.push(queueItem as unknown as QueueItem<File>);
    this.state.totalQueued = this.queue.length;

    // 按优先级排序
    this.sortQueue();

    // 持久化队列
    if (this.options.persistQueue) {
      await this.persistQueue();
    }

    // 触发事件
    this.emitEvent(QueueEvents.QUEUE_UPDATED, this.getQueueState());

    // 如果是空闲状态且在线，开始处理队列
    if (this.state.status === QueueItemStatus.IDLE && this.state.isOnline) {
      this.processQueue();
    }

    return queueId;
  }

  /**
   * 批量添加文件到上传队列
   * @param files 要上传的文件数组
   * @param commonMetadata 所有文件共享的元数据
   * @returns 队列项ID数组
   */
  async addBulkToQueue<T = File>(
    files: T[],
    commonMetadata: Record<string, any> = {}
  ): Promise<string[]> {
    const queueIds: string[] = [];

    for (const file of files) {
      // 为每个文件添加特定元数据
      const metadata = {
        ...commonMetadata,
        bulkUpload: true,
        bulkSize: files.length
      };

      try {
        const id = await this.addToQueue<T>(file, metadata);
        queueIds.push(id);
      } catch (error) {
        // 继续添加其他文件，但记录错误
        console.error('添加文件到队列失败:', error);
      }
    }

    return queueIds;
  }

  /**
   * 处理上传队列
   */
  async processQueue(): Promise<void> {
    // 如果不在线、已暂停或正在处理，直接返回
    if (
      !this.state.isOnline ||
      this.state.status === QueueItemStatus.PAUSED ||
      this.state.status === QueueItemStatus.PROCESSING
    ) {
      return;
    }

    // 标记为处理中
    this.state.status = QueueItemStatus.PROCESSING;
    this.emitEvent(QueueEvents.STATUS_CHANGED, this.state.status);

    // 获取队列中的下一个项目
    const nextItem = this.queue.find(item => item.status === QueueItemStatus.QUEUED);

    if (!nextItem) {
      // 队列为空，标记为空闲
      this.state.status = QueueItemStatus.IDLE;
      this.emitEvent(QueueEvents.STATUS_CHANGED, this.state.status);
      this.emitEvent(QueueEvents.QUEUE_EMPTY);
      return;
    }

    // 更新状态
    nextItem.status = QueueItemStatus.PROCESSING;
    this.processing = nextItem;
    this.state.processingItem = nextItem.id;
    this.state.activeUploads++;

    // 持久化当前处理状态
    if (this.options.persistQueue && this.storage) {
      await this.storage.save(this.options.processingKey, this.serializeQueueItem(nextItem));
      await this.persistQueue();
    }

    // 触发事件
    this.emitEvent(QueueEvents.UPLOAD_STARTED, nextItem);

    try {
      // 使用传输模块上传文件
      if (this.kernel) {
        const transport = this.kernel.getModule('transport');
        const platform = this.kernel.getModule('platform');

        // 注册进度回调
        const progressHandler = (progress: number) => {
          if (nextItem) {
            nextItem.progress = progress;
            this.emitEvent(QueueEvents.UPLOAD_PROGRESS, { id: nextItem.id, progress });
          }
        };

        this.kernel.on('progress', progressHandler);

        // 执行上传
        const result = await transport.start(nextItem.file, platform);

        // 更新队列项
        nextItem.status = QueueItemStatus.COMPLETED;
        nextItem.progress = 100;
        nextItem.result = result;

        // 从队列中移除
        this.queue = this.queue.filter(item => item.id !== nextItem.id);
        this.state.totalQueued = this.queue.length;

        // 清除正在处理项
        this.processing = null;
        this.state.processingItem = null;
        this.state.activeUploads--;

        // 持久化队列
        if (this.options.persistQueue && this.storage) {
          await this.storage.remove(this.options.processingKey);
          await this.persistQueue();
        }

        // 触发事件
        this.emitEvent(QueueEvents.UPLOAD_COMPLETED, { id: nextItem.id, result });
        this.emitEvent(QueueEvents.QUEUE_UPDATED, this.getQueueState());

        // 移除进度监听器
        this.kernel.off('progress', progressHandler);

        // 继续处理队列
        this.processQueue();
      }
    } catch (error) {
      if (!nextItem) return;

      // 上传失败
      nextItem.status = QueueItemStatus.FAILED;
      nextItem.error = {
        message: error instanceof Error ? error.message : '上传失败',
        code: 'UPLOAD_ERROR',
        timestamp: Date.now()
      };
      nextItem.retries++;

      // 清除正在处理项
      this.processing = null;
      this.state.processingItem = null;
      this.state.activeUploads--;

      // 持久化队列
      if (this.options.persistQueue && this.storage) {
        await this.storage.remove(this.options.processingKey);
        await this.persistQueue();
      }

      // 触发事件
      this.emitEvent(QueueEvents.UPLOAD_FAILED, { id: nextItem.id, error });
      this.emitEvent(QueueEvents.QUEUE_UPDATED, this.getQueueState());

      // 继续处理队列
      this.processQueue();
    }
  }

  /**
   * 暂停队列处理
   */
  async pauseQueue(): Promise<void> {
    // 如果当前不是处理中状态，直接返回
    if (this.state.status !== QueueItemStatus.PROCESSING) {
      return;
    }

    // 标记为暂停
    this.state.status = QueueItemStatus.PAUSED;

    // 如果有正在处理的项目，暂停它
    if (this.processing && this.kernel) {
      const transport = this.kernel.getModule('transport');
      transport.pause();

      // 更新状态
      this.processing.status = QueueItemStatus.PAUSED;

      // 持久化
      if (this.options.persistQueue && this.storage) {
        await this.persistQueue();
      }
    }

    // 触发事件
    this.emitEvent(QueueEvents.STATUS_CHANGED, this.state.status);
    this.emitEvent(QueueEvents.QUEUE_PAUSED);
  }

  /**
   * 恢复队列处理
   */
  async resumeQueue(): Promise<void> {
    // 如果当前不是暂停状态，直接返回
    if (this.state.status !== QueueItemStatus.PAUSED) {
      return;
    }

    // 标记为处理中
    this.state.status = QueueItemStatus.PROCESSING;

    // 如果有暂停的处理项，恢复它
    if (this.processing && this.kernel) {
      const transport = this.kernel.getModule('transport');
      transport.resume();

      // 更新状态
      this.processing.status = QueueItemStatus.PROCESSING;

      // 持久化
      if (this.options.persistQueue && this.storage) {
        await this.persistQueue();
      }
    } else {
      // 没有正在处理的项目，开始处理队列
      this.processQueue();
    }

    // 触发事件
    this.emitEvent(QueueEvents.STATUS_CHANGED, this.state.status);
    this.emitEvent(QueueEvents.QUEUE_RESUMED);
  }

  /**
   * 取消指定上传
   * @param id 队列项ID
   */
  async cancelUpload(id: string): Promise<void> {
    // 查找队列项
    const queueItem = this.queue.find(item => item.id === id);

    if (!queueItem) {
      throw new Error(`未找到上传项: ${id}`);
    }

    // 如果是正在处理的项目，取消上传
    if (this.processing && this.processing.id === id && this.kernel) {
      const transport = this.kernel.getModule('transport');
      transport.cancel();

      // 清除正在处理项
      this.processing = null;
      this.state.processingItem = null;
      this.state.activeUploads--;
    }

    // 从队列中移除
    this.queue = this.queue.filter(item => item.id !== id);
    this.state.totalQueued = this.queue.length;

    // 持久化队列
    if (this.options.persistQueue && this.storage) {
      if (id === this.state.processingItem) {
        await this.storage.remove(this.options.processingKey);
      }
      await this.persistQueue();
    }

    // 触发事件
    this.emitEvent(QueueEvents.UPLOAD_CANCELED, { id });
    this.emitEvent(QueueEvents.QUEUE_UPDATED, this.getQueueState());

    // 如果当前没有处理中的项目，继续处理队列
    if (!this.processing && this.state.status === QueueItemStatus.PROCESSING) {
      this.processQueue();
    }
  }

  /**
   * 清空上传队列
   */
  async clearQueue(): Promise<void> {
    // 如果有正在处理的项目，取消它
    if (this.processing && this.kernel) {
      const transport = this.kernel.getModule('transport');
      transport.cancel();

      // 清除正在处理项
      this.processing = null;
      this.state.processingItem = null;
      this.state.activeUploads = 0;
    }

    // 清空队列
    this.queue = [];
    this.state.totalQueued = 0;
    this.state.status = QueueItemStatus.IDLE;

    // 持久化队列
    if (this.options.persistQueue && this.storage) {
      await this.storage.remove(this.options.processingKey);
      await this.storage.remove(this.options.queueKey);
    }

    // 触发事件
    this.emitEvent(QueueEvents.QUEUE_CLEARED);
    this.emitEvent(QueueEvents.STATUS_CHANGED, this.state.status);
    this.emitEvent(QueueEvents.QUEUE_UPDATED, this.getQueueState());
  }

  /**
   * 获取队列状态
   */
  getQueueState(): QueueStateSummary {
    return {
      status: this.state.status,
      isOnline: this.state.isOnline,
      processingItem: this.state.processingItem,
      activeUploads: this.state.activeUploads,
      totalQueued: this.state.totalQueued,
      queue: this.queue.map(item => ({
        id: item.id,
        fileName: item.metadata.fileName,
        fileSize: item.metadata.fileSize,
        status: item.status as unknown as QueueItemStatus,
        progress: item.progress,
        addedAt: item.metadata.addedAt
      }))
    };
  }

  /**
   * 对队列按优先级排序
   * @private
   */
  private sortQueue(): void {
    if (this.options.prioritySort) {
      this.queue.sort(this.options.prioritySort);
    }
  }

  /**
   * 获取指定队列项
   * @param id 队列项ID
   */
  getQueueItem(id: string): QueueItem | null {
    return this.queue.find(item => item.id === id) || null;
  }

  /**
   * 更新队列项优先级
   * @param id 队列项ID
   * @param priority 新的优先级值
   */
  async updatePriority(id: string, priority: number): Promise<void> {
    const item = this.getQueueItem(id);
    if (item) {
      // 设置优先级
      item.metadata.priority = priority;

      // 重新排序
      this.sortQueue();

      // 持久化
      if (this.options.persistQueue && this.storage) {
        await this.persistQueue();
      }

      // 触发事件
      this.emitEvent(QueueEvents.QUEUE_UPDATED, this.getQueueState());
    }
  }

  /**
   * 获取队列长度
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * 检查队列是否为空
   */
  isQueueEmpty(): boolean {
    return this.queue.length === 0;
  }

  // =====================================
  // 队列事件系统实现
  // =====================================

  /**
   * 注册事件处理器
   * @param event 事件类型
   * @param handler 事件处理函数
   * @returns 取消订阅函数
   */
  on<T = any>(event: QueueEvents | string, handler: QueueEventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event)!.push(handler as QueueEventHandler);

    // 返回取消订阅函数
    return () => this.off(event, handler);
  }

  /**
   * 移除事件处理器
   * @param event 事件类型
   * @param handler 事件处理函数
   */
  off<T = any>(event: QueueEvents | string, handler: QueueEventHandler<T>): void {
    if (!this.listeners.has(event)) return;

    const handlers = this.listeners.get(event)!;
    const index = handlers.indexOf(handler as QueueEventHandler);

    if (index !== -1) {
      handlers.splice(index, 1);

      // 如果没有更多的处理器，删除整个事件
      if (handlers.length === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * 触发事件
   * @param event 事件类型
   * @param data 事件数据
   * @private
   */
  private emitEvent<T = any>(event: QueueEvents | string, data?: T): void {
    if (!this.listeners.has(event)) return;

    const handlers = [...this.listeners.get(event)!]; // 创建副本以避免迭代时修改

    for (const handler of handlers) {
      try {
        // 使用nextTick或setTimeout确保异步执行，避免阻塞
        setTimeout(() => {
          try {
            handler(data);
          } catch (error) {
            console.error(`队列事件处理器错误 (${event}):`, error);
          }
        }, 0);
      } catch (error) {
        console.error(`队列事件触发错误 (${event}):`, error);
      }
    }
  }

  /**
   * 获取事件监听器数量
   * @param event 事件类型
   * @returns 监听器数量
   */
  getListenerCount(event?: QueueEvents | string): number {
    if (!event) {
      // 返回所有事件的监听器总数
      let count = 0;
      for (const handlers of this.listeners.values()) {
        count += handlers.length;
      }
      return count;
    }

    // 返回特定事件的监听器数量
    return this.listeners.has(event) ? this.listeners.get(event)!.length : 0;
  }

  /**
   * 移除所有事件监听器
   * @param event 指定事件类型（可选，不指定则清除所有）
   */
  clearListeners(event?: QueueEvents | string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * 一次性事件监听
   * 事件触发一次后自动取消订阅
   * @param event 事件类型
   * @param handler 事件处理函数
   * @returns 取消订阅函数
   */
  once<T = any>(event: QueueEvents | string, handler: QueueEventHandler<T>): () => void {
    const onceHandler: QueueEventHandler = data => {
      // 先移除监听器，再调用处理函数
      this.off(event, onceHandler);
      (handler as QueueEventHandler)(data);
    };

    return this.on(event, onceHandler);
  }

  // =====================================
  // 网络状态监听
  // =====================================

  /**
   * 初始化网络监听器
   * @private
   */
  private setupNetworkListeners(): void {
    if (typeof window !== 'undefined' && 'addEventListener' in window) {
      // 初始化网络状态
      this.state.isOnline = navigator?.onLine !== false;

      // 网络在线状态变化
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));

      // 页面可见性变化（用户切换回页面时检查网络）
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          // 更新网络状态
          this.state.isOnline = navigator.onLine;

          // 如果在线且配置了自动恢复，继续上传
          if (
            this.state.isOnline &&
            this.options.autoResume &&
            this.state.status === QueueItemStatus.PAUSED
          ) {
            this.resumeQueue();
          }
        }
      });
    }
  }

  /**
   * 处理网络状态变化
   * @param isOnline 是否在线
   * @private
   */
  private async handleNetworkChange(isOnline: boolean): Promise<void> {
    // 更新状态
    this.state.isOnline = isOnline;

    if (isOnline) {
      // 网络恢复
      this.emitEvent(QueueEvents.NETWORK_ONLINE);

      // 如果配置了自动恢复且当前为暂停状态，恢复上传
      if (this.options.autoResume && this.state.status === QueueItemStatus.PAUSED) {
        await this.resumeQueue();
      }
    } else {
      // 网络断开
      this.emitEvent(QueueEvents.NETWORK_OFFLINE);

      // 自动暂停上传
      if (this.state.status === QueueItemStatus.PROCESSING) {
        await this.pauseQueue();
      }
    }
  }

  // =====================================
  // 持久化实现
  // =====================================

  /**
   * 持久化队列到存储
   */
  async persistQueue(): Promise<void> {
    try {
      if (!this.storage) return;

      // 序列化队列
      const serializedQueue = this.queue.map(item => this.serializeQueueItem(item));

      await this.storage.save(this.options.queueKey, serializedQueue);
    } catch (error) {
      console.error('持久化队列失败:', error);
    }
  }

  /**
   * 序列化队列项（移除文件对象）
   * @param item 队列项
   * @private
   */
  private serializeQueueItem(item: QueueItem): SerializedQueueItem {
    const file = item.file as any;

    return {
      id: item.id,
      fileInfo: {
        name: file.name || '',
        size: file.size || 0,
        type: file.type || '',
        lastModified: file.lastModified || Date.now()
      },
      metadata: item.metadata,
      status: item.status as unknown as QueueItemStatus,
      progress: item.progress,
      error: item.error,
      retries: item.retries,
      result: item.result
    };
  }

  /**
   * 从存储恢复队列
   */
  async restoreQueue(): Promise<void> {
    try {
      if (!this.storage) return;

      // 恢复队列
      const savedQueue = await this.storage.get(this.options.queueKey);
      if (savedQueue && Array.isArray(savedQueue)) {
        // 队列恢复只能保留元数据，实际文件需要用户手动重新选择
        this.queue = savedQueue;
        this.state.totalQueued = savedQueue.length;
      }

      // 恢复正在处理的项目
      const processingItem = await this.storage.get(this.options.processingKey);
      if (processingItem) {
        this.processing = processingItem;
        this.state.processingItem = processingItem.id;
        this.state.activeUploads = 1;
      }

      // 触发事件
      this.emitEvent(QueueEvents.QUEUE_RESTORED, this.getQueueState());
    } catch (error) {
      console.error('恢复队列失败:', error);
      // 恢复失败时初始化空队列
      this.queue = [];
      this.state.totalQueued = 0;
    }
  }

  /**
   * 清除持久化存储
   */
  async clearPersistentStorage(): Promise<void> {
    if (!this.storage) return;

    try {
      await this.storage.remove(this.options.queueKey);
      await this.storage.remove(this.options.processingKey);
    } catch (error) {
      console.error('清除持久化存储失败:', error);
    }
  }
}
