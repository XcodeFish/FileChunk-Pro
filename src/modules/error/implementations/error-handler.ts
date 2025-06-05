/**
 * 错误处理器实现
 *
 * 提供统一的错误处理、错误分类、网络错误识别、服务器错误处理、
 * 客户端错误处理、错误上下文收集和全局错误拦截等功能。
 */

import {
  ErrorHandler,
  ErrorTransformer,
  ErrorFilter,
  ErrorReporter,
  RetryStrategy,
  StandardizedError,
  ErrorContext
} from '../interfaces';

/**
 * 默认错误处理器实现
 */
export class DefaultErrorHandler implements ErrorHandler {
  private transformer: ErrorTransformer;
  private filter: ErrorFilter;
  private reporter: ErrorReporter;
  private retryStrategy: RetryStrategy;
  private globalErrorHandler: ((error: StandardizedError) => void | Promise<void>) | null = null;

  constructor(
    transformer: ErrorTransformer,
    filter: ErrorFilter,
    reporter: ErrorReporter,
    retryStrategy: RetryStrategy
  ) {
    this.transformer = transformer;
    this.filter = filter;
    this.reporter = reporter;
    this.retryStrategy = retryStrategy;
  }

  /**
   * 处理错误
   * @param error 原始错误
   * @param context 错误上下文
   */
  async handleError(error: unknown, context?: Partial<ErrorContext>): Promise<void> {
    // 转换为标准错误格式
    const standardizedError = this.createStandardizedError(error, context);

    // 应用过滤规则
    const filteredError = this.filter.applyRules(standardizedError);
    if (!filteredError) {
      return; // 错误被过滤掉，不需要进一步处理
    }

    // 执行全局错误处理回调
    if (this.globalErrorHandler) {
      try {
        await Promise.resolve(this.globalErrorHandler(filteredError));
      } catch (callbackError) {
        // 全局错误处理器本身出错，记录并继续处理原始错误
        console.error('全局错误处理器执行失败:', callbackError);
      }
    }

    // 上报错误
    try {
      await this.reporter.reportError(filteredError);
    } catch (reportError) {
      console.error('错误上报失败:', reportError);
    }
  }

  /**
   * 创建标准化错误
   * @param error 原始错误
   * @param context 错误上下文
   */
  createStandardizedError(error: unknown, context?: Partial<ErrorContext>): StandardizedError {
    return this.transformer.transform(error, context);
  }

  /**
   * 获取错误转换器
   */
  getTransformer(): ErrorTransformer {
    return this.transformer;
  }

  /**
   * 获取错误过滤器
   */
  getFilter(): ErrorFilter {
    return this.filter;
  }

  /**
   * 获取错误上报器
   */
  getReporter(): ErrorReporter {
    return this.reporter;
  }

  /**
   * 获取重试策略
   */
  getRetryStrategy(): RetryStrategy {
    return this.retryStrategy;
  }

  /**
   * 设置全局错误处理回调
   * @param callback 错误处理回调函数
   */
  setGlobalErrorHandler(callback: (error: StandardizedError) => void | Promise<void>): void {
    this.globalErrorHandler = callback;
  }

  /**
   * 重置错误处理状态
   */
  reset(): void {
    this.globalErrorHandler = null;
    this.retryStrategy.reset();
  }
}
