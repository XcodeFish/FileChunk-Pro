import { Module as ModuleInterface } from '../types/modules';

/**
 * 内核事件类型
 */
export enum KernelEventType {
  // 内核生命周期事件
  KERNEL_INIT = 'kernel:init',
  KERNEL_INIT_COMPLETE = 'kernel:init:complete',
  KERNEL_START = 'kernel:start',
  KERNEL_START_COMPLETE = 'kernel:start:complete',
  KERNEL_STOP = 'kernel:stop',
  KERNEL_STOP_COMPLETE = 'kernel:stop:complete',
  KERNEL_DESTROY = 'kernel:destroy',
  KERNEL_DESTROY_COMPLETE = 'kernel:destroy:complete',

  // 模块相关事件
  MODULE_REGISTER = 'kernel:module:register',
  MODULE_REGISTER_COMPLETE = 'kernel:module:register:complete',
  MODULE_UNREGISTER = 'kernel:module:unregister',
  MODULE_UNREGISTER_COMPLETE = 'kernel:module:unregister:complete',
  MODULE_INIT = 'kernel:module:init',
  MODULE_INIT_COMPLETE = 'kernel:module:init:complete',
  MODULE_START = 'kernel:module:start',
  MODULE_START_COMPLETE = 'kernel:module:start:complete',
  MODULE_STOP = 'kernel:module:stop',
  MODULE_STOP_COMPLETE = 'kernel:module:stop:complete',
  MODULE_ERROR = 'kernel:module:error',

  // 文件上传相关事件（预留）
  UPLOAD_START = 'kernel:upload:start',
  UPLOAD_PROGRESS = 'kernel:upload:progress',
  UPLOAD_SUCCESS = 'kernel:upload:success',
  UPLOAD_ERROR = 'kernel:upload:error',
  UPLOAD_ABORT = 'kernel:upload:abort',
  UPLOAD_PAUSE = 'kernel:upload:pause',
  UPLOAD_RESUME = 'kernel:upload:resume',

  // 配置相关事件
  CONFIG_CHANGED = 'kernel:config:changed',
  CONFIG_RESET = 'kernel:config:reset',

  // 状态相关事件
  KERNEL_STATE_CHANGED = 'kernel:state:changed',

  // 热替换相关事件
  MODULE_REPLACE = 'kernel:module:replace',
  MODULE_REPLACE_COMPLETE = 'kernel:module:replace:complete'
}

/**
 * 内核配置项
 */
export interface KernelOptions {
  /**
   * 是否启用严格模式
   * 在严格模式下，模块依赖不满足或出现错误时将立即抛出异常
   */
  strictMode?: boolean;

  /**
   * 模块初始化超时时间(ms)
   */
  moduleInitTimeout?: number;

  /**
   * 模块启动超时时间(ms)
   */
  moduleStartTimeout?: number;

  /**
   * 是否自动启动已初始化的模块
   */
  autoStartModules?: boolean;

  /**
   * 调试模式
   */
  debug?: boolean;

  /**
   * 全局配置初始值
   */
  globalConfig?: Record<string, unknown>;
}

/**
 * 内核状态类型定义
 */
export interface KernelState {
  /**
   * 当前状态名称
   */
  status:
    | 'idle'
    | 'initializing'
    | 'initialized'
    | 'starting'
    | 'running'
    | 'stopping'
    | 'stopped'
    | 'error';

  /**
   * 上一个状态
   */
  previousStatus?: string;

  /**
   * 错误信息（如果状态是error）
   */
  error?: Error;

  /**
   * 状态详情信息
   */
  details?: Record<string, unknown>;

  /**
   * 状态更新时间戳
   */
  timestamp: number;
}

/**
 * 微内核核心类
 * 负责模块的注册、管理和生命周期控制
 */
export class Kernel {
  // 存储已注册的模块
  private modules = new Map<string, ModuleInterface>();

  // 事件处理器
  private eventHandlers = new Map<string, Array<(data: unknown) => void>>();

  /**
   * 注册模块
   * @param name 模块名称
   * @param module 模块实例
   */
  registerModule(name: string, module: ModuleInterface): Kernel {
    if (this.modules.has(name)) {
      throw new Error(`模块"${name}"已注册`);
    }

    this.modules.set(name, module);
    // 在注册时直接调用init，不传参数
    module.init();

    return this;
  }

  /**
   * 获取模块
   * @param name 模块名称
   * @returns 模块实例
   */
  getModule<T extends ModuleInterface>(name: string): T {
    const module = this.modules.get(name);
    if (!module) {
      throw new Error(`模块"${name}"未注册`);
    }

    return module as T;
  }

  /**
   * 注册事件监听器
   * @param event 事件名称
   * @param handler 事件处理函数
   */
  on<T>(event: string, handler: (data: T) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }

    this.eventHandlers.get(event)!.push(handler as (data: unknown) => void);
  }

  /**
   * 注销事件监听器
   * @param event 事件名称
   * @param handler 事件处理函数
   */
  off<T>(event: string, handler: (data: T) => void): void {
    if (!this.eventHandlers.has(event)) {
      return;
    }

    const handlers = this.eventHandlers.get(event)!;
    const index = handlers.indexOf(handler as (data: unknown) => void);

    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param data 事件数据
   */
  emit<T>(event: string, data?: T): void {
    if (!this.eventHandlers.has(event)) {
      return;
    }

    const handlers = this.eventHandlers.get(event)!.slice();
    for (const handler of handlers) {
      try {
        handler(data as unknown);
      } catch (error) {
        console.error(`事件处理器错误 (${event}):`, error);
      }
    }
  }
}
