/**
 * 错误处理模块
 *
 * 提供统一的错误处理、错误分类、错误报告和重试策略能力
 */

import { DefaultErrorHandler } from './implementations/error-handler';
import { DefaultErrorTransformer } from './implementations/error-transformer';
import { DefaultErrorFilter } from './implementations/error-filter';
import { DefaultErrorReporter } from './implementations/error-reporter';
import {
  ExponentialBackoffRetryStrategy,
  AdaptiveRetryStrategy
} from './implementations/retry-strategies';
import { DefaultErrorModule } from './implementations/error-module';

export * from './interfaces';
export {
  DefaultErrorHandler,
  DefaultErrorTransformer,
  DefaultErrorFilter,
  DefaultErrorReporter,
  ExponentialBackoffRetryStrategy,
  AdaptiveRetryStrategy,
  DefaultErrorModule
};
