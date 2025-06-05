import { EventEmitter } from 'events';

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
 * 微内核引擎类
 * FileChunk Pro的核心架构组件，负责模块的注册和管理
 */
export class FileChunkKernel {
  private modules: Map<string, any> = new Map();
  private eventEmitter: EventEmitter = new EventEmitter();
  private state: Record<string, any> = {
    status: 'idle'
  };

  /**
   * 注册模块
   * @param name 模块名称
   * @param module 模块实例
   */
  public registerModule(name: string, module: any): this {
    this.modules.set(name, module);

    // 如果模块有初始化方法，调用它
    if (typeof module.init === 'function') {
      module.init(this);
    }

    return this;
  }

  /**
   * 获取已注册的模块
   * @param name 模块名称
   */
  public getModule<T = any>(name: string): T {
    if (!this.modules.has(name)) {
      throw new Error(`模块 ${name} 未注册`);
    }
    return this.modules.get(name) as T;
  }

  /**
   * 注册事件监听器
   * @param event 事件名称
   * @param handler 事件处理函数
   */
  public on(event: string, handler: (...args: any[]) => void): this {
    this.eventEmitter.on(event, handler);
    return this;
  }

  /**
   * 移除事件监听器
   * @param event 事件名称
   * @param handler 事件处理函数
   */
  public off(event: string, handler: (...args: any[]) => void): this {
    this.eventEmitter.off(event, handler);
    return this;
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param args 事件参数
   */
  public emit(event: string, ...args: any[]): boolean {
    return this.eventEmitter.emit(event, ...args);
  }

  /**
   * 更新内核状态
   * @param newState 新状态
   */
  public updateState(newState: Record<string, any>): void {
    this.state = { ...this.state, ...newState };
    this.emit('stateChange', this.state);
  }

  /**
   * 获取当前状态
   */
  public getState(): Record<string, any> {
    return { ...this.state };
  }
}
