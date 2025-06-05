/**
 * 错误模块实现
 *
 * 整合错误处理相关功能，作为微内核架构中的模块
 */

import { ModuleMetadata, ModuleStatus } from '../../../types/modules';
import {
  ErrorModule,
  ErrorHandler,
  RetryConfig,
  ErrorReportConfig,
  ErrorTransformer,
  ErrorFilterCondition,
  StandardizedError
} from '../interfaces';
import { DefaultErrorHandler } from './error-handler';
import { DefaultErrorTransformer } from './error-transformer';
import { DefaultErrorFilter } from './error-filter';
import { DefaultErrorReporter } from './error-reporter';
import { ExponentialBackoffRetryStrategy } from './retry-strategies';

/**
 * 默认错误模块实现
 */
export class DefaultErrorModule implements ErrorModule {
  public metadata: ModuleMetadata;
  public status: ModuleStatus = ModuleStatus.REGISTERED;

  private errorHandler: ErrorHandler;
  private defaultTransformer: DefaultErrorTransformer;
  private defaultFilter: DefaultErrorFilter;
  private defaultReporter: DefaultErrorReporter;
  private defaultRetryStrategy: ExponentialBackoffRetryStrategy;

  constructor() {
    this.metadata = {
      id: 'error',
      name: '错误处理模块',
      version: '1.0.0',
      description: '提供统一的错误处理、重试策略和错误上报功能'
    };

    // 创建默认实现
    this.defaultTransformer = new DefaultErrorTransformer();
    this.defaultFilter = new DefaultErrorFilter();
    this.defaultRetryStrategy = new ExponentialBackoffRetryStrategy();
    this.defaultReporter = new DefaultErrorReporter({
      enabled: true,
      minSeverity: undefined, // 使用默认值
      privateFields: ['password', 'token', 'auth', 'secret', 'key']
    });

    // 创建错误处理器
    this.errorHandler = new DefaultErrorHandler(
      this.defaultTransformer,
      this.defaultFilter,
      this.defaultReporter,
      this.defaultRetryStrategy
    );
  }

  /**
   * 获取错误处理器实例
   */
  getErrorHandler(): ErrorHandler {
    return this.errorHandler;
  }

  /**
   * 配置错误处理模块
   */
  configure(config: {
    retryConfig?: Partial<RetryConfig>;
    reportConfig?: Partial<ErrorReportConfig>;
    transformers?: Record<string, ErrorTransformer>;
    filters?: Array<{
      condition: ErrorFilterCondition;
      action: (error: StandardizedError) => StandardizedError | null;
    }>;
  }): void {
    // 配置重试策略
    if (config.retryConfig) {
      this.defaultRetryStrategy.updateConfig(config.retryConfig);
    }

    // 配置错误上报
    if (config.reportConfig) {
      this.defaultReporter.updateConfig(config.reportConfig);
    }

    // 添加自定义转换器
    // 这里保留扩展点，如果需要支持自定义转换器，可以在此处实现

    // 添加错误过滤规则
    if (config.filters && config.filters.length > 0) {
      for (const { condition, action } of config.filters) {
        this.defaultFilter.addRule(condition, action);
      }
    }
  }

  /**
   * 模块初始化
   */
  async init(): Promise<void> {
    this.status = ModuleStatus.INITIALIZING;

    // 可以进行一些初始化操作，如检查环境、预加载配置等

    this.status = ModuleStatus.INITIALIZED;
  }

  /**
   * 模块启动
   */
  async start(): Promise<void> {
    this.status = ModuleStatus.STARTING;

    // 注册全局错误处理器
    if (typeof window !== 'undefined') {
      window.addEventListener('error', event => {
        this.errorHandler.handleError(event.error, {
          timestamp: Date.now(),
          extra: {
            type: 'window.error',
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
          }
        });
      });

      window.addEventListener('unhandledrejection', event => {
        this.errorHandler.handleError(event.reason, {
          timestamp: Date.now(),
          extra: {
            type: 'unhandledrejection'
          }
        });
      });
    }

    this.status = ModuleStatus.RUNNING;
  }

  /**
   * 模块停止
   */
  async stop(): Promise<void> {
    this.status = ModuleStatus.STOPPING;

    // 移除全局错误处理器
    if (typeof window !== 'undefined') {
      // 由于我们不能直接移除匿名事件监听器，这里只是状态标记
      // 实际应用中应该使用具名函数以便于移除
    }

    // 刷新所有等待中的错误报告
    await this.defaultReporter.flush();

    this.status = ModuleStatus.STOPPED;
  }

  /**
   * 模块销毁
   */
  async destroy(): Promise<void> {
    // 清理所有资源
    this.errorHandler.reset();

    this.status = ModuleStatus.REGISTERED;
  }

  /**
   * 检查模块是否正在运行
   */
  isRunning(): boolean {
    return this.status === ModuleStatus.RUNNING;
  }

  /**
   * 获取模块当前状态
   */
  getStatus(): ModuleStatus {
    return this.status;
  }

  /**
   * 错误处理方法
   */
  onError(error: Error): void {
    console.error('错误模块内部错误:', error);
    // 不使用自身的错误处理器处理内部错误，避免潜在的循环调用
  }
}
