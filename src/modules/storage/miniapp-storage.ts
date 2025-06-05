import { BaseStorageEngine, StorageEngine } from './storage-engine';
import {
  IStorageOptions,
  StorageItem,
  StorageStats,
  CacheCleanupStrategy
} from '../../types/storage';

// 声明小程序全局对象
declare const wx: any;
declare const my: any;
declare const tt: any;
declare const swan: any;

/**
 * 小程序存储引擎实现
 * 提供适配小程序环境的存储能力，并解决存储限制问题
 */
export class MiniappStorage extends BaseStorageEngine implements StorageEngine {
  private metadataKey: string;
  private storageApi: any;
  private fsApi: any;
  private temporaryFilePath: string = '';
  private storageLimit: number = 0; // 存储限制大小缓存
  private lastStorageCheck: number = 0; // 最后一次存储检查时间

  /**
   * 构造小程序存储引擎
   */
  constructor(options: IStorageOptions = {}) {
    super(options);
    this.metadataKey = `${this.options.prefix}metadata`;

    // 初始化API引用
    this.initApi();
  }

  /**
   * 初始化平台相关API
   */
  private initApi(): void {
    // 检测小程序环境并获取对应API
    if (typeof wx !== 'undefined') {
      this.storageApi = wx;
      this.fsApi = wx.getFileSystemManager();
      this.temporaryFilePath = wx.env ? wx.env.USER_DATA_PATH : '';
    } else if (typeof my !== 'undefined') {
      // 支付宝小程序
      this.storageApi = my;
      this.fsApi = my.getFileSystemManager();
      this.temporaryFilePath = ''; // 支付宝小程序需要另外处理
    } else if (typeof tt !== 'undefined') {
      // 字节小程序
      this.storageApi = tt;
      this.fsApi = tt.getFileSystemManager();
      this.temporaryFilePath = tt.env ? tt.env.USER_DATA_PATH : '';
    } else if (typeof swan !== 'undefined') {
      // 百度小程序
      this.storageApi = swan;
      this.fsApi = swan.getFileSystemManager();
      this.temporaryFilePath = swan.env ? swan.env.USER_DATA_PATH : '';
    } else {
      // 默认实现，可能需要在运行时根据具体环境再初始化
      this.storageApi = {
        setStorage: () => Promise.reject(new Error('未识别的小程序环境')),
        getStorage: () => Promise.reject(new Error('未识别的小程序环境')),
        removeStorage: () => Promise.reject(new Error('未识别的小程序环境')),
        getStorageInfo: () => Promise.reject(new Error('未识别的小程序环境')),
        clearStorage: () => Promise.reject(new Error('未识别的小程序环境'))
      };
    }
  }

  /**
   * 初始化存储引擎
   */
  async init(): Promise<void> {
    try {
      // 检查并初始化元数据
      await this.initMetadata();

      // 获取存储限制信息
      const stats = await this.getStats();
      this.storageLimit = stats.limitSize;

      // 如果启用自动清理，检查存储使用情况
      if (this.options.autoCleanup) {
        // 清理过期项
        await this.cleanupExpired();

        // 如果存储接近上限，执行常规清理
        await this.checkAndCleanupIfNeeded();

        // 清理临时文件
        await this.cleanupTemporaryFiles();
      }

      return Promise.resolve();
    } catch (err: unknown) {
      console.warn('小程序存储初始化失败:', err);
      return Promise.resolve(); // 即使失败也继续，避免阻塞主流程
    }
  }

  /**
   * 初始化或读取元数据
   */
  private async initMetadata(): Promise<void> {
    try {
      await this.getMetadata();
    } catch {
      // 元数据不存在，创建初始元数据
      const initialMetadata = {
        items: [],
        lastCleanup: Date.now(),
        version: '1.0'
      };

      await this.saveRaw(this.metadataKey, initialMetadata);
    }
  }

  /**
   * 保存数据到存储
   */
  async save(key: string, data: any): Promise<void> {
    const fullKey = this.getFullKey(key);

    try {
      // 检查存储空间（最多10秒检查一次，避免频繁检查影响性能）
      const now = Date.now();
      if (this.options.autoCleanup && now - this.lastStorageCheck > 10000) {
        this.lastStorageCheck = now;
        await this.checkAndCleanupIfNeeded();
      }

      // 序列化数据
      const value = this.serialize(data);

      // 保存数据
      await this.saveRaw(fullKey, value);

      // 更新元数据
      await this.updateMetadataForKey(key, value.length);

      return Promise.resolve();
    } catch (err: any) {
      return Promise.reject(new Error(`保存失败: ${err.message}`));
    }
  }

  /**
   * 直接保存原始数据，不处理元数据
   */
  private async saveRaw(fullKey: string, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storageApi.setStorage({
        key: fullKey,
        data: value,
        success: resolve,
        fail: (err: any) => reject(new Error(err.errMsg || '保存失败'))
      });
    });
  }

  /**
   * 获取存储的数据
   */
  async get(key: string): Promise<any> {
    const fullKey = this.getFullKey(key);

    return new Promise<any>(resolve => {
      this.storageApi.getStorage({
        key: fullKey,
        success: (res: any) => {
          try {
            // 更新访问时间
            this.updateAccessTime(key).catch(console.warn);

            // 返回反序列化的数据
            resolve(this.deserialize(res.data));
          } catch {
            resolve(res.data);
          }
        },
        fail: () => resolve(null) // 不存在则返回null
      });
    });
  }

  /**
   * 删除指定数据
   */
  async remove(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);

    return new Promise((resolve, reject) => {
      this.storageApi.removeStorage({
        key: fullKey,
        success: async () => {
          // 从元数据中移除
          await this.removeFromMetadata(key).catch(console.warn);
          resolve();
        },
        fail: (err: any) => reject(new Error(err.errMsg || '删除失败'))
      });
    });
  }

  /**
   * 清空所有存储
   */
  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storageApi.clearStorage({
        success: resolve,
        fail: (err: any) => reject(new Error(err.errMsg || '清空存储失败'))
      });
    });
  }

  /**
   * 获取存储状态统计
   */
  override async getStats(): Promise<StorageStats> {
    return new Promise((resolve, reject) => {
      this.storageApi.getStorageInfo({
        success: async (res: any) => {
          const metadata = await this.getMetadata();
          const currentSize = res.currentSize || 0;
          const limitSize = res.limitSize || this.options.maxStorageSize || 0;
          const usagePercentage = limitSize ? (currentSize / limitSize) * 100 : 0;

          resolve({
            keys: res.keys || [],
            currentSize,
            limitSize,
            items: metadata.items.length,
            lastCleanup: metadata.lastCleanup,
            usagePercentage
          });
        },
        fail: (err: any) => reject(new Error(err.errMsg || '获取存储信息失败'))
      });
    });
  }

  /**
   * 检查并在需要时清理缓存
   */
  async checkAndCleanupIfNeeded(): Promise<boolean> {
    try {
      const stats = await this.getStats();

      // 检查是否达到清理阈值
      if (stats.usagePercentage >= (this.options.cleanupThreshold || 0.8) * 100) {
        await this.cleanup();
        return true;
      }

      return false;
    } catch (err: unknown) {
      console.warn('检查存储状态失败:', err);
      return false;
    }
  }

  /**
   * 强制执行缓存清理
   */
  async cleanup(targetPercentage: number = 0.5): Promise<void> {
    try {
      // 获取元数据
      const metadata = await this.getMetadata();
      const stats = await this.getStats();

      if (metadata.items.length === 0) {
        return;
      }

      // 目标是降低到指定百分比
      const currentBytes = stats.currentSize;
      const targetBytes = stats.limitSize * targetPercentage;
      const bytesToFree = Math.max(0, currentBytes - targetBytes);

      if (bytesToFree <= 0) {
        return;
      }

      // 根据清理策略对元数据排序
      let sortedItems = [...metadata.items];
      const cleanupStrategy = this.options.cleanupStrategy || CacheCleanupStrategy.LRU;

      // 过期时间优先的处理，提前声明变量
      const now = Date.now();

      // 首先过滤已过期的项目
      const expiredItems = sortedItems.filter(item => item.expireAt && item.expireAt < now);

      // 如果有过期项目，优先清理它们
      if (expiredItems.length > 0) {
        sortedItems = expiredItems;
      } else {
        // 没有过期项目，根据策略排序
        switch (cleanupStrategy) {
          case CacheCleanupStrategy.LRU:
            // 最近最少使用
            sortedItems.sort((a, b) => a.lastAccessed - b.lastAccessed);
            break;
          case CacheCleanupStrategy.LFU:
            // 最不常使用
            sortedItems.sort((a, b) => a.accessCount - b.accessCount);
            break;
          case CacheCleanupStrategy.FIFO:
            // 先进先出
            sortedItems.sort((a, b) => a.createdAt - b.createdAt);
            break;
          case CacheCleanupStrategy.EXPIRE:
            // 过期时间优先但没有过期项，按过期时间从近到远排序
            sortedItems.sort((a, b) => {
              const aExpire = a.expireAt || Infinity;
              const bExpire = b.expireAt || Infinity;
              return aExpire - bExpire;
            });
            break;
          case CacheCleanupStrategy.SIZE:
            // 大小优先，先删除大文件
            sortedItems.sort((a, b) => b.size - a.size);
            break;
          case CacheCleanupStrategy.PRIORITY:
            // 优先级，低优先级先删除
            sortedItems.sort((a, b) => (a.priority || 0) - (b.priority || 0));
            break;
        }
      }

      // 执行清理
      let freedBytes = 0;
      const deletedKeys = [];

      // 智能清理：考虑文件大小和优先级的综合因素
      if (cleanupStrategy === CacheCleanupStrategy.PRIORITY) {
        // 按优先级分组
        const priorityGroups: { [key: number]: StorageItem[] } = {};
        sortedItems.forEach(item => {
          const priority = item.priority || 0;
          if (!priorityGroups[priority]) {
            priorityGroups[priority] = [];
          }
          priorityGroups[priority].push(item);
        });

        // 按优先级从低到高清理
        const priorities = Object.keys(priorityGroups)
          .map(Number)
          .sort((a, b) => a - b);

        for (const priority of priorities) {
          // 在同一优先级内，按LRU策略清理
          const itemsInPriority = priorityGroups[priority].sort(
            (a, b) => a.lastAccessed - b.lastAccessed
          );

          for (const item of itemsInPriority) {
            if (freedBytes >= bytesToFree) break;

            try {
              await this.remove(item.key);
              freedBytes += item.size;
              deletedKeys.push(item.key);
            } catch (err: unknown) {
              console.warn(`清理缓存项失败: ${item.key}`, err);
            }
          }

          if (freedBytes >= bytesToFree) break;
        }
      } else {
        // 常规清理方法
        for (const item of sortedItems) {
          if (freedBytes >= bytesToFree) break;

          try {
            await this.remove(item.key);
            freedBytes += item.size;
            deletedKeys.push(item.key);
          } catch (err: unknown) {
            console.warn(`清理缓存项失败: ${item.key}`, err);
          }
        }
      }

      // 更新最后清理时间
      const updatedMetadata = await this.getMetadata();
      updatedMetadata.lastCleanup = Date.now();
      await this.saveRaw(this.metadataKey, updatedMetadata);

      console.log(`缓存清理完成: 释放 ${freedBytes} 字节, 删除 ${deletedKeys.length} 项`);
    } catch (err: unknown) {
      console.error('缓存清理失败:', err);
      throw err;
    }
  }

  /**
   * 清理临时文件
   */
  async cleanupTemporaryFiles(): Promise<void> {
    try {
      if (!this.fsApi || !this.temporaryFilePath) {
        return;
      }

      // 读取临时目录文件
      const readDir = (): Promise<string[]> => {
        return new Promise((resolve, reject) => {
          this.fsApi.readdir({
            dirPath: this.temporaryFilePath,
            success: (res: any) => resolve(res.files || []),
            fail: reject
          });
        });
      };

      // 获取文件状态
      const getStat = (filePath: string): Promise<any> => {
        return new Promise((resolve, reject) => {
          this.fsApi.stat({
            path: `${this.temporaryFilePath}/${filePath}`,
            success: (res: any) => resolve(res.stats || res.stat),
            fail: reject
          });
        });
      };

      // 删除文件
      const removeFile = (filePath: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          this.fsApi.unlink({
            filePath: `${this.temporaryFilePath}/${filePath}`,
            success: () => resolve(),
            fail: reject
          });
        });
      };

      // 读取所有文件
      const files = await readDir();

      // 只处理上传相关临时文件
      const uploadTempFiles = files.filter(
        file =>
          file.startsWith('upload_temp_') || file.startsWith('chunk_') || file.includes('.tmp')
      );

      // 文件信息类型
      interface FileInfo {
        name: string;
        mtime: Date;
        size: number;
      }

      // 获取文件信息并按修改时间排序
      const fileStatsPromises = uploadTempFiles.map(async (file): Promise<FileInfo | null> => {
        try {
          const stat = await getStat(file);
          return {
            name: file,
            mtime: stat.mtime || new Date(0),
            size: stat.size || 0
          };
        } catch {
          return null;
        }
      });

      const fileStats = await Promise.all(fileStatsPromises);

      // 过滤掉获取信息失败的文件并按修改时间排序
      const validFiles = fileStats
        .filter((file): file is FileInfo => file !== null)
        .sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

      // 删除超过24小时的临时文件
      const now = new Date();
      const oneDayMs = 24 * 60 * 60 * 1000;
      let deletedCount = 0;
      let freedBytes = 0;

      for (const file of validFiles) {
        if (now.getTime() - file.mtime.getTime() > oneDayMs) {
          try {
            await removeFile(file.name);
            deletedCount++;
            freedBytes += file.size;
          } catch (err) {
            console.warn(`删除临时文件失败: ${file.name}`, err);
          }
        }
      }

      console.log(`临时文件清理完成: 删除 ${deletedCount} 文件, 释放 ${freedBytes} 字节`);
    } catch (err) {
      console.warn('清理临时文件失败:', err);
    }
  }

  /**
   * 设置数据项过期时间
   */
  async setExpiry(key: string, ttlMs: number): Promise<void> {
    try {
      const metadata = await this.getMetadata();
      const item = metadata.items.find(item => item.key === key);

      if (item) {
        item.expireAt = Date.now() + ttlMs;
        await this.saveRaw(this.metadataKey, metadata);
      }
    } catch (err) {
      console.warn(`设置过期时间失败: ${key}`, err);
    }
  }

  /**
   * 设置数据项优先级
   * 优先级越高，清理时越后删除
   */
  async setPriority(key: string, priority: number): Promise<void> {
    try {
      const metadata = await this.getMetadata();
      const item = metadata.items.find(item => item.key === key);

      if (item) {
        item.priority = priority;
        await this.saveRaw(this.metadataKey, metadata);
      }
    } catch (err) {
      console.warn(`设置优先级失败: ${key}`, err);
    }
  }

  /**
   * 清理所有过期项
   */
  async cleanupExpired(): Promise<number> {
    try {
      const metadata = await this.getMetadata();
      const now = Date.now();

      const expiredItems = metadata.items.filter(item => item.expireAt && item.expireAt < now);

      let deletedCount = 0;

      for (const item of expiredItems) {
        try {
          await this.remove(item.key);
          deletedCount++;
        } catch (err) {
          console.warn(`删除过期项失败: ${item.key}`, err);
        }
      }

      return deletedCount;
    } catch (err) {
      console.warn('清理过期项失败:', err);
      return 0;
    }
  }

  /**
   * 获取存储元数据
   */
  private async getMetadata(): Promise<{
    items: StorageItem[];
    lastCleanup: number;
    version: string;
  }> {
    try {
      const result = await new Promise<any>((resolve, reject) => {
        this.storageApi.getStorage({
          key: this.metadataKey,
          success: (res: any) => {
            try {
              const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
              resolve(data);
            } catch {
              reject(new Error('元数据解析失败'));
            }
          },
          fail: reject
        });
      });

      return result;
    } catch {
      // 初始元数据
      return {
        items: [],
        lastCleanup: Date.now(),
        version: '1.0'
      };
    }
  }

  /**
   * 更新指定键的元数据
   */
  private async updateMetadataForKey(key: string, size: number): Promise<void> {
    try {
      const metadata = await this.getMetadata();
      const now = Date.now();

      // 查找是否已存在
      const existingIndex = metadata.items.findIndex(item => item.key === key);

      if (existingIndex >= 0) {
        // 更新现有项
        metadata.items[existingIndex] = {
          ...metadata.items[existingIndex],
          size,
          lastModified: now,
          lastAccessed: now,
          accessCount: metadata.items[existingIndex].accessCount + 1
        };
      } else {
        // 添加新项
        metadata.items.push({
          key,
          size,
          createdAt: now,
          lastModified: now,
          lastAccessed: now,
          accessCount: 1,
          priority: 0
        });
      }

      // 保存元数据
      await this.saveRaw(this.metadataKey, metadata);
    } catch (err) {
      console.warn('更新元数据失败:', err);
    }
  }

  /**
   * 更新访问时间和计数
   */
  private async updateAccessTime(key: string): Promise<void> {
    try {
      const metadata = await this.getMetadata();
      const itemIndex = metadata.items.findIndex(item => item.key === key);

      if (itemIndex >= 0) {
        metadata.items[itemIndex].lastAccessed = Date.now();
        metadata.items[itemIndex].accessCount += 1;
        await this.saveRaw(this.metadataKey, metadata);
      }
    } catch (err) {
      console.warn('更新访问时间失败:', err);
    }
  }

  /**
   * 从元数据中移除项
   */
  private async removeFromMetadata(key: string): Promise<void> {
    try {
      const metadata = await this.getMetadata();
      metadata.items = metadata.items.filter(item => item.key !== key);
      await this.saveRaw(this.metadataKey, metadata);
    } catch (err) {
      console.warn('从元数据移除失败:', err);
    }
  }

  /**
   * 获取完整的键名
   */
  private getFullKey(key: string): string {
    return `${this.options.prefix}${key}`;
  }

  /**
   * 获取指定大小范围的所有数据项
   * @param minSize 最小大小(字节)
   * @param maxSize 最大大小(字节)
   */
  async getItemsBySize(minSize: number = 0, maxSize: number = Infinity): Promise<StorageItem[]> {
    try {
      const metadata = await this.getMetadata();
      return metadata.items.filter(item => item.size >= minSize && item.size <= maxSize);
    } catch (err) {
      console.warn('获取数据项失败:', err);
      return [];
    }
  }

  /**
   * 获取指定时间范围内的所有数据项
   * @param fromTime 起始时间戳
   * @param toTime 结束时间戳
   */
  async getItemsByTime(fromTime: number, toTime: number = Date.now()): Promise<StorageItem[]> {
    try {
      const metadata = await this.getMetadata();
      return metadata.items.filter(item => item.createdAt >= fromTime && item.createdAt <= toTime);
    } catch (err) {
      console.warn('获取数据项失败:', err);
      return [];
    }
  }

  /**
   * 智能清理：结合多种策略进行清理
   * @param targetPercentage 目标使用百分比
   */
  async smartCleanup(targetPercentage: number = 0.5): Promise<void> {
    try {
      // 获取元数据和存储统计
      const metadata = await this.getMetadata();
      const stats = await this.getStats();

      if (metadata.items.length === 0) return;

      // 计算需要释放的空间
      const currentBytes = stats.currentSize;
      const targetBytes = stats.limitSize * targetPercentage;
      const bytesToFree = Math.max(0, currentBytes - targetBytes);

      if (bytesToFree <= 0) return;

      // 综合评分系统 - 根据多个因素为每个项目计算清理分数
      // 分数越高越优先被清理
      const scoredItems = metadata.items.map(item => {
        // 基础分数计算因子
        const now = Date.now();
        const ageScore = (now - item.createdAt) / (24 * 60 * 60 * 1000); // 每天1分
        const accessScore = Math.max(0, 10 - item.accessCount); // 访问越少分越高，最高10分
        const sizeScore = item.size / (1024 * 1024); // 每MB 1分
        const timeScore = (now - item.lastAccessed) / (60 * 60 * 1000); // 每小时1分

        // 优先级分数（优先级越高，分数越低）
        const priorityScore = Math.max(0, 10 - (item.priority || 0) * 2);

        // 过期项目得分最高
        const expiryScore = item.expireAt && item.expireAt < now ? 1000 : 0;

        // 总分
        const totalScore =
          expiryScore + // 过期项目最高优先级
          sizeScore * 3 + // 大文件权重高
          timeScore * 2 + // 长时间未访问权重高
          ageScore + // 旧文件权重中等
          accessScore + // 低访问次数权重中等
          priorityScore * 5; // 优先级影响很大

        return {
          ...item,
          score: totalScore
        };
      });

      // 按分数降序排序
      scoredItems.sort((a, b) => b.score - a.score);

      // 执行清理
      let freedBytes = 0;
      const deletedKeys = [];

      for (const item of scoredItems) {
        if (freedBytes >= bytesToFree) break;

        try {
          await this.remove(item.key);
          freedBytes += item.size;
          deletedKeys.push(item.key);
        } catch (err: unknown) {
          console.warn(`清理缓存项失败: ${item.key}`, err);
        }
      }

      // 更新最后清理时间
      const updatedMetadata = await this.getMetadata();
      updatedMetadata.lastCleanup = Date.now();
      await this.saveRaw(this.metadataKey, updatedMetadata);

      console.log(`智能缓存清理完成: 释放 ${freedBytes} 字节, 删除 ${deletedKeys.length} 项`);
    } catch (err: unknown) {
      console.error('智能缓存清理失败:', err);
      throw err;
    }
  }
}
