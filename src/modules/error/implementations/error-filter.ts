/**
 * 错误过滤器实现
 *
 * 提供错误过滤规则管理与应用功能
 */

import { ErrorFilter, ErrorFilterCondition, StandardizedError } from '../interfaces';

/**
 * 默认错误过滤器实现
 */
export class DefaultErrorFilter implements ErrorFilter {
  private rules: Array<{
    condition: ErrorFilterCondition;
    action: (error: StandardizedError) => StandardizedError | null;
  }> = [];

  /**
   * 根据条件匹配错误
   * @param error 标准化错误对象
   * @param condition 过滤条件
   */
  match(error: StandardizedError, condition: ErrorFilterCondition): boolean {
    // 如果提供了自定义断言函数，直接使用它
    if (condition.predicate && typeof condition.predicate === 'function') {
      return condition.predicate(error);
    }

    // 匹配错误名称
    if (condition.name !== undefined) {
      if (typeof condition.name === 'string') {
        if (error.name !== condition.name) {
          return false;
        }
      } else if (condition.name instanceof RegExp) {
        if (!condition.name.test(error.name)) {
          return false;
        }
      }
    }

    // 匹配错误消息
    if (condition.message !== undefined) {
      if (typeof condition.message === 'string') {
        if (error.message !== condition.message) {
          return false;
        }
      } else if (condition.message instanceof RegExp) {
        if (!condition.message.test(error.message)) {
          return false;
        }
      }
    }

    // 匹配错误代码
    if (condition.code !== undefined) {
      if (Array.isArray(condition.code)) {
        if (!condition.code.includes(error.code)) {
          return false;
        }
      } else {
        if (error.code !== condition.code) {
          return false;
        }
      }
    }

    // 匹配错误严重程度
    if (condition.severity !== undefined) {
      if (Array.isArray(condition.severity)) {
        if (!condition.severity.includes(error.severity)) {
          return false;
        }
      } else {
        if (error.severity !== condition.severity) {
          return false;
        }
      }
    }

    // 匹配错误类别
    if (condition.category !== undefined) {
      if (Array.isArray(condition.category)) {
        if (!condition.category.includes(error.category)) {
          return false;
        }
      } else {
        if (error.category !== condition.category) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 添加过滤规则
   * @param condition 过滤条件
   * @param action 匹配后的操作
   */
  addRule(
    condition: ErrorFilterCondition,
    action: (error: StandardizedError) => StandardizedError | null
  ): void {
    this.rules.push({ condition, action });
  }

  /**
   * 应用所有过滤规则
   * @param error 标准化错误对象
   * @returns 处理后的错误对象，如果返回null则表示该错误被过滤掉
   */
  applyRules(error: StandardizedError): StandardizedError | null {
    let currentError = { ...error };

    for (const { condition, action } of this.rules) {
      if (this.match(currentError, condition)) {
        const result = action(currentError);

        // 如果规则处理返回null，则表示错误应被过滤掉
        if (result === null) {
          return null;
        }

        // 更新当前错误对象
        currentError = result;
      }
    }

    return currentError;
  }
}
