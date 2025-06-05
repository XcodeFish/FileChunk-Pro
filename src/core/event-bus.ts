/**
 * FileChunk Pro - 事件总线
 *
 * 实现发布/订阅模式的事件系统，提供事件注册、触发和管理功能。
 */

/**
 * 事件处理函数类型
 */
export type EventHandler = (...args: any[]) => void;

/**
 * 事件优先级
 */
export enum EventPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2
}

/**
 * 事件订阅选项
 */
export interface EventSubscriptionOptions {
  /**
   * 事件处理优先级
   */
  priority?: EventPriority;

  /**
   * 是否只触发一次后自动移除
   */
  once?: boolean;
}

/**
 * 事件订阅者信息
 */
interface Subscription {
  handler: EventHandler;
  priority: EventPriority;
  once: boolean;
}

/**
 * 事件总线实现类
 */
export class EventEmitter {
  /**
   * 事件处理函数映射表
   */
  private eventMap: Map<string, Subscription[]>;

  /**
   * 通配符事件处理函数
   */
  private wildcardHandlers: Subscription[];

  /**
   * 是否启用异步事件处理
   */
  private asyncEnabled: boolean;

  /**
   * 构造函数
   */
  constructor() {
    this.eventMap = new Map();
    this.wildcardHandlers = [];
    this.asyncEnabled = false;
  }

  /**
   * 启用异步事件分发
   */
  public enableAsync(): this {
    this.asyncEnabled = true;
    return this;
  }

  /**
   * 禁用异步事件分发
   */
  public disableAsync(): this {
    this.asyncEnabled = false;
    return this;
  }

  /**
   * 注册事件监听器
   *
   * @param event 事件名称，使用*表示监听所有事件
   * @param handler 事件处理函数
   * @param options 订阅选项
   */
  public on(event: string, handler: EventHandler, options: EventSubscriptionOptions = {}): this {
    const subscription: Subscription = {
      handler,
      priority: options.priority || EventPriority.NORMAL,
      once: !!options.once
    };

    if (event === '*') {
      this.wildcardHandlers.push(subscription);
      this.sortSubscriptions(this.wildcardHandlers);
    } else {
      if (!this.eventMap.has(event)) {
        this.eventMap.set(event, []);
      }

      const handlers = this.eventMap.get(event)!;
      handlers.push(subscription);
      this.sortSubscriptions(handlers);
    }

    return this;
  }

  /**
   * 注册一次性事件监听器
   *
   * @param event 事件名称
   * @param handler 事件处理函数
   * @param options 订阅选项
   */
  public once(event: string, handler: EventHandler, options: EventSubscriptionOptions = {}): this {
    return this.on(event, handler, { ...options, once: true });
  }

  /**
   * 移除事件监听器
   *
   * @param event 事件名称
   * @param handler 事件处理函数，如果不提供则移除该事件的所有监听器
   */
  public off(event: string, handler?: EventHandler): this {
    if (event === '*') {
      if (handler) {
        const index = this.wildcardHandlers.findIndex(sub => sub.handler === handler);
        if (index !== -1) {
          this.wildcardHandlers.splice(index, 1);
        }
      } else {
        this.wildcardHandlers = [];
      }
    } else if (this.eventMap.has(event)) {
      if (handler) {
        const handlers = this.eventMap.get(event)!;
        const index = handlers.findIndex(sub => sub.handler === handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      } else {
        this.eventMap.delete(event);
      }
    }

    return this;
  }

  /**
   * 触发事件
   *
   * @param event 事件名称
   * @param args 传递给事件处理函数的参数
   */
  public emit(event: string, ...args: any[]): this {
    // 处理具体事件
    if (this.eventMap.has(event)) {
      this.triggerHandlers(this.eventMap.get(event)!, args);
    }

    // 处理通配符事件
    if (this.wildcardHandlers.length > 0) {
      this.triggerHandlers(this.wildcardHandlers, [event, ...args]);
    }

    return this;
  }

  /**
   * 触发事件处理函数
   */
  private triggerHandlers(handlers: Subscription[], args: any[]): void {
    // 创建副本以避免在迭代中修改数组时的问题
    const handlersToTrigger = [...handlers];

    // 记录需要移除的一次性处理函数
    const onceHandlers: Subscription[] = [];

    for (const subscription of handlersToTrigger) {
      try {
        if (this.asyncEnabled) {
          setTimeout(() => {
            subscription.handler(...args);
          }, 0);
        } else {
          subscription.handler(...args);
        }

        // 记录需要移除的一次性处理函数
        if (subscription.once) {
          onceHandlers.push(subscription);
        }
      } catch (error) {
        console.error('事件处理函数执行错误:', error);
      }
    }

    // 移除已触发的一次性处理函数
    if (onceHandlers.length > 0) {
      for (const sub of onceHandlers) {
        const index = handlers.indexOf(sub);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    }
  }

  /**
   * 按优先级排序订阅列表
   */
  private sortSubscriptions(subscriptions: Subscription[]): void {
    subscriptions.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 检查事件是否有监听器
   *
   * @param event 事件名称
   */
  public hasListeners(event: string): boolean {
    return (
      (this.eventMap.has(event) && this.eventMap.get(event)!.length > 0) ||
      this.wildcardHandlers.length > 0
    );
  }

  /**
   * 获取事件监听器数量
   *
   * @param event 事件名称，不提供则返回所有事件的监听器总数
   */
  public listenerCount(event?: string): number {
    if (event) {
      return event === '*'
        ? this.wildcardHandlers.length
        : this.eventMap.has(event)
          ? this.eventMap.get(event)!.length
          : 0;
    } else {
      let count = this.wildcardHandlers.length;
      this.eventMap.forEach(handlers => {
        count += handlers.length;
      });
      return count;
    }
  }

  /**
   * 移除所有事件监听器
   */
  public removeAllListeners(): this {
    this.eventMap.clear();
    this.wildcardHandlers = [];
    return this;
  }
}
