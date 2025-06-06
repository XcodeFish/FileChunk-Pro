import { IStorageOptions, StorageStats } from '../../types/storage';
import { IKernel, IModule } from '../../core/interfaces';

/**
 * 存储引擎接口，定义统一的存储操作方法
 */
export abstract class StorageEngine implements IModule {
  /**
   * 初始化存储引擎
   */
  async init(_kernel: IKernel): Promise<void> {
    // 基类默认实现，子类可以覆盖
  }

  /**
   * 保存数据
   * @param key 键
   * @param data 要保存的数据
   */
  abstract save<T>(key: string, data: T): Promise<void>;

  /**
   * 获取数据
   * @param key 键
   * @returns 存储的数据，不存在时返回null
   */
  abstract get<T>(key: string): Promise<T | null>;

  /**
   * 移除数据
   * @param key 键
   */
  abstract remove(key: string): Promise<void>;

  /**
   * 清除所有数据
   */
  abstract clear(): Promise<void>;

  /**
   * 检查键是否存在
   * @param key 键
   * @returns 是否存在
   */
  abstract exists(key: string): Promise<boolean>;
}

/**
 * 基础存储引擎实现
 * 提供通用功能的默认实现
 */
export abstract class BaseStorageEngine implements StorageEngine {
  protected options: IStorageOptions;

  constructor(options: IStorageOptions = {}) {
    this.options = {
      prefix: 'filechunk-pro:',
      maxStorageSize: 100 * 1024 * 1024, // 默认100MB
      cleanupThreshold: 0.8,
      autoCleanup: true,
      ...options
    };
  }

  /**
   * 初始化存储引擎
   */
  async init(_kernel: IKernel): Promise<void> {
    // 由子类实现
    return Promise.resolve();
  }

  /**
   * 保存数据
   * @param key 键名
   * @param data 要存储的数据
   */
  abstract save<T>(key: string, data: T): Promise<void>;

  /**
   * 获取数据
   * @param key 键名
   */
  abstract get<T>(key: string): Promise<T | null>;

  /**
   * 删除数据
   * @param key 键名
   */
  abstract remove(key: string): Promise<void>;

  /**
   * 清空所有数据
   */
  abstract clear(): Promise<void>;

  /**
   * 检查键是否存在
   * @param key 键名
   */
  abstract exists(key: string): Promise<boolean>;

  /**
   * 获取存储状态
   */
  async getStats(): Promise<StorageStats> {
    // 默认返回空统计，子类应实现自己的统计方法
    return {
      keys: [],
      currentSize: 0,
      limitSize: this.options.maxStorageSize || 0,
      items: 0,
      lastCleanup: 0,
      usagePercentage: 0
    };
  }

  /**
   * 序列化数据
   * @param data 要序列化的数据
   */
  protected serialize(data: any): string {
    if (data === undefined) return '';
    return typeof data === 'object' ? JSON.stringify(data) : String(data);
  }

  /**
   * 反序列化数据
   * @param data 要反序列化的数据
   */
  protected deserialize(data: string): any {
    if (!data) return null;

    if (data === 'undefined') return undefined;
    if (data === 'null') return null;

    try {
      // 检查是否是JSON对象或数组
      if (
        (data.startsWith('{') && data.endsWith('}')) ||
        (data.startsWith('[') && data.endsWith(']'))
      ) {
        return JSON.parse(data);
      }
    } catch {
      // 解析错误，返回原始字符串
    }

    return data;
  }
}
