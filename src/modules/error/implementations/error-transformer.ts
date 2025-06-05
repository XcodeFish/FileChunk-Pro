/**
 * 错误转换器实现
 *
 * 负责将各种错误转换为标准化错误格式，提供细粒度错误分类和智能错误识别
 */

import {
  ErrorTransformer,
  StandardizedError,
  ErrorContext,
  ErrorSeverity,
  ErrorCategory
} from '../interfaces';

/**
 * 默认错误转换器实现
 */
export class DefaultErrorTransformer implements ErrorTransformer {
  /**
   * 将任意错误转换为标准化错误
   * @param error 原始错误
   * @param context 错误上下文
   */
  transform(error: unknown, context?: Partial<ErrorContext>): StandardizedError {
    // 创建基础上下文
    const errorContext: ErrorContext = {
      timestamp: Date.now(),
      ...context
    };

    // 如果已经是标准化错误，返回它
    if (this.isStandardizedError(error)) {
      return {
        ...error,
        context: {
          ...error.context,
          ...errorContext
        }
      };
    }

    // 判断错误类型并进行转换
    if (error instanceof Error) {
      return this.transformErrorInstance(error, errorContext);
    } else if (typeof error === 'string') {
      return this.createGenericError('StringError', error, errorContext);
    } else if (error && typeof error === 'object') {
      return this.transformObjectError(error as Record<string, any>, errorContext);
    } else {
      return this.createGenericError('UnknownError', '发生未知错误', errorContext, error);
    }
  }

  /**
   * 检查是否已经是标准化错误
   */
  private isStandardizedError(error: unknown): error is StandardizedError {
    if (!error || typeof error !== 'object') return false;

    const potentialStdError = error as Partial<StandardizedError>;
    return (
      typeof potentialStdError.name === 'string' &&
      typeof potentialStdError.message === 'string' &&
      (typeof potentialStdError.code === 'string' || typeof potentialStdError.code === 'number') &&
      typeof potentialStdError.severity === 'string' &&
      typeof potentialStdError.category === 'string' &&
      typeof potentialStdError.retriable === 'boolean'
    );
  }

  /**
   * 转换Error实例
   */
  private transformErrorInstance(error: Error, context: ErrorContext): StandardizedError {
    // 根据错误名称和消息进行分类
    const { category, severity, code, retriable } = this.classifyError(
      error.name,
      error.message,
      context
    );

    return {
      name: error.name || 'Error',
      message: error.message,
      code,
      severity,
      category,
      retriable,
      stack: error.stack,
      originalError: error,
      context
    };
  }

  /**
   * 转换对象类型错误
   */
  private transformObjectError(
    error: Record<string, any>,
    context: ErrorContext
  ): StandardizedError {
    const errorName = error.name || 'ObjectError';
    let errorMessage = error.message || '对象错误';

    if (typeof errorMessage !== 'string') {
      try {
        errorMessage = JSON.stringify(error);
      } catch {
        errorMessage = '无法序列化的对象错误';
      }
    }

    // 尝试从对象中提取更多上下文
    if (error.status && context.response) {
      context.response.status = error.status;
    }
    if (error.statusText && context.response) {
      context.response.statusText = error.statusText;
    }
    if (error.data && context.response) {
      context.response.data = error.data;
    }

    const { category, severity, code, retriable } = this.classifyError(
      errorName,
      errorMessage,
      context
    );

    return {
      name: errorName,
      message: errorMessage,
      code: error.code || error.errorCode || code,
      severity,
      category,
      retriable,
      originalError: error,
      context
    };
  }

  /**
   * 创建通用错误
   */
  private createGenericError(
    name: string,
    message: string,
    context: ErrorContext,
    originalError?: unknown
  ): StandardizedError {
    const { category, severity, code, retriable } = this.classifyError(name, message, context);

    return {
      name,
      message,
      code,
      severity,
      category,
      retriable,
      originalError,
      context
    };
  }

  /**
   * 根据错误名称、消息和上下文进行分类
   */
  private classifyError(
    name: string,
    message: string,
    context: ErrorContext
  ): {
    category: ErrorCategory;
    severity: ErrorSeverity;
    code: string;
    retriable: boolean;
  } {
    // 网络错误识别
    if (this.isNetworkError(name, message, context)) {
      return {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.ERROR,
        code: 'NETWORK_ERROR',
        retriable: true
      };
    }

    // 服务器错误识别
    if (this.isServerError(name, message, context)) {
      return {
        category: ErrorCategory.SERVER,
        severity: ErrorSeverity.ERROR,
        code: `SERVER_ERROR_${context?.response?.status || 'UNKNOWN'}`,
        retriable: true
      };
    }

    // 客户端错误识别
    if (this.isClientError(name, message, context)) {
      return {
        category: ErrorCategory.CLIENT,
        severity: ErrorSeverity.ERROR,
        code: `CLIENT_ERROR_${context?.response?.status || 'UNKNOWN'}`,
        retriable: false
      };
    }

    // 文件错误识别
    if (this.isFileError(name, message, context)) {
      return {
        category: ErrorCategory.FILE,
        severity: ErrorSeverity.ERROR,
        code: 'FILE_ERROR',
        retriable: false
      };
    }

    // 权限错误识别
    if (this.isPermissionError(name, message, context)) {
      return {
        category: ErrorCategory.PERMISSION,
        severity: ErrorSeverity.ERROR,
        code: 'PERMISSION_DENIED',
        retriable: false
      };
    }

    // 配置错误识别
    if (this.isConfigurationError(name, message)) {
      return {
        category: ErrorCategory.CONFIGURATION,
        severity: ErrorSeverity.ERROR,
        code: 'CONFIGURATION_ERROR',
        retriable: false
      };
    }

    // 默认为未知错误
    return {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.ERROR,
      code: 'UNKNOWN_ERROR',
      retriable: false
    };
  }

  /**
   * 判断是否为网络错误
   */
  private isNetworkError(name: string, message: string, context?: ErrorContext): boolean {
    // 名称特征
    const networkErrorNames = ['NetworkError', 'AbortError', 'TimeoutError', 'FetchError'];

    // 消息特征
    const networkErrorPatterns = [
      /failed to fetch/i,
      /network error/i,
      /网络错误/i,
      /连接失败/i,
      /timeout/i,
      /超时/i,
      /连接超时/i,
      /aborted/i,
      /connection refused/i,
      /断开/i,
      /offline/i,
      /离线/i
    ];

    // 状态码特征
    const isNetworkStatusCode =
      context?.response?.status === 0 || context?.response?.status === undefined;

    return (
      networkErrorNames.some(errorName => name.includes(errorName)) ||
      networkErrorPatterns.some(pattern => pattern.test(message)) ||
      isNetworkStatusCode
    );
  }

  /**
   * 判断是否为服务器错误
   */
  private isServerError(name: string, message: string, context?: ErrorContext): boolean {
    // 服务器错误状态码 (5xx)
    if (
      context?.response?.status &&
      context.response.status >= 500 &&
      context.response.status < 600
    ) {
      return true;
    }

    // 消息特征
    const serverErrorPatterns = [
      /server error/i,
      /服务器错误/i,
      /服务器异常/i,
      /internal server error/i,
      /service unavailable/i,
      /服务不可用/i,
      /gateway timeout/i,
      /网关超时/i
    ];

    return serverErrorPatterns.some(pattern => pattern.test(message));
  }

  /**
   * 判断是否为客户端错误
   */
  private isClientError(name: string, message: string, context?: ErrorContext): boolean {
    // 客户端错误状态码 (4xx)
    if (
      context?.response?.status &&
      context.response.status >= 400 &&
      context.response.status < 500
    ) {
      return true;
    }

    // 消息特征
    const clientErrorPatterns = [
      /client error/i,
      /客户端错误/i,
      /bad request/i,
      /请求错误/i,
      /unauthorized/i,
      /未授权/i,
      /forbidden/i,
      /禁止访问/i,
      /not found/i,
      /未找到/i
    ];

    return clientErrorPatterns.some(pattern => pattern.test(message));
  }

  /**
   * 判断是否为文件错误
   */
  private isFileError(name: string, message: string, context?: ErrorContext): boolean {
    // 文件信息存在
    const hasFileInfo = Boolean(context?.fileInfo);

    // 消息特征
    const fileErrorPatterns = [
      /file not found/i,
      /文件未找到/i,
      /file too large/i,
      /文件太大/i,
      /invalid file/i,
      /无效文件/i,
      /unsupported file/i,
      /不支持的文件/i,
      /文件格式/i,
      /file format/i,
      /文件读取/i,
      /read file/i,
      /file access/i
    ];

    return hasFileInfo && fileErrorPatterns.some(pattern => pattern.test(message));
  }

  /**
   * 判断是否为权限错误
   */
  private isPermissionError(name: string, message: string, context?: ErrorContext): boolean {
    // 401/403状态码
    if (context?.response?.status === 401 || context?.response?.status === 403) {
      return true;
    }

    // 消息特征
    const permissionErrorPatterns = [
      /permission denied/i,
      /权限被拒绝/i,
      /not authorized/i,
      /未授权/i,
      /forbidden/i,
      /禁止访问/i,
      /access denied/i,
      /访问被拒绝/i,
      /无权限/i,
      /requires authentication/i,
      /需要认证/i,
      /invalid token/i,
      /token expired/i,
      /令牌过期/i
    ];

    return permissionErrorPatterns.some(pattern => pattern.test(message));
  }

  /**
   * 判断是否为配置错误
   */
  private isConfigurationError(name: string, message: string): boolean {
    // 消息特征
    const configErrorPatterns = [
      /configuration error/i,
      /配置错误/i,
      /invalid config/i,
      /无效配置/i,
      /missing config/i,
      /缺少配置/i,
      /配置项/i,
      /invalid option/i,
      /无效选项/i,
      /参数错误/i,
      /parameter error/i
    ];

    return configErrorPatterns.some(pattern => pattern.test(message));
  }
}
