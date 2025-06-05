/**
 * 重试策略实现
 *
 * 提供指数退避算法实现、抖动因子计算、自适应重试间隔及重试条件评估功能
 */

import { RetryStrategy, RetryConfig, StandardizedError, ErrorCategory } from '../interfaces';

/**
 * 默认重试配置
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  jitterFactor: 0.2,
  retryStatusCodes: [408, 429, 500, 502, 503, 504],
  noRetryStatusCodes: [400, 401, 403, 404, 405, 413],
  retryCategories: [ErrorCategory.NETWORK, ErrorCategory.SERVER],
  noRetryCategories: [ErrorCategory.PERMISSION, ErrorCategory.CONFIGURATION]
};

/**
 * 指数退避重试策略实现
 */
export class ExponentialBackoffRetryStrategy implements RetryStrategy {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      ...DEFAULT_RETRY_CONFIG,
      ...config
    };
  }

  /**
   * 判断错误是否可重试
   * @param error 标准化错误对象
   * @param attemptCount 已重试次数
   */
  shouldRetry(error: StandardizedError, attemptCount: number): boolean {
    // 检查重试次数是否已达上限
    if (attemptCount >= this.config.maxRetries) {
      return false;
    }

    // 如果错误本身标记为不可重试，则不重试
    if (error.retriable === false) {
      return false;
    }

    // 检查错误类别
    if (this.config.noRetryCategories?.includes(error.category)) {
      return false;
    }

    // 如果指定了特定重试类别，检查是否匹配
    if (
      this.config.retryCategories &&
      this.config.retryCategories.length > 0 &&
      !this.config.retryCategories.includes(error.category)
    ) {
      return false;
    }

    // 如果是HTTP错误，检查状态码
    const responseStatus = error.context?.response?.status;
    if (responseStatus) {
      // 检查是否在不重试状态码列表中
      if (this.config.noRetryStatusCodes?.includes(responseStatus)) {
        return false;
      }

      // 如果指定了特定重试状态码，检查是否匹配
      if (
        this.config.retryStatusCodes &&
        this.config.retryStatusCodes.length > 0 &&
        !this.config.retryStatusCodes.includes(responseStatus)
      ) {
        return false;
      }
    }

    // 通过所有检查，可以重试
    return true;
  }

  /**
   * 计算下一次重试的延迟时间
   * @param attemptCount 已重试次数
   * @param error 标准化错误对象
   */
  getNextRetryDelay(attemptCount: number, error: StandardizedError): number {
    // 基本指数退避计算
    let delay = this.config.baseDelay * Math.pow(this.config.backoffFactor, attemptCount);

    // 应用最大延迟限制
    delay = Math.min(delay, this.config.maxDelay);

    // 根据错误类型调整延迟
    delay = this.adjustDelayByErrorType(delay, error);

    // 添加随机抖动以防止雪崩效应
    delay = this.applyJitter(delay, this.config.jitterFactor);

    return Math.floor(delay);
  }

  /**
   * 获取当前重试配置
   */
  getRetryConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * 更新重试配置
   * @param config 新的重试配置
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * 重置重试状态
   */
  reset(): void {
    // ExponentialBackoffRetryStrategy是无状态的，不需要重置
  }

  /**
   * 根据错误类型调整延迟时间
   */
  private adjustDelayByErrorType(delay: number, error: StandardizedError): number {
    // 针对网络错误，增加延迟时间，因为网络问题通常需要更长时间才能恢复
    if (error.category === ErrorCategory.NETWORK) {
      return delay * 1.5;
    }

    // 针对服务器错误，特别是服务不可用类错误(503)，增加延迟
    if (error.category === ErrorCategory.SERVER && error.context?.response?.status === 503) {
      return delay * 2;
    }

    // 针对超时错误，增加延迟时间
    if (error.message.toLowerCase().includes('timeout')) {
      return delay * 1.5;
    }

    // 针对限流错误(429)，根据响应头进行调整
    if (error.context?.response?.status === 429) {
      // 尝试获取Retry-After响应头
      const retryAfter = error.context?.response?.headers?.['retry-after'];
      if (retryAfter) {
        const retryAfterValue = parseInt(retryAfter, 10);
        if (!isNaN(retryAfterValue)) {
          // 将Retry-After值转换为毫秒
          return retryAfterValue * 1000;
        }
      }
      // 没有Retry-After头，增加延迟
      return delay * 1.5;
    }

    return delay;
  }

  /**
   * 应用随机抖动
   */
  private applyJitter(delay: number, jitterFactor: number): number {
    // 抖动范围为 [delay * (1 - jitterFactor), delay * (1 + jitterFactor)]
    const min = delay * (1 - jitterFactor);
    const max = delay * (1 + jitterFactor);
    return min + Math.random() * (max - min);
  }
}

/**
 * 自适应重试策略，可以根据错误模式和系统负载动态调整重试行为
 */
export class AdaptiveRetryStrategy implements RetryStrategy {
  private config: RetryConfig;
  private retryHistory: { timestamp: number; success: boolean }[] = [];
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      ...DEFAULT_RETRY_CONFIG,
      ...config
    };
  }

  /**
   * 判断错误是否可重试
   */
  shouldRetry(error: StandardizedError, attemptCount: number): boolean {
    // 基本重试条件检查
    const baseStrategy = new ExponentialBackoffRetryStrategy(this.config);
    if (!baseStrategy.shouldRetry(error, attemptCount)) {
      return false;
    }

    // 计算当前系统健康度
    const systemHealth = this.calculateSystemHealth();

    // 如果系统健康度低，减少重试次数
    const adjustedMaxRetries = Math.max(1, Math.floor(this.config.maxRetries * systemHealth));

    return attemptCount < adjustedMaxRetries;
  }

  /**
   * 计算下一次重试的延迟时间
   */
  getNextRetryDelay(attemptCount: number, error: StandardizedError): number {
    const baseStrategy = new ExponentialBackoffRetryStrategy(this.config);
    let delay = baseStrategy.getNextRetryDelay(attemptCount, error);

    // 根据系统健康度调整延迟
    const systemHealth = this.calculateSystemHealth();

    // 如果系统健康度低，增加延迟以减轻系统压力
    if (systemHealth < 0.5) {
      delay *= 1 + (0.5 - systemHealth) * 2;
    }

    return Math.floor(delay);
  }

  /**
   * 记录重试结果，用于优化未来的重试策略
   * @param success 重试是否成功
   */
  recordRetryResult(success: boolean): void {
    this.retryHistory.push({
      timestamp: Date.now(),
      success
    });

    // 清理旧记录
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.retryHistory = this.retryHistory.filter(record => record.timestamp >= oneHourAgo);

    // 更新连续成功/失败计数
    if (success) {
      this.consecutiveSuccesses++;
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
      this.consecutiveSuccesses = 0;
    }

    // 根据最近的结果自动调整配置
    this.autoAdjustConfig();
  }

  /**
   * 获取当前重试配置
   */
  getRetryConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * 更新重试配置
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * 重置重试状态
   */
  reset(): void {
    this.retryHistory = [];
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
  }

  /**
   * 计算当前系统健康度，范围[0, 1]，值越高表示系统越健康
   */
  private calculateSystemHealth(): number {
    if (this.retryHistory.length === 0) {
      return 1.0; // 默认为健康
    }

    // 仅考虑最近的记录
    const recentHistory = this.retryHistory.slice(-20);

    // 计算最近的成功率
    const successCount = recentHistory.filter(record => record.success).length;
    const successRate = successCount / recentHistory.length;

    // 连续失败会显著降低健康度
    let healthPenalty = 0;
    if (this.consecutiveFailures > 3) {
      healthPenalty = Math.min(0.5, this.consecutiveFailures * 0.1);
    }

    // 计算最终健康度，最低为0.1，以确保系统总是有机会恢复
    return Math.max(0.1, successRate - healthPenalty);
  }

  /**
   * 基于重试历史自动调整配置
   */
  private autoAdjustConfig(): void {
    // 连续失败多次，增加基础延迟和最大重试次数减少
    if (this.consecutiveFailures >= 5) {
      this.updateConfig({
        baseDelay: Math.min(this.config.baseDelay * 1.5, 5000),
        maxRetries: Math.max(this.config.maxRetries - 1, 1)
      });
    }

    // 连续成功多次，减少基础延迟并增加最大重试次数
    if (this.consecutiveSuccesses >= 10) {
      this.updateConfig({
        baseDelay: Math.max(this.config.baseDelay * 0.8, DEFAULT_RETRY_CONFIG.baseDelay),
        maxRetries: Math.min(this.config.maxRetries + 1, 5)
      });
    }
  }
}
