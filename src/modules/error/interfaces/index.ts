/**
 * 错误处理模块接口定义
 *
 * 本模块提供统一的错误处理、重试策略、错误上报等接口定义
 */

import { Module } from '../../../types/modules';

/**
 * 错误严重程度级别
 */
export enum ErrorSeverity {
  /** 致命错误，导致操作无法继续 */
  FATAL = 'fatal',
  /** 错误，但可能允许部分操作继续 */
  ERROR = 'error',
  /** 警告，操作可以继续但可能存在问题 */
  WARNING = 'warning',
  /** 信息提示，不影响操作 */
  INFO = 'info'
}

/**
 * 错误类别枚举
 */
export enum ErrorCategory {
  /** 网络错误 */
  NETWORK = 'network',
  /** 服务器错误 */
  SERVER = 'server',
  /** 客户端错误 */
  CLIENT = 'client',
  /** 文件错误 */
  FILE = 'file',
  /** 权限错误 */
  PERMISSION = 'permission',
  /** 配置错误 */
  CONFIGURATION = 'configuration',
  /** 未知错误 */
  UNKNOWN = 'unknown'
}

/**
 * 标准错误上下文接口
 * 提供错误发生时的环境与状态信息
 */
export interface ErrorContext {
  /** 操作ID */
  operationId?: string;
  /** 文件信息 */
  fileInfo?: {
    fileId?: string;
    fileName?: string;
    fileSize?: number;
  };
  /** 错误发生时的请求信息 */
  request?: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    params?: Record<string, any>;
    chunkIndex?: number;
    chunkSize?: number;
  };
  /** 服务器响应信息 */
  response?: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    data?: any;
  };
  /** 平台信息 */
  platform?: {
    type?: string;
    version?: string;
    features?: Record<string, boolean>;
  };
  /** 时间信息 */
  timestamp: number;
  /** 额外信息 */
  extra?: Record<string, any>;
}

/**
 * 标准化错误接口
 * 提供统一的错误数据结构
 */
export interface StandardizedError {
  /** 错误名称 */
  name: string;
  /** 错误消息 */
  message: string;
  /** 错误代码 */
  code: string | number;
  /** 错误严重程度 */
  severity: ErrorSeverity;
  /** 错误类别 */
  category: ErrorCategory;
  /** 是否可重试 */
  retriable: boolean;
  /** 原始错误对象 */
  originalError?: Error | unknown;
  /** 错误堆栈 */
  stack?: string;
  /** 错误上下文 */
  context?: ErrorContext;
}

/**
 * 重试配置接口
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试延迟基数(ms) */
  baseDelay: number;
  /** 最大重试延迟(ms) */
  maxDelay: number;
  /** 退避系数(用于指数退避算法) */
  backoffFactor: number;
  /** 退避随机因子(添加随机性防止瞬时峰值) */
  jitterFactor: number;
  /** 只重试特定HTTP状态码 */
  retryStatusCodes?: number[];
  /** 不重试特定HTTP状态码 */
  noRetryStatusCodes?: number[];
  /** 只重试特定错误类别 */
  retryCategories?: ErrorCategory[];
  /** 不重试特定错误类别 */
  noRetryCategories?: ErrorCategory[];
}

/**
 * 重试策略接口
 * 定义如何判断和执行重试逻辑
 */
export interface RetryStrategy {
  /**
   * 判断错误是否可重试
   * @param error 标准化错误对象
   * @param attemptCount 已重试次数
   */
  shouldRetry(error: StandardizedError, attemptCount: number): boolean;

  /**
   * 计算下一次重试的延迟时间
   * @param attemptCount 已重试次数
   * @param error 标准化错误对象
   */
  getNextRetryDelay(attemptCount: number, error: StandardizedError): number;

  /**
   * 获取当前重试配置
   */
  getRetryConfig(): RetryConfig;

  /**
   * 更新重试配置
   * @param config 新的重试配置
   */
  updateConfig(config: Partial<RetryConfig>): void;

  /**
   * 重置重试状态
   */
  reset(): void;
}

/**
 * 错误上报配置
 */
export interface ErrorReportConfig {
  /** 是否启用错误上报 */
  enabled: boolean;
  /** 上报服务URL */
  endpoint?: string;
  /** 批量上报阈值 */
  batchSize?: number;
  /** 上报频率限制(ms) */
  throttleTime?: number;
  /** 采样率(0-1) */
  samplingRate?: number;
  /** 最小上报错误级别 */
  minSeverity?: ErrorSeverity;
  /** 上报头信息 */
  headers?: Record<string, string>;
  /** 隐私字段过滤 */
  privateFields?: string[];
  /** 自定义错误转换器 */
  transformer?: (error: StandardizedError) => any;
}

/**
 * 错误上报器接口
 * 负责收集和发送错误数据
 */
export interface ErrorReporter {
  /**
   * 上报错误
   * @param error 标准化错误对象
   */
  reportError(error: StandardizedError): Promise<void>;

  /**
   * 批量上报错误
   * @param errors 标准化错误对象数组
   */
  reportErrors(errors: StandardizedError[]): Promise<void>;

  /**
   * 获取上报配置
   */
  getConfig(): ErrorReportConfig;

  /**
   * 更新上报配置
   * @param config 新的上报配置
   */
  updateConfig(config: Partial<ErrorReportConfig>): void;

  /**
   * 清空待上报的错误队列
   */
  flush(): Promise<void>;
}

/**
 * 错误过滤条件
 */
export interface ErrorFilterCondition {
  /** 匹配错误名称 */
  name?: string | RegExp;
  /** 匹配错误消息 */
  message?: string | RegExp;
  /** 匹配错误代码 */
  code?: string | number | Array<string | number>;
  /** 匹配错误严重程度 */
  severity?: ErrorSeverity | ErrorSeverity[];
  /** 匹配错误类别 */
  category?: ErrorCategory | ErrorCategory[];
  /** 自定义匹配函数 */
  predicate?: (error: StandardizedError) => boolean;
}

/**
 * 错误转换器接口
 */
export interface ErrorTransformer {
  /**
   * 转换任意错误为标准化错误
   * @param error 原始错误
   * @param context 错误上下文
   */
  transform(error: unknown, context?: Partial<ErrorContext>): StandardizedError;
}

/**
 * 错误过滤器接口
 * 提供错误过滤和转换能力
 */
export interface ErrorFilter {
  /**
   * 根据条件过滤错误
   * @param error 标准化错误对象
   * @param condition 过滤条件
   */
  match(error: StandardizedError, condition: ErrorFilterCondition): boolean;

  /**
   * 添加过滤规则
   * @param condition 过滤条件
   * @param action 匹配后的操作
   */
  addRule(
    condition: ErrorFilterCondition,
    action: (error: StandardizedError) => StandardizedError | null
  ): void;

  /**
   * 应用所有过滤规则
   * @param error 标准化错误对象
   */
  applyRules(error: StandardizedError): StandardizedError | null;
}

/**
 * 错误处理器接口
 * 错误处理模块的主接口
 */
export interface ErrorHandler {
  /**
   * 处理错误
   * @param error 原始错误
   * @param context 错误上下文
   */
  handleError(error: unknown, context?: Partial<ErrorContext>): Promise<void>;

  /**
   * 创建标准化错误
   * @param error 原始错误
   * @param context 错误上下文
   */
  createStandardizedError(error: unknown, context?: Partial<ErrorContext>): StandardizedError;

  /**
   * 获取错误转换器
   */
  getTransformer(): ErrorTransformer;

  /**
   * 获取错误过滤器
   */
  getFilter(): ErrorFilter;

  /**
   * 获取错误上报器
   */
  getReporter(): ErrorReporter;

  /**
   * 获取重试策略
   */
  getRetryStrategy(): RetryStrategy;

  /**
   * 设置全局错误处理回调
   * @param callback 错误处理回调函数
   */
  setGlobalErrorHandler(callback: (error: StandardizedError) => void | Promise<void>): void;

  /**
   * 重置错误处理状态
   */
  reset(): void;
}

/**
 * 错误处理模块接口
 * 继承自基础模块接口
 */
export interface ErrorModule extends Module {
  /**
   * 获取错误处理器实例
   */
  getErrorHandler(): ErrorHandler;

  /**
   * 设置默认的错误处理配置
   * @param config 错误处理配置
   */
  configure(config: {
    retryConfig?: Partial<RetryConfig>;
    reportConfig?: Partial<ErrorReportConfig>;
    transformers?: Record<string, ErrorTransformer>;
    filters?: Array<{
      condition: ErrorFilterCondition;
      action: (error: StandardizedError) => StandardizedError | null;
    }>;
  }): void;
}
