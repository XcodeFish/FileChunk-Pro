/**
 * 事件处理器类型
 */
export type EventHandler<T = any> = (eventData: T) => void | Promise<void>;

/**
 * 事件处理器注册信息
 */
export interface EventSubscription {
  /**
   * 订阅ID
   */
  id: string;

  /**
   * 事件名称
   */
  eventName: string;

  /**
   * 事件处理器
   */
  handler: EventHandler;

  /**
   * 调用一次后自动取消订阅
   */
  once: boolean;

  /**
   * 优先级，数字越大优先级越高
   */
  priority: number;

  /**
   * 订阅者ID，用于识别订阅者并支持批量取消订阅
   */
  subscriberId?: string;
}

/**
 * 事件订阅选项
 */
export interface EventSubscriptionOptions {
  /**
   * 调用一次后自动取消订阅
   */
  once?: boolean;

  /**
   * 优先级，数字越大优先级越高
   */
  priority?: number;

  /**
   * 订阅者ID
   */
  subscriberId?: string;
}

/**
 * 事件发布选项
 */
export interface EventEmitOptions {
  /**
   * 是否异步发布事件
   */
  async?: boolean;

  /**
   * 异步发布时是否等待所有处理器完成
   */
  waitForAll?: boolean;

  /**
   * 是否捕获处理器中的错误
   */
  catchErrors?: boolean;

  /**
   * 超时时间(ms)，仅在异步且waitForAll时有效
   */
  timeout?: number;
}

/**
 * 事件总线接口
 */
export interface EventBus {
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
  ): string;

  /**
   * 订阅事件，但只触发一次
   *
   * @param eventName 事件名称，支持通配符*匹配任意字符
   * @param handler 事件处理器
   * @param options 订阅选项
   * @returns 订阅ID
   */
  once<T = any>(
    eventName: string,
    handler: EventHandler<T>,
    options?: EventSubscriptionOptions
  ): string;

  /**
   * 取消订阅
   *
   * @param subscriptionId 订阅ID
   * @returns 是否成功取消
   */
  off(subscriptionId: string): boolean;

  /**
   * 取消特定事件的所有订阅
   *
   * @param eventName 事件名称
   * @returns 取消的订阅数量
   */
  offAll(eventName: string): number;

  /**
   * 取消指定订阅者的所有订阅
   *
   * @param subscriberId 订阅者ID
   * @returns 取消的订阅数量
   */
  offBySubscriber(subscriberId: string): number;

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
  ): Promise<void[]> | number;

  /**
   * 同步发布事件并等待所有处理器完成
   *
   * @param eventName 事件名称
   * @param eventData 事件数据
   * @param options 发布选项
   * @returns Promise对象，resolve为处理器结果数组
   */
  emitAsync<T = any>(eventName: string, eventData: T, options?: EventEmitOptions): Promise<void[]>;

  /**
   * 判断事件是否有订阅者
   *
   * @param eventName 事件名称
   * @returns 是否有订阅者
   */
  hasSubscribers(eventName: string): boolean;

  /**
   * 获取指定事件的订阅者数量
   *
   * @param eventName 事件名称
   * @returns 订阅者数量
   */
  countSubscribers(eventName: string): number;

  /**
   * 获取所有已订阅的事件名称
   *
   * @returns 事件名称数组
   */
  getEventNames(): string[];

  /**
   * 清空所有订阅
   */
  clear(): void;
}
