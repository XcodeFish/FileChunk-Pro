import {
  Module,
  ModuleStatus,
  ModuleRegistrationOptions,
  ModuleRegistrationError,
  ModuleLifecycleError
} from '../types/modules';
import { BaseModule } from './module-base';
import {
  ModuleRegistryImpl,
  ModuleHotReplaceOptions,
  ModuleDependencyGraph
} from './module-registry';
import { EventBusImpl } from './event-bus';
import {
  EventBus,
  EventHandler,
  EventSubscriptionOptions,
  EventEmitOptions
} from '../types/events';

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
  globalConfig?: Record<string, any>;
}

/**
 * 默认内核配置
 */
const DEFAULT_KERNEL_OPTIONS: KernelOptions = {
  strictMode: false,
  moduleInitTimeout: 30000, // 30秒
  moduleStartTimeout: 30000, // 30秒
  autoStartModules: false,
  debug: false,
  globalConfig: {}
};

/**
 * 默认全局配置
 */
const DEFAULT_GLOBAL_CONFIG: Record<string, any> = {
  // 传输配置
  transport: {
    // 默认分片大小 2MB
    defaultChunkSize: 2 * 1024 * 1024,
    // 最小分片大小 100KB
    minChunkSize: 100 * 1024,
    // 最大分片大小 10MB
    maxChunkSize: 10 * 1024 * 1024,
    // 默认并发数
    concurrency: 3,
    // 上传超时时间（毫秒）
    timeout: 30000,
    // 重试次数
    retryCount: 3,
    // 重试延迟（毫秒）
    retryDelay: 1000
  },

  // 存储配置
  storage: {
    // 默认存储引擎
    defaultEngine: 'indexeddb',
    // 存储过期时间（小时）
    expireTime: 24
  },

  // 安全配置
  security: {
    // 是否启用文件完整性校验
    enableIntegrityCheck: true,
    // 默认哈希算法
    hashAlgorithm: 'md5'
  }
};

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
  details?: Record<string, any>;

  /**
   * 状态更新时间戳
   */
  timestamp: number;
}

/**
 * 微内核引擎
 *
 * 负责模块的注册、管理和生命周期控制
 */
export class Kernel {
  /**
   * 内核配置项
   */
  private readonly _options: KernelOptions;

  /**
   * 模块注册中心实例
   */
  private readonly _registry: ModuleRegistryImpl;

  /**
   * 事件总线实例
   */
  private readonly _eventBus: EventBusImpl;

  /**
   * 全局配置
   */
  private _globalConfig: Record<string, any>;

  /**
   * 内核是否已初始化
   */
  private _initialized: boolean = false;

  /**
   * 内核是否已启动
   */
  private _started: boolean = false;

  /**
   * 内核状态
   */
  private _state: KernelState = {
    status: 'idle',
    timestamp: Date.now()
  };

  /**
   * 状态监听器映射
   */
  private _stateListeners: Map<string, ((state: KernelState) => void)[]> = new Map();

  /**
   * 构造函数
   *
   * @param options - 内核配置项
   */
  constructor(options: KernelOptions = {}) {
    this._options = { ...DEFAULT_KERNEL_OPTIONS, ...options };
    this._registry = new ModuleRegistryImpl();
    this._eventBus = new EventBusImpl();

    // 初始化全局配置
    this._globalConfig = this._mergeConfigs(
      DEFAULT_GLOBAL_CONFIG,
      this._options.globalConfig || {}
    );

    this._logDebug('内核实例已创建');
  }

  /**
   * 获取事件总线实例
   *
   * @returns 事件总线实例
   */
  getEventBus(): EventBus {
    return this._eventBus;
  }

  /**
   * 订阅事件
   *
   * @param eventName 事件名称
   * @param handler 事件处理器
   * @param options 订阅选项
   * @returns 订阅ID
   */
  on<T = any>(
    eventName: string,
    handler: EventHandler<T>,
    options?: EventSubscriptionOptions
  ): string {
    return this._eventBus.on(eventName, handler, options);
  }

  /**
   * 订阅事件，但只触发一次
   *
   * @param eventName 事件名称
   * @param handler 事件处理器
   * @param options 订阅选项
   * @returns 订阅ID
   */
  once<T = any>(
    eventName: string,
    handler: EventHandler<T>,
    options?: EventSubscriptionOptions
  ): string {
    return this._eventBus.once(eventName, handler, options);
  }

  /**
   * 取消订阅
   *
   * @param subscriptionId 订阅ID
   * @returns 是否成功取消
   */
  off(subscriptionId: string): boolean {
    return this._eventBus.off(subscriptionId);
  }

  /**
   * 发布事件
   *
   * @param eventName 事件名称
   * @param eventData 事件数据
   * @param options 发布选项
   * @returns 处理结果
   */
  emit<T = any>(
    eventName: string,
    eventData: T,
    options?: EventEmitOptions
  ): Promise<void[]> | number {
    return this._eventBus.emit(eventName, eventData, options);
  }

  /**
   * 获取配置值
   *
   * @param path 配置路径，支持点表示法访问深层配置，如'upload.transport.timeout'
   * @param defaultValue 默认值，当配置不存在时返回
   * @returns 配置值
   */
  getConfig<T = any>(path?: string, defaultValue?: T): T {
    // 如果没有提供路径，返回整个配置对象
    if (!path) {
      return this._globalConfig as unknown as T;
    }

    // 使用点表示法获取嵌套配置
    const keys = path.split('.');
    let value: any = this._globalConfig;

    for (const key of keys) {
      if (value === undefined || value === null || typeof value !== 'object') {
        return defaultValue as T;
      }
      value = value[key];
    }

    // 如果值不存在，返回默认值或查找初始配置中的默认值
    if (value === undefined) {
      return this._options.globalConfig ? this._getDefaultConfigValue(path) : (defaultValue as T);
    }

    return value as T;
  }

  /**
   * 设置配置值
   *
   * @param path 配置路径，支持点表示法设置深层配置，如'upload.transport.timeout'
   * @param value 配置值
   */
  setConfig<T = any>(path: string, value: T): void {
    if (!path) {
      throw new Error('配置路径不能为空');
    }

    // 解析路径
    const keys = path.split('.');
    const lastKey = keys.pop()!;

    // 从配置中获取或创建目标对象
    let target = this._globalConfig;

    // 遍历路径，确保每一级都存在
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      if (!(key in target) || target[key] === null || typeof target[key] !== 'object') {
        // 如果当前级别不存在或不是对象，创建一个空对象
        target[key] = {};
      }

      target = target[key];
    }

    // 获取旧值（用于事件通知）
    const oldValue = target[lastKey];

    // 设置值
    target[lastKey] = value;

    // 如果值实际发生变化，触发配置变更事件
    if (!this._isEqual(oldValue, value)) {
      this.emit(KernelEventType.CONFIG_CHANGED, {
        path,
        oldValue,
        newValue: value,
        source: 'set'
      });
    }
  }

  /**
   * 简单比较两个值是否相等
   *
   * @param a 第一个值
   * @param b 第二个值
   * @returns 两个值是否相等
   */
  private _isEqual(a: any, b: any): boolean {
    // 如果引用相同，则相等
    if (a === b) {
      return true;
    }

    // 如果任一值为null或非对象，则不相等
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
      return false;
    }

    // 如果是数组
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return false;
      }

      for (let i = 0; i < a.length; i++) {
        if (!this._isEqual(a[i], b[i])) {
          return false;
        }
      }

      return true;
    }

    // 如果是对象
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) {
      return false;
    }

    for (const key of keysA) {
      if (!keysB.includes(key) || !this._isEqual(a[key], b[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * 更新多个配置项
   *
   * @param configs 配置对象，支持深层路径如 {'transport.timeout': 3000, 'security.enabled': true}
   */
  updateConfigs(configs: Record<string, any>): void {
    if (!configs || typeof configs !== 'object') {
      return;
    }

    const changedPaths: string[] = [];
    const flattenedConfigs: Record<string, any> = {};

    // 处理两种格式：嵌套对象和点表示法扁平对象
    for (const key in configs) {
      const value = configs[key];

      // 检查是否为点表示法路径
      if (key.includes('.')) {
        flattenedConfigs[key] = value;
        changedPaths.push(key);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // 处理嵌套对象
        this._processNestedConfigs(value, key, flattenedConfigs, changedPaths);
      } else {
        // 简单键值
        flattenedConfigs[key] = value;
        changedPaths.push(key);
      }
    }

    // 批量更新所有配置
    for (const path in flattenedConfigs) {
      this.setConfig(path, flattenedConfigs[path]);
    }

    // 触发配置变更事件，一次性通知所有变更
    if (changedPaths.length > 0) {
      this.emit(KernelEventType.CONFIG_CHANGED, {
        paths: changedPaths,
        source: 'batch_update'
      });
    }
  }

  /**
   * 处理嵌套配置对象，转换为扁平的路径格式
   *
   * @param obj 嵌套配置对象
   * @param prefix 路径前缀
   * @param result 结果对象
   * @param changedPaths 变更路径数组
   */
  private _processNestedConfigs(
    obj: Record<string, any>,
    prefix: string,
    result: Record<string, any>,
    changedPaths: string[]
  ): void {
    for (const key in obj) {
      const value = obj[key];
      const path = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // 递归处理嵌套对象
        this._processNestedConfigs(value, path, result, changedPaths);
      } else {
        // 叶子节点
        result[path] = value;
        changedPaths.push(path);
      }
    }
  }

  /**
   * 重置配置
   *
   * @param path 配置路径，如果不提供则重置所有配置
   */
  resetConfig(path?: string): void {
    if (!path) {
      // 重置所有配置
      const oldConfig = { ...this._globalConfig };
      this._globalConfig = this._options.globalConfig ? { ...this._options.globalConfig } : {};

      // 触发重置事件
      this.emit(KernelEventType.CONFIG_RESET, {
        oldConfig,
        newConfig: { ...this._globalConfig }
      });

      return;
    }

    // 重置特定路径的配置
    const keys = path.split('.');
    const lastKey = keys.pop()!;

    // 查找默认值
    const defaultValue = this._getDefaultConfigValue(path);

    // 定位到要重置的配置项的父对象
    let target = this._globalConfig;
    for (const key of keys) {
      if (!(key in target) || target[key] === null || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }

    // 保存旧值用于事件通知
    const oldValue = target[lastKey];

    if (defaultValue !== undefined) {
      // 如果有默认值，重置为默认值
      target[lastKey] = defaultValue;
    } else {
      // 否则删除该配置项
      delete target[lastKey];
    }

    // 触发配置变更事件
    this.emit(KernelEventType.CONFIG_CHANGED, {
      path,
      oldValue,
      newValue: target[lastKey],
      source: 'reset'
    });

    // 同时触发特定路径的重置事件
    this.emit(KernelEventType.CONFIG_RESET, {
      path,
      oldValue,
      newValue: target[lastKey]
    });
  }

  /**
   * 初始化内核
   * 初始化过程会加载并初始化所有已注册的模块
   *
   * @returns Promise，初始化完成后解决
   */
  async init(): Promise<void> {
    if (this._initialized) {
      return;
    }

    try {
      // 更新状态
      this._updateState('initializing', { startTime: Date.now() });

      // 触发初始化事件
      await this.emit(KernelEventType.KERNEL_INIT, {});

      // 内部初始化逻辑
      await this._internalInit();

      this._initialized = true;

      // 更新状态
      this._updateState('initialized', {
        duration: (Date.now() - this._state.details!.startTime) as number
      });

      // 触发初始化完成事件
      await this.emit(KernelEventType.KERNEL_INIT_COMPLETE, {});
    } catch (error) {
      // 更新为错误状态
      this._updateState('error', { phase: 'initialization' }, error as Error);

      this._logDebug(`内核初始化失败: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * 启动内核
   * 启动过程会依次启动所有已初始化的模块
   *
   * @returns Promise，启动完成后解决
   * @throws 如果内核尚未初始化，将抛出错误
   */
  async start(): Promise<void> {
    if (!this._initialized) {
      throw new Error('内核尚未初始化，请先调用init()');
    }

    if (this._started) {
      return;
    }

    try {
      // 更新状态
      this._updateState('starting', { startTime: Date.now() });

      // 触发启动事件
      await this.emit(KernelEventType.KERNEL_START, {});

      // 启动所有已初始化的模块
      await this._startInitializedModules();

      this._started = true;

      // 更新状态
      this._updateState('running', {
        duration: (Date.now() - this._state.details!.startTime) as number
      });

      // 触发启动完成事件
      await this.emit(KernelEventType.KERNEL_START_COMPLETE, {});
    } catch (error) {
      // 更新为错误状态
      this._updateState('error', { phase: 'starting' }, error as Error);

      this._logDebug(`内核启动失败: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * 停止内核
   * 停止过程会依次停止所有已启动的模块
   *
   * @returns Promise，停止完成后解决
   */
  async stop(): Promise<void> {
    if (!this._started) {
      return;
    }

    try {
      // 更新状态
      this._updateState('stopping', { startTime: Date.now() });

      // 触发停止事件
      await this.emit(KernelEventType.KERNEL_STOP, {});

      // 停止所有已启动的模块
      await this._stopRunningModules();

      this._started = false;

      // 更新状态
      this._updateState('stopped', {
        duration: (Date.now() - this._state.details!.startTime) as number
      });

      // 触发停止完成事件
      await this.emit(KernelEventType.KERNEL_STOP_COMPLETE, {});
    } catch (error) {
      // 更新为错误状态
      this._updateState('error', { phase: 'stopping' }, error as Error);

      this._logDebug(`内核停止失败: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * 销毁内核
   * 销毁过程会停止所有模块并清理资源
   *
   * @returns Promise，销毁完成后解决
   */
  async destroy(): Promise<void> {
    try {
      // 如果内核已启动，先停止
      if (this._started) {
        await this.stop();
      }

      // 更新状态
      this._updateState('stopping', { phase: 'destroy', startTime: Date.now() });

      // 触发销毁事件
      await this.emit(KernelEventType.KERNEL_DESTROY, {});

      // 卸载所有模块
      const modules = this._registry.getAllModules();

      for (const module of modules) {
        try {
          await this._registry.unregister(module.metadata.id);
        } catch (error) {
          this._logDebug(`卸载模块 ${module.metadata.id} 失败: ${error}`, 'error');
        }
      }

      // 清理事件监听器
      this.getEventBus().clear();

      // 清理状态监听器
      this._stateListeners.clear();

      this._initialized = false;
      this._started = false;

      // 更新状态
      this._updateState('idle', {
        duration: (Date.now() - this._state.details!.startTime) as number
      });

      // 触发销毁完成事件
      await this.emit(KernelEventType.KERNEL_DESTROY_COMPLETE, {});
    } catch (error) {
      // 更新为错误状态
      this._updateState('error', { phase: 'destroy' }, error as Error);

      this._logDebug(`内核销毁失败: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * 注册模块
   *
   * @param module - 模块实例
   * @param options - 注册选项
   * @returns 当前内核实例，支持链式调用
   */
  registerModule(module: Module, options?: Partial<ModuleRegistrationOptions>): Kernel {
    if (!(module instanceof BaseModule)) {
      throw new ModuleRegistrationError(
        '模块必须继承自BaseModule',
        module?.metadata?.id || 'unknown'
      );
    }

    // 发布模块注册事件
    this._eventBus.emit(KernelEventType.MODULE_REGISTER, {
      module,
      options
    });

    // 设置模块的内核引用
    (module as BaseModule).setKernel(this);

    // 注册到注册表
    this._registry.register(module, {
      ...options,
      initTimeout: options?.initTimeout || this._options.moduleInitTimeout,
      startTimeout: options?.startTimeout || this._options.moduleStartTimeout
    });

    this._logDebug(`模块注册成功: ${module.metadata.id}`);

    // 发布模块注册完成事件
    this._eventBus.emit(KernelEventType.MODULE_REGISTER_COMPLETE, {
      moduleId: module.metadata.id,
      module,
      options
    });

    return this;
  }

  /**
   * 注销模块
   *
   * @param moduleId - 模块ID
   * @returns 是否成功注销
   */
  unregisterModule(moduleId: string): boolean {
    // 发布模块注销事件
    this._eventBus.emit(KernelEventType.MODULE_UNREGISTER, { moduleId });

    const module = this.getModule(moduleId);
    const result = this._registry.unregister(moduleId);

    if (result) {
      this._logDebug(`模块注销成功: ${moduleId}`);

      // 发布模块注销完成事件
      this._eventBus.emit(KernelEventType.MODULE_UNREGISTER_COMPLETE, {
        moduleId,
        module
      });
    }

    return result;
  }

  /**
   * 获取模块实例
   *
   * @param moduleId - 模块ID
   * @returns 模块实例，如果未找到则返回undefined
   */
  getModule<T extends Module>(moduleId: string): T | undefined {
    return this._registry.get<T>(moduleId);
  }

  /**
   * 检查模块是否已注册
   *
   * @param moduleId - 模块ID
   * @returns 是否已注册
   */
  hasModule(moduleId: string): boolean {
    return this._registry.has(moduleId);
  }

  /**
   * 获取所有已注册模块
   *
   * @returns 模块数组
   */
  getAllModules(): Module[] {
    return this._registry.getAllModules();
  }

  /**
   * 获取特定状态的所有模块
   *
   * @param status - 模块状态
   * @returns 符合状态的模块数组
   */
  getModulesByStatus(status: ModuleStatus): Module[] {
    return this._registry.getModulesByStatus(status);
  }

  /**
   * 初始化特定模块
   *
   * @param moduleId - 模块ID
   * @returns Promise 对象
   */
  async initModule(moduleId: string): Promise<void> {
    const module = this.getModule(moduleId);
    if (!module) {
      throw new Error(`模块未找到: ${moduleId}`);
    }

    if (module.status !== ModuleStatus.REGISTERED) {
      throw new ModuleLifecycleError(`模块${moduleId}已经初始化或处于其他状态`, moduleId, 'init');
    }

    this._logDebug(`开始初始化模块: ${moduleId}`);

    // 发布模块初始化事件
    await this._eventBus.emitAsync(KernelEventType.MODULE_INIT, {
      moduleId,
      module
    });

    // 确保所有依赖模块已初始化
    await this._ensureDependenciesInitialized(module);

    // 初始化模块
    await module.init();

    this._logDebug(`模块初始化完成: ${moduleId}`);

    // 发布模块初始化完成事件
    await this._eventBus.emitAsync(KernelEventType.MODULE_INIT_COMPLETE, {
      moduleId,
      module
    });

    // 如果配置了自动启动，则启动模块
    if (this._options.autoStartModules && this._started) {
      await this.startModule(moduleId);
    }
  }

  /**
   * 启动特定模块
   *
   * @param moduleId - 模块ID
   * @returns Promise 对象
   */
  async startModule(moduleId: string): Promise<void> {
    const module = this.getModule(moduleId);
    if (!module) {
      throw new Error(`模块未找到: ${moduleId}`);
    }

    if (module.status !== ModuleStatus.INITIALIZED) {
      if (module.status === ModuleStatus.REGISTERED) {
        // 如果模块尚未初始化，先初始化它
        await this.initModule(moduleId);
      } else {
        throw new ModuleLifecycleError(
          `模块${moduleId}无法启动，当前状态为: ${module.status}`,
          moduleId,
          'start'
        );
      }
    }

    this._logDebug(`开始启动模块: ${moduleId}`);

    // 发布模块启动事件
    await this._eventBus.emitAsync(KernelEventType.MODULE_START, {
      moduleId,
      module
    });

    // 确保所有依赖模块已启动
    await this._ensureDependenciesStarted(module);

    // 启动模块
    await module.start();

    this._logDebug(`模块启动完成: ${moduleId}`);

    // 发布模块启动完成事件
    await this._eventBus.emitAsync(KernelEventType.MODULE_START_COMPLETE, {
      moduleId,
      module
    });
  }

  /**
   * 停止特定模块
   *
   * @param moduleId - 模块ID
   * @returns Promise 对象
   */
  async stopModule(moduleId: string): Promise<void> {
    const module = this.getModule(moduleId);
    if (!module) {
      throw new Error(`模块未找到: ${moduleId}`);
    }

    if (module.status !== ModuleStatus.RUNNING) {
      throw new ModuleLifecycleError(
        `模块${moduleId}未在运行中，当前状态为: ${module.status}`,
        moduleId,
        'stop'
      );
    }

    // 检查依赖这个模块的其他模块是否都已停止
    const dependents = this._registry.getDependentModules(moduleId);
    for (const depId of dependents) {
      const depModule = this.getModule(depId);
      if (depModule?.status === ModuleStatus.RUNNING) {
        throw new ModuleLifecycleError(
          `无法停止模块${moduleId}，因为它仍被模块${depId}依赖`,
          moduleId,
          'stop'
        );
      }
    }

    this._logDebug(`开始停止模块: ${moduleId}`);

    // 发布模块停止事件
    await this._eventBus.emitAsync(KernelEventType.MODULE_STOP, {
      moduleId,
      module
    });

    // 停止模块
    await module.stop();

    this._logDebug(`模块停止完成: ${moduleId}`);

    // 发布模块停止完成事件
    await this._eventBus.emitAsync(KernelEventType.MODULE_STOP_COMPLETE, {
      moduleId,
      module
    });
  }

  /**
   * 内部初始化方法
   */
  private async _internalInit(): Promise<void> {
    // 这里可以添加内核初始化的特定逻辑
    // 例如内置模块的注册等
  }

  /**
   * 启动所有已初始化的模块
   */
  private async _startInitializedModules(): Promise<void> {
    const initializedModules = this._registry.getModulesByStatus(ModuleStatus.INITIALIZED);

    // 按照拓扑排序顺序启动模块，确保依赖先启动
    const sorted = this._topologicalSort(initializedModules);

    for (const module of sorted) {
      try {
        await this.startModule(module.metadata.id);
      } catch (error: unknown) {
        this._handleModuleError(
          error instanceof Error ? error : new Error(String(error)),
          module,
          '启动'
        );
      }
    }
  }

  /**
   * 停止所有正在运行的模块
   */
  private async _stopRunningModules(): Promise<void> {
    const runningModules = this._registry.getModulesByStatus(ModuleStatus.RUNNING);

    // 按照拓扑排序的相反顺序停止模块，确保被依赖的模块后停止
    const sorted = this._topologicalSort(runningModules).reverse();

    for (const module of sorted) {
      try {
        await this.stopModule(module.metadata.id);
      } catch (error: unknown) {
        this._handleModuleError(
          error instanceof Error ? error : new Error(String(error)),
          module,
          '停止'
        );
      }
    }
  }

  /**
   * 确保所有依赖模块已初始化
   *
   * @param module - 要检查的模块
   */
  private async _ensureDependenciesInitialized(module: Module): Promise<void> {
    const dependencies = module.metadata.dependencies || [];

    for (const depId of dependencies) {
      const depModule = this.getModule(depId);

      if (!depModule) {
        throw new Error(`找不到依赖模块: ${depId}`);
      }

      if (depModule.status === ModuleStatus.REGISTERED) {
        // 递归初始化依赖模块
        await this.initModule(depId);
      } else if (depModule.status === ModuleStatus.ERROR) {
        throw new Error(`依赖模块${depId}处于错误状态，无法继续初始化${module.metadata.id}`);
      }
    }
  }

  /**
   * 确保所有依赖模块已启动
   *
   * @param module - 要检查的模块
   */
  private async _ensureDependenciesStarted(module: Module): Promise<void> {
    const dependencies = module.metadata.dependencies || [];

    for (const depId of dependencies) {
      const depModule = this.getModule(depId);

      if (!depModule) {
        throw new Error(`找不到依赖模块: ${depId}`);
      }

      if (depModule.status !== ModuleStatus.RUNNING) {
        if (depModule.status === ModuleStatus.INITIALIZED) {
          // 启动依赖模块
          await this.startModule(depId);
        } else {
          throw new Error(`依赖模块${depId}未准备好启动，当前状态为: ${depModule.status}`);
        }
      }
    }
  }

  /**
   * 模块拓扑排序，用于确定启动顺序
   *
   * @param modules - 要排序的模块数组
   * @returns 排序后的模块数组
   */
  private _topologicalSort(modules: Module[]): Module[] {
    const result: Module[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    // 对每个模块执行深度优先搜索
    for (const module of modules) {
      if (!visited.has(module.metadata.id)) {
        this._dfsTopologicalSort(module, visited, temp, result);
      }
    }

    return result;
  }

  /**
   * 拓扑排序的深度优先搜索
   *
   * @param module - 当前模块
   * @param visited - 已访问的模块ID集合
   * @param temp - 临时标记的模块ID集合，用于检测循环
   * @param result - 结果数组
   */
  private _dfsTopologicalSort(
    module: Module,
    visited: Set<string>,
    temp: Set<string>,
    result: Module[]
  ): void {
    const moduleId = module.metadata.id;

    // 检测循环依赖
    if (temp.has(moduleId)) {
      throw new Error(`检测到循环依赖: ${moduleId}`);
    }

    if (visited.has(moduleId)) {
      return;
    }

    // 临时标记
    temp.add(moduleId);

    // 递归访问所有依赖
    const dependencies = module.metadata.dependencies || [];
    for (const depId of dependencies) {
      const depModule = this.getModule(depId);
      if (depModule) {
        this._dfsTopologicalSort(depModule, visited, temp, result);
      }
    }

    // 移除临时标记并添加到已访问集合
    temp.delete(moduleId);
    visited.add(moduleId);

    // 将当前模块添加到结果
    result.push(module);
  }

  /**
   * 处理模块错误
   *
   * @param error - 错误对象
   * @param module - 发生错误的模块
   * @param operation - 操作名称
   */
  private _handleModuleError(error: Error, module: Module, operation: string): void {
    const errorMessage = `模块${module.metadata.id}${operation}失败: ${error.message}`;

    this._logDebug(errorMessage, 'error');

    // 发布模块错误事件
    this._eventBus.emit(KernelEventType.MODULE_ERROR, {
      moduleId: module.metadata.id,
      module,
      error,
      operation
    });

    if (this._options.strictMode) {
      throw error;
    }
  }

  /**
   * 输出调试日志
   *
   * @param message - 日志消息
   * @param level - 日志级别
   */
  private _logDebug(message: string, level: 'log' | 'error' = 'log'): void {
    if (this._options.debug) {
      if (level === 'error') {
        console.error(`[Kernel] ${message}`);
      } else {
        console.log(`[Kernel] ${message}`);
      }
    }
  }

  /**
   * 合并配置对象
   *
   * @param target 目标对象
   * @param source 源对象
   * @returns 合并后的对象
   */
  private _mergeConfigs(
    target: Record<string, any>,
    source: Record<string, any>
  ): Record<string, any> {
    const result: Record<string, any> = { ...target };

    for (const key in source) {
      const sourceValue = source[key];

      // 如果源是对象且不是数组，进行深度合并
      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        target[key] !== null &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        result[key] = this._mergeConfigs(target[key], sourceValue);
      } else {
        // 直接覆盖或添加新属性
        result[key] = sourceValue;
      }
    }

    return result;
  }

  /**
   * 从默认配置中获取特定路径的值
   *
   * @param path 配置路径
   * @returns 默认值
   */
  private _getDefaultConfigValue(path: string): any {
    const keys = path.split('.');
    let value = DEFAULT_GLOBAL_CONFIG;

    for (const key of keys) {
      if (value === undefined || value === null || typeof value !== 'object') {
        return undefined;
      }
      value = value[key];
    }

    // 如果是对象，返回深拷贝
    if (value !== null && typeof value === 'object') {
      return JSON.parse(JSON.stringify(value));
    }

    return value;
  }

  /**
   * 获取当前内核状态
   *
   * @returns 当前状态对象（只读）
   */
  getState(): Readonly<KernelState> {
    return { ...this._state };
  }

  /**
   * 添加状态变更监听器
   *
   * @param listenerId 监听器ID
   * @param listener 监听函数
   * @returns 取消监听的函数
   */
  addStateListener(listenerId: string, listener: (state: KernelState) => void): () => void {
    if (!this._stateListeners.has(listenerId)) {
      this._stateListeners.set(listenerId, []);
    }

    const listeners = this._stateListeners.get(listenerId)!;
    listeners.push(listener);

    // 立即调用一次，提供当前状态
    listener({ ...this._state });

    // 返回取消监听的函数
    return () => this.removeStateListener(listenerId, listener);
  }

  /**
   * 移除状态变更监听器
   *
   * @param listenerId 监听器ID
   * @param listener 要移除的监听函数，如果不提供则移除该ID下所有监听器
   * @returns 是否成功移除
   */
  removeStateListener(listenerId: string, listener?: (state: KernelState) => void): boolean {
    if (!this._stateListeners.has(listenerId)) {
      return false;
    }

    if (!listener) {
      // 移除该ID下所有监听器
      this._stateListeners.delete(listenerId);
      return true;
    }

    // 移除特定监听器
    const listeners = this._stateListeners.get(listenerId)!;
    const index = listeners.indexOf(listener);

    if (index !== -1) {
      listeners.splice(index, 1);

      // 如果没有监听器了，删除该ID的条目
      if (listeners.length === 0) {
        this._stateListeners.delete(listenerId);
      }

      return true;
    }

    return false;
  }

  /**
   * 更新内核状态
   *
   * @param status 状态名称
   * @param details 状态详情
   * @param error 错误信息
   */
  protected _updateState(
    status: KernelState['status'],
    details?: Record<string, any>,
    error?: Error
  ): void {
    const previousStatus = this._state.status;

    this._state = {
      status,
      previousStatus,
      details: details ? { ...details } : undefined,
      error,
      timestamp: Date.now()
    };

    // 通知所有监听器
    this._notifyStateListeners();

    // 同时触发状态变更事件
    this.emit(KernelEventType.KERNEL_STATE_CHANGED, { ...this._state });
  }

  /**
   * 通知所有状态监听器
   */
  private _notifyStateListeners(): void {
    const state = { ...this._state };

    for (const listeners of this._stateListeners.values()) {
      for (const listener of listeners) {
        try {
          listener(state);
        } catch (error) {
          this._logDebug(`状态监听器执行错误: ${error}`, 'error');
        }
      }
    }
  }

  /**
   * 热替换模块
   *
   * @param moduleId - 要替换的模块ID
   * @param newModule - 新的模块实例
   * @param options - 热替换选项
   * @returns 内核实例，支持链式调用
   */
  hotReplaceModule(
    moduleId: string,
    newModule: Module,
    options: ModuleHotReplaceOptions = {}
  ): Kernel {
    this._logDebug(`开始热替换模块: ${moduleId}`);

    this.emit(KernelEventType.MODULE_REPLACE, {
      moduleId,
      oldModule: this._registry.get(moduleId),
      newModule
    });

    // 不保存结果，直接调用方法
    this._registry.hotReplaceModule(moduleId, newModule, {
      ...options,
      onReplaced: (oldModule, newModule) => {
        this.emit(KernelEventType.MODULE_REPLACE_COMPLETE, {
          moduleId,
          oldModule,
          newModule,
          success: true
        });

        // 调用用户提供的回调
        if (options.onReplaced) {
          options.onReplaced(oldModule, newModule);
        }
      }
    });

    return this;
  }

  /**
   * 获取模块接口的实现
   *
   * @param interfaceId - 接口模块ID
   * @returns 实现该接口的模块实例
   */
  getImplementation<T extends Module>(interfaceId: string): T | undefined {
    return this._registry.getImplementation<T>(interfaceId);
  }

  /**
   * 注册接口实现关系
   *
   * @param implementationId - 实现模块ID
   * @param interfaceId - 接口模块ID
   * @returns 内核实例，支持链式调用
   */
  registerInterfaceImplementation(implementationId: string, interfaceId: string): Kernel {
    this._registry.registerInterfaceImplementation(implementationId, interfaceId);
    return this;
  }

  /**
   * 生成模块依赖图，用于可视化或分析
   *
   * @returns 包含节点和边的依赖图结构
   */
  generateModuleDependencyGraph(): ModuleDependencyGraph {
    return this._registry.generateDependencyGraph();
  }

  /**
   * 获取按依赖顺序排序的模块列表
   *
   * @returns 排序后的模块数组
   */
  getSortedModules(): Module[] {
    return this._registry.getSortedModules();
  }
}
