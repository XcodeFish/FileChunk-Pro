import { Kernel } from '../../core/kernel';
import { Module } from '../../core/module-base';
import { AdaptiveCompressionStrategy } from './compression-strategies';

/**
 * 压缩优先级配置文件类型
 */
export type CompressionProfile =
  | 'speed'
  | 'balanced'
  | 'compression'
  | 'maximum-compression'
  | 'custom';

export interface CompressionOptions {
  enabled: boolean;
  minSize: number; // 最小压缩大小（字节）
  defaultCompressionLevel: number; // 默认压缩级别 (1-9)
  adaptiveCompression: boolean; // 是否启用自适应压缩
  maxCompressionLevel: number; // 最大压缩级别
  minCompressionLevel: number; // 最小压缩级别
  mimeTypesToCompress: string[]; // 要压缩的MIME类型列表
  compressionThreshold: number; // MB/s，低于此网速时使用较高压缩级别
  devicePerformanceWeight: number; // 设备性能对压缩级别的影响权重(0-1)
  adaptiveThreshold: number; // 最小压缩比例，低于此值使用较低压缩级别
  learningRate: number; // 自适应学习率(0-1)
  useCompressionStream: boolean; // 是否使用CompressionStream API
  profileType: CompressionProfile; // 压缩配置文件类型
}

export class CompressionManager implements Module {
  private options: CompressionOptions;
  private kernel!: Kernel; // 使用非空断言操作符，因为会在init方法中初始化
  private adaptiveStrategy: AdaptiveCompressionStrategy;
  private compressionStats: Map<string, CompressionStat>; // 压缩统计信息，按文件类型分类
  private devicePerformanceScore: number = 0.5; // 设备性能得分(0-1)，默认中等
  private isPerformanceMeasured: boolean = false; // 是否已测量设备性能
  private _lastCustomOptions: Partial<CompressionOptions> | null = null;

  constructor(options: Partial<CompressionOptions> = {}) {
    this.options = {
      enabled: true,
      minSize: 50 * 1024, // 最小50KB才压缩
      defaultCompressionLevel: 6, // 默认压缩级别(1-9)
      adaptiveCompression: true, // 默认启用自适应压缩
      maxCompressionLevel: 9,
      minCompressionLevel: 1,
      compressionThreshold: 1, // 1MB/s
      devicePerformanceWeight: 0.3,
      adaptiveThreshold: 0.1, // 10%的压缩率
      learningRate: 0.2, // 学习率
      useCompressionStream: true, // 默认使用CompressionStream API
      mimeTypesToCompress: [
        'text/plain',
        'text/html',
        'text/css',
        'text/javascript',
        'application/javascript',
        'application/json',
        'application/xml',
        'application/x-javascript',
        'image/svg+xml',
        'application/wasm'
      ],
      profileType: 'custom',
      ...options
    };

    this.compressionStats = new Map();
    this.adaptiveStrategy = new AdaptiveCompressionStrategy();
    this.measureDevicePerformance();
  }

  init(kernel: Kernel): void {
    this.kernel = kernel;

    // 注册压缩相关事件
    this.kernel.on('networkSpeedMeasured', (speed: number) => {
      this.adaptiveStrategy.updateNetworkSpeed(speed);
    });

    // 监听设备状态变化事件（如电池状态、节能模式）
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      this.monitorBatteryStatus();
    }

    // 监听设备性能变化
    this.setupPerformanceMonitoring();
  }

  /**
   * 监控电池状态，在低电量时降低压缩级别
   */
  private async monitorBatteryStatus(): Promise<void> {
    try {
      // @ts-expect-error - 标准API但TypeScript可能没有类型定义
      const battery = await navigator.getBattery();

      const updateBatteryStatus = () => {
        // 低电量时降低性能压力
        if (battery.level < 0.2 && !battery.charging) {
          this.devicePerformanceScore = Math.max(0.1, this.devicePerformanceScore - 0.2);
        } else if (battery.charging) {
          // 充电时可以恢复性能评分
          this.devicePerformanceScore = Math.min(1, this.devicePerformanceScore + 0.1);
        }
      };

      // 初次检查
      updateBatteryStatus();

      // 监听电池状态变化
      battery.addEventListener('levelchange', updateBatteryStatus);
      battery.addEventListener('chargingchange', updateBatteryStatus);
    } catch (e) {
      console.log('无法访问电池状态API:', e);
    }
  }

  /**
   * 设置性能监控
   */
  private setupPerformanceMonitoring(): void {
    // 使用PerformanceObserver监控系统负载
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver(list => {
          const entries = list.getEntries();
          // 分析近期性能数据，调整设备性能评分
          if (entries.length > 0) {
            const recentEntry = entries[entries.length - 1];
            if ('duration' in recentEntry && recentEntry.duration > 100) {
              // 长时间阻塞任务表明设备负载高
              this.devicePerformanceScore = Math.max(0.1, this.devicePerformanceScore - 0.05);
            }
          }
        });

        observer.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        console.log('性能监控初始化失败:', e);
      }
    }
  }

  // 是否应该压缩
  shouldCompress(file: File): boolean {
    if (!this.options.enabled) return false;

    // 文件太小不压缩
    if (file.size < this.options.minSize) return false;

    // 检查MIME类型
    if (this.options.mimeTypesToCompress.includes(file.type)) return true;

    // 智能检测可能受益于压缩的文本类型文件
    if (file.type.startsWith('text/') || this.isPossiblyTextFile(file.name)) {
      return true;
    }

    // 一些文件类型已经是压缩格式，不需要再压缩
    const compressedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'audio/mp3',
      'audio/ogg',
      'video/mp4',
      'video/webm',
      'application/zip',
      'application/gzip',
      'application/x-rar-compressed',
      'application/pdf'
    ];

    return !compressedTypes.includes(file.type);
  }

  /**
   * 检测可能是文本文件但MIME类型未正确识别的情况
   */
  private isPossiblyTextFile(filename: string): boolean {
    const textExtensions = [
      '.txt',
      '.md',
      '.csv',
      '.log',
      '.ini',
      '.conf',
      '.sh',
      '.bash',
      '.yml',
      '.yaml',
      '.toml',
      '.json5',
      '.ts',
      '.jsx',
      '.tsx',
      '.vue',
      '.svelte',
      '.php',
      '.py',
      '.rb',
      '.go',
      '.java',
      '.c',
      '.cpp',
      '.h',
      '.cs',
      '.swift',
      '.kt',
      '.rs',
      '.lua',
      '.sql'
    ];

    return textExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  /**
   * 自适应压缩级别调整核心方法
   * 根据文件类型、大小、历史压缩统计和网络状况动态调整压缩级别
   */
  getOptimalCompressionLevel(file: File): number {
    const fileType = this.getFileTypeCategory(file);
    const fileSize = file.size;

    // 基本压缩级别
    let compressionLevel = this.options.defaultCompressionLevel;

    // 如果启用自适应压缩
    if (this.options.adaptiveCompression) {
      try {
        // 如果未测量设备性能，先进行测量
        if (!this.isPerformanceMeasured) {
          this.measureDevicePerformance().catch(err => {
            console.warn('设备性能测量失败:', err);
          });
          this.isPerformanceMeasured = true;
        }

        // 同步性能评分到策略类
        this.adaptiveStrategy.updateDevicePerformance(this.devicePerformanceScore);

        // 使用自适应策略确定压缩级别
        const adaptiveLevel = this.adaptiveStrategy.getIdealCompressionLevel(fileType, fileSize);

        // 调整为1到9的整数范围
        const adjustedLevel = Math.max(
          this.options.minCompressionLevel,
          Math.min(this.options.maxCompressionLevel, Math.round(adaptiveLevel))
        );

        compressionLevel = adjustedLevel;

        // 尝试进行内容采样分析进一步优化
        compressionLevel = this.adjustByContentSampling(file, compressionLevel);

        console.log(
          `文件 ${file.name} (${fileType}, ${fileSize}字节) 最优压缩级别: ${compressionLevel}`
        );
      } catch (error) {
        console.warn('自适应压缩级别计算错误，使用默认级别', error);
        // 出错时使用基于文件类型的默认级别
        compressionLevel = this.getFileTypeCompressionLevel(fileType, compressionLevel);
      }
    } else {
      // 不使用自适应压缩时，仍根据文件类型设置不同级别
      compressionLevel = this.getFileTypeCompressionLevel(fileType, compressionLevel);
    }

    return compressionLevel;
  }

  /**
   * 通过文件内容采样进一步优化压缩级别
   * 适用于大文件，通过采样少量内容分析其可压缩性
   */
  private adjustByContentSampling(file: File, baseLevel: number): number {
    // 仅对大文件执行采样分析
    if (file.size < 1024 * 1024) {
      return baseLevel;
    }

    // 从文件历史统计中查找相同类型文件的压缩结果
    const fileType = this.getFileTypeCategory(file);
    const stats = this.compressionStats.get(fileType);

    if (stats && stats.compressionCount > 5) {
      // 有足够历史数据时，使用历史最优级别
      let bestLevel = baseLevel;
      let bestRatio = 0;

      for (const [level, levelStats] of stats.optimalLevelHistory.entries()) {
        if (levelStats.count > 2 && levelStats.averageRatio > bestRatio) {
          bestRatio = levelStats.averageRatio;
          bestLevel = level;
        }
      }

      // 将历史最优级别与当前计算级别融合（加权平均）
      return baseLevel * 0.7 + bestLevel * 0.3;
    }

    return baseLevel;
  }

  /**
   * 根据文件类型返回基准压缩级别
   */
  private getFileTypeCompressionLevel(fileType: string, baseLevel: number): number {
    // 不同文件类型有不同的压缩特性
    switch (fileType) {
      case 'text':
        // 文本文件压缩效果好，可以用较高级别
        return baseLevel + 2;
      case 'code':
        // 代码文件通常压缩效果很好
        return baseLevel + 2.5;
      case 'xml':
        // XML/HTML等结构化文本压缩效果极佳
        return baseLevel + 3;
      case 'json':
        // JSON数据压缩效果好
        return baseLevel + 2;
      case 'image':
        // 非压缩图像适合中等压缩级别
        return baseLevel;
      case 'document':
        // 文档类型适合较高压缩级别
        return baseLevel + 1;
      case 'binary':
        // 二进制文件压缩效果差，降低级别以提高速度
        return baseLevel - 2;
      case 'unknown':
      default:
        return baseLevel;
    }
  }

  /**
   * 根据文件大小调整压缩级别
   * 较大文件使用较低压缩级别以提高速度
   */
  private adjustCompressionLevelBySize(size: number, baseLevel: number): number {
    const fileSizeMB = size / (1024 * 1024);

    if (fileSizeMB > 500) {
      // 超大文件，大幅降低压缩级别提高速度
      return baseLevel - 3;
    } else if (fileSizeMB > 100) {
      // 超大文件，降低压缩级别提高速度
      return baseLevel - 2;
    } else if (fileSizeMB > 10) {
      // 大文件，略微降低压缩级别
      return baseLevel - 1;
    } else if (fileSizeMB < 0.5) {
      // 很小的文件，可以用更高压缩级别
      return baseLevel + 1.5;
    } else if (fileSizeMB < 1) {
      // 小文件，可以用更高压缩级别
      return baseLevel + 1;
    }

    return baseLevel;
  }

  /**
   * 根据网络速度调整压缩级别
   * 慢网络使用更高压缩级别
   */
  private adjustCompressionLevelByNetwork(baseLevel: number): number {
    const networkSpeed = this.adaptiveStrategy.getCurrentNetworkSpeed();
    const networkCondition = this.adaptiveStrategy.getNetworkCondition();

    // 网络速度单位: MB/s
    if (networkSpeed <= 0) {
      // 无法检测网络速度，使用默认级别
      return baseLevel;
    }

    switch (networkCondition) {
      case 'very-slow':
        // 网络极慢，最大程度压缩
        return baseLevel + 3;
      case 'slow':
        // 网速较慢，提高压缩级别减少传输数据量
        return baseLevel + 2;
      case 'medium':
        // 中等网速，轻微提高压缩级别
        return baseLevel + 0.5;
      case 'fast':
        // 网速较快，可以降低压缩级别
        return baseLevel - 1;
      case 'very-fast':
        // 网速极快，大幅降低压缩级别提高处理速度
        return baseLevel - 2;
      default:
        return baseLevel;
    }
  }

  /**
   * 根据设备性能调整压缩级别
   * 低性能设备使用较低压缩级别以减少CPU负担
   */
  private adjustCompressionLevelByDevicePerformance(baseLevel: number): number {
    // 确保设备性能已测量
    if (!this.isPerformanceMeasured) {
      return baseLevel;
    }

    // 设备性能评分越低，压缩级别越低
    if (this.devicePerformanceScore < 0.2) {
      // 极低性能设备，大幅降低压缩级别
      return baseLevel - Math.round(3 * this.options.devicePerformanceWeight);
    } else if (this.devicePerformanceScore < 0.4) {
      // 低性能设备
      return baseLevel - Math.round(2 * this.options.devicePerformanceWeight);
    } else if (this.devicePerformanceScore < 0.6) {
      // 中等性能设备，不调整
      return baseLevel;
    } else if (this.devicePerformanceScore < 0.8) {
      // 高性能设备
      return baseLevel + Math.round(1 * this.options.devicePerformanceWeight);
    } else {
      // 极高性能设备
      return baseLevel + Math.round(2 * this.options.devicePerformanceWeight);
    }
  }

  /**
   * 根据历史压缩统计调整压缩级别
   */
  private adjustCompressionLevelByStats(fileType: string, baseLevel: number): number {
    const stats = this.compressionStats.get(fileType);
    if (!stats || stats.compressionCount < 3) return baseLevel;

    // 如果历史数据足够，找出效果最好的压缩级别
    if (stats.optimalLevelHistory.size > 0) {
      let bestLevel = baseLevel;
      let bestRatio = 0;

      // 遍历历史记录，找出压缩比最好的级别
      for (const [level, levelStats] of stats.optimalLevelHistory.entries()) {
        if (levelStats.count >= 3) {
          // 需要足够样本
          const effectivenessScore = levelStats.averageRatio;
          if (effectivenessScore > bestRatio) {
            bestRatio = effectivenessScore;
            bestLevel = level;
          }
        }
      }

      if (bestRatio > 0) {
        // 使用学习率平滑过渡到历史最优级别
        return baseLevel * (1 - this.options.learningRate) + bestLevel * this.options.learningRate;
      }
    }

    // 如果平均压缩率低于阈值，降低压缩级别提高速度
    if (stats.averageCompressionRatio < this.options.adaptiveThreshold) {
      return baseLevel - 1;
    }

    // 如果压缩非常有效，考虑提高压缩级别
    if (stats.averageCompressionRatio > 0.5) {
      return baseLevel + 1;
    }

    return baseLevel;
  }

  /**
   * 记录压缩结果统计信息
   */
  recordCompressionStats(
    fileType: string,
    originalSize: number,
    compressedSize: number,
    compressionLevel: number,
    compressionTime: number
  ): void {
    const compressionRatio = 1 - compressedSize / originalSize;
    const compressionSpeed = originalSize / compressionTime; // bytes/ms

    let stats = this.compressionStats.get(fileType);
    if (!stats) {
      stats = {
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        compressionCount: 0,
        averageCompressionRatio: 0,
        averageCompressionSpeed: 0,
        optimalLevelHistory: new Map()
      };
      this.compressionStats.set(fileType, stats);
    }

    // 更新统计数据
    stats.totalOriginalSize += originalSize;
    stats.totalCompressedSize += compressedSize;
    stats.compressionCount++;
    stats.averageCompressionRatio = 1 - stats.totalCompressedSize / stats.totalOriginalSize;

    // 更新压缩速度（使用指数移动平均）
    stats.averageCompressionSpeed =
      (stats.averageCompressionSpeed * (stats.compressionCount - 1) + compressionSpeed) /
      stats.compressionCount;

    // 更新特定压缩级别的历史数据
    const levelStats = stats.optimalLevelHistory.get(compressionLevel) || {
      count: 0,
      totalRatio: 0,
      averageRatio: 0
    };

    levelStats.count++;
    levelStats.totalRatio += compressionRatio;
    levelStats.averageRatio = levelStats.totalRatio / levelStats.count;

    stats.optimalLevelHistory.set(compressionLevel, levelStats);

    // 日志记录
    if (stats.compressionCount % 10 === 0) {
      // 每10次记录一次日志，避免日志过多
      console.debug(
        `压缩统计(${fileType}): 平均压缩率=${(stats.averageCompressionRatio * 100).toFixed(1)}%, ` +
          `平均速度=${((stats.averageCompressionSpeed * 1000) / 1024 / 1024).toFixed(2)}MB/s`
      );
    }

    // 发送数据收集事件，用于分析和进一步优化
    if (this.kernel) {
      this.kernel.emit('compressionStatCollected', {
        fileType,
        originalSize,
        compressedSize,
        compressionRatio,
        compressionLevel,
        compressionTime,
        compressionSpeed
      });
    }

    // 将统计信息传递给策略类，用于全局优化
    this.adaptiveStrategy.recordCompressionResult(
      fileType,
      originalSize,
      compressedSize,
      compressionLevel,
      compressionTime
    );
  }

  /**
   * 测量当前设备的性能
   * 用于调整压缩级别
   */
  private async measureDevicePerformance(): Promise<void> {
    try {
      const startTime = performance.now();

      // 执行一些计算密集型操作来评估设备性能
      const testSize = 1000000;
      const testArray = new Uint8Array(testSize);
      for (let i = 0; i < testSize; i++) {
        testArray[i] = (i * 17) % 256;
      }

      // 计算简单的校验和
      let checksum = 0;
      for (let i = 0; i < testSize; i++) {
        checksum = (checksum + testArray[i]) % 65536;
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 基于持续时间计算性能得分
      // 持续时间越短，性能越好
      const referenceTime = 200; // 基准时间(ms)
      this.devicePerformanceScore = Math.min(1.0, referenceTime / duration);

      console.log(`设备性能评分: ${this.devicePerformanceScore.toFixed(2)}`);
    } catch (error) {
      console.warn('设备性能评估失败:', error);
      // 出错时使用默认中等性能值
      this.devicePerformanceScore = 0.5;
    }
  }

  /**
   * 根据MIME类型返回更一般的文件类别
   */
  private getFileTypeCategory(file: File): string {
    const mimeType = file.type.toLowerCase();

    if (
      mimeType.startsWith('text/') ||
      mimeType.includes('javascript') ||
      mimeType.includes('json') ||
      mimeType.includes('xml')
    ) {
      return 'text';
    }

    if (mimeType.startsWith('image/')) {
      if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) {
        return 'compressedImage';
      }
      return 'image';
    }

    if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
      return 'media';
    }

    if (
      mimeType.includes('pdf') ||
      mimeType.includes('document') ||
      mimeType.includes('spreadsheet')
    ) {
      return 'document';
    }

    if (mimeType.includes('zip') || mimeType.includes('gzip') || mimeType.includes('compressed')) {
      return 'compressed';
    }

    // 二进制文件或其他类型
    return 'binary';
  }

  // 压缩数据
  async compressData(
    data: ArrayBuffer | Uint8Array,
    file: File
  ): Promise<{
    data: ArrayBuffer;
    compressionLevel: number;
    originalSize: number;
    compressedSize: number;
    compressionTime: number;
  }> {
    // 确定最佳压缩级别
    const compressionLevel = this.getOptimalCompressionLevel(file);
    const originalSize = data.byteLength;
    const startTime = performance.now();

    // 使用CompressionStream API (现代浏览器)
    let compressedData: ArrayBuffer;
    if (typeof CompressionStream !== 'undefined') {
      compressedData = await this.compressWithStream(data, compressionLevel);
    } else {
      // 回退到pako
      compressedData = await this.compressWithPako(data, compressionLevel);
    }

    const endTime = performance.now();
    const compressionTime = endTime - startTime;

    // 记录压缩统计
    const fileType = this.getFileTypeCategory(file);
    this.recordCompressionStats(
      fileType,
      originalSize,
      compressedData.byteLength,
      compressionLevel,
      compressionTime
    );

    return {
      data: compressedData,
      compressionLevel,
      originalSize,
      compressedSize: compressedData.byteLength,
      compressionTime
    };
  }

  /**
   * 私有方法处理CompressionStream API的压缩
   */
  private async compressWithStream(
    data: ArrayBuffer | Uint8Array,
    _level: number
  ): Promise<ArrayBuffer> {
    try {
      const sourceData = data instanceof Uint8Array ? data : new Uint8Array(data);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(sourceData);
          controller.close();
        }
      });

      const cs = new CompressionStream('gzip');
      const compressedStream = stream.pipeThrough(cs);
      const reader = compressedStream.getReader();

      const chunks: Uint8Array[] = [];
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          chunks.push(value);
        }
      }

      // 合并所有压缩后的数据块
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      // 使用as关键字进行安全类型转换
      return result.buffer.slice(0) as ArrayBuffer;
    } catch (error) {
      console.error('CompressionStream压缩失败:', error);
      throw error;
    }
  }

  /**
   * 使用Pako库进行压缩处理，作为CompressionStream的降级方案
   */
  private async compressWithPako(
    data: ArrayBuffer | Uint8Array,
    level: number
  ): Promise<ArrayBuffer> {
    if (typeof window === 'undefined' || !window.pako) {
      throw new Error('Pako library is required for compression but not available');
    }

    const sourceData = data instanceof Uint8Array ? data : new Uint8Array(data);
    const result = window.pako.gzip(sourceData, { level });
    // 使用as关键字进行安全类型转换
    return result.buffer.slice(0) as ArrayBuffer;
  }

  /**
   * 数据解压缩
   * @param data 压缩后的数据
   */
  async decompressData(data: ArrayBuffer): Promise<ArrayBuffer> {
    // 使用DecompressionStream API (现代浏览器)
    if (typeof DecompressionStream !== 'undefined') {
      try {
        return await this.decompressWithStream(data);
      } catch (err) {
        console.warn('DecompressionStream失败，回退到pako:', err);
      }
    }

    // 降级方案：Pako库解压
    return await this.decompressWithPako(data);
  }

  /**
   * 使用DecompressionStream API解压
   */
  private async decompressWithStream(data: ArrayBuffer): Promise<ArrayBuffer> {
    const sourceData = new Uint8Array(data);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(sourceData);
        controller.close();
      }
    });

    const ds = new DecompressionStream('gzip');
    const decompressedStream = stream.pipeThrough(ds);
    const reader = decompressedStream.getReader();

    const chunks: Uint8Array[] = [];
    let done = false;

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        chunks.push(value);
      }
    }

    // 合并所有解压后的数据块
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer as ArrayBuffer;
  }

  /**
   * 使用Pako库解压缩数据
   */
  private async decompressWithPako(data: ArrayBuffer): Promise<ArrayBuffer> {
    if (typeof window === 'undefined' || !window.pako) {
      throw new Error('Pako library is required for decompression but not available');
    }

    const result = window.pako.ungzip(new Uint8Array(data));
    return result.buffer as ArrayBuffer;
  }

  /**
   * 预测文件压缩后的大致大小
   * 这对前端用户界面非常有用，可以在压缩前显示预期压缩效果
   * @param file 要预测的文件
   * @returns 预测的压缩后大小（字节）
   */
  async predictCompressedSize(file: File): Promise<number> {
    // 获取文件类型分类
    const fileType = this.getFileTypeCategory(file);

    // 获取最优压缩级别
    const compressionLevel = this.getOptimalCompressionLevel(file);

    // 如果文件很小，考虑直接压缩一个样本来提高准确性
    if (file.size < 100 * 1024) {
      // 文件小于100KB
      try {
        // 读取整个文件
        const buffer = await this.readFileAsArrayBuffer(file);

        // 计时
        const startTime = performance.now();

        // 压缩
        const result = await this.compressData(buffer, file);

        // 记录压缩统计数据
        this.recordCompressionStats(
          fileType,
          buffer.byteLength,
          result.data.byteLength,
          compressionLevel,
          performance.now() - startTime
        );

        // 返回实际压缩后大小
        return result.data.byteLength;
      } catch (err) {
        console.warn('预测压缩大小时出错:', err);
        // 出错时使用估算方法
      }
    }

    // 对于大文件，或者直接压缩尝试失败的情况，使用基于历史数据的预测
    let compressionRatio;

    // 尝试读取文件前一小部分进行内容分析
    if (file.size > 1024 && file.type.startsWith('text/')) {
      try {
        const sampleSize = Math.min(10 * 1024, file.size);
        const sample = file.slice(0, sampleSize);
        const sampleText = await this.readFileAsText(sample);

        // 分析内容可压缩性
        compressionRatio = this.adaptiveStrategy.analyzeContentCompressibility(sampleText);
      } catch (err) {
        console.warn('内容采样分析失败:', err);
      }
    }

    // 如果内容分析失败或不适用，使用基于文件类型的预测
    if (!compressionRatio) {
      compressionRatio = this.adaptiveStrategy.predictCompressionRatio(fileType);
    }

    // 计算并返回预测大小
    const predictedSize = Math.round(file.size * (1 - compressionRatio));

    // 确保预测值在合理范围内
    return Math.max(predictedSize, Math.round(file.size * 0.1)); // 压缩比不超过90%
  }

  /**
   * 读取文件为ArrayBuffer
   * @param file 要读取的文件
   * @returns Promise<ArrayBuffer>
   */
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 读取文件为文本
   * @param file 要读取的文件
   * @returns Promise<string>
   */
  private readFileAsText(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  /**
   * 设置压缩配置文件
   * 快速调整压缩选项，以优先考虑速度或压缩率
   * @param profile 配置文件类型
   * @param customOptions 当profile为'custom'时的自定义选项
   */
  setCompressionProfile(
    profile: CompressionProfile,
    customOptions?: Partial<CompressionOptions>
  ): void {
    // 保存当前自定义设置（如果是自定义模式）
    if (this.options.profileType === 'custom') {
      this._lastCustomOptions = { ...this.options };
    }

    // 创建新选项的基础（保留当前所有选项）
    const newOptions: CompressionOptions = { ...this.options };

    // 应用选定的配置文件
    switch (profile) {
      case 'speed':
        // 优先考虑速度，使用最低压缩级别
        Object.assign(newOptions, {
          defaultCompressionLevel: 1,
          minCompressionLevel: 1,
          maxCompressionLevel: 3,
          adaptiveCompression: true,
          compressionThreshold: 1, // 只有在网速非常差时才提高压缩级别
          devicePerformanceWeight: 0.8, // 设备性能影响更大
          adaptiveThreshold: 0.3, // 只有在压缩效果特别好的情况下才使用更高级别
          profileType: 'speed'
        });
        break;

      case 'balanced':
        // 平衡速度和压缩率
        Object.assign(newOptions, {
          defaultCompressionLevel: 5,
          minCompressionLevel: 3,
          maxCompressionLevel: 7,
          adaptiveCompression: true,
          compressionThreshold: 3,
          devicePerformanceWeight: 0.5,
          adaptiveThreshold: 0.2,
          profileType: 'balanced'
        });
        break;

      case 'compression':
        // 优先考虑压缩率
        Object.assign(newOptions, {
          defaultCompressionLevel: 7,
          minCompressionLevel: 5,
          maxCompressionLevel: 9,
          adaptiveCompression: true,
          compressionThreshold: 5,
          devicePerformanceWeight: 0.3,
          adaptiveThreshold: 0.1,
          profileType: 'compression'
        });
        break;

      case 'maximum-compression':
        // 最大压缩，不考虑性能影响
        Object.assign(newOptions, {
          defaultCompressionLevel: 9,
          minCompressionLevel: 7,
          maxCompressionLevel: 9,
          adaptiveCompression: false, // 直接使用最高压缩级别
          compressionThreshold: 10,
          devicePerformanceWeight: 0.1,
          adaptiveThreshold: 0,
          profileType: 'maximum-compression'
        });
        break;

      case 'custom':
        // 使用自定义设置
        if (customOptions) {
          Object.assign(newOptions, customOptions, { profileType: 'custom' });
        } else if (this._lastCustomOptions) {
          // 没有提供新的自定义选项，恢复上次的自定义设置
          Object.assign(newOptions, this._lastCustomOptions, { profileType: 'custom' });
        }
        break;
    }

    // 更新选项
    this.options = newOptions;

    // 触发配置文件变更事件
    if (this.kernel) {
      this.kernel.emit('compression:profile-changed', {
        profile,
        options: this.options
      });
    }

    console.log(`压缩配置文件已更改为: ${profile}`);
  }
}

// 压缩统计接口
interface CompressionStat {
  totalOriginalSize: number;
  totalCompressedSize: number;
  compressionCount: number;
  averageCompressionRatio: number;
  averageCompressionSpeed: number; // bytes/ms
  optimalLevelHistory: Map<number, { count: number; totalRatio: number; averageRatio: number }>;
}

// 为TypeScript声明Pako全局变量
declare global {
  interface Window {
    pako: {
      gzip(data: Uint8Array, options?: { level?: number }): Uint8Array;
      ungzip(data: Uint8Array): Uint8Array;
    };
  }
}
