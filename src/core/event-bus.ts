import {
  EventBus,
  EventHandler,
  EventSubscription,
  EventSubscriptionOptions,
  EventEmitOptions,
  EventHistoryOptions,
  EventRecord
} from '../types/events';

/**
 * 默认事件订阅选项
 */
const DEFAULT_SUBSCRIPTION_OPTIONS: EventSubscriptionOptions = {
  once: false,
  priority: 0
};

/**
 * 默认事件发布选项
 */
const DEFAULT_EMIT_OPTIONS: EventEmitOptions = {
  async: false,
  waitForAll: true,
  catchErrors: true,
  timeout: 30000 // 30秒超时
};

/**
 * 默认事件历史选项
 */
const DEFAULT_HISTORY_OPTIONS: EventHistoryOptions = {
  enabled: false,
  maxEvents: 100,
  includeData: false,
  eventFilter: null
};

/**
 * 事件总线实现类
 *
 * 提供发布/订阅模式的事件机制，支持事件优先级、通配符订阅等高级特性
 */
export class EventBusImpl implements EventBus {
  /**
   * 订阅表 - 存储事件名称到订阅信息的映射
   */
  private _subscriptions: Map<string, EventSubscription[]> = new Map();

  /**
   * 通配符订阅 - 存储包含通配符的订阅
   */
  private _wildcardSubscriptions: EventSubscription[] = [];

  /**
   * 订阅ID到订阅信息的映射
   */
  private _subscriptionById: Map<string, EventSubscription> = new Map();

  /**
   * 订阅ID计数器
   */
  private _idCounter: number = 0;

  /**
   * 事件历史记录
   */
  private _eventHistory: EventRecord[] = [];

  /**
   * 事件历史设置
   */
  private _historyOptions: EventHistoryOptions = DEFAULT_HISTORY_OPTIONS;

  /**
   * 订阅事件
   *
   * @param eventName 事件名称，支持通配符*匹配任意字符
   * @param handler 事件处理器
   * @param options 订阅选项
   * @returns 订阅ID
   */
  on<T = any>(
    eventName: string,
    handler: EventHandler<T>,
    options?: EventSubscriptionOptions
  ): string {
    if (!eventName || typeof eventName !== 'string') {
      throw new Error('事件名称必须是非空字符串');
    }

    if (typeof handler !== 'function') {
      throw new Error('事件处理器必须是函数');
    }

    const mergedOptions = {
      ...DEFAULT_SUBSCRIPTION_OPTIONS,
      ...options
    };

    const subscriptionId = this._generateSubscriptionId();
    const subscription: EventSubscription = {
      id: subscriptionId,
      eventName,
      handler,
      once: !!mergedOptions.once,
      priority: mergedOptions.priority || 0,
      subscriberId: mergedOptions.subscriberId
    };

    // 存储订阅信息
    this._subscriptionById.set(subscriptionId, subscription);

    // 如果是通配符订阅，存储到通配符列表
    if (this._isWildcardEventName(eventName)) {
      this._addWildcardSubscription(subscription);
    } else {
      // 普通订阅，按事件名称存储
      if (!this._subscriptions.has(eventName)) {
        this._subscriptions.set(eventName, []);
      }

      const subs = this._subscriptions.get(eventName) as EventSubscription[];
      subs.push(subscription);

      // 按优先级排序
      subs.sort((a, b) => b.priority - a.priority);
    }

    return subscriptionId;
  }

  /**
   * 订阅事件，但只触发一次
   *
   * @param eventName 事件名称，支持通配符*匹配任意字符
   * @param handler 事件处理器
   * @param options 订阅选项
   * @returns this 链式调用的实例
   */
  once<T = any>(
    eventName: string,
    handler: EventHandler<T>,
    options?: EventSubscriptionOptions
  ): string {
    return this.on(eventName, handler, {
      ...options,
      once: true
    });
  }

  /**
   * 取消订阅
   *
   * @param subscriptionId 订阅ID
   * @returns 是否成功取消
   */
  off(subscriptionId: string): boolean {
    const subscription = this._subscriptionById.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    this._subscriptionById.delete(subscriptionId);

    if (this._isWildcardEventName(subscription.eventName)) {
      // 从通配符列表中移除
      const index = this._wildcardSubscriptions.findIndex(sub => sub.id === subscriptionId);
      if (index !== -1) {
        this._wildcardSubscriptions.splice(index, 1);
      }
    } else {
      // 从普通订阅列表中移除
      const subs = this._subscriptions.get(subscription.eventName);
      if (subs) {
        const index = subs.findIndex(sub => sub.id === subscriptionId);
        if (index !== -1) {
          subs.splice(index, 1);
        }

        // 如果没有订阅了，清理Map
        if (subs.length === 0) {
          this._subscriptions.delete(subscription.eventName);
        }
      }
    }

    return true;
  }

  /**
   * 取消特定事件的所有订阅
   *
   * @param eventName 事件名称
   * @returns 取消的订阅数量
   */
  offAll(eventName: string): number {
    // 处理普通事件
    let count = 0;
    const subs = this._subscriptions.get(eventName);

    if (subs) {
      // 删除所有订阅ID映射
      for (const sub of subs) {
        this._subscriptionById.delete(sub.id);
        count++;
      }

      // 清除事件订阅列表
      this._subscriptions.delete(eventName);
    }

    // 处理通配符事件（如果需要）
    if (this._isWildcardEventName(eventName)) {
      // 移除完全匹配的通配符订阅
      const initialLength = this._wildcardSubscriptions.length;
      this._wildcardSubscriptions = this._wildcardSubscriptions.filter(sub => {
        if (sub.eventName === eventName) {
          this._subscriptionById.delete(sub.id);
          count++;
          return false;
        }
        return true;
      });

      // 确认移除数量
      count = initialLength - this._wildcardSubscriptions.length;
    }

    return count;
  }

  /**
   * 取消指定订阅者的所有订阅
   *
   * @param subscriberId 订阅者ID
   * @returns 取消的订阅数量
   */
  offBySubscriber(subscriberId: string): number {
    if (!subscriberId) {
      return 0;
    }

    let count = 0;
    const subscriptionsToRemove: string[] = [];

    // 找出需要移除的订阅
    for (const [id, sub] of this._subscriptionById.entries()) {
      if (sub.subscriberId === subscriberId) {
        subscriptionsToRemove.push(id);
      }
    }

    // 逐个移除
    for (const id of subscriptionsToRemove) {
      if (this.off(id)) {
        count++;
      }
    }

    return count;
  }

  /**
   * 发布事件
   *
   * @param eventName 事件名称
   * @param eventData 事件数据
   * @param options 发布选项
   * @returns 同步模式下：处理器数量；异步模式下：Promise对象，resolve为处理器结果数组
   */
  emit<T = any>(
    eventName: string,
    eventData: T,
    options?: EventEmitOptions
  ): Promise<void[]> | number {
    const mergedOptions = {
      ...DEFAULT_EMIT_OPTIONS,
      ...options
    };

    // 记录事件历史
    this._recordEvent(eventName, eventData);

    // 如果是异步模式，调用异步发布方法
    if (mergedOptions.async) {
      return this.emitAsync(eventName, eventData, mergedOptions);
    }

    // 同步模式处理逻辑
    const handlers = this._getEventHandlers(eventName);

    if (handlers.length === 0) {
      return 0;
    }

    // 执行所有处理器
    let handled = 0;
    for (const { handler, once, subscriptionId } of handlers) {
      try {
        handler(eventData);
        handled++;

        // 如果是一次性订阅，则移除
        if (once) {
          this.off(subscriptionId);
        }
      } catch (error) {
        if (!mergedOptions.catchErrors) {
          throw error;
        }

        // 错误日志记录
        console.error(`事件处理器错误 (${eventName}):`, error);
      }
    }

    return handled;
  }

  /**
   * 异步发布事件并等待所有处理器完成
   *
   * @param eventName 事件名称
   * @param eventData 事件数据
   * @param options 发布选项
   * @returns Promise对象，resolve为处理器结果数组
   */
  async emitAsync<T = any>(
    eventName: string,
    eventData: T,
    options?: EventEmitOptions
  ): Promise<void[]> {
    const mergedOptions = {
      ...DEFAULT_EMIT_OPTIONS,
      async: true,
      ...options
    };

    // 记录事件历史（如果启用）
    this._recordEvent(eventName, eventData);

    const handlers = this._getEventHandlers(eventName);

    if (handlers.length === 0) {
      return [];
    }

    // 创建每个处理器的Promise
    const promises = handlers.map(async ({ handler, once, subscriptionId }) => {
      try {
        const result = await handler(eventData);

        // 如果是一次性订阅，移除
        if (once) {
          this.off(subscriptionId);
        }

        return result;
      } catch (error) {
        if (!mergedOptions.catchErrors) {
          throw error;
        }

        // 错误日志记录
        console.error(`异步事件处理器错误 (${eventName}):`, error);
      }
    });

    // 如果需要等待所有处理器完成
    if (mergedOptions.waitForAll) {
      if (mergedOptions.timeout && mergedOptions.timeout > 0) {
        // 创建超时Promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          const id = setTimeout(() => {
            clearTimeout(id);
            reject(new Error(`事件处理超时: ${eventName}`));
          }, mergedOptions.timeout);
        });

        // 与超时Promise竞争
        return Promise.race([Promise.all(promises), timeoutPromise]) as Promise<void[]>;
      } else {
        // 无超时限制
        return Promise.all(promises);
      }
    } else {
      // 不需要等待，立即返回
      for (const promise of promises) {
        promise.catch(() => {}); // 避免未捕获的Promise rejection
      }
      return [] as void[];
    }
  }

  /**
   * 判断事件是否有订阅者
   *
   * @param eventName 事件名称
   * @returns 是否有订阅者
   */
  hasSubscribers(eventName: string): boolean {
    // 检查普通订阅
    if (
      this._subscriptions.has(eventName) &&
      (this._subscriptions.get(eventName)?.length || 0) > 0
    ) {
      return true;
    }

    // 检查通配符订阅是否匹配
    return this._wildcardSubscriptions.some(sub =>
      this._eventMatchesWildcard(eventName, sub.eventName)
    );
  }

  /**
   * 获取指定事件的订阅者数量
   *
   * @param eventName 事件名称
   * @returns 订阅者数量
   */
  countSubscribers(eventName: string): number {
    // 计算普通订阅数量
    const directSubscriptions = this._subscriptions.get(eventName)?.length || 0;

    // 计算匹配的通配符订阅数量
    const wildcardSubscriptions = this._wildcardSubscriptions.filter(sub =>
      this._eventMatchesWildcard(eventName, sub.eventName)
    ).length;

    return directSubscriptions + wildcardSubscriptions;
  }

  /**
   * 获取所有已订阅的事件名称
   *
   * @returns 事件名称数组
   */
  getEventNames(): string[] {
    const eventNames = Array.from(this._subscriptions.keys());

    // 添加通配符订阅的事件名
    for (const sub of this._wildcardSubscriptions) {
      if (!eventNames.includes(sub.eventName)) {
        eventNames.push(sub.eventName);
      }
    }

    return eventNames;
  }

  /**
   * 清空所有订阅
   *
   * @returns this 链式调用的实例
   */
  clear(): EventBus {
    this._subscriptions.clear();
    this._wildcardSubscriptions = [];
    this._subscriptionById.clear();
    return this;
  }

  /**
   * 配置事件历史记录
   *
   * @param options 事件历史选项
   * @returns this 链式调用的实例
   */
  configureHistory(options: Partial<EventHistoryOptions>): EventBus {
    this._historyOptions = {
      ...this._historyOptions,
      ...options
    };

    // 如果禁用了历史记录，清空历史
    if (!this._historyOptions.enabled) {
      this.clearHistory();
    }

    return this;
  }

  /**
   * 清空事件历史记录
   *
   * @returns this 链式调用的实例
   */
  clearHistory(): EventBus {
    this._eventHistory = [];
    return this;
  }

  /**
   * 获取事件历史记录
   *
   * @param eventName 可选，指定事件名称过滤
   * @param limit 可选，限制返回记录数量
   * @returns 事件历史记录数组
   */
  getHistory(eventName?: string, limit?: number): EventRecord[] {
    // 如果历史记录功能未启用，返回空数组
    if (!this._historyOptions.enabled) {
      return [];
    }

    let history = this._eventHistory;

    // 按事件名称过滤
    if (eventName) {
      history = history.filter(
        record =>
          record.eventName === eventName || this._eventMatchesWildcard(record.eventName, eventName)
      );
    }

    // 限制数量
    if (typeof limit === 'number' && limit > 0) {
      history = history.slice(-limit);
    }

    return [...history]; // 返回副本，防止外部修改
  }

  /**
   * 重放历史事件
   *
   * @param eventFilter 可选，事件过滤函数或事件名称
   * @param limit 可选，限制重放的事件数量
   * @returns Promise对象，resolve为重放的事件数量
   */
  async replayHistory(
    eventFilter?: string | ((record: EventRecord) => boolean),
    limit?: number
  ): Promise<number> {
    // 如果历史记录功能未启用，无法重放
    if (!this._historyOptions.enabled || this._eventHistory.length === 0) {
      return 0;
    }

    let historyToReplay = [...this._eventHistory]; // 创建副本

    // 应用过滤器
    if (typeof eventFilter === 'string') {
      // 字符串过滤器，按事件名称过滤
      const eventName = eventFilter;
      historyToReplay = historyToReplay.filter(
        record =>
          record.eventName === eventName || this._eventMatchesWildcard(record.eventName, eventName)
      );
    } else if (typeof eventFilter === 'function') {
      // 函数过滤器
      historyToReplay = historyToReplay.filter(eventFilter);
    }

    // 应用数量限制
    if (typeof limit === 'number' && limit > 0) {
      historyToReplay = historyToReplay.slice(-limit);
    }

    // 重放事件
    for (const record of historyToReplay) {
      // 创建重放的选项，标记为重放事件
      const replayOptions: EventEmitOptions = {
        async: true,
        waitForAll: true,
        catchErrors: true,
        isReplay: true
      };

      // 重放事件但不记录历史
      await this.emitAsync(record.eventName, record.data, replayOptions);
    }

    return historyToReplay.length;
  }

  /**
   * 生成唯一的订阅ID
   */
  private _generateSubscriptionId(): string {
    this._idCounter++;
    return `sub_${Date.now()}_${this._idCounter}`;
  }

  /**
   * 检查事件名是否包含通配符
   *
   * @param eventName 事件名称
   */
  private _isWildcardEventName(eventName: string): boolean {
    return eventName.includes('*');
  }

  /**
   * 添加通配符订阅
   *
   * @param subscription 订阅信息
   */
  private _addWildcardSubscription(subscription: EventSubscription): void {
    this._wildcardSubscriptions.push(subscription);
    // 按优先级排序
    this._wildcardSubscriptions.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 获取指定事件的所有处理器信息
   *
   * @param eventName 事件名称
   */
  private _getEventHandlers(
    eventName: string
  ): Array<EventSubscription & { subscriptionId: string }> {
    const handlers: Array<EventSubscription & { subscriptionId: string }> = [];

    // 添加直接订阅的处理器
    const directSubscriptions = this._subscriptions.get(eventName);
    if (directSubscriptions) {
      for (const sub of directSubscriptions) {
        handlers.push({
          ...sub,
          subscriptionId: sub.id
        });
      }
    }

    // 添加匹配的通配符处理器
    for (const sub of this._wildcardSubscriptions) {
      if (this._eventMatchesWildcard(eventName, sub.eventName)) {
        handlers.push({
          ...sub,
          subscriptionId: sub.id
        });
      }
    }

    // 按优先级排序
    handlers.sort((a, b) => b.priority - a.priority);

    return handlers;
  }

  /**
   * 检查事件名是否匹配通配符模式
   *
   * @param eventName 待检查的事件名
   * @param wildcardPattern 通配符模式
   */
  private _eventMatchesWildcard(eventName: string, wildcardPattern: string): boolean {
    // 转换通配符为正则表达式
    const regexPattern = wildcardPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // 转义正则特殊字符
      .replace(/\*/g, '.*'); // * 替换为 .*

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(eventName);
  }

  /**
   * 记录事件到历史
   *
   * @param eventName 事件名称
   * @param eventData 事件数据
   */
  private _recordEvent<T = any>(eventName: string, eventData: T): void {
    // 如果历史记录功能未启用，直接返回
    if (!this._historyOptions.enabled) {
      return;
    }

    // 应用事件过滤器
    if (
      this._historyOptions.eventFilter &&
      !this._historyOptions.eventFilter(eventName, eventData)
    ) {
      return;
    }

    // 创建事件记录
    const eventRecord: EventRecord = {
      timestamp: Date.now(),
      eventName,
      data: this._historyOptions.includeData ? eventData : undefined
    };

    // 添加到历史记录
    this._eventHistory.push(eventRecord);

    // 如果超出最大记录数，移除最旧的
    if (
      this._historyOptions.maxEvents > 0 &&
      this._eventHistory.length > this._historyOptions.maxEvents
    ) {
      this._eventHistory = this._eventHistory.slice(-this._historyOptions.maxEvents);
    }
  }
}
