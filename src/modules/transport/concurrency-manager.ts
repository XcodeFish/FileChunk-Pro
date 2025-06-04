/**
 * 并发管理器选项
 */
export interface ConcurrencyManagerOptions {
  /**
   * 初始并发数
   */
  maxConcurrency?: number;

  /**
   * 最小并发数
   */
  minConcurrency?: number;

  /**
   * 最大并发数
   */
  absoluteMaxConcurrency?: number;

  /**
   * 是否启用自适应调整
   */
  enableAdaptive?: boolean;

  /**
   * 自适应调整间隔（毫秒）
   */
  adaptiveInterval?: number;
}

/**
 * 并发管理器类
 *
 * 用于管理和控制任务的并发执行，并根据网络状况和成功率自适应调整并发数
 */
export class ConcurrencyManager {
  /**
   * 当前并发数
   */
  private _concurrency: number;

  /**
   * 最小并发数
   */
  private minConcurrency: number;

  /**
   * 最大并发数
   */
  private maxConcurrency: number;

  /**
   * 是否启用自适应调整
   */
  private enableAdaptive: boolean;

  /**
   * 活跃任务计数
   */
  private activeRequests: number = 0;

  /**
   * 成功任务计数
   */
  private successCount: number = 0;

  /**
   * 失败任务计数
   */
  private failureCount: number = 0;

  /**
   * 超时任务计数
   */
  private timeoutCount: number = 0;

  /**
   * 网络错误计数
   */
  private networkErrorCount: number = 0;

  /**
   * 待执行任务队列
   */
  private pendingExecutions: Array<{
    task: () => Promise<any>;
    resolve: (result: any) => void;
    reject: (error: any) => void;
    priority?: number;
  }> = [];

  /**
   * 自适应调整计时器ID
   */
  private adaptiveIntervalId: NodeJS.Timeout | null = null;

  /**
   * 获取当前并发数
   */
  get concurrency(): number {
    return this._concurrency;
  }

  /**
   * 构造函数
   *
   * @param options 并发管理器选项
   */
  constructor(options: ConcurrencyManagerOptions = {}) {
    this.minConcurrency = options.minConcurrency || 1;
    this.maxConcurrency = options.absoluteMaxConcurrency || 10;
    this._concurrency = options.maxConcurrency || 3;
    this.enableAdaptive = options.enableAdaptive !== false; // 默认启用自适应

    // 确保并发数在有效范围内
    this._concurrency = Math.max(
      this.minConcurrency,
      Math.min(this._concurrency, this.maxConcurrency)
    );

    // 启动自适应调整
    if (this.enableAdaptive) {
      this.startAdaptiveAdjustment(options.adaptiveInterval || 5000);
    }
  }

  /**
   * 执行任务
   *
   * @param task 要执行的任务函数
   * @param priority 任务优先级(可选)，数字越大优先级越高
   * @returns 任务执行结果的Promise
   */
  async execute<T>(task: () => Promise<T>, priority: number = 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // 创建执行项
      const execution = {
        task,
        resolve,
        reject,
        priority
      };

      // 添加到队列（按优先级排序）
      if (priority > 0) {
        // 找到合适的位置插入
        const index = this.pendingExecutions.findIndex(item => (item.priority || 0) < priority);

        if (index !== -1) {
          this.pendingExecutions.splice(index, 0, execution);
        } else {
          this.pendingExecutions.push(execution);
        }
      } else {
        // 无优先级，直接添加到队列末尾
        this.pendingExecutions.push(execution);
      }

      // 尝试执行队列
      this.processQueue();
    });
  }

  /**
   * 处理队列
   * 尝试执行尽可能多的待处理任务，直到达到并发上限
   */
  private processQueue(): void {
    // 如果队列为空或已达到并发上限，直接返回
    while (this.pendingExecutions.length > 0 && this.activeRequests < this._concurrency) {
      // 获取下一个要执行的任务
      const execution = this.pendingExecutions.shift();
      if (!execution) break;

      const { task, resolve, reject } = execution;

      // 增加活跃请求计数
      this.activeRequests++;

      // 执行任务
      task()
        .then(result => {
          this.successCount++;
          resolve(result);
          return result;
        })
        .catch(error => {
          // 根据错误类型记录不同统计
          if (this.isTimeoutError(error)) {
            this.timeoutCount++;
          } else if (this.isNetworkError(error)) {
            this.networkErrorCount++;
          } else {
            this.failureCount++;
          }

          reject(error);
        })
        .finally(() => {
          // 减少活跃请求计数
          this.activeRequests--;

          // 如果启用了自适应调整，调整并发数
          if (this.enableAdaptive) {
            this.adjustConcurrencyOnDemand();
          }

          // 继续处理队列
          this.processQueue();
        });
    }
  }

  /**
   * 检查是否为超时错误
   */
  private isTimeoutError(error: any): boolean {
    return (
      error.name === 'TimeoutError' ||
      error.code === 'ETIMEDOUT' ||
      error.message?.includes('timeout') ||
      error.message?.includes('timed out')
    );
  }

  /**
   * 检查是否为网络错误
   */
  private isNetworkError(error: any): boolean {
    return (
      error.name === 'NetworkError' ||
      error.code === 'ENETUNREACH' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.message?.includes('network') ||
      error.message?.includes('connection') ||
      error.message?.includes('offline')
    );
  }

  /**
   * 根据需求调整并发数
   * 这个方法在每次任务完成时调用，可以快速响应网络状况变化
   */
  private adjustConcurrencyOnDemand(): void {
    const total = this.successCount + this.failureCount;

    // 样本不足，不调整
    if (total < 5) return;

    const failureRate = this.failureCount / total;
    const timeoutRate = this.timeoutCount / total;

    // 网络拥塞迹象（高失败率或高超时率），减少并发
    if (timeoutRate > 0.3 || failureRate > 0.5) {
      this.decreaseConcurrency();
      return;
    }

    // 网络状况良好，且当前队列已满，增加并发
    if (
      failureRate < 0.1 &&
      this.activeRequests >= this._concurrency &&
      this.pendingExecutions.length > 0
    ) {
      this.increaseConcurrency();
    }
  }

  /**
   * 启动定期自适应调整
   *
   * @param interval 调整间隔（毫秒）
   */
  private startAdaptiveAdjustment(interval: number): void {
    if (this.adaptiveIntervalId) {
      clearInterval(this.adaptiveIntervalId);
    }

    this.adaptiveIntervalId = setInterval(() => {
      this.adaptConcurrencyPeriodically();
    }, interval);
  }

  /**
   * 停止自适应调整
   */
  stopAdaptiveAdjustment(): void {
    if (this.adaptiveIntervalId) {
      clearInterval(this.adaptiveIntervalId);
      this.adaptiveIntervalId = null;
    }
  }

  /**
   * 定期调整并发数
   * 这个方法定期调用，用于长期优化
   */
  private adaptConcurrencyPeriodically(): void {
    const total = this.successCount + this.failureCount;

    // 没有足够的样本
    if (total < 10) return;

    const failureRate = this.failureCount / total;
    const networkErrorRate = this.networkErrorCount / total;

    // 根据失败率与网络错误率动态调整
    if (failureRate > 0.4 || networkErrorRate > 0.3) {
      // 较高失败率，降低并发
      this.decreaseConcurrency();
    } else if (failureRate < 0.1 && this.pendingExecutions.length > 0) {
      // 较低失败率且有等待任务，增加并发
      this.increaseConcurrency();
    }

    // 定期重置计数器，避免旧数据影响决策
    this.resetCountsPartially();
  }

  /**
   * 增加并发数
   */
  increaseConcurrency(): void {
    if (this._concurrency < this.maxConcurrency) {
      this._concurrency = Math.min(this._concurrency + 1, this.maxConcurrency);

      // 增加并发后立即处理队列
      this.processQueue();
    }
  }

  /**
   * 减少并发数
   */
  decreaseConcurrency(): void {
    if (this._concurrency > this.minConcurrency) {
      this._concurrency = Math.max(this._concurrency - 1, this.minConcurrency);
    }
  }

  /**
   * 设置并发数
   *
   * @param value 新的并发数
   */
  setConcurrency(value: number): void {
    const newValue = Math.max(this.minConcurrency, Math.min(value, this.maxConcurrency));

    this._concurrency = newValue;

    // 如果增加了并发数，尝试处理队列
    if (newValue > this._concurrency) {
      this.processQueue();
    }
  }

  /**
   * 部分重置计数器
   * 保留一部分最近的数据，给予新数据更多权重
   */
  private resetCountsPartially(): void {
    // 保留30%的历史数据
    this.successCount = Math.floor(this.successCount * 0.3);
    this.failureCount = Math.floor(this.failureCount * 0.3);
    this.timeoutCount = Math.floor(this.timeoutCount * 0.3);
    this.networkErrorCount = Math.floor(this.networkErrorCount * 0.3);
  }

  /**
   * 完全重置所有计数器
   */
  resetCounts(): void {
    this.successCount = 0;
    this.failureCount = 0;
    this.timeoutCount = 0;
    this.networkErrorCount = 0;
  }

  /**
   * 获取状态统计信息
   */
  getStats(): {
    activeRequests: number;
    pendingRequests: number;
    successCount: number;
    failureCount: number;
    timeoutCount: number;
    networkErrorCount: number;
    concurrency: number;
  } {
    return {
      activeRequests: this.activeRequests,
      pendingRequests: this.pendingExecutions.length,
      successCount: this.successCount,
      failureCount: this.failureCount,
      timeoutCount: this.timeoutCount,
      networkErrorCount: this.networkErrorCount,
      concurrency: this._concurrency
    };
  }

  /**
   * 清空队列
   *
   * @param reason 取消原因
   */
  clearQueue(reason: string = 'Queue cleared'): void {
    const error = new Error(reason);

    // 拒绝所有待处理任务
    for (const execution of this.pendingExecutions) {
      execution.reject(error);
    }

    // 清空队列
    this.pendingExecutions = [];
  }

  /**
   * 销毁并发管理器
   */
  destroy(): void {
    this.stopAdaptiveAdjustment();
    this.clearQueue('Concurrency manager destroyed');
  }
}
