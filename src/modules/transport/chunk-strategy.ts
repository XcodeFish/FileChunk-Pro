/**
 * 分片策略选项
 */
export interface ChunkStrategyOptions {
  /**
   * 最小分片大小（字节）
   */
  minChunkSize?: number;

  /**
   * 最大分片大小（字节）
   */
  maxChunkSize?: number;

  /**
   * 初始分片大小（字节）
   */
  initialChunkSize?: number;

  /**
   * 目标分片上传时间（秒）
   */
  targetChunkTime?: number;
}

/**
 * 分片策略类
 *
 * 用于动态调整分片大小，基于网络速度和其他条件，优化上传性能
 */
export class ChunkStrategy {
  /**
   * 网络速度（字节/秒）
   */
  private networkSpeed: number = 0;

  /**
   * 测量次数
   */
  private measurementCount: number = 0;

  /**
   * 最小分片大小（字节）
   */
  private minChunkSize: number;

  /**
   * 最大分片大小（字节）
   */
  private maxChunkSize: number;

  /**
   * 初始分片大小（字节）
   */
  private initialChunkSize: number;

  /**
   * 目标分片上传时间（秒）
   */
  private targetChunkTime: number;

  /**
   * 初始化分片策略
   *
   * @param options 策略配置选项
   */
  constructor(options: ChunkStrategyOptions = {}) {
    this.minChunkSize = options.minChunkSize || 512 * 1024; // 512KB
    this.maxChunkSize = options.maxChunkSize || 10 * 1024 * 1024; // 10MB
    this.initialChunkSize = options.initialChunkSize || 2 * 1024 * 1024; // 2MB
    this.targetChunkTime = options.targetChunkTime || 3; // 3秒
  }

  /**
   * 更新网络速度
   *
   * @param bytesPerSecond 字节/秒
   */
  updateNetworkSpeed(bytesPerSecond: number): void {
    if (bytesPerSecond <= 0) {
      return; // 忽略无效的速度数据
    }

    // 使用加权平均，新测量值权重为0.3
    if (this.measurementCount === 0) {
      this.networkSpeed = bytesPerSecond;
    } else {
      this.networkSpeed = this.networkSpeed * 0.7 + bytesPerSecond * 0.3;
    }

    this.measurementCount++;
  }

  /**
   * 获取最优分片大小
   *
   * @param fileSize 文件大小（字节）
   * @returns 最优分片大小（字节）
   */
  getOptimalChunkSize(fileSize: number = 0): number {
    // 如果没有网速数据，使用默认大小或基于文件大小估算
    if (this.measurementCount === 0) {
      if (fileSize === 0) {
        return this.initialChunkSize;
      }

      // 基于文件大小估算合理的分片大小
      // 较小的文件使用较小的分片，较大的文件使用较大的分片
      // 但是保持在最小和最大限制之内
      return Math.min(Math.max(this.minChunkSize, Math.ceil(fileSize / 100)), this.maxChunkSize);
    }

    // 基于当前网速和目标上传时间计算分片大小
    let optimalSize = this.networkSpeed * this.targetChunkTime;

    // 确保在限制范围内
    optimalSize = Math.max(this.minChunkSize, Math.min(optimalSize, this.maxChunkSize));

    return Math.floor(optimalSize);
  }

  /**
   * 重置测量数据
   */
  resetMeasurements(): void {
    this.networkSpeed = 0;
    this.measurementCount = 0;
  }

  /**
   * 获取当前网络速度
   *
   * @returns 网络速度（字节/秒）
   */
  getCurrentNetworkSpeed(): number {
    return this.networkSpeed;
  }

  /**
   * 获取网速统计信息
   */
  getSpeedStats(): { speed: number; measurements: number } {
    return {
      speed: this.networkSpeed,
      measurements: this.measurementCount
    };
  }
}
