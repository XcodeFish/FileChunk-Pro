import { IKernel } from '../../core/interfaces';
import { StorageEngine } from '../../modules/storage/storage-engine';
import { QueueItem, QueueStatus, QueueEvents } from './interfaces';

/**
 * 持久化队列项接口 - 存储的数据格式
 */
export interface PersistentQueueItem {
  id: string;
  metadata: {
    fileName: string;
    fileSize: number;
    fileType: string;
    addedAt: number;
    lastUpdatedAt: number;
    [key: string]: any;
  };
  status: QueueStatus;
  progress: number;
  error?: {
    message: string;
    code: string;
    timestamp: number;
  } | null;
  retries: number;
  result?: any;
  // 文件引用信息存储
  fileRef?: {
    // 当实现文件存储时使用的引用ID
    storageId?: string;
    // 临时文件路径或标识符
    tempPath?: string;
  };
  // 完整性校验
  checksum?: string;
  // 序列号用于顺序重建
  sequence: number;
  // 分片状态 - 存储已上传的分片索引
  uploadedChunks?: number[];
  // 队列版本号，用于处理队列格式升级
  version: number;
}

/**
 * 持久化队列存储键前缀
 */
export enum PersistentQueueKeys {
  QUEUE_ITEMS = 'queue:items',
  QUEUE_STATE = 'queue:state',
  QUEUE_META = 'queue:meta',
  FILE_DATA_PREFIX = 'file:data:',
  ACTIVE_UPLOAD = 'queue:active'
}

/**
 * 持久化队列配置选项
 */
export interface PersistentQueueOptions {
  // 存储键前缀
  keyPrefix?: string;
  // 自动清理阈值（项目数）
  cleanupThreshold?: number;
  // 最大保留时间（毫秒）
  maxRetentionTime?: number;
  // 自动恢复
  autoRestore?: boolean;
  // 是否存储文件数据
  storeFileData?: boolean;
  // 文件数据存储大小限制（字节）
  maxFileDataSize?: number;
  // 队列版本号
  version?: number;
  // 数据校验
  enableChecksum?: boolean;
}

/**
 * 队列状态接口
 */
interface QueueState {
  status: 'idle' | 'processing' | 'paused' | 'stopped';
  lastUpdated: number;
  itemCount: number;
  activeItem?: string | null;
  version: number;
}

/**
 * 队列元数据接口
 */
interface QueueMeta {
  created: number;
  lastAccess: number;
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  version: number;
}

/**
 * 队列事件处理器类型
 */
type QueueEventHandler = (data: any) => void;

/**
 * 持久化队列实现
 *
 * 提供队列数据的持久化、恢复和管理功能
 */
export class PersistentQueue {
  private kernel?: IKernel;
  private storage?: StorageEngine;
  private options: PersistentQueueOptions;
  private queueItems: Map<string, PersistentQueueItem> = new Map();
  private queueState: QueueState;
  private queueMeta: QueueMeta;
  private isInitialized = false;
  private isSyncing = false;
  private syncTimeout: any = null;
  private listeners = new Map<string, QueueEventHandler[]>();
  private readonly CURRENT_VERSION = 1; // 队列格式当前版本号

  /**
   * 创建持久化队列实例
   */
  constructor(options: PersistentQueueOptions = {}) {
    this.options = {
      keyPrefix: 'filechunk-pro:',
      cleanupThreshold: 100, // 队列项超过100个时触发清理
      maxRetentionTime: 7 * 24 * 60 * 60 * 1000, // 默认保留7天
      autoRestore: true,
      storeFileData: false, // 默认不存储文件数据（过大）
      maxFileDataSize: 10 * 1024 * 1024, // 默认最大10MB
      version: this.CURRENT_VERSION,
      enableChecksum: true,
      ...options
    };

    // 初始化队列状态
    this.queueState = {
      status: 'idle',
      lastUpdated: Date.now(),
      itemCount: 0,
      activeItem: null,
      version: this.options.version || this.CURRENT_VERSION
    };

    // 初始化队列元数据
    this.queueMeta = {
      created: Date.now(),
      lastAccess: Date.now(),
      totalProcessed: 0,
      successCount: 0,
      failureCount: 0,
      version: this.options.version || this.CURRENT_VERSION
    };
  }

  /**
   * 初始化队列
   * @param kernel 微内核实例
   */
  async init(kernel: IKernel): Promise<void> {
    if (this.isInitialized) return;

    this.kernel = kernel;

    try {
      // 获取存储模块
      this.storage = kernel.getModule<StorageEngine>('storage');

      // 确保存储模块已初始化
      if (this.storage && typeof this.storage.init === 'function') {
        await this.storage.init(kernel);
      }

      // 恢复队列状态和元数据
      await this.restoreQueueMetadata();

      // 自动恢复队列
      if (this.options.autoRestore) {
        await this.restore();
      }

      // 添加页面关闭同步
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
          // 在页面关闭前同步队列
          this.syncImmediate();
        });
      }

      this.isInitialized = true;
      this.emit(QueueEvents.QUEUE_INITIALIZED, { queue: this.getState() });
    } catch (error) {
      console.error('初始化持久化队列失败:', error);
      throw error;
    }
  }

  /**
   * 添加项目到队列
   * @param item 队列项
   */
  async add(item: QueueItem): Promise<string> {
    this.ensureInitialized();

    // 转换为持久化队列项
    const persistentItem = this.toPersistentItem(item);

    // 存储到内存中
    this.queueItems.set(persistentItem.id, persistentItem);

    // 更新队列状态
    this.queueState.itemCount = this.queueItems.size;
    this.queueState.lastUpdated = Date.now();

    // 触发同步
    this.schedulePersist();

    // 触发事件
    this.emit(QueueEvents.ITEM_ADDED, { item: persistentItem });
    this.emit(QueueEvents.QUEUE_UPDATED, { queue: this.getState() });

    return persistentItem.id;
  }

  /**
   * 更新队列项
   * @param id 队列项ID
   * @param updates 更新内容
   */
  async update(id: string, updates: Partial<QueueItem>): Promise<boolean> {
    this.ensureInitialized();

    if (!this.queueItems.has(id)) {
      return false;
    }

    const item = this.queueItems.get(id)!;

    // 应用更新
    const updatedItem: PersistentQueueItem = {
      ...item,
      ...updates,
      metadata: {
        ...item.metadata,
        ...(updates.metadata || {}),
        lastUpdatedAt: Date.now()
      },
      // 确保版本号不被覆盖
      version: item.version
    };

    if (updates.status) {
      // 如果状态发生变化，更新活动项
      if (updates.status === 'processing') {
        this.queueState.activeItem = id;
      } else if (this.queueState.activeItem === id && (updates.status as string) !== 'processing') {
        this.queueState.activeItem = null;
      }
    }

    // 计算新的校验和
    if (this.options.enableChecksum) {
      const newChecksum = await this.calculateChecksum(updatedItem);
      updatedItem.checksum = newChecksum;
    }

    // 更新内存中的项
    this.queueItems.set(id, updatedItem);

    // 更新队列状态
    this.queueState.lastUpdated = Date.now();

    // 触发同步
    this.schedulePersist();

    // 触发事件
    this.emit(QueueEvents.ITEM_UPDATED, { item: updatedItem });
    this.emit(QueueEvents.QUEUE_UPDATED, { queue: this.getState() });

    return true;
  }

  /**
   * 移除队列项
   * @param id 队列项ID
   */
  async remove(id: string): Promise<boolean> {
    this.ensureInitialized();

    if (!this.queueItems.has(id)) {
      return false;
    }

    const item = this.queueItems.get(id)!;

    // 从内存中移除
    this.queueItems.delete(id);

    // 更新队列状态
    this.queueState.itemCount = this.queueItems.size;
    this.queueState.lastUpdated = Date.now();
    if (this.queueState.activeItem === id) {
      this.queueState.activeItem = null;
    }

    // 同步到存储
    this.schedulePersist();

    // 尝试删除相关的文件数据
    try {
      if (this.storage && item.fileRef?.storageId) {
        await this.storage.remove(this.getFileDataKey(item.fileRef.storageId));
      }
    } catch (error) {
      console.warn(`删除队列项文件数据失败: ${id}`, error);
    }

    // 触发事件
    this.emit(QueueEvents.ITEM_REMOVED, { id });
    this.emit(QueueEvents.QUEUE_UPDATED, { queue: this.getState() });

    return true;
  }

  /**
   * 获取队列项
   * @param id 队列项ID
   */
  get(id: string): PersistentQueueItem | undefined {
    this.ensureInitialized();
    return this.queueItems.get(id);
  }

  /**
   * 获取所有队列项
   */
  getAll(): PersistentQueueItem[] {
    this.ensureInitialized();
    return Array.from(this.queueItems.values()).sort((a, b) => a.sequence - b.sequence);
  }

  /**
   * 获取队列状态
   */
  getState(): any {
    return {
      status: this.queueState.status,
      itemCount: this.queueState.itemCount,
      activeItem: this.queueState.activeItem,
      lastUpdated: new Date(this.queueState.lastUpdated),
      items: this.getAll().map(item => ({
        id: item.id,
        status: item.status,
        progress: item.progress,
        fileName: item.metadata.fileName,
        fileSize: item.metadata.fileSize,
        addedAt: new Date(item.metadata.addedAt),
        sequence: item.sequence
      }))
    };
  }

  /**
   * 设置队列状态
   * @param status 队列状态
   */
  async setStatus(status: 'idle' | 'processing' | 'paused' | 'stopped'): Promise<void> {
    this.ensureInitialized();

    const prevStatus = this.queueState.status;
    this.queueState.status = status;
    this.queueState.lastUpdated = Date.now();

    // 持久化状态
    this.schedulePersist();

    // 触发事件
    if (prevStatus !== status) {
      this.emit(QueueEvents.STATUS_CHANGED, { status, prevStatus });
    }
  }

  /**
   * 清空队列
   */
  async clear(): Promise<void> {
    this.ensureInitialized();

    // 备份队列长度用于事件
    const prevCount = this.queueItems.size;

    // 清空内存队列
    const itemsToDelete = Array.from(this.queueItems.keys());
    this.queueItems.clear();

    // 更新队列状态
    this.queueState.itemCount = 0;
    this.queueState.activeItem = null;
    this.queueState.lastUpdated = Date.now();

    // 持久化空队列
    await this.persist();

    // 尝试删除所有文件数据
    if (this.storage) {
      try {
        for (const id of itemsToDelete) {
          await this.storage.remove(this.getQueueItemKey(id));
        }
      } catch (error) {
        console.warn('清除队列文件数据失败', error);
      }
    }

    // 触发事件
    if (prevCount > 0) {
      this.emit(QueueEvents.QUEUE_CLEARED, { previousCount: prevCount });
      this.emit(QueueEvents.QUEUE_UPDATED, { queue: this.getState() });
    }
  }

  /**
   * 恢复队列
   */
  async restore(): Promise<boolean> {
    try {
      if (!this.storage) {
        console.warn('存储模块不可用，无法恢复队列');
        return false;
      }

      console.log('正在恢复持久化队列...');

      // 恢复队列状态
      const storedState = await this.storage.get<QueueState>(
        this.getKey(PersistentQueueKeys.QUEUE_STATE)
      );
      if (storedState) {
        // 兼容版本
        if (storedState.version <= this.CURRENT_VERSION) {
          this.queueState = {
            ...storedState,
            version: this.CURRENT_VERSION
          };
        } else {
          console.warn(`队列状态版本不兼容: ${storedState.version}`);
        }
      }

      // 获取存储的队列项ID列表
      const itemKeys =
        (await this.storage.get<string[]>(this.getKey(PersistentQueueKeys.QUEUE_ITEMS))) || [];

      if (itemKeys.length === 0) {
        console.log('没有需要恢复的队列项');
        return true;
      }

      // 清空当前队列
      this.queueItems.clear();

      // 恢复所有队列项
      const promises = itemKeys.map(async id => {
        try {
          const item = await this.storage!.get<PersistentQueueItem>(this.getQueueItemKey(id));
          if (!item) {
            return false;
          }

          // 校验队列项完整性
          if (this.options.enableChecksum && item.checksum) {
            const calculatedChecksum = await this.calculateChecksum(item);
            if (calculatedChecksum !== item.checksum) {
              console.warn(`队列项校验失败: ${id}`);
              return false;
            }
          }

          // 版本检查
          if (item.version > this.CURRENT_VERSION) {
            console.warn(`队列项版本不兼容: ${item.version}`);
            return false;
          }

          // 有效性检查
          if (this.isItemExpired(item)) {
            console.log(`跳过过期的队列项: ${id}`);
            return false;
          }

          // 添加到内存队列
          this.queueItems.set(id, item);
          return true;
        } catch (error) {
          console.error(`恢复队列项失败: ${id}`, error);
          return false;
        }
      });

      const results = await Promise.all(promises);
      const restoredCount = results.filter(Boolean).length;

      // 更新队列状态
      this.queueState.itemCount = this.queueItems.size;
      this.queueState.lastUpdated = Date.now();

      console.log(`成功恢复了 ${restoredCount}/${itemKeys.length} 个队列项`);

      // 触发事件
      this.emit(QueueEvents.QUEUE_RESTORED, {
        restoredCount,
        totalCount: itemKeys.length,
        queue: this.getState()
      });

      return restoredCount > 0;
    } catch (error) {
      console.error('恢复队列失败:', error);
      return false;
    }
  }

  /**
   * 存储文件数据
   * @param id 队列项ID
   * @param file 文件对象
   */
  async storeFileData(id: string, file: Blob): Promise<string | null> {
    if (!this.options.storeFileData || !this.storage || file.size > this.options.maxFileDataSize!) {
      return null;
    }

    try {
      const item = this.queueItems.get(id);
      if (!item) return null;

      // 生成存储ID
      const storageId = `${id}_${Date.now()}`;
      const fileDataKey = this.getFileDataKey(storageId);

      // 读取文件数据
      const fileData = await this.readFileAsArrayBuffer(file);

      // 存储文件数据
      await this.storage.save(fileDataKey, fileData);

      // 更新队列项引用
      const updatedItem = {
        ...item,
        fileRef: {
          ...(item.fileRef || {}),
          storageId
        }
      };

      this.queueItems.set(id, updatedItem);
      this.schedulePersist();

      return storageId;
    } catch (error) {
      console.error('存储文件数据失败:', error);
      return null;
    }
  }

  /**
   * 获取存储的文件数据
   * @param id 队列项ID
   */
  async getFileData(id: string): Promise<ArrayBuffer | null> {
    try {
      const item = this.queueItems.get(id);
      if (!item || !item.fileRef?.storageId || !this.storage) return null;

      const fileDataKey = this.getFileDataKey(item.fileRef.storageId);
      return await this.storage.get<ArrayBuffer>(fileDataKey);
    } catch (error) {
      console.error('获取文件数据失败:', error);
      return null;
    }
  }

  /**
   * 更新已上传的分片信息
   * @param id 队列项ID
   * @param chunks 已上传的分片索引数组
   */
  async updateUploadedChunks(id: string, chunks: number[]): Promise<boolean> {
    const item = this.queueItems.get(id);
    if (!item) return false;

    // 更新分片信息
    const updatedItem = {
      ...item,
      uploadedChunks: chunks,
      metadata: {
        ...item.metadata,
        lastUpdatedAt: Date.now()
      }
    };

    this.queueItems.set(id, updatedItem);
    this.schedulePersist();

    return true;
  }

  /**
   * 存储队列
   */
  async persist(): Promise<void> {
    if (!this.storage || !this.isInitialized) return;

    try {
      this.isSyncing = true;

      // 更新元数据
      this.queueMeta.lastAccess = Date.now();

      // 存储队列状态
      await this.storage.save(this.getKey(PersistentQueueKeys.QUEUE_STATE), this.queueState);

      // 存储元数据
      await this.storage.save(this.getKey(PersistentQueueKeys.QUEUE_META), this.queueMeta);

      // 获取所有项目ID
      const itemIds = Array.from(this.queueItems.keys());

      // 存储项目ID列表
      await this.storage.save(this.getKey(PersistentQueueKeys.QUEUE_ITEMS), itemIds);

      // 存储每个队列项
      const promises = Array.from(this.queueItems.entries()).map(async ([id, item]) => {
        // 更新校验和
        if (this.options.enableChecksum && !item.checksum) {
          const newChecksum = await this.calculateChecksum(item);
          item.checksum = newChecksum;
        }

        // 存储队列项
        await this.storage!.save(this.getQueueItemKey(id), item);
      });

      await Promise.all(promises);

      // 检查是否需要清理存储
      if (this.queueItems.size > this.options.cleanupThreshold!) {
        this.cleanupStorage();
      }

      this.emit(QueueEvents.QUEUE_PERSISTED, { itemCount: this.queueItems.size });
    } catch (error) {
      console.error('持久化队列失败:', error);
      this.emit(QueueEvents.PERSIST_ERROR, { error });
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 立即同步队列到存储
   */
  async syncImmediate(): Promise<void> {
    // 清除任何计划的同步
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }

    if (!this.isSyncing) {
      await this.persist();
    }
  }

  /**
   * 清理存储空间
   */
  async cleanupStorage(): Promise<void> {
    try {
      console.log('开始清理队列存储...');

      // 获取所有队列项，按添加时间排序
      const items = Array.from(this.queueItems.values()).sort((a, b) => {
        // 保留活动项和最近项，清理旧项目
        if (a.id === this.queueState.activeItem) return 1;
        if (b.id === this.queueState.activeItem) return -1;
        return a.metadata.addedAt - b.metadata.addedAt;
      });

      // 计算需要清理的项目数量
      const excessItems = Math.max(0, items.length - this.options.cleanupThreshold!);
      if (excessItems === 0) return;

      console.log(`准备清理 ${excessItems} 个过期队列项`);

      // 获取要清理的项目
      const itemsToCleanup = items.slice(0, excessItems);

      // 清理过期项目
      for (const item of itemsToCleanup) {
        // 跳过活动项
        if (item.id === this.queueState.activeItem) continue;

        // 检查状态，只清理已完成或已失败的项目
        if (item.status !== 'completed' && item.status !== 'failed') continue;

        // 检查是否过期
        if (!this.isItemExpired(item)) continue;

        // 删除队列项
        await this.remove(item.id);
      }

      console.log(`已清理 ${itemsToCleanup.length} 个过期队列项`);
    } catch (error) {
      console.error('清理队列存储失败:', error);
    }
  }

  /**
   * 添加事件监听器
   * @param event 事件名称
   * @param handler 处理函数
   */
  on(event: string, handler: QueueEventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event)!.push(handler);
  }

  /**
   * 移除事件监听器
   * @param event 事件名称
   * @param handler 处理函数
   */
  off(event: string, handler: QueueEventHandler): void {
    if (!this.listeners.has(event)) return;

    const handlers = this.listeners.get(event)!;
    const index = handlers.indexOf(handler);

    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param data 事件数据
   */
  private emit(event: string, data: any): void {
    if (!this.listeners.has(event)) return;

    for (const handler of this.listeners.get(event)!) {
      try {
        handler(data);
      } catch (error) {
        console.error(`队列事件处理器错误 (${event}):`, error);
      }
    }
  }

  /**
   * 检查队列项是否过期
   * @param item 队列项
   */
  private isItemExpired(item: PersistentQueueItem): boolean {
    const now = Date.now();
    const age = now - item.metadata.addedAt;

    // 检查年龄是否超过最大保留时间
    if (age > this.options.maxRetentionTime!) {
      return true;
    }

    // 对于已完成或失败的项目，可以使用更短的保留期
    if (item.status === 'completed' || item.status === 'failed') {
      // 已完成的项目保留1天
      const completedRetention = 24 * 60 * 60 * 1000; // 1天
      const completedAge = now - (item.metadata.lastUpdatedAt || item.metadata.addedAt);
      return completedAge > completedRetention;
    }

    return false;
  }

  /**
   * 安排队列持久化
   */
  private schedulePersist(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    this.syncTimeout = setTimeout(() => {
      this.persist();
      this.syncTimeout = null;
    }, 1000); // 1秒防抖
  }

  /**
   * 恢复队列元数据
   */
  private async restoreQueueMetadata(): Promise<void> {
    if (!this.storage) return;

    try {
      // 恢复队列状态
      const storedState = await this.storage.get<QueueState>(
        this.getKey(PersistentQueueKeys.QUEUE_STATE)
      );
      if (storedState) {
        this.queueState = {
          ...storedState,
          version: this.CURRENT_VERSION // 确保使用当前版本
        };
      }

      // 恢复元数据
      const storedMeta = await this.storage.get<QueueMeta>(
        this.getKey(PersistentQueueKeys.QUEUE_META)
      );
      if (storedMeta) {
        this.queueMeta = {
          ...storedMeta,
          lastAccess: Date.now(),
          version: this.CURRENT_VERSION // 确保使用当前版本
        };
      }
    } catch (error) {
      console.warn('恢复队列元数据失败:', error);
    }
  }

  /**
   * 获取带前缀的存储键
   * @param key 基础键
   */
  private getKey(key: string): string {
    return `${this.options.keyPrefix}${key}`;
  }

  /**
   * 获取队列项存储键
   * @param id 队列项ID
   */
  private getQueueItemKey(id: string): string {
    return `${this.options.keyPrefix}item:${id}`;
  }

  /**
   * 获取文件数据存储键
   * @param storageId 存储ID
   */
  private getFileDataKey(storageId: string): string {
    return `${this.options.keyPrefix}${PersistentQueueKeys.FILE_DATA_PREFIX}${storageId}`;
  }

  /**
   * 计算队列项的校验和
   * @param item 队列项
   */
  private async calculateChecksum(item: PersistentQueueItem): Promise<string> {
    try {
      // 创建一个不包含checksum字段的对象副本
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { checksum, ...itemWithoutChecksum } = item;

      // 生成JSON字符串
      const jsonStr = JSON.stringify(itemWithoutChecksum);

      // 使用简单的哈希算法
      let hash = 0;
      for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // 转换为32位整数
      }

      return hash.toString(16);
    } catch (error) {
      console.warn('计算校验和失败:', error);
      return '';
    }
  }

  /**
   * 将队列项转换为持久化格式
   * @param item 队列项
   */
  private toPersistentItem(item: QueueItem): PersistentQueueItem {
    const now = Date.now();

    // 创建持久化项
    const persistentItem: PersistentQueueItem = {
      id: item.id,
      metadata: {
        ...(item.metadata || {}),
        fileName: item.file?.name || 'unknown',
        fileSize: item.file?.size || 0,
        fileType: item.file?.type || '',
        addedAt: now,
        lastUpdatedAt: now
      },
      status: item.status || 'queued',
      progress: item.progress || 0,
      error: item.error,
      retries: item.retries || 0,
      result: item.result,
      // 使用当前队列长度作为序列号
      sequence: this.queueItems.size,
      version: this.CURRENT_VERSION
    };

    return persistentItem;
  }

  /**
   * 读取文件为ArrayBuffer
   * @param file 文件对象
   */
  private readFileAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result as ArrayBuffer);
      };

      reader.onerror = () => {
        reject(reader.error);
      };

      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 确保队列已初始化
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('持久化队列尚未初始化，请先调用init()方法');
    }
  }
}
