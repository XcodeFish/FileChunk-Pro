import { FileChunk } from './interfaces';

/**
 * 分片迭代器选项
 */
export interface ChunkIteratorOptions {
  /**
   * 是否启用惰性加载
   */
  lazyLoad?: boolean;

  /**
   * 启用缓存
   */
  enableCache?: boolean;

  /**
   * 最大缓存项数
   */
  maxCacheSize?: number;
}

/**
 * 分片迭代器类
 *
 * 用于内存优化的分片处理，支持顺序访问和随机访问
 */
export class ChunkIterator {
  /**
   * 所有分片
   */
  private chunks: FileChunk[] = [];

  /**
   * 当前索引
   */
  private currentIndex: number = 0;

  /**
   * 总分片数
   */
  private totalChunks: number = 0;

  /**
   * 已访问的分片集合
   */
  private visitedChunks = new Set<number>();

  /**
   * 惰性加载功能标志
   */
  private lazyLoad: boolean;

  /**
   * 分片数据缓存
   */
  private chunkCache: Map<number, FileChunk> = new Map();

  /**
   * 缓存是否启用
   */
  private cacheEnabled: boolean;

  /**
   * 最大缓存项数
   */
  private maxCacheSize: number;

  /**
   * 构造函数
   *
   * @param chunks 文件分片数组
   * @param options 迭代器选项
   */
  constructor(chunks: FileChunk[], options: ChunkIteratorOptions = {}) {
    this.chunks = chunks;
    this.totalChunks = chunks.length;
    this.lazyLoad = options.lazyLoad !== undefined ? options.lazyLoad : false;
    this.cacheEnabled = options.enableCache !== undefined ? options.enableCache : true;
    this.maxCacheSize = options.maxCacheSize || 10;
  }

  /**
   * 获取下一个分片
   *
   * @returns 下一个分片或null（如果已结束）
   */
  next(): FileChunk | null {
    if (this.currentIndex >= this.totalChunks) {
      return null;
    }

    const chunk = this.getChunkAt(this.currentIndex);
    this.visitedChunks.add(this.currentIndex);
    this.currentIndex++;

    return chunk;
  }

  /**
   * 检查是否有下一个分片
   *
   * @returns 是否有下一个分片
   */
  hasNext(): boolean {
    return this.currentIndex < this.totalChunks;
  }

  /**
   * 重置迭代器
   */
  reset(): void {
    this.currentIndex = 0;
    this.visitedChunks.clear();
    if (!this.cacheEnabled) {
      this.chunkCache.clear();
    }
  }

  /**
   * 获取指定索引的分片
   *
   * @param index 分片索引
   * @returns 指定位置的分片或null（如果索引越界）
   */
  getChunkAt(index: number): FileChunk | null {
    if (index < 0 || index >= this.totalChunks) {
      return null;
    }

    // 如果启用了缓存，先检查缓存
    if (this.cacheEnabled && this.chunkCache.has(index)) {
      return this.chunkCache.get(index)!;
    }

    const chunk = this.chunks[index];

    // 如果启用了缓存，将分片添加到缓存
    if (this.cacheEnabled) {
      // 管理缓存大小
      if (this.chunkCache.size >= this.maxCacheSize) {
        // 简单的LRU策略：移除第一个键值对
        const firstKey = this.chunkCache.keys().next().value;
        if (firstKey) {
          this.chunkCache.delete(firstKey);
        }
      }

      this.chunkCache.set(index, chunk);
    }

    return chunk;
  }

  /**
   * 跳转到指定位置
   *
   * @param index 目标索引
   * @returns 是否跳转成功
   */
  jumpTo(index: number): boolean {
    if (index < 0 || index >= this.totalChunks) {
      return false;
    }

    this.currentIndex = index;
    return true;
  }

  /**
   * 获取剩余的未访问分片
   *
   * @returns 未访问的分片数组
   */
  getRemainingChunks(): FileChunk[] {
    const remaining: FileChunk[] = [];

    for (let i = this.currentIndex; i < this.totalChunks; i++) {
      const chunk = this.getChunkAt(i);
      if (chunk) {
        remaining.push(chunk);
      }
    }

    return remaining;
  }

  /**
   * 获取总分片数
   *
   * @returns 总分片数
   */
  getTotalChunks(): number {
    return this.totalChunks;
  }

  /**
   * 获取当前索引
   *
   * @returns 当前索引
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * 获取已访问的分片索引集合
   *
   * @returns 已访问的分片索引集合
   */
  getVisitedChunks(): Set<number> {
    return new Set(this.visitedChunks);
  }

  /**
   * 获取剩余分片数量
   *
   * @returns 剩余分片数量
   */
  getRemainingCount(): number {
    return this.totalChunks - this.currentIndex;
  }

  /**
   * 获取未访问的分片索引
   *
   * @returns 未访问的分片索引数组
   */
  getUnvisitedChunkIndices(): number[] {
    const unvisited: number[] = [];

    for (let i = 0; i < this.totalChunks; i++) {
      if (!this.visitedChunks.has(i)) {
        unvisited.push(i);
      }
    }

    return unvisited;
  }

  /**
   * 获取所有分片
   *
   * @returns 所有分片的浅拷贝
   */
  getAllChunks(): FileChunk[] {
    return [...this.chunks];
  }

  /**
   * 从已上传的分片集合中恢复状态
   * 用于断点续传场景
   *
   * @param uploadedChunks 已上传的分片索引集合
   */
  recoverFromUploaded(uploadedChunks: Set<number>): void {
    this.visitedChunks = new Set(uploadedChunks);

    // 寻找第一个未上传的分片索引
    for (let i = 0; i < this.totalChunks; i++) {
      if (!uploadedChunks.has(i)) {
        this.currentIndex = i;
        return;
      }
    }

    // 所有分片都已上传
    this.currentIndex = this.totalChunks;
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.chunkCache.clear();
  }
}
