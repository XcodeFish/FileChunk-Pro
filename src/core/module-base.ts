import { ModuleMetadata, ModuleStatus, ModuleLifecycleError } from '../types/modules';
import { Module as ModuleInterface } from '../types/modules';
import { EventEmitter } from './event-bus';
import { FileChunkKernel } from './kernel';

/**
 * 模块接口定义
 * 所有功能模块必须实现此接口
 */
export interface Module {
  /**
   * 初始化模块
   * @param kernel 微内核实例
   */
  init(kernel: FileChunkKernel): void;
}

/**
 * 模块基类
 *
 * 提供模块的核心功能和生命周期管理，所有具体模块应继承此类
 */
export abstract class BaseModule implements ModuleInterface {
  /**
   * 模块元数据
   */
  public readonly metadata: ModuleMetadata;

  /**
   * 模块当前状态
   */
  protected _status: ModuleStatus = ModuleStatus.REGISTERED;

  /**
   * 实现接口的 status 属性（直接暴露内部状态）
   */
  public get status(): ModuleStatus {
    return this._status;
  }

  /**
   * 依赖注入容器
   */
  protected _kernel?: FileChunkKernel;

  /**
   * 事件总线实例
   */
  protected _eventBus?: EventEmitter;

  /**
   * 模块配置
   */
  protected _config: Record<string, unknown> = {};

  /**
   * 构造函数
   *
   * @param metadata - 模块元数据
   * @param config - 模块配置（可选）
   */
  constructor(metadata: ModuleMetadata, config?: Record<string, unknown>) {
    this.validateMetadata(metadata);
    this.metadata = { ...metadata };

    // 确保依赖项是数组
    if (!this.metadata.dependencies) {
      this.metadata.dependencies = [];
    }

    // 初始化配置
    if (config) {
      this._config = this._mergeConfig(this._config, config);
    }
  }

  /**
   * 验证模块元数据
   *
   * @param metadata - 待验证的元数据
   */
  private validateMetadata(metadata: ModuleMetadata): void {
    if (!metadata) {
      throw new Error('模块元数据不能为空');
    }

    if (!metadata.id || typeof metadata.id !== 'string') {
      throw new Error('模块必须提供有效的ID');
    }

    if (!metadata.name || typeof metadata.name !== 'string') {
      throw new Error('模块必须提供有效的名称');
    }

    if (!metadata.version || typeof metadata.version !== 'string') {
      throw new Error('模块必须提供有效的版本号');
    }
  }

  /**
   * 设置内核引用
   *
   * @param kernel - 内核实例
   */
  setKernel(kernel: FileChunkKernel): void {
    this._kernel = kernel;
  }

  /**
   * 设置事件总线
   *
   * @param eventBus - 事件总线实例
   */
  setEventBus(eventBus: EventEmitter): void {
    this._eventBus = eventBus;
  }

  /**
   * 获取模块当前状态
   */
  getStatus(): ModuleStatus {
    return this._status;
  }

  /**
   * 检查模块是否在运行中
   */
  isRunning(): boolean {
    return this._status === ModuleStatus.RUNNING;
  }

  /**
   * 获取模块配置
   *
   * @param path - 配置路径，支持点表示法访问嵌套属性
   * @param defaultValue - 默认值，当配置不存在时返回
   * @returns 配置值或默认值
   */
  getConfig<T>(path?: string, defaultValue?: T): T | Record<string, unknown> {
    if (!path) {
      return this._config as T;
    }

    const keys = path.split('.');
    let current: unknown = this._config;

    for (const key of keys) {
      if (current === undefined || current === null || typeof current !== 'object') {
        return defaultValue as T;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return current !== undefined ? (current as T) : (defaultValue as T);
  }

  /**
   * 更新模块配置
   *
   * @param config - 新的配置，将与现有配置合并
   * @param notify - 是否发送配置变更事件，默认为true
   */
  updateConfig(config: Record<string, unknown>, notify: boolean = true): void {
    this._config = this._mergeConfig(this._config, config);

    if (notify && this._eventBus) {
      this._eventBus.emit('module.config.updated', {
        moduleId: this.metadata.id,
        config: this._config
      });
    }
  }

  /**
   * 合并配置对象
   *
   * @param target - 目标配置
   * @param source - 源配置
   * @returns 合并后的配置
   */
  private _mergeConfig(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = target[key];

        // 如果目标和源都是对象，则递归合并
        if (
          targetValue &&
          typeof targetValue === 'object' &&
          sourceValue &&
          typeof sourceValue === 'object' &&
          !Array.isArray(targetValue) &&
          !Array.isArray(sourceValue)
        ) {
          result[key] = this._mergeConfig(
            targetValue as Record<string, unknown>,
            sourceValue as Record<string, unknown>
          );
        } else {
          // 否则直接替换
          result[key] = sourceValue;
        }
      }
    }

    return result;
  }

  /**
   * 初始化模块
   * 遵循types/modules.ts中的接口定义
   */
  init(): Promise<void> | void {
    // 初始化基本逻辑
    this._status = ModuleStatus.INITIALIZING;

    try {
      // 调用初始化钩子
      this.onInit();

      // 更新状态
      this._status = ModuleStatus.INITIALIZED;

      return Promise.resolve();
    } catch (error) {
      this._status = ModuleStatus.ERROR;
      this.onError(error as Error);
      throw error;
    }
  }

  /**
   * 初始化完成后执行的钩子
   * 子类可以重写此方法以添加自定义初始化逻辑
   */
  protected onInit(): void {
    // 空实现，子类可以重写
  }

  /**
   * 启动模块
   * 子类应重写此方法以实现具体启动逻辑
   */
  async start(): Promise<void> {
    if (this._status !== ModuleStatus.INITIALIZED) {
      throw new ModuleLifecycleError(
        `模块${this.metadata.id}无法启动：当前状态为${this._status}`,
        this.metadata.id,
        'start'
      );
    }

    try {
      this._status = ModuleStatus.STARTING;

      // 启动前钩子
      await this.onBeforeStart();

      // 主启动逻辑
      await this.onStart();

      // 启动后钩子
      await this.onAfterStart();

      this._status = ModuleStatus.RUNNING;
    } catch (error) {
      this._status = ModuleStatus.ERROR;
      this.onError(error as Error);
      throw error;
    }
  }

  /**
   * 停止模块
   */
  async stop(): Promise<void> {
    if (this._status !== ModuleStatus.RUNNING) {
      throw new ModuleLifecycleError(
        `模块${this.metadata.id}无法停止：当前状态为${this._status}`,
        this.metadata.id,
        'stop'
      );
    }

    try {
      this._status = ModuleStatus.STOPPING;

      // 停止前钩子
      await this.onBeforeStop();

      // 主停止逻辑
      await this.onStop();

      // 停止后钩子
      await this.onAfterStop();

      this._status = ModuleStatus.STOPPED;
    } catch (error) {
      this._status = ModuleStatus.ERROR;
      this.onError(error as Error);
      throw error;
    }
  }

  /**
   * 销毁模块
   */
  async destroy(): Promise<void> {
    if (this._status === ModuleStatus.RUNNING) {
      await this.stop();
    }

    try {
      // 销毁前钩子
      await this.onBeforeDestroy();

      // 主销毁逻辑
      await this.onDestroy();

      // 销毁后钩子
      await this.onAfterDestroy();

      this._status = ModuleStatus.REGISTERED;
    } catch (error) {
      this._status = ModuleStatus.ERROR;
      this.onError(error as Error);
      throw error;
    }
  }

  /**
   * 错误处理器
   * @param error - 捕获的错误
   */
  onError(error: Error): void {
    console.error(`模块 ${this.metadata.id} 错误:`, error);

    if (this._eventBus) {
      this._eventBus.emit('module.error', {
        moduleId: this.metadata.id,
        error
      });
    }
  }

  /**
   * 保护方法：注册事件监听器
   * @param eventName - 事件名称
   * @param handler - 事件处理函数
   * @returns 订阅ID，可用于取消订阅
   */
  protected on<T>(eventName: string, handler: (data: T) => void): void {
    if (this._eventBus) {
      this._eventBus.on(eventName, handler);
    } else {
      console.warn(`模块 ${this.metadata.id} 没有事件总线，无法注册事件: ${eventName}`);
    }
  }

  /**
   * 保护方法：注册一次性事件监听器
   * @param eventName - 事件名称
   * @param handler - 事件处理函数
   * @returns 订阅ID，可用于取消订阅
   */
  protected once<T>(eventName: string, handler: (data: T) => void): void {
    if (this._eventBus) {
      this._eventBus.once(eventName, handler);
    } else {
      console.warn(`模块 ${this.metadata.id} 没有事件总线，无法注册事件: ${eventName}`);
    }
  }

  /**
   * 保护方法：发布事件
   * @param eventName - 事件名称
   * @param eventData - 事件数据
   */
  protected emit<T>(eventName: string, eventData: T): void {
    if (this._eventBus) {
      this._eventBus.emit(eventName, eventData);
    } else {
      console.warn(`模块 ${this.metadata.id} 没有事件总线，无法发布事件: ${eventName}`);
    }
  }

  /**
   * 启动前钩子
   */
  protected async onBeforeStart(): Promise<void> {
    // 空实现，子类可以重写
  }

  /**
   * 启动主逻辑钩子
   */
  protected async onStart(): Promise<void> {
    // 空实现，子类可以重写
  }

  /**
   * 启动后钩子
   */
  protected async onAfterStart(): Promise<void> {
    // 空实现，子类可以重写
  }

  /**
   * 停止前钩子
   */
  protected async onBeforeStop(): Promise<void> {
    // 空实现，子类可以重写
  }

  /**
   * 停止主逻辑钩子
   */
  protected async onStop(): Promise<void> {
    // 空实现，子类可以重写
  }

  /**
   * 停止后钩子
   */
  protected async onAfterStop(): Promise<void> {
    // 空实现，子类可以重写
  }

  /**
   * 销毁前钩子
   */
  protected async onBeforeDestroy(): Promise<void> {
    // 空实现，子类可以重写
  }

  /**
   * 销毁主逻辑钩子
   */
  protected async onDestroy(): Promise<void> {
    // 空实现，子类可以重写
  }

  /**
   * 销毁后钩子
   */
  protected async onAfterDestroy(): Promise<void> {
    // 空实现，子类可以重写
  }

  /**
   * 获取其他模块实例
   * @param moduleId - 模块ID
   * @returns 模块实例
   */
  protected getModule<T extends ModuleInterface>(moduleId: string): T {
    if (!this._kernel) {
      throw new Error(`模块 ${this.metadata.id} 没有关联内核实例，无法获取其他模块`);
    }

    return this._kernel.getModule<T>(moduleId);
  }

  /**
   * 获取其他模块实例（可选）
   * 如果模块不存在，返回undefined而不是抛出错误
   * @param moduleId - 模块ID
   * @returns 模块实例或undefined
   */
  protected getOptionalModule<T extends ModuleInterface>(moduleId: string): T | undefined {
    if (!this._kernel) {
      return undefined;
    }

    try {
      return this._kernel.getModule<T>(moduleId);
    } catch {
      return undefined;
    }
  }
}

/**
 * 模块基类 - 所有功能模块的基础类
 * 提供统一的生命周期管理和核心功能访问
 */
export abstract class ModuleBase {
  /**
   * 内核引用
   */
  protected kernel!: FileChunkKernel;

  /**
   * 简易日志工具
   */
  protected logger = {
    debug: (message: string) => console.debug(message),
    info: (message: string) => console.info(message),
    warn: (message: string) => console.warn(message),
    error: (message: string) => console.error(message)
  };

  /**
   * 初始化模块
   * @param kernel 内核实例
   */
  abstract init(kernel: FileChunkKernel): Promise<void>;

  /**
   * 获取模块名称
   */
  abstract getName(): string;

  /**
   * 获取内核实例
   */
  getKernel(): FileChunkKernel {
    if (!this.kernel) {
      throw new Error('模块未初始化，内核引用不可用');
    }
    return this.kernel;
  }

  /**
   * 获取依赖模块列表
   */
  getDependencies(): string[] {
    return [];
  }

  /**
   * 获取配置
   */
  getConfig<T = any>(path: string, defaultValue?: T): T {
    return this.kernel.getConfig(path, defaultValue);
  }

  /**
   * 设置配置
   */
  setConfig(path: string, value: any): void {
    this.kernel.setConfig(path, value);
  }

  /**
   * 获取模块
   */
  getModule<T = any>(name: string): T {
    return this.kernel.getModule<T>(name);
  }

  /**
   * 注册事件监听器
   */
  on<T = any>(event: string, handler: (data?: T) => void): () => void {
    this.kernel.on(event, handler);
    return () => this.kernel.off(event, handler);
  }

  /**
   * 触发事件
   */
  emit<T = any>(event: string, data?: T): void {
    this.kernel.emit(event, data);
  }
}
