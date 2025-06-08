/**
 * FileChunk Pro - 事件总线
 *
 * 实现发布/订阅模式的事件系统，提供事件注册、触发和管理功能。
 */

/**
 * 事件处理器类型定义
 */
export type EventHandler<T = any> = (event: T) => void | Promise<void>;

/**
 * 事件优先级
 */
export enum EventPriority {
  HIGH = 0,
  NORMAL = 1,
  LOW = 2
}

/**
 * 事件处理器配置
 */
export interface EventHandlerConfig<T = any> {
  handler: EventHandler<T>;
  priority: EventPriority;
  once: boolean;
  group?: string;
}

/**
 * 事件总线类
 * 实现事件的发布/订阅模式
 */
export class EventEmitter {
  private handlers: Map<string, EventHandlerConfig[]> = new Map();
  private wildcardHandlers: EventHandlerConfig[] = [];
  private eventHistory: Map<string, any[]> = new Map();
  private maxHistoryLength = 100;
  private enableHistory = false;

  constructor(options?: { enableHistory?: boolean; maxHistoryLength?: number }) {
    this.enableHistory = options?.enableHistory || false;
    this.maxHistoryLength = options?.maxHistoryLength || 100;
  }

  /**
   * 订阅事件
   */
  on<T = any>(
    event: string,
    handler: EventHandler<T>,
    options?: {
      priority?: EventPriority;
      group?: string;
    }
  ): this {
    const config: EventHandlerConfig = {
      handler,
      priority: options?.priority || EventPriority.NORMAL,
      once: false,
      group: options?.group
    };

    this.addHandler(event, config);
    return this;
  }

  /**
   * 一次性订阅事件
   */
  once<T = any>(
    event: string,
    handler: EventHandler<T>,
    options?: {
      priority?: EventPriority;
      group?: string;
    }
  ): this {
    const config: EventHandlerConfig = {
      handler,
      priority: options?.priority || EventPriority.NORMAL,
      once: true,
      group: options?.group
    };

    this.addHandler(event, config);
    return this;
  }

  /**
   * 使用通配符订阅所有事件
   */
  onAny<T = any>(
    handler: EventHandler<T>,
    options?: {
      priority?: EventPriority;
      group?: string;
    }
  ): this {
    const config: EventHandlerConfig = {
      handler,
      priority: options?.priority || EventPriority.NORMAL,
      once: false,
      group: options?.group
    };

    this.wildcardHandlers.push(config);
    this.sortHandlers(this.wildcardHandlers);
    return this;
  }

  /**
   * 取消事件订阅
   */
  off<T = any>(event: string, handler?: EventHandler<T>): this {
    if (!this.handlers.has(event)) {
      return this;
    }

    if (!handler) {
      // 移除所有该事件的处理器
      this.handlers.delete(event);
      return this;
    }

    // 移除特定的处理器
    const handlers = this.handlers.get(event)!.filter(config => config.handler !== handler);

    if (handlers.length === 0) {
      this.handlers.delete(event);
    } else {
      this.handlers.set(event, handlers);
    }

    return this;
  }

  /**
   * 取消通配符事件订阅
   */
  offAny<T = any>(handler?: EventHandler<T>): this {
    if (!handler) {
      this.wildcardHandlers = [];
      return this;
    }

    this.wildcardHandlers = this.wildcardHandlers.filter(config => config.handler !== handler);
    return this;
  }

  /**
   * 按组取消订阅
   */
  offGroup(group: string): this {
    // 从所有事件中移除该组的处理器
    for (const [event, handlers] of this.handlers.entries()) {
      const filteredHandlers = handlers.filter(config => config.group !== group);

      if (filteredHandlers.length === 0) {
        this.handlers.delete(event);
      } else {
        this.handlers.set(event, filteredHandlers);
      }
    }

    // 从通配符处理器中移除该组
    this.wildcardHandlers = this.wildcardHandlers.filter(config => config.group !== group);

    return this;
  }

  /**
   * 发布事件
   */
  async emit<T = any>(event: string, payload?: T): Promise<void> {
    // 记录事件历史
    if (this.enableHistory) {
      this.recordEventHistory(event, payload);
    }

    const promises: Promise<void>[] = [];

    // 执行特定事件处理器
    if (this.handlers.has(event)) {
      const handlers = [...this.handlers.get(event)!];
      const oncers: EventHandlerConfig[] = [];

      // 执行处理器并收集一次性处理器
      for (const config of handlers) {
        try {
          const result = config.handler(payload);
          if (result instanceof Promise) {
            promises.push(result);
          }

          if (config.once) {
            oncers.push(config);
          }
        } catch (error) {
          console.error(`Error in event handler for "${event}":`, error);
        }
      }

      // 移除一次性处理器
      if (oncers.length > 0) {
        const remaining = handlers.filter(config => !oncers.includes(config));
        if (remaining.length === 0) {
          this.handlers.delete(event);
        } else {
          this.handlers.set(event, remaining);
        }
      }
    }

    // 执行通配符处理器
    for (const config of this.wildcardHandlers) {
      try {
        const result = config.handler({ event, payload });
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (error) {
        console.error(`Error in wildcard handler for "${event}":`, error);
      }
    }

    // 等待所有异步处理器完成
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  /**
   * 同步发布事件（不等待异步处理器完成）
   */
  emitSync<T = any>(event: string, payload?: T): void {
    // 记录事件历史
    if (this.enableHistory) {
      this.recordEventHistory(event, payload);
    }

    // 执行特定事件处理器
    if (this.handlers.has(event)) {
      const handlers = [...this.handlers.get(event)!];
      const oncers: EventHandlerConfig[] = [];

      // 执行处理器并收集一次性处理器
      for (const config of handlers) {
        try {
          config.handler(payload);

          if (config.once) {
            oncers.push(config);
          }
        } catch (error) {
          console.error(`Error in event handler for "${event}":`, error);
        }
      }

      // 移除一次性处理器
      if (oncers.length > 0) {
        const remaining = handlers.filter(config => !oncers.includes(config));
        if (remaining.length === 0) {
          this.handlers.delete(event);
        } else {
          this.handlers.set(event, remaining);
        }
      }
    }

    // 执行通配符处理器
    for (const config of this.wildcardHandlers) {
      try {
        config.handler({ event, payload });
      } catch (error) {
        console.error(`Error in wildcard handler for "${event}":`, error);
      }
    }
  }

  /**
   * 检查是否有事件监听器
   */
  hasListeners(event?: string): boolean {
    if (event) {
      return this.handlers.has(event) && this.handlers.get(event)!.length > 0;
    }
    return this.handlers.size > 0 || this.wildcardHandlers.length > 0;
  }

  /**
   * 获取事件监听器数量
   */
  listenerCount(event?: string): number {
    if (event) {
      return this.handlers.has(event) ? this.handlers.get(event)!.length : 0;
    }

    let count = this.wildcardHandlers.length;
    for (const handlers of this.handlers.values()) {
      count += handlers.length;
    }
    return count;
  }

  /**
   * 清除所有事件监听器
   */
  clear(): this {
    this.handlers.clear();
    this.wildcardHandlers = [];
    return this;
  }

  /**
   * 获取事件历史记录
   */
  getEventHistory(event?: string): Array<{ event: string; payload: any; timestamp: number }> {
    if (!this.enableHistory) {
      return [];
    }

    if (event) {
      return this.eventHistory.get(event) || [];
    }

    const history: Array<{ event: string; payload: any; timestamp: number }> = [];
    for (const [, events] of this.eventHistory.entries()) {
      history.push(...events);
    }

    // 按时间戳排序
    return history.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 清除事件历史
   */
  clearHistory(event?: string): this {
    if (!this.enableHistory) {
      return this;
    }

    if (event) {
      this.eventHistory.delete(event);
    } else {
      this.eventHistory.clear();
    }

    return this;
  }

  /**
   * 添加事件处理器
   */
  private addHandler(event: string, config: EventHandlerConfig): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }

    this.handlers.get(event)!.push(config);
    this.sortHandlers(this.handlers.get(event)!);
  }

  /**
   * 按优先级排序处理器
   */
  private sortHandlers(handlers: EventHandlerConfig[]): void {
    handlers.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 记录事件历史
   */
  private recordEventHistory<T>(event: string, payload?: T): void {
    if (!this.enableHistory) {
      return;
    }

    if (!this.eventHistory.has(event)) {
      this.eventHistory.set(event, []);
    }

    const eventList = this.eventHistory.get(event)!;
    eventList.push({
      event,
      payload,
      timestamp: Date.now()
    });

    // 限制历史记录长度
    if (eventList.length > this.maxHistoryLength) {
      eventList.shift();
    }
  }
}
