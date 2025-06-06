/**
 * 队列管理模块接口定义
 * 提供队列管理的抽象接口，包括队列项、状态管理和操作方法
 */

import { FileChunkKernel } from '../../../core/kernel';

/**
 * 队列项状态枚举
 */
export enum QueueItemStatus {
  QUEUED = 'queued', // 已加入队列，等待处理
  PROCESSING = 'processing', // 正在处理中
  PAUSED = 'paused', // 暂停处理
  COMPLETED = 'completed', // 处理完成
  FAILED = 'failed', // 处理失败
  CANCELED = 'canceled', // 已取消
  IDLE = 'idle' // 空闲
}

/**
 * 队列状态类型
 */
export type QueueStatus =
  | 'queued'
  | 'processing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'idle';

/**
 * 队列项元数据接口
 */
export interface QueueItemMetadata {
  // 添加时间戳
  addedAt: number;
  // 文件名
  fileName: string;
  // 文件大小（字节）
  fileSize: number;
  // 文件类型
  fileType: string;
  // 自定义元数据，可以由用户扩展
  [key: string]: any;
}

/**
 * 队列项错误信息接口
 */
export interface QueueItemError {
  // 错误消息
  message: string;
  // 错误代码
  code: string;
  // 错误发生时间戳
  timestamp: number;
  // 其他错误详情
  details?: any;
}

/**
 * 队列项接口
 * 表示队列中的一个待处理项
 */
export interface QueueItem<T = File> {
  // 队列项唯一标识
  id: string;
  // 待处理的文件或数据
  file: T;
  // 元数据
  metadata: QueueItemMetadata;
  // 当前状态
  status: QueueStatus;
  // 处理进度（0-100）
  progress: number;
  // 错误信息（如果失败）
  error: QueueItemError | null;
  // 重试次数
  retries: number;
  // 处理结果（如果成功）
  result: any | null;
}

/**
 * 队列状态接口
 */
export interface QueueState {
  // 队列当前状态
  status: QueueStatus;
  // 网络是否在线
  isOnline: boolean;
  // 当前处理项ID
  processingItem: string | null;
  // 活跃上传数量
  activeUploads: number;
  // 队列中的总项目数
  totalQueued: number;
}

/**
 * 队列状态摘要接口（用于UI展示）
 */
export interface QueueStateSummary extends QueueState {
  // 队列项摘要列表（用于UI展示）
  queue: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    status: QueueItemStatus;
    progress: number;
    addedAt: number;
  }>;
}

/**
 * 队列事件枚举
 */
export enum QueueEvents {
  ITEM_ADDED = 'item:added',
  ITEM_UPDATED = 'item:updated',
  ITEM_REMOVED = 'item:removed',
  QUEUE_UPDATED = 'queue:updated',
  QUEUE_CLEARED = 'queue:cleared',
  QUEUE_PERSISTED = 'queue:persisted',
  QUEUE_RESTORED = 'queue:restored',
  QUEUE_INITIALIZED = 'queue:initialized',
  STATUS_CHANGED = 'queue:status-changed',
  PERSIST_ERROR = 'queue:persist-error',
  QUEUE_EMPTY = 'queue:empty',
  UPLOAD_STARTED = 'upload:started',
  UPLOAD_PROGRESS = 'upload:progress',
  UPLOAD_COMPLETED = 'upload:completed',
  UPLOAD_FAILED = 'upload:failed',
  UPLOAD_CANCELED = 'upload:canceled',
  QUEUE_PAUSED = 'queue:paused',
  QUEUE_RESUMED = 'queue:resumed',
  QUEUE_STOPPED = 'queue:stopped',
  NETWORK_OFFLINE = 'network:offline',
  NETWORK_ONLINE = 'network:online'
}

/**
 * 队列事件处理器类型
 */
export type QueueEventHandler<T = any> = (data: T) => void;

/**
 * 队列管理器选项接口
 */
export interface QueueManagerOptions {
  // 队列最大容量
  maxQueueSize?: number;
  // 是否持久化队列
  persistQueue?: boolean;
  // 网络恢复时是否自动恢复
  autoResume?: boolean;
  // 队列存储键名
  queueKey?: string;
  // 处理中项目存储键名
  processingKey?: string;
  // 优先级排序函数
  prioritySort?: (a: QueueItem, b: QueueItem) => number;
}

/**
 * 队列管理器接口
 * 定义队列管理的核心功能
 */
export interface QueueManager {
  /**
   * 初始化队列管理器
   * @param kernel 微内核实例
   */
  init(kernel: FileChunkKernel): Promise<void>;

  /**
   * 将文件添加到上传队列
   * @param file 要上传的文件
   * @param metadata 文件元数据
   * @returns 队列项ID
   */
  addToQueue<T = File>(file: T, metadata?: Record<string, any>): Promise<string>;

  /**
   * 批量添加文件到上传队列
   * @param files 要上传的文件数组
   * @param commonMetadata 所有文件共享的元数据
   * @returns 队列项ID数组
   */
  addBulkToQueue<T = File>(files: T[], commonMetadata?: Record<string, any>): Promise<string[]>;

  /**
   * 处理上传队列
   * 开始处理队列中的下一个项目
   */
  processQueue(): Promise<void>;

  /**
   * 暂停队列处理
   */
  pauseQueue(): Promise<void>;

  /**
   * 恢复队列处理
   */
  resumeQueue(): Promise<void>;

  /**
   * 取消指定上传
   * @param id 队列项ID
   */
  cancelUpload(id: string): Promise<void>;

  /**
   * 清空上传队列
   */
  clearQueue(): Promise<void>;

  /**
   * 获取队列状态
   * @returns 当前队列状态摘要
   */
  getQueueState(): QueueStateSummary;

  /**
   * 注册事件处理器
   * @param event 事件类型
   * @param handler 事件处理函数
   * @returns 取消订阅函数
   */
  on<T = any>(event: QueueEvents | string, handler: QueueEventHandler<T>): () => void;

  /**
   * 移除事件处理器
   * @param event 事件类型
   * @param handler 事件处理函数
   */
  off<T = any>(event: QueueEvents | string, handler: QueueEventHandler<T>): void;

  /**
   * 获取指定队列项
   * @param id 队列项ID
   * @returns 队列项或null（如果不存在）
   */
  getQueueItem(id: string): QueueItem | null;

  /**
   * 更新队列项优先级
   * @param id 队列项ID
   * @param priority 新的优先级值
   */
  updatePriority(id: string, priority: number): Promise<void>;

  /**
   * 获取队列长度
   * @returns 队列中的项目数量
   */
  getQueueLength(): number;

  /**
   * 检查队列是否为空
   * @returns 队列是否为空
   */
  isQueueEmpty(): boolean;
}

/**
 * 持久化队列接口
 * 定义队列的持久化能力
 */
export interface PersistentQueue extends QueueManager {
  /**
   * 持久化队列到存储
   */
  persistQueue(): Promise<void>;

  /**
   * 从存储恢复队列
   */
  restoreQueue(): Promise<void>;

  /**
   * 清除持久化存储
   */
  clearPersistentStorage(): Promise<void>;
}

/**
 * 队列项序列化接口
 * 用于队列项的持久化存储
 */
export interface SerializedQueueItem {
  // 保留QueueItem的所有属性，除了file
  id: string;
  fileInfo: {
    name: string;
    size: number;
    type: string;
    lastModified: number;
  };
  metadata: QueueItemMetadata;
  status: QueueItemStatus;
  progress: number;
  error: QueueItemError | null;
  retries: number;
  result: any | null;
}

/**
 * 队列模块接口
 */
export interface QueueModule {
  /**
   * 添加项目到队列
   * @param item 队列项
   */
  add(item: QueueItem): Promise<string>;

  /**
   * 更新队列项
   * @param id 队列项ID
   * @param updates 更新内容
   */
  update(id: string, updates: Partial<QueueItem>): Promise<boolean>;

  /**
   * 移除队列项
   * @param id 队列项ID
   */
  remove(id: string): Promise<boolean>;

  /**
   * 获取队列项
   * @param id 队列项ID
   */
  get(id: string): QueueItem | undefined;

  /**
   * 获取所有队列项
   */
  getAll(): QueueItem[];

  /**
   * 获取队列状态
   */
  getState(): any;
}
