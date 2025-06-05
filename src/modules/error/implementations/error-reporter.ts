/**
 * 错误上报器实现
 *
 * 提供错误上报和批量上报功能
 */

import { ErrorReporter, StandardizedError, ErrorReportConfig, ErrorSeverity } from '../interfaces';

/**
 * 默认错误上报器实现
 */
export class DefaultErrorReporter implements ErrorReporter {
  private config: ErrorReportConfig;
  private queue: StandardizedError[] = [];
  private reportingInProgress = false;
  private reportTimer: ReturnType<typeof setTimeout> | null = null;
  private throttleTimerId: ReturnType<typeof setTimeout> | null = null;

  constructor(config: ErrorReportConfig) {
    this.config = {
      batchSize: 10,
      throttleTime: 5000, // 默认5秒上报一次
      samplingRate: 1.0, // 默认采样率100%
      minSeverity: ErrorSeverity.ERROR,
      ...config
    };
  }

  /**
   * 上报单个错误
   * @param error 标准化错误对象
   */
  async reportError(error: StandardizedError): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // 检查错误严重程度是否达到上报标准
    if (!this.shouldReportBySeverity(error.severity)) {
      return;
    }

    // 应用采样率过滤
    if (!this.shouldReportBySampling()) {
      return;
    }

    // 将错误加入队列
    this.queue.push(this.sanitizeError(error));

    // 如果队列达到了批量上报阈值，立即上报
    if (this.queue.length >= (this.config.batchSize || 10)) {
      this.scheduleImmediateReport();
    } else if (this.queue.length === 1) {
      // 如果这是队列中的第一个错误，启动定时上报
      this.scheduleReporting();
    }
  }

  /**
   * 批量上报错误
   * @param errors 标准化错误对象数组
   */
  async reportErrors(errors: StandardizedError[]): Promise<void> {
    if (!this.config.enabled || errors.length === 0) {
      return;
    }

    const filteredErrors = errors
      .filter(error => this.shouldReportBySeverity(error.severity))
      .filter(() => this.shouldReportBySampling())
      .map(error => this.sanitizeError(error));

    if (filteredErrors.length === 0) {
      return;
    }

    try {
      await this.sendErrorsToServer(filteredErrors);
    } catch (error) {
      console.error('批量上报错误失败:', error);
    }
  }

  /**
   * 获取上报配置
   */
  getConfig(): ErrorReportConfig {
    return { ...this.config };
  }

  /**
   * 更新上报配置
   * @param config 新的上报配置
   */
  updateConfig(config: Partial<ErrorReportConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };

    // 如果禁用了上报，清理队列和定时器
    if (config.enabled === false) {
      this.clearScheduledReporting();
      this.queue = [];
    }
  }

  /**
   * 立即上报所有等待中的错误
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0 || !this.config.enabled) {
      return;
    }

    this.clearScheduledReporting();
    await this.processQueue();
  }

  /**
   * 根据严重程度决定是否应该上报
   */
  private shouldReportBySeverity(severity: ErrorSeverity): boolean {
    const severityLevels = {
      [ErrorSeverity.INFO]: 0,
      [ErrorSeverity.WARNING]: 1,
      [ErrorSeverity.ERROR]: 2,
      [ErrorSeverity.FATAL]: 3
    };

    const minLevel = severityLevels[this.config.minSeverity || ErrorSeverity.ERROR];
    const errorLevel = severityLevels[severity];

    return errorLevel >= minLevel;
  }

  /**
   * 根据采样率决定是否应该上报
   */
  private shouldReportBySampling(): boolean {
    const samplingRate = this.config.samplingRate || 1.0;
    return Math.random() < samplingRate;
  }

  /**
   * 清理错误数据中的敏感信息
   */
  private sanitizeError(error: StandardizedError): StandardizedError {
    const sanitizedError = { ...error };
    const privateFields = this.config.privateFields || [];

    // 如果存在上下文
    if (sanitizedError.context && privateFields.length > 0) {
      const context = { ...sanitizedError.context };

      // 递归处理对象中的敏感字段
      const sanitizeObject = (obj: Record<string, any>, path = ''): Record<string, any> => {
        const result: Record<string, any> = {};

        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;

          // 检查当前路径是否在私有字段列表中
          const isPrivate = privateFields.some(field => {
            if (field.endsWith('.*')) {
              // 处理通配符情况，例如 "headers.*"
              const prefix = field.slice(0, -2);
              return currentPath.startsWith(prefix);
            }
            return currentPath === field;
          });

          if (isPrivate) {
            // 替换敏感字段
            result[key] = '[REDACTED]';
          } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            // 递归处理嵌套对象
            result[key] = sanitizeObject(value, currentPath);
          } else {
            // 保留非敏感字段
            result[key] = value;
          }
        }

        return result;
      };

      sanitizedError.context = sanitizeObject(context) as typeof context;
    }

    // 应用自定义转换器
    if (this.config.transformer && typeof this.config.transformer === 'function') {
      return this.config.transformer(sanitizedError);
    }

    return sanitizedError;
  }

  /**
   * 安排即时上报
   */
  private scheduleImmediateReport(): void {
    this.clearScheduledReporting();

    // 使用节流控制避免频繁上报
    if (!this.throttleTimerId && !this.reportingInProgress) {
      this.processQueue().catch(error => {
        console.error('处理错误队列失败:', error);
      });
    }
  }

  /**
   * 安排定时上报
   */
  private scheduleReporting(): void {
    if (this.reportTimer !== null) {
      return; // 已经安排了上报
    }

    // 设置定时器，按配置的时间间隔进行上报
    this.reportTimer = setTimeout(() => {
      this.processQueue().catch(error => {
        console.error('处理错误队列失败:', error);
      });
    }, this.config.throttleTime || 5000);
  }

  /**
   * 清除已安排的上报任务
   */
  private clearScheduledReporting(): void {
    if (this.reportTimer !== null) {
      clearTimeout(this.reportTimer);
      this.reportTimer = null;
    }

    if (this.throttleTimerId !== null) {
      clearTimeout(this.throttleTimerId);
      this.throttleTimerId = null;
    }
  }

  /**
   * 处理错误队列
   */
  private async processQueue(): Promise<void> {
    if (this.reportingInProgress || this.queue.length === 0) {
      return;
    }

    this.reportingInProgress = true;
    this.clearScheduledReporting();

    try {
      // 从队列中取出错误进行批量上报
      const errorsToReport = this.queue.splice(0, this.config.batchSize || 10);
      await this.sendErrorsToServer(errorsToReport);

      // 设置节流计时器
      this.throttleTimerId = setTimeout(() => {
        this.throttleTimerId = null;

        // 如果还有更多错误，继续处理
        if (this.queue.length > 0) {
          this.scheduleImmediateReport();
        }
      }, this.config.throttleTime || 5000);
    } catch (error) {
      console.error('上报错误失败:', error);

      // 上报失败，将错误放回队列，稍后重试
      // 注意：可能需要限制重试次数以避免无限循环
      if (this.queue.length < 1000) {
        // 避免无限增长
        this.scheduleReporting();
      }
    } finally {
      this.reportingInProgress = false;

      // 如果仍有错误，但数量未达到立即上报阈值，安排定时上报
      if (this.queue.length > 0 && this.queue.length < (this.config.batchSize || 10)) {
        this.scheduleReporting();
      }
    }
  }

  /**
   * 将错误发送到服务器
   */
  private async sendErrorsToServer(errors: StandardizedError[]): Promise<void> {
    if (!this.config.endpoint) {
      console.warn('未配置错误上报端点，跳过上报');
      return;
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers
      },
      body: JSON.stringify({
        timestamp: Date.now(),
        errors: errors
      }),
      // 设置较短的超时，避免上报过程中阻塞
      signal: this.createTimeoutSignal(10000) // 10秒超时
    });

    if (!response.ok) {
      throw new Error(`错误上报失败：${response.status} ${response.statusText}`);
    }
  }

  /**
   * 创建带超时的AbortSignal
   */
  private createTimeoutSignal(timeoutMs: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    return controller.signal;
  }
}
