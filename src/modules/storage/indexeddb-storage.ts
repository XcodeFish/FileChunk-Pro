import { BaseStorageEngine, StorageEngine } from './storage-engine';
import {
  IStorageOptions,
  StorageItem,
  StorageStats,
  CacheCleanupStrategy
} from '../../types/storage';

/**
 * IndexedDB存储引擎实现
 * 提供浏览器环境下的持久化存储能力，支持大文件分块存储和高效检索
 */
export class IndexedDBStorage extends BaseStorageEngine implements StorageEngine {
  private db: IDBDatabase | null = null;
  private dbName: string;
  private storeName: string = 'fileData'; // 主存储对象
  private metadataStore: string = 'metadata'; // 元数据存储对象
  private chunkStore: string = 'chunks'; // 文件块存储对象
  private dbVersion: number = 1;
  private initPromise: Promise<void> | null = null;

  /**
   * 构造IndexedDB存储引擎
   */
  constructor(options: IStorageOptions = {}) {
    super(options);
    this.dbName = `${this.options.prefix || 'filechunk-pro'}-storage`;
  }

  /**
   * 初始化存储引擎
   */
  override async init(): Promise<void> {
    // 使用单例模式确保数据库只被初始化一次
    if (!this.initPromise) {
      this.initPromise = this.initDatabase();
    }
    return this.initPromise;
  }

  /**
   * 初始化IndexedDB数据库
   * 创建所需的对象存储和索引
   */
  private async initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        return reject(new Error('浏览器不支持IndexedDB'));
      }

      // 打开数据库连接
      const request = window.indexedDB.open(this.dbName, this.dbVersion);

      // 数据库升级事件 - 在版本变更时创建/更新对象存储和索引
      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建主存储对象（如果不存在）
        if (!db.objectStoreNames.contains(this.storeName)) {
          const mainStore = db.createObjectStore(this.storeName, { keyPath: 'key' });
          // 创建用于快速查找的索引
          mainStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
          mainStore.createIndex('size', 'size', { unique: false });
          mainStore.createIndex('expireAt', 'expireAt', { unique: false });
        }

        // 创建元数据存储（如果不存在）
        if (!db.objectStoreNames.contains(this.metadataStore)) {
          db.createObjectStore(this.metadataStore, { keyPath: 'key' });
        }

        // 创建文件块存储（如果不存在）
        if (!db.objectStoreNames.contains(this.chunkStore)) {
          const chunkStore = db.createObjectStore(this.chunkStore, { keyPath: 'id' });
          // 创建用于快速定位文件块的索引
          chunkStore.createIndex('fileKey', 'fileKey', { unique: false });
          chunkStore.createIndex('sequence', 'sequence', { unique: false });
        }

        console.log(`IndexedDB数据库 ${this.dbName} 已创建/升级到版本 ${this.dbVersion}`);
      };

      // 成功打开数据库
      request.onsuccess = (event: Event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        console.log(`IndexedDB数据库 ${this.dbName} 已成功打开`);

        // 注册数据库事件
        this.db.onerror = event => {
          console.error('IndexedDB错误:', (event.target as any).errorCode);
        };

        // 检查存储空间使用情况
        this.checkAndCleanupIfNeeded()
          .then(() => resolve())
          .catch(err => {
            console.warn('初始清理检查失败:', err);
            resolve(); // 即使清理失败也继续，不阻塞初始化
          });
      };

      // 打开数据库失败
      request.onerror = (event: Event) => {
        console.error('无法打开数据库:', (event.target as IDBOpenDBRequest).error);
        reject(
          new Error(
            `打开IndexedDB失败: ${(event.target as IDBOpenDBRequest).error?.message || '未知错误'}`
          )
        );
      };

      // 数据库被阻塞
      request.onblocked = () => {
        console.warn('IndexedDB操作被阻塞，可能有其他连接未关闭');
        reject(new Error('IndexedDB操作被阻塞'));
      };
    });
  }

  /**
   * 创建事务
   * @param storeNames 需要访问的存储对象名称
   * @param mode 事务模式
   */
  private createTransaction(
    storeNames: string | string[],
    mode: IDBTransactionMode = 'readonly'
  ): IDBTransaction {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    try {
      return this.db.transaction(storeNames, mode);
    } catch (error) {
      console.error('创建事务失败:', error);
      throw new Error('创建事务失败');
    }
  }

  /**
   * 保存数据到存储
   */
  async save(key: string, data: any): Promise<void> {
    await this.init();

    // 确定数据大小和是否需要分块存储
    const serializedData = this.serialize(data);
    const dataSize = this.getDataSize(serializedData);

    // 超过1MB的数据使用分块存储优化
    const largeFileThreshold = 1024 * 1024; // 1MB
    const useChunks = dataSize > largeFileThreshold;

    try {
      // 如果启用自动清理，检查存储使用情况
      if (this.options.autoCleanup && dataSize > largeFileThreshold / 2) {
        await this.checkAndCleanupIfNeeded();
      }

      if (useChunks) {
        // 使用分块存储大型数据
        await this.saveLargeData(key, serializedData);
      } else {
        // 直接存储小型数据
        await this.saveDirectData(key, serializedData, dataSize);
      }

      return Promise.resolve();
    } catch (error) {
      console.error('保存数据失败:', error);
      return Promise.reject(
        new Error(`保存失败: ${error instanceof Error ? error.message : String(error)}`)
      );
    }
  }

  /**
   * 直接保存小型数据（不分块）
   */
  private saveDirectData(key: string, data: string, size: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.createTransaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        // 检查是否已有相同键的记录
        const getRequest = store.get(key);

        getRequest.onsuccess = event => {
          const existing = (event.target as IDBRequest).result;
          const now = Date.now();

          const storageItem: StorageItem & { data: string } = {
            key,
            size,
            data,
            createdAt: existing ? existing.createdAt : now,
            lastModified: now,
            lastAccessed: now,
            accessCount: existing ? existing.accessCount + 1 : 1,
            priority: existing?.priority || 0,
            isChunked: false
          };

          const putRequest = store.put(storageItem);

          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error('存储数据失败'));
        };

        getRequest.onerror = () => reject(new Error('获取现有记录失败'));

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('事务失败'));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 分块保存大型数据
   */
  private async saveLargeData(key: string, data: string): Promise<void> {
    try {
      // 首先清理可能存在的旧块
      await this.removeChunks(key);

      // 将数据分块
      const chunks = this.chunkData(data);
      const chunkSize = chunks[0]?.length || 0;
      const totalSize = data.length;

      // 创建事务保存所有块和元数据
      const transaction = this.createTransaction([this.storeName, this.chunkStore], 'readwrite');
      const mainStore = transaction.objectStore(this.storeName);
      const chunkStore = transaction.objectStore(this.chunkStore);

      // 保存每个块
      chunks.forEach((chunk, index) => {
        const chunkId = `${key}_chunk_${index}`;
        chunkStore.put({
          id: chunkId,
          fileKey: key,
          sequence: index,
          data: chunk,
          totalChunks: chunks.length
        });
      });

      // 保存主记录（不含完整数据）
      const now = Date.now();
      const mainRecord: StorageItem & { totalChunks: number; chunkSize: number } = {
        key,
        size: totalSize,
        createdAt: now,
        lastModified: now,
        lastAccessed: now,
        accessCount: 1,
        isChunked: true,
        totalChunks: chunks.length,
        chunkSize
      };

      const request = mainStore.put(mainRecord);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('保存分块数据主记录失败'));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('分块数据事务失败'));
      });
    } catch (error) {
      console.error('保存大文件失败:', error);
      throw error;
    }
  }

  /**
   * 将数据分块
   */
  private chunkData(data: string): string[] {
    // 默认分块大小：500KB
    const chunkSize = 512 * 1024;
    const chunks: string[] = [];

    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.substring(i, i + chunkSize));
    }

    return chunks;
  }

  /**
   * 获取存储的数据
   */
  async get(key: string): Promise<any> {
    await this.init();

    try {
      // 先获取主记录
      const mainRecord = await this.getMainRecord(key);

      if (!mainRecord) return null;

      // 更新访问时间
      this.updateAccessMetadata(key).catch(console.warn);

      // 检查是否为分块存储
      if (mainRecord.isChunked) {
        // 获取并组装所有块
        const data = await this.getChunkedData(key, mainRecord.totalChunks);
        return this.deserialize(data);
      } else {
        // 直接返回数据
        return this.deserialize(mainRecord.data);
      }
    } catch (error) {
      console.error('获取数据失败:', error);
      return null;
    }
  }

  /**
   * 获取主记录
   */
  private getMainRecord(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.createTransaction(this.storeName);
        const store = transaction.objectStore(this.storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('获取主记录失败'));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 获取分块存储的数据
   */
  private async getChunkedData(key: string, totalChunks: number): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.createTransaction(this.chunkStore);
        const store = transaction.objectStore(this.chunkStore);
        const index = store.index('fileKey');
        const request = index.getAll(key);

        request.onsuccess = () => {
          const chunks = request.result;

          // 验证是否获取了所有块
          if (chunks.length !== totalChunks) {
            return reject(new Error(`数据块不完整: 预期 ${totalChunks}, 实际 ${chunks.length}`));
          }

          // 按序列号排序
          chunks.sort((a, b) => a.sequence - b.sequence);

          // 组装数据
          const fullData = chunks.map(chunk => chunk.data).join('');
          resolve(fullData);
        };

        request.onerror = () => reject(new Error('获取数据块失败'));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 更新数据访问元数据
   */
  private async updateAccessMetadata(key: string): Promise<void> {
    try {
      const transaction = this.createTransaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      // 获取当前记录
      const getRequest = store.get(key);

      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (!record) return;

        // 更新访问时间和次数
        record.lastAccessed = Date.now();
        record.accessCount = (record.accessCount || 0) + 1;

        // 保存更新后的记录
        store.put(record);
      };
    } catch (error) {
      console.warn('更新访问元数据失败:', error);
    }
  }

  /**
   * 删除指定数据
   */
  async remove(key: string): Promise<void> {
    await this.init();

    try {
      // 先检查数据是否是分块存储
      const mainRecord = await this.getMainRecord(key);

      if (mainRecord?.isChunked) {
        // 删除所有块
        await this.removeChunks(key);
      }

      // 删除主记录
      return new Promise((resolve, reject) => {
        const transaction = this.createTransaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('删除数据失败'));
      });
    } catch (error) {
      console.error('删除数据失败:', error);
      throw error;
    }
  }

  /**
   * 删除文件块
   */
  private async removeChunks(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.createTransaction(this.chunkStore, 'readwrite');
        const store = transaction.objectStore(this.chunkStore);
        const index = store.index('fileKey');
        const request = index.getAll(key);

        request.onsuccess = () => {
          const chunks = request.result;

          // 删除每个块
          chunks.forEach(chunk => {
            store.delete(chunk.id);
          });
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('删除数据块失败'));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 清空所有存储
   */
  async clear(): Promise<void> {
    await this.init();

    try {
      // 清空所有存储对象
      return new Promise((resolve, reject) => {
        const transaction = this.createTransaction(
          [this.storeName, this.chunkStore, this.metadataStore],
          'readwrite'
        );

        // 清空主存储
        transaction.objectStore(this.storeName).clear();

        // 清空块存储
        transaction.objectStore(this.chunkStore).clear();

        // 清空元数据存储
        transaction.objectStore(this.metadataStore).clear();

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('清空存储失败'));
      });
    } catch (error) {
      console.error('清空存储失败:', error);
      throw error;
    }
  }

  /**
   * 获取存储状态统计
   */
  override async getStats(): Promise<StorageStats> {
    await this.init();

    try {
      // 获取所有记录
      const records = await this.getAllStorageRecords();

      // 获取元数据记录
      const metadata = await this.getMetadata();

      // 计算总大小
      const currentSize = records.reduce((sum, item) => sum + item.size, 0);

      // 估算IndexedDB的存储限制（大多数浏览器为50-200MB，这里保守估计为50MB）
      const limitSize =
        navigator.storage && navigator.storage.estimate
          ? (await navigator.storage.estimate()).quota || 50 * 1024 * 1024
          : 50 * 1024 * 1024;

      // 计算使用百分比
      const usagePercentage = limitSize ? (currentSize / limitSize) * 100 : 0;

      return {
        keys: records.map(record => record.key),
        currentSize,
        limitSize,
        items: records.length,
        lastCleanup: metadata.lastCleanup || 0,
        usagePercentage
      };
    } catch (error) {
      console.error('获取存储统计信息失败:', error);

      // 返回默认空统计
      return {
        keys: [],
        currentSize: 0,
        limitSize: this.options.maxStorageSize || 0,
        items: 0,
        lastCleanup: 0,
        usagePercentage: 0
      };
    }
  }

  /**
   * 获取所有存储记录
   */
  private async getAllStorageRecords(): Promise<StorageItem[]> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.createTransaction(this.storeName);
        const store = transaction.objectStore(this.storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          // 过滤掉非元数据字段
          const records = request.result.map(item => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { data, isChunked, totalChunks, chunkSize, ...metadata } = item;
            return metadata as StorageItem;
          });

          resolve(records);
        };

        request.onerror = () => reject(new Error('获取所有记录失败'));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 获取元数据
   */
  private async getMetadata(): Promise<{
    lastCleanup: number;
    version: string;
  }> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.createTransaction(this.metadataStore);
        const store = transaction.objectStore(this.metadataStore);
        const request = store.get('metadata');

        request.onsuccess = () => {
          const metadata = request.result || { lastCleanup: 0, version: '1.0' };
          resolve(metadata);
        };

        request.onerror = () => reject(new Error('获取元数据失败'));
      } catch {
        resolve({ lastCleanup: 0, version: '1.0' });
      }
    });
  }

  /**
   * 设置元数据
   */
  private async setMetadata(metadata: { lastCleanup: number; version: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.createTransaction(this.metadataStore, 'readwrite');
        const store = transaction.objectStore(this.metadataStore);

        const putRequest = store.put({ ...metadata, key: 'metadata' });

        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(new Error('保存元数据失败'));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 设置数据项过期时间
   */
  async setExpiry(key: string, ttlMs: number): Promise<void> {
    await this.init();

    try {
      const transaction = this.createTransaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      // 获取当前记录
      const getRequest = store.get(key);

      return new Promise((resolve, reject) => {
        getRequest.onsuccess = () => {
          const record = getRequest.result;
          if (!record) {
            return reject(new Error('记录不存在'));
          }

          // 设置过期时间
          record.expireAt = Date.now() + ttlMs;

          // 更新记录
          const putRequest = store.put(record);

          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error('设置过期时间失败'));
        };

        getRequest.onerror = () => reject(new Error('获取记录失败'));
      });
    } catch (error) {
      console.error('设置过期时间失败:', error);
      throw error;
    }
  }

  /**
   * 设置数据项优先级
   */
  async setPriority(key: string, priority: number): Promise<void> {
    await this.init();

    try {
      const transaction = this.createTransaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      // 获取当前记录
      const getRequest = store.get(key);

      return new Promise((resolve, reject) => {
        getRequest.onsuccess = () => {
          const record = getRequest.result;
          if (!record) {
            return reject(new Error('记录不存在'));
          }

          // 设置优先级
          record.priority = priority;

          // 更新记录
          const putRequest = store.put(record);

          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error('设置优先级失败'));
        };

        getRequest.onerror = () => reject(new Error('获取记录失败'));
      });
    } catch (error) {
      console.error('设置优先级失败:', error);
      throw error;
    }
  }

  /**
   * 检查并在需要时清理缓存
   */
  async checkAndCleanupIfNeeded(): Promise<boolean> {
    try {
      // 获取存储统计
      const stats = await this.getStats();

      // 首先清理已过期的项目
      const expiredCount = await this.cleanupExpired();

      // 检查是否达到清理阈值
      if (stats.usagePercentage >= (this.options.cleanupThreshold || 0.8) * 100) {
        await this.cleanup();
        return true;
      }

      return expiredCount > 0;
    } catch (error) {
      console.warn('检查存储状态失败:', error);
      return false;
    }
  }

  /**
   * 清理所有过期项
   */
  async cleanupExpired(): Promise<number> {
    await this.init();

    try {
      const transaction = this.createTransaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('expireAt');
      const now = Date.now();

      // 获取所有已过期的项
      const request = index.openCursor(IDBKeyRange.upperBound(now));
      const expiredKeys: string[] = [];

      await new Promise<void>(resolve => {
        request.onsuccess = event => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            expiredKeys.push(cursor.value.key);
            cursor.continue();
          } else {
            resolve();
          }
        };

        request.onerror = () => resolve();
      });

      // 删除所有过期项
      let deletedCount = 0;
      for (const key of expiredKeys) {
        try {
          await this.remove(key);
          deletedCount++;
        } catch (err) {
          console.warn(`删除过期项失败: ${key}`, err);
        }
      }

      return deletedCount;
    } catch (error) {
      console.warn('清理过期项失败:', error);
      return 0;
    }
  }

  /**
   * 强制执行缓存清理
   */
  async cleanup(targetPercentage: number = 0.5): Promise<void> {
    await this.init();

    try {
      // 获取存储统计和清理策略
      const stats = await this.getStats();
      const cleanupStrategy = this.options.cleanupStrategy || CacheCleanupStrategy.LRU;

      // 计算需要释放的空间
      const currentBytes = stats.currentSize;
      const targetBytes = stats.limitSize * targetPercentage;
      const bytesToFree = Math.max(0, currentBytes - targetBytes);

      if (bytesToFree <= 0) {
        return;
      }

      // 获取所有记录
      const records = await this.getAllStorageRecords();

      if (records.length === 0) {
        return;
      }

      // 根据清理策略排序
      let sortedItems = [...records];
      const now = Date.now();

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
          // 过期时间优先
          sortedItems = sortedItems
            .filter(item => item.expireAt && item.expireAt < now)
            .sort((a, b) => (a.expireAt || Infinity) - (b.expireAt || Infinity));

          // 如果没有过期项，按过期时间从近到远排序
          if (sortedItems.length === 0) {
            sortedItems = [...records].sort((a, b) => {
              const aExpire = a.expireAt || Infinity;
              const bExpire = b.expireAt || Infinity;
              return aExpire - bExpire;
            });
          }
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

      // 执行清理
      let freedBytes = 0;
      const deletedKeys = [];

      for (const item of sortedItems) {
        if (freedBytes >= bytesToFree) break;

        try {
          await this.remove(item.key);
          freedBytes += item.size;
          deletedKeys.push(item.key);
        } catch (error) {
          console.warn(`清理缓存项失败: ${item.key}`, error);
        }
      }

      // 更新最后清理时间
      const metadata = await this.getMetadata();
      metadata.lastCleanup = Date.now();
      await this.setMetadata(metadata);

      console.log(`缓存清理完成: 释放 ${freedBytes} 字节, 删除 ${deletedKeys.length} 项`);
    } catch (error) {
      console.error('缓存清理失败:', error);
      throw error;
    }
  }

  /**
   * 数据库版本迁移
   * 将数据库升级到新版本，并执行必要的迁移操作
   */
  async migrateDatabase(newVersion: number): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    if (this.db && this.db.version >= newVersion) {
      console.log(`数据库已是最新版本: ${this.db.version}`);
      return;
    }

    // 关闭现有连接
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(this.dbName, newVersion);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        // 根据版本号执行迁移
        this.performMigration(db, oldVersion, newVersion);
      };

      request.onsuccess = (event: Event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.dbVersion = newVersion;
        console.log(`数据库已升级到版本 ${newVersion}`);
        resolve();
      };

      request.onerror = (event: Event) => {
        console.error('数据库升级失败:', (event.target as IDBOpenDBRequest).error);
        reject(new Error(`数据库升级失败: ${(event.target as IDBOpenDBRequest).error?.message}`));
      };

      request.onblocked = () => {
        console.warn('数据库升级被阻塞，请关闭所有其他标签页');
        reject(new Error('数据库升级被阻塞'));
      };
    });
  }

  /**
   * 执行数据库迁移操作
   */
  private performMigration(db: IDBDatabase, oldVersion: number, newVersion: number): void {
    // 版本2：添加优先级和过期索引
    if (oldVersion < 2 && newVersion >= 2) {
      if (db.objectStoreNames.contains(this.storeName)) {
        const store = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName);

        // 检查并添加优先级索引
        if (!store.indexNames.contains('priority')) {
          store.createIndex('priority', 'priority', { unique: false });
        }
      }
    }

    // 版本3：添加大文件块存储优化
    if (oldVersion < 3 && newVersion >= 3) {
      if (!db.objectStoreNames.contains(this.chunkStore)) {
        const chunkStore = db.createObjectStore(this.chunkStore, { keyPath: 'id' });
        chunkStore.createIndex('fileKey', 'fileKey', { unique: false });
        chunkStore.createIndex('sequence', 'sequence', { unique: false });
      }
    }

    console.log(`执行数据库迁移: ${oldVersion} -> ${newVersion}`);
  }

  /**
   * 获取数据大小（字节）
   */
  private getDataSize(data: string): number {
    // 估算字符串大小（粗略估计，UTF-16编码每个字符2字节）
    return data.length * 2;
  }

  /**
   * 检测存储空间限额和使用情况
   */
  async checkStorageQuota(): Promise<{
    quota: number;
    usage: number;
    usagePercentage: number;
    remaining: number;
  }> {
    try {
      // 使用新的Storage API（如果可用）
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();

        return {
          quota: estimate.quota || 0,
          usage: estimate.usage || 0,
          usagePercentage: estimate.quota ? ((estimate.usage || 0) / estimate.quota) * 100 : 0,
          remaining: estimate.quota ? estimate.quota - (estimate.usage || 0) : 0
        };
      }

      // 降级方式 - 使用已保存数据估算
      const stats = await this.getStats();
      return {
        quota: stats.limitSize,
        usage: stats.currentSize,
        usagePercentage: stats.usagePercentage,
        remaining: stats.limitSize - stats.currentSize
      };
    } catch (error) {
      console.error('检测存储空间失败:', error);
      return {
        quota: 0,
        usage: 0,
        usagePercentage: 0,
        remaining: 0
      };
    }
  }

  /**
   * 释放资源
   */
  async dispose(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
