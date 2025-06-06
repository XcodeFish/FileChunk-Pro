/* eslint-disable @typescript-eslint/no-unused-vars */
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
 * 微内核主类 - FileChunk Pro核心引擎
 * 负责模块注册、生命周期管理和全局状态
 */
export class FileChunkKernel {
  // 已注册的模块
  private modules: Map<string, any>;
  // 事件处理器
  private eventHandlers: Map<string, Array<(data?: any) => void>>;
  // 核心配置
  private config: Record<string, any>;
  // 日志工具
  public logger: Logger;

  /**
   * 创建微内核实例
   */
  constructor() {
    this.modules = new Map();
    this.eventHandlers = new Map();
    this.config = {};
    this.logger = new Logger('FileChunkKernel');
  }

  /**
   * 注册模块
   * @param name 模块名称
   * @param module 模块实例
   * @returns 微内核实例(用于链式调用)
   */
  registerModule(name: string, module: any): FileChunkKernel {
    if (this.modules.has(name)) {
      this.logger.warn(`模块"${name}"已存在，将被覆盖`);
    }

    this.modules.set(name, module);

    // 如果模块有init方法，调用它并传入内核引用
    if (typeof module.init === 'function') {
      // 异步初始化，但不等待
      Promise.resolve().then(() => module.init(this));
    }

    this.logger.debug(`模块"${name}"已注册`);
    return this;
  }

  /**
   * 获取已注册的模块
   * @param name 模块名称
   * @returns 模块实例
   */
  getModule<T = any>(name: string): T {
    if (!this.modules.has(name)) {
      throw new Error(`模块"${name}"未注册`);
    }

    return this.modules.get(name) as T;
  }

  /**
   * 注册事件处理器
   * @param event 事件名称
   * @param handler 处理函数
   * @returns 移除监听器的函数
   */
  on<T = any>(event: string, handler: (data?: T) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }

    this.eventHandlers.get(event)!.push(handler);

    // 返回移除监听器的函数
    return () => this.off(event, handler);
  }

  /**
   * 移除事件处理器
   * @param event 事件名称
   * @param handler 处理函数
   */
  off(event: string, handler: (data?: any) => void): void {
    if (!this.eventHandlers.has(event)) return;

    const handlers = this.eventHandlers.get(event)!;
    const index = handlers.indexOf(handler);

    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param data 事件数据
   * @returns 微内核实例(用于链式调用)
   */
  emit<T = any>(event: string, data?: T): FileChunkKernel {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event)!;

      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          this.logger.error(`事件"${event}"处理器执行出错:`, error);
        }
      }
    }

    return this;
  }

  /**
   * 设置配置项
   * @param path 配置路径
   * @param value 配置值
   * @returns 微内核实例(用于链式调用)
   */
  setConfig(path: string, value: any): FileChunkKernel {
    const parts = path.split('.');
    let current = this.config;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
    return this;
  }

  /**
   * 获取配置项
   * @param path 配置路径
   * @param defaultValue 默认值
   * @returns 配置值
   */
  getConfig<T = any>(path: string, defaultValue?: T): T {
    const parts = path.split('.');
    let current: any = this.config;

    for (const part of parts) {
      if (current === undefined || current === null || typeof current !== 'object') {
        return defaultValue as T;
      }
      current = current[part];
    }

    return current !== undefined ? current : (defaultValue as T);
  }

  /**
   * 启动所有模块
   */
  async start(): Promise<void> {
    this.logger.info('正在启动所有模块...');

    // 触发启动前事件
    this.emit('beforeStart');

    // 启动所有模块
    for (const [name, module] of this.modules.entries()) {
      if (typeof module.start === 'function') {
        try {
          this.logger.debug(`正在启动模块"${name}"...`);
          await module.start();
          this.logger.debug(`模块"${name}"已启动`);
        } catch (error) {
          this.logger.error(`模块"${name}"启动失败:`, error);
          throw error;
        }
      }
    }

    // 触发启动完成事件
    this.emit('afterStart');

    this.logger.info('所有模块已启动');
  }

  /**
   * 停止所有模块
   */
  async stop(): Promise<void> {
    this.logger.info('正在停止所有模块...');

    // 触发停止前事件
    this.emit('beforeStop');

    // 停止所有模块
    for (const [name, module] of this.modules.entries()) {
      if (typeof module.stop === 'function') {
        try {
          this.logger.debug(`正在停止模块"${name}"...`);
          await module.stop();
          this.logger.debug(`模块"${name}"已停止`);
        } catch (error) {
          this.logger.error(`模块"${name}"停止失败:`, error);
        }
      }
    }

    // 触发停止完成事件
    this.emit('afterStop');

    this.logger.info('所有模块已停止');
  }
}

/**
 * 简单日志工具
 */
class Logger {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  debug(message: string, ...args: any[]): void {
    console.debug(`[${this.name}] ${message}`, ...args);
  }

  info(message: string, ...args: any[]): void {
    console.info(`[${this.name}] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[${this.name}] ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`[${this.name}] ${message}`, ...args);
  }
}
