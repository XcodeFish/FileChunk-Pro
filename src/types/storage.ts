/**
 * 存储配置选项接口
 */
export interface IStorageOptions {
  /** 存储键前缀 */
  prefix?: string;
  /** 存储大小上限(字节) */
  maxStorageSize?: number;
  /** 清理阈值(0-1之间) */
  cleanupThreshold?: number;
  /** 缓存清理策略 */
  cleanupStrategy?: CacheCleanupStrategy;
  /** 是否自动清理 */
  autoCleanup?: boolean;
  /** 过期时间(毫秒) */
  defaultTTL?: number;
}

/**
 * 缓存清理策略枚举
 */
export enum CacheCleanupStrategy {
  /** 最近最少使用 */
  LRU = 'lru',
  /** 最不常使用 */
  LFU = 'lfu',
  /** 先进先出 */
  FIFO = 'fifo',
  /** 过期优先 */
  EXPIRE = 'expire',
  /** 大小优先 */
  SIZE = 'size',
  /** 优先级 */
  PRIORITY = 'priority'
}

/**
 * 存储项元数据
 */
export interface StorageItem {
  /** 存储键 */
  key: string;
  /** 数据大小(字节) */
  size: number;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后修改时间戳 */
  lastModified: number;
  /** 最后访问时间戳 */
  lastAccessed: number;
  /** 访问次数 */
  accessCount: number;
  /** 过期时间戳 */
  expireAt?: number;
  /** 优先级(越高越不容易被清理) */
  priority?: number;
  /** 是否使用分块存储(仅用于IndexedDB大文件存储) */
  isChunked?: boolean;
}

/**
 * 存储统计信息
 */
export interface StorageStats {
  /** 存储中的键名列表 */
  keys: string[];
  /** 当前使用的存储大小(字节) */
  currentSize: number;
  /** 存储大小限制(字节) */
  limitSize: number;
  /** 存储项数量 */
  items: number;
  /** 上次清理时间戳 */
  lastCleanup: number;
  /** 使用百分比(0-100) */
  usagePercentage: number;
}
