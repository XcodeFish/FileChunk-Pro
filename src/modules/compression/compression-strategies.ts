/**
 * 自适应压缩策略类
 * 用于管理和决定文件压缩的最佳策略
 */
export class AdaptiveCompressionStrategy {
  private networkSpeed: number = 0; // MB/s
  private measurementCount: number = 0;
  private speedHistory: number[] = [];
  private readonly maxHistoryLength: number = 10;
  private compressionResults: Map<string, FileTypeCompressionStats> = new Map();
  private devicePerformanceScore: number = 0.5; // 设备性能评分
  private lastNetworkStateUpdate: number = Date.now();
  private networkStability: number = 1.0; // 1.0表示非常稳定，0表示不稳定
  private networkTrend: 'improving' | 'declining' | 'stable' = 'stable';

  constructor() {
    // 初始化，尝试从存储中恢复历史数据
    this.tryRestoreHistoricalData();
  }

  /**
   * 尝试从localStorage恢复历史压缩数据
   * 这有助于在多次会话中持续优化压缩策略
   */
  private tryRestoreHistoricalData(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const savedData = localStorage.getItem('compression-stats');
        if (savedData) {
          const parsed = JSON.parse(savedData);
          if (parsed && typeof parsed === 'object') {
            // 重建Map结构
            Object.entries(parsed).forEach(([fileType, stats]) => {
              this.compressionResults.set(fileType, stats as FileTypeCompressionStats);
            });
            console.debug('已从存储恢复压缩历史数据');
          }
        }
      }
    } catch (e) {
      console.warn('恢复压缩历史数据失败', e);
    }
  }

  /**
   * 保存历史压缩数据到localStorage
   */
  private saveHistoricalData(): void {
    try {
      if (typeof localStorage !== 'undefined' && this.compressionResults.size > 0) {
        // 将Map转换为普通对象以便序列化
        const dataToSave: Record<string, FileTypeCompressionStats> = {};

        this.compressionResults.forEach((stats, fileType) => {
          dataToSave[fileType] = stats;
        });

        localStorage.setItem('compression-stats', JSON.stringify(dataToSave));
      }
    } catch (e) {
      console.warn('保存压缩历史数据失败', e);
    }
  }

  /**
   * 更新设备性能评分
   * 与CompressionManager共享此评分，用于压缩决策
   */
  updateDevicePerformance(performanceScore: number): void {
    if (performanceScore >= 0 && performanceScore <= 1) {
      this.devicePerformanceScore = performanceScore;
    }
  }

  /**
   * 更新网络速度测量
   * @param bytesPerSecond 字节每秒的网络速度
   */
  updateNetworkSpeed(bytesPerSecond: number): void {
    // 转换为MB/s便于理解
    const speedInMBps = bytesPerSecond / (1024 * 1024);

    // 计算相对于上次测量的速度变化
    const now = Date.now();
    const timeDiff = (now - this.lastNetworkStateUpdate) / 1000; // 秒
    const previousSpeed = this.networkSpeed;
    this.lastNetworkStateUpdate = now;

    // 加入历史记录
    this.speedHistory.push(speedInMBps);
    if (this.speedHistory.length > this.maxHistoryLength) {
      this.speedHistory.shift(); // 保持历史记录在设定长度内
    }

    // 使用加权平均，新测量值权重为0.3
    if (this.measurementCount === 0) {
      this.networkSpeed = speedInMBps;
    } else {
      // 计算加权平均值，最近的测量值权重更大
      this.networkSpeed = this.networkSpeed * 0.7 + speedInMBps * 0.3;
    }
    this.measurementCount++;

    // 如果有足够的历史数据，分析网络稳定性和趋势
    if (this.speedHistory.length >= 3) {
      // 计算网络速度的标准差作为稳定性指标
      const mean = this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length;
      const variance =
        this.speedHistory.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / this.speedHistory.length;
      const stdDev = Math.sqrt(variance);

      // 网络稳定性 = 1.0 - 归一化的标准差
      // 值越接近1表示网络越稳定
      const normalizedStdDev = Math.min(stdDev / mean, 1.0);
      this.networkStability = 1.0 - normalizedStdDev;

      // 分析网络趋势
      if (timeDiff > 0 && previousSpeed > 0) {
        const changeRate = (this.networkSpeed - previousSpeed) / previousSpeed;

        // 如果速度变化超过一定阈值，更新趋势
        if (changeRate > 0.2) {
          this.networkTrend = 'improving';
        } else if (changeRate < -0.2) {
          this.networkTrend = 'declining';
        } else {
          this.networkTrend = 'stable';
        }
      }
    }
  }

  /**
   * 获取当前网络速度
   * @returns 当前网络速度 (MB/s)
   */
  getCurrentNetworkSpeed(): number {
    return this.networkSpeed;
  }

  /**
   * 获取网络状况详细信息
   * 包括速度、稳定性和趋势
   */
  getNetworkDetails(): NetworkDetails {
    return {
      speed: this.networkSpeed,
      stability: this.networkStability,
      trend: this.networkTrend,
      condition: this.getNetworkCondition()
    };
  }

  /**
   * 获取网络状况分类
   * 用于决策压缩策略
   */
  getNetworkCondition(): NetworkCondition {
    if (this.networkSpeed <= 0) {
      return 'unknown';
    } else if (this.networkSpeed < 0.5) {
      return 'very-slow';
    } else if (this.networkSpeed < 1) {
      return 'slow';
    } else if (this.networkSpeed < 5) {
      return 'medium';
    } else if (this.networkSpeed < 20) {
      return 'fast';
    } else {
      return 'very-fast';
    }
  }

  /**
   * 确定特定文件类型的理想压缩级别
   * @param fileType 文件类型
   * @param fileSize 文件大小（字节）
   * @returns 推荐的压缩级别(1-9)
   */
  getIdealCompressionLevel(fileType: string, fileSize: number): number {
    // 基于文件类型的基准压缩级别
    let baseLevel = this.getBaseCompressionLevel(fileType);

    // 从历史数据中学习
    baseLevel = this.applyHistoricalLearning(fileType, baseLevel);

    // 根据文件大小调整
    baseLevel = this.adjustByFileSize(baseLevel, fileSize);

    // 根据网络条件调整
    baseLevel = this.adjustByNetworkCondition(baseLevel);

    // 根据设备性能调整
    baseLevel = this.adjustByDevicePerformance(baseLevel);

    // 确保在有效范围内(1-9)
    return Math.max(1, Math.min(9, Math.round(baseLevel)));
  }

  /**
   * 根据历史压缩结果优化压缩级别
   */
  private applyHistoricalLearning(fileType: string, baseLevel: number): number {
    const stats = this.compressionResults.get(fileType);
    if (!stats || stats.sampleCount < 3) return baseLevel;

    // 找出历史上效果最好的压缩级别
    let bestLevel = baseLevel;
    let bestScore = 0;

    // 计算一个压缩效率分数，考虑压缩率和速度
    stats.levelStats.forEach((levelData, level) => {
      if (levelData.count < 3) return; // 样本不足

      // 计算效率分数 = 压缩率 / 压缩时间
      // 即每单位时间内的压缩效果
      const efficiencyScore = levelData.avgRatio / levelData.avgTime;

      if (efficiencyScore > bestScore) {
        bestScore = efficiencyScore;
        bestLevel = level;
      }
    });

    // 如果有更好的级别，逐渐向它靠拢（平滑过渡）
    if (bestScore > 0) {
      // 学习率越低，越平缓地向最优值靠拢
      const learningRate = 0.3;
      return baseLevel * (1 - learningRate) + bestLevel * learningRate;
    }

    return baseLevel;
  }

  /**
   * 获取基准压缩级别
   * @param fileType 文件类型分类
   * @returns 基准压缩级别
   */
  private getBaseCompressionLevel(fileType: string): number {
    // 根据文件类型确定基本压缩级别
    switch (fileType) {
      case 'text':
        // 文本文件压缩效果好，可以用高级别
        return 7;
      case 'code':
        // 代码文件通常压缩效果极佳
        return 8;
      case 'json':
        // JSON数据结构化，压缩效果好
        return 7;
      case 'xml':
        // XML文件有大量重复标签，压缩效果极佳
        return 8;
      case 'html':
        // HTML与XML类似
        return 7;
      case 'css':
        // CSS通常有较多重复模式
        return 6;
      case 'image':
        // 未压缩图像
        return 6;
      case 'compressedImage':
        // 已压缩图像，不适合再压缩
        return 1;
      case 'document':
        // 文档类型通常压缩效果好
        return 6;
      case 'spreadsheet':
        // 电子表格文件结构化程度高
        return 7;
      case 'pdf':
        // PDF已有内部压缩
        return 3;
      case 'audio':
      case 'video':
      case 'media':
        // 媒体文件通常已经压缩
        return 3;
      case 'archive':
      case 'compressed':
        // 已压缩的文件
        return 1;
      case 'executable':
        // 可执行文件压缩效果不确定，安全起见用中等级别
        return 5;
      case 'binary':
      default:
        // 二进制文件压缩效果不确定
        return 4;
    }
  }

  /**
   * 根据文件大小调整压缩级别
   * @param baseLevel 基准压缩级别
   * @param fileSize 文件大小（字节）
   */
  private adjustByFileSize(baseLevel: number, fileSize: number): number {
    const fileSizeInMB = fileSize / (1024 * 1024);

    // 较大的文件使用较低的压缩级别，提高速度
    if (fileSizeInMB > 500) {
      // 超大文件
      return baseLevel - 2.5;
    } else if (fileSizeInMB > 100) {
      // 大文件
      return baseLevel - 1.5;
    } else if (fileSizeInMB > 50) {
      // 中大型文件
      return baseLevel - 1;
    } else if (fileSizeInMB > 10) {
      // 中型文件
      return baseLevel - 0.5;
    } else if (fileSizeInMB < 0.5) {
      // 小文件
      return baseLevel + 1; // 小文件可以用更高的压缩级别
    } else if (fileSizeInMB < 1) {
      // 小到中型文件
      return baseLevel + 0.5;
    }

    return baseLevel;
  }

  /**
   * 根据网络状况调整压缩级别
   * @param baseLevel 基准压缩级别
   */
  private adjustByNetworkCondition(baseLevel: number): number {
    const condition = this.getNetworkCondition();

    // 网络稳定性也影响压缩决策
    const stabilityFactor = this.networkStability;

    // 稳定性低时更激进地调整压缩级别
    const stabilityMultiplier = 1 + (1 - stabilityFactor) * 0.5;

    switch (condition) {
      case 'very-slow':
        // 网络很慢，使用高压缩级别减少传输数据
        return baseLevel + 2 * stabilityMultiplier;
      case 'slow':
        // 网络较慢
        return baseLevel + 1 * stabilityMultiplier;
      case 'fast':
        // 网络较快，可降低压缩级别
        return baseLevel - 1 * stabilityMultiplier;
      case 'very-fast':
        // 网络很快，可大幅降低压缩级别
        return baseLevel - 2 * stabilityMultiplier;
      case 'unknown':
      case 'medium':
      default:
        // 考虑网络趋势微调
        if (this.networkTrend === 'improving') {
          return baseLevel - 0.5; // 网络改善，略微降低压缩级别
        } else if (this.networkTrend === 'declining') {
          return baseLevel + 0.5; // 网络变差，略微提高压缩级别
        }
        return baseLevel; // 中等网络或未知，保持不变
    }
  }

  /**
   * 根据设备性能调整压缩级别
   * @param baseLevel 基准压缩级别
   */
  private adjustByDevicePerformance(baseLevel: number): number {
    // 设备性能评分越低，压缩级别越低（降低CPU负担）
    // 设备性能评分越高，压缩级别可以稍微提高

    if (this.devicePerformanceScore < 0.2) {
      // 性能非常差
      return baseLevel - 2;
    } else if (this.devicePerformanceScore < 0.4) {
      // 性能较差
      return baseLevel - 1;
    } else if (this.devicePerformanceScore > 0.8) {
      // 性能很好
      return baseLevel + 0.5;
    }

    return baseLevel;
  }

  /**
   * 分析并记录压缩结果，用于未来优化
   * @param fileType 文件类型
   * @param originalSize 原始大小
   * @param compressedSize 压缩后大小
   * @param compressionLevel 使用的压缩级别
   * @param compressionTime 压缩时间（毫秒）
   * @param uploadTime 上传时间（毫秒）
   */
  recordCompressionResult(
    fileType: string,
    originalSize: number,
    compressedSize: number,
    compressionLevel: number,
    compressionTime: number,
    uploadTime?: number
  ): void {
    // 计算压缩率
    const compressionRatio = 1 - compressedSize / originalSize;

    // 计算压缩速度 (字节/毫秒)
    const compressionSpeed = originalSize / compressionTime;

    // 获取或创建此文件类型的统计
    let stats = this.compressionResults.get(fileType);
    if (!stats) {
      stats = {
        sampleCount: 0,
        totalOriginalSize: 0,
        avgCompressionRatio: 0,
        avgCompressionSpeed: 0,
        levelStats: new Map()
      };
      this.compressionResults.set(fileType, stats);
    }

    // 更新总体统计
    stats.sampleCount++;
    stats.totalOriginalSize += originalSize;

    // 使用滑动平均更新压缩比率
    stats.avgCompressionRatio =
      (stats.avgCompressionRatio * (stats.sampleCount - 1) + compressionRatio) / stats.sampleCount;

    // 更新压缩速度统计
    stats.avgCompressionSpeed =
      (stats.avgCompressionSpeed * (stats.sampleCount - 1) + compressionSpeed) / stats.sampleCount;

    // 获取或创建此压缩级别的统计
    let levelStat = stats.levelStats.get(compressionLevel);
    if (!levelStat) {
      levelStat = {
        count: 0,
        avgRatio: 0,
        avgTime: 0,
        avgSpeed: 0
      };
      stats.levelStats.set(compressionLevel, levelStat);
    }

    // 更新此级别的统计
    levelStat.count++;
    // 使用滑动平均更新各项指标
    levelStat.avgRatio =
      (levelStat.avgRatio * (levelStat.count - 1) + compressionRatio) / levelStat.count;
    levelStat.avgTime =
      (levelStat.avgTime * (levelStat.count - 1) + compressionTime) / levelStat.count;
    levelStat.avgSpeed =
      (levelStat.avgSpeed * (levelStat.count - 1) + compressionSpeed) / levelStat.count;

    // 记录这些信息用于未来的压缩策略调整
    if (stats.sampleCount % 10 === 0) {
      // 每累积10个样本保存一次数据
      this.saveHistoricalData();
    }

    // 日志记录
    console.log(`压缩结果统计 - 类型: ${fileType}, 级别: ${compressionLevel}`);
    console.log(`  原始大小: ${originalSize} 字节`);
    console.log(`  压缩后: ${compressedSize} 字节 (${(compressionRatio * 100).toFixed(2)}%压缩率)`);
    console.log(`  压缩速度: ${((compressionSpeed * 1000) / 1024 / 1024).toFixed(2)} MB/s`);

    if (uploadTime) {
      console.log(`  上传时间: ${uploadTime} ms`);
    }
  }

  /**
   * 根据文件类型和内容特征预测压缩效果
   * @param fileType 文件类型
   * @param _sampleContent 文件内容样本(可选)
   * @returns 预测的压缩比率(0-1)，越高表示压缩效果越好
   */
  predictCompressionRatio(fileType: string, _sampleContent?: string): number {
    // 首先检查历史数据
    const stats = this.compressionResults.get(fileType);
    if (stats && stats.sampleCount > 5) {
      // 有足够的历史数据，直接使用平均压缩率
      return stats.avgCompressionRatio;
    }

    // 没有历史数据，根据文件类型估计
    switch (fileType) {
      case 'text':
      case 'html':
      case 'xml':
      case 'json':
      case 'code':
        return 0.7; // 文本类型一般有很好的压缩效果
      case 'css':
      case 'document':
      case 'spreadsheet':
        return 0.6; // 结构化文档有较好的压缩效果
      case 'image':
        return 0.3; // 未压缩图像压缩效果中等
      case 'compressedImage':
      case 'audio':
      case 'video':
      case 'compressed':
      case 'archive':
        return 0.05; // 已压缩文件几乎无法进一步压缩
      case 'binary':
      case 'executable':
        return 0.3; // 二进制文件压缩效果中等
      default:
        return 0.4; // 默认中等估计
    }
  }

  /**
   * 分析样本内容估计其可压缩性
   * @param content 文本内容样本
   * @returns 估计的压缩率
   */
  analyzeContentCompressibility(content: string): number {
    if (!content || content.length < 10) return 0.4; // 样本太小，返回默认值

    // 计算重复字符比例
    const total = content.length;
    const uniqueChars = new Set(content.split('')).size;
    const repetitionRate = 1 - uniqueChars / total;

    // 检查是否有大量重复模式
    const patternCount = this.detectRepeatingPatterns(content);

    // 结合各种特征计算可压缩性分数
    const compressibilityScore = repetitionRate * 0.5 + (patternCount / total) * 0.5;

    // 将分数转换为预期压缩率范围(0.1-0.9)
    return Math.max(0.1, Math.min(0.9, 0.3 + compressibilityScore * 0.6));
  }

  /**
   * 检测文本中的重复模式
   * @param text 要分析的文本
   * @returns 重复模式的数量
   */
  private detectRepeatingPatterns(text: string): number {
    if (text.length < 10) return 0;

    // 检查常见重复序列
    const patterns = [
      '  ', // 重复空格
      '\n\n', // 重复换行
      '==', // 重复等号
      '//', // 注释标记
      '/*', // 注释开始
      '*/', // 注释结束
      '<div', // HTML标签
      '</div>', // HTML结束标签
      '{', // 大括号
      '}', // 大括号
      '[', // 中括号
      ']', // 中括号
      '""', // 双引号
      '.', // 点符号
      ':', // 冒号
      ',', // 逗号
      '; ' // 分号加空格
    ];

    let patternCount = 0;

    for (const pattern of patterns) {
      let count = 0;
      let pos = 0;

      while (pos !== -1) {
        pos = text.indexOf(pattern, pos);
        if (pos !== -1) {
          count++;
          pos += pattern.length;
        }
      }

      patternCount += count;
    }

    return patternCount;
  }
}

/**
 * 网络状况分类类型
 */
export type NetworkCondition =
  | 'very-slow' // 非常慢 (<0.5 MB/s)
  | 'slow' // 慢 (0.5-1 MB/s)
  | 'medium' // 中等 (1-5 MB/s)
  | 'fast' // 快 (5-20 MB/s)
  | 'very-fast' // 非常快 (>20 MB/s)
  | 'unknown'; // 未知

/**
 * 网络详细状况
 */
export interface NetworkDetails {
  speed: number; // MB/s
  stability: number; // 0-1，1表示非常稳定
  trend: 'improving' | 'declining' | 'stable';
  condition: NetworkCondition;
}

/**
 * 文件类型压缩统计数据
 */
interface FileTypeCompressionStats {
  sampleCount: number;
  totalOriginalSize: number;
  avgCompressionRatio: number; // 0-1，越高表示压缩效果越好
  avgCompressionSpeed: number; // 字节/毫秒
  levelStats: Map<number, LevelCompressionStats>;
}

/**
 * 特定压缩级别的统计数据
 */
interface LevelCompressionStats {
  count: number;
  avgRatio: number; // 平均压缩率
  avgTime: number; // 平均压缩时间（毫秒）
  avgSpeed: number; // 平均压缩速度（字节/毫秒）
}

/**
 * 多算法压缩工厂
 * 支持不同的压缩算法与策略
 */
export class CompressionAlgorithmFactory {
  /**
   * 获取支持的压缩算法列表
   */
  static getSupportedAlgorithms(): string[] {
    const algorithms = ['gzip']; // 基本支持

    // 检查浏览器支持
    if (typeof CompressionStream !== 'undefined') {
      try {
        // 尝试检测浏览器支持的格式
        new CompressionStream('deflate');
        algorithms.push('deflate');
      } catch {
        // 浏览器不支持此格式
      }

      try {
        new CompressionStream('deflate-raw');
        algorithms.push('deflate-raw');
      } catch {
        // 浏览器不支持此格式
      }
    }

    // 检查pako库支持
    if (typeof window !== 'undefined' && (window as any).pako) {
      if (typeof (window as any).pako.deflate === 'function') {
        algorithms.push('pako-deflate');
      }
    }

    return algorithms;
  }

  /**
   * 选择特定文件类型的最佳压缩算法
   * @param mimeType 文件MIME类型
   */
  static getBestAlgorithmForType(mimeType: string): string {
    const supportedAlgorithms = this.getSupportedAlgorithms();

    // 如果只有一种算法可用，直接返回
    if (supportedAlgorithms.length === 1) {
      return supportedAlgorithms[0];
    }

    // 基于MIME类型选择最适合的算法
    if (
      mimeType.startsWith('text/') ||
      mimeType.includes('json') ||
      mimeType.includes('xml') ||
      mimeType.includes('javascript')
    ) {
      // 文本类型优先使用deflate-raw (如果可用)，因为它对文本效果好
      if (supportedAlgorithms.includes('deflate-raw')) {
        return 'deflate-raw';
      }
    }

    // 默认优先选择gzip，它是最通用的
    if (supportedAlgorithms.includes('gzip')) {
      return 'gzip';
    }

    // 退化到其他可用算法
    return supportedAlgorithms[0];
  }

  /**
   * 创建合适的压缩流
   * @param algorithm 压缩算法名称
   * @returns 压缩流（如果浏览器支持）
   */
  static createCompressionStream(algorithm: string = 'gzip'): CompressionStream | null {
    if (typeof CompressionStream === 'undefined') {
      return null;
    }

    try {
      // 将我们的算法名称映射到标准名称
      let streamAlgorithm = algorithm;
      if (algorithm === 'pako-deflate') {
        streamAlgorithm = 'deflate';
      }

      return new CompressionStream(streamAlgorithm as any);
    } catch (e) {
      console.warn(`创建压缩流失败 (${algorithm}):`, e);
      return null;
    }
  }
}
