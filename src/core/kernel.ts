/* eslint-disable @typescript-eslint/no-unused-vars */
import { EventEmitter } from './event-bus';

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
 * 模块接口定义
 */
export interface Module {
  id: string;
  dependencies?: string[];
  initialize: () => Promise<void> | void;
  start?: () => Promise<void> | void;
  stop?: () => Promise<void> | void;
  destroy?: () => Promise<void> | void;
}

/**
 * 核心配置接口
 */
export interface KernelConfig {
  [key: string]: any;
}

/**
 * 模块状态枚举
 */
export enum ModuleState {
  REGISTERED = 'registered',
  INITIALIZED = 'initialized',
  STARTED = 'started',
  STOPPED = 'stopped',
  ERROR = 'error'
}

/**
 * 微内核主类
 * 负责模块注册、生命周期管理和依赖解析
 */
export class FileChunkKernel {
  // 模块注册表
  private modules: Map<string, Module> = new Map();

  // 模块状态表
  private moduleStates: Map<string, ModuleState> = new Map();

  // 全局配置
  private config: KernelConfig = {};

  // 事件总线
  private eventBus: EventEmitter;

  /**
   * 构造函数
   */
  constructor(config?: KernelConfig) {
    this.config = config || {};
    this.eventBus = new EventEmitter();
    this.initializeEvents();
  }

  /**
   * 初始化内核事件
   */
  private initializeEvents(): void {
    this.eventBus.on('module:error', event => {
      console.error(`Module ${event.moduleId} error:`, event.error);
    });
  }

  /**
   * 注册模块
   */
  registerModule(module: Module): boolean {
    if (this.modules.has(module.id)) {
      console.warn(`Module ${module.id} is already registered`);
      return false;
    }

    this.modules.set(module.id, module);
    this.moduleStates.set(module.id, ModuleState.REGISTERED);
    this.eventBus.emit('module:registered', { moduleId: module.id });
    return true;
  }

  /**
   * 获取模块
   */
  getModule<T extends Module>(id: string): T | undefined {
    return this.modules.get(id) as T | undefined;
  }

  /**
   * 初始化模块
   */
  async initializeModule(moduleId: string): Promise<boolean> {
    if (!this.modules.has(moduleId)) {
      console.error(`Module ${moduleId} is not registered`);
      return false;
    }

    if (this.moduleStates.get(moduleId) !== ModuleState.REGISTERED) {
      return true; // 已经初始化
    }

    const module = this.modules.get(moduleId)!;

    // 检查依赖并初始化
    if (module.dependencies && module.dependencies.length > 0) {
      for (const depId of module.dependencies) {
        if (!this.modules.has(depId)) {
          console.error(`Module ${moduleId} depends on ${depId}, but it's not registered`);
          this.moduleStates.set(moduleId, ModuleState.ERROR);
          this.eventBus.emit('module:error', {
            moduleId,
            error: new Error(`Missing dependency: ${depId}`)
          });
          return false;
        }

        // 初始化依赖模块
        const success = await this.initializeModule(depId);
        if (!success) {
          this.moduleStates.set(moduleId, ModuleState.ERROR);
          this.eventBus.emit('module:error', {
            moduleId,
            error: new Error(`Failed to initialize dependency: ${depId}`)
          });
          return false;
        }
      }
    }

    // 初始化模块
    try {
      this.eventBus.emit('module:beforeInitialize', { moduleId });
      await Promise.resolve(module.initialize());
      this.moduleStates.set(moduleId, ModuleState.INITIALIZED);
      this.eventBus.emit('module:initialized', { moduleId });
      return true;
    } catch (error) {
      this.moduleStates.set(moduleId, ModuleState.ERROR);
      this.eventBus.emit('module:error', { moduleId, error });
      return false;
    }
  }

  /**
   * 启动模块
   */
  async startModule(moduleId: string): Promise<boolean> {
    if (!this.modules.has(moduleId)) {
      console.error(`Module ${moduleId} is not registered`);
      return false;
    }

    const state = this.moduleStates.get(moduleId);
    if (state === ModuleState.STARTED) {
      return true; // 已经启动
    }

    if (state !== ModuleState.INITIALIZED) {
      // 尝试先初始化模块
      const initialized = await this.initializeModule(moduleId);
      if (!initialized) {
        return false;
      }
    }

    const module = this.modules.get(moduleId)!;

    // 启动模块
    try {
      this.eventBus.emit('module:beforeStart', { moduleId });

      if (module.start) {
        await Promise.resolve(module.start());
      }

      this.moduleStates.set(moduleId, ModuleState.STARTED);
      this.eventBus.emit('module:started', { moduleId });
      return true;
    } catch (error) {
      this.moduleStates.set(moduleId, ModuleState.ERROR);
      this.eventBus.emit('module:error', { moduleId, error });
      return false;
    }
  }

  /**
   * 停止模块
   */
  async stopModule(moduleId: string): Promise<boolean> {
    if (!this.modules.has(moduleId)) {
      console.error(`Module ${moduleId} is not registered`);
      return false;
    }

    const state = this.moduleStates.get(moduleId);
    if (state !== ModuleState.STARTED) {
      return true; // 已经停止或从未启动
    }

    const module = this.modules.get(moduleId)!;

    // 检查是否有其他运行中的模块依赖该模块
    for (const [id, mod] of this.modules.entries()) {
      if (
        id !== moduleId &&
        this.moduleStates.get(id) === ModuleState.STARTED &&
        mod.dependencies?.includes(moduleId)
      ) {
        console.error(`Cannot stop module ${moduleId}: it's a dependency of running module ${id}`);
        return false;
      }
    }

    // 停止模块
    try {
      this.eventBus.emit('module:beforeStop', { moduleId });

      if (module.stop) {
        await Promise.resolve(module.stop());
      }

      this.moduleStates.set(moduleId, ModuleState.STOPPED);
      this.eventBus.emit('module:stopped', { moduleId });
      return true;
    } catch (error) {
      this.moduleStates.set(moduleId, ModuleState.ERROR);
      this.eventBus.emit('module:error', { moduleId, error });
      return false;
    }
  }

  /**
   * 销毁模块
   */
  async destroyModule(moduleId: string): Promise<boolean> {
    if (!this.modules.has(moduleId)) {
      console.error(`Module ${moduleId} is not registered`);
      return false;
    }

    // 检查是否有其他模块依赖该模块
    for (const [id, mod] of this.modules.entries()) {
      if (id !== moduleId && mod.dependencies?.includes(moduleId)) {
        console.error(`Cannot destroy module ${moduleId}: it's a dependency of module ${id}`);
        return false;
      }
    }

    const module = this.modules.get(moduleId)!;
    const state = this.moduleStates.get(moduleId);

    // 如果模块在运行，先停止它
    if (state === ModuleState.STARTED) {
      const stopped = await this.stopModule(moduleId);
      if (!stopped) {
        return false;
      }
    }

    // 销毁模块
    try {
      this.eventBus.emit('module:beforeDestroy', { moduleId });

      if (module.destroy) {
        await Promise.resolve(module.destroy());
      }

      this.modules.delete(moduleId);
      this.moduleStates.delete(moduleId);
      this.eventBus.emit('module:destroyed', { moduleId });
      return true;
    } catch (error) {
      this.moduleStates.set(moduleId, ModuleState.ERROR);
      this.eventBus.emit('module:error', { moduleId, error });
      return false;
    }
  }

  /**
   * 获取模块状态
   */
  getModuleState(moduleId: string): ModuleState | undefined {
    return this.moduleStates.get(moduleId);
  }

  /**
   * 获取所有已注册模块
   */
  getModuleIds(): string[] {
    return Array.from(this.modules.keys());
  }

  /**
   * 获取事件总线
   */
  getEventBus(): EventEmitter {
    return this.eventBus;
  }

  /**
   * 设置配置项
   */
  setConfig(path: string, value: any): void {
    // 支持点表示法路径设置配置
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
    this.eventBus.emit('config:updated', { path, value });
  }

  /**
   * 获取配置项
   */
  getConfig<T = any>(path?: string, defaultValue?: T): T {
    if (!path) {
      return this.config as unknown as T;
    }

    // 支持点表示法路径获取配置
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
   * 批量更新配置
   */
  updateConfig(config: KernelConfig): void {
    this.config = this.deepMerge(this.config, config);
    this.eventBus.emit('config:batch:updated', { config });
  }

  /**
   * 深度合并对象
   */
  private deepMerge(target: any, source: any): any {
    const output = { ...target };

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }

    return output;
  }

  /**
   * 判断是否为对象
   */
  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * 初始化所有模块
   */
  async initializeAll(): Promise<boolean> {
    let success = true;

    // 获取模块依赖图的拓扑排序
    const sortedModules = this.topologicalSort();

    for (const moduleId of sortedModules) {
      const result = await this.initializeModule(moduleId);
      if (!result) {
        success = false;
      }
    }

    return success;
  }

  /**
   * 启动所有模块
   */
  async startAll(): Promise<boolean> {
    let success = true;

    // 获取模块依赖图的拓扑排序
    const sortedModules = this.topologicalSort();

    for (const moduleId of sortedModules) {
      const result = await this.startModule(moduleId);
      if (!result) {
        success = false;
      }
    }

    return success;
  }

  /**
   * 停止所有模块
   */
  async stopAll(): Promise<boolean> {
    let success = true;

    // 以依赖的逆序停止模块
    const sortedModules = this.topologicalSort().reverse();

    for (const moduleId of sortedModules) {
      const result = await this.stopModule(moduleId);
      if (!result) {
        success = false;
      }
    }

    return success;
  }

  /**
   * 销毁所有模块
   */
  async destroyAll(): Promise<boolean> {
    let success = true;

    // 以依赖的逆序销毁模块
    const sortedModules = this.topologicalSort().reverse();

    for (const moduleId of sortedModules) {
      const result = await this.destroyModule(moduleId);
      if (!result) {
        success = false;
      }
    }

    return success;
  }

  /**
   * 模块拓扑排序（处理依赖关系）
   */
  private topologicalSort(): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    // 深度优先搜索函数
    const dfs = (moduleId: string): boolean => {
      if (temp.has(moduleId)) {
        // 检测到循环依赖
        console.error(`Circular dependency detected: ${moduleId}`);
        return false;
      }

      if (visited.has(moduleId)) {
        return true;
      }

      temp.add(moduleId);

      const module = this.modules.get(moduleId);
      if (module && module.dependencies) {
        for (const depId of module.dependencies) {
          if (!this.modules.has(depId)) {
            console.error(
              `Missing dependency: ${moduleId} depends on ${depId}, but it's not registered`
            );
            return false;
          }

          if (!dfs(depId)) {
            return false;
          }
        }
      }

      temp.delete(moduleId);
      visited.add(moduleId);
      result.push(moduleId);
      return true;
    };

    // 遍历所有模块
    for (const moduleId of this.modules.keys()) {
      if (!visited.has(moduleId)) {
        if (!dfs(moduleId)) {
          throw new Error('Cannot sort modules due to circular dependency');
        }
      }
    }

    return result;
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
