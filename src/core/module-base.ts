import { Module, ModuleMetadata, ModuleStatus, ModuleLifecycleError } from '../types/modules';
import { EventBusImpl } from './event-bus';

/**
 * 模块基类
 *
 * 提供模块的核心功能和生命周期管理，所有具体模块应继承此类
 */
export abstract class BaseModule implements Module {
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
  protected _kernel?: any; // 将在Kernel类完成后替换为具体类型

  /**
   * 事件总线实例
   */
  protected _eventBus?: EventBusImpl;

  /**
   * 模块配置
   */
  protected _config: Record<string, any> = {};

  /**
   * 构造函数
   *
   * @param metadata - 模块元数据
   * @param config - 模块配置（可选）
   */
  constructor(metadata: ModuleMetadata, config?: Record<string, any>) {
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
  setKernel(kernel: any): void {
    this._kernel = kernel;
  }

  /**
   * 设置事件总线
   *
   * @param eventBus - 事件总线实例
   */
  setEventBus(eventBus: EventBusImpl): void {
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
  getConfig<T>(path?: string, defaultValue?: T): T | Record<string, any> {
    if (!path) {
      return this._config as T;
    }

    const keys = path.split('.');
    let current: any = this._config;

    for (const key of keys) {
      if (current === undefined || current === null || typeof current !== 'object') {
        return defaultValue as T;
      }
      current = current[key];
    }

    return current !== undefined ? current : (defaultValue as T);
  }

  /**
   * 更新模块配置
   *
   * @param config - 新的配置，将与现有配置合并
   * @param notify - 是否发送配置变更事件，默认为true
   */
  updateConfig(config: Record<string, any>, notify: boolean = true): void {
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
    target: Record<string, any>,
    source: Record<string, any>
  ): Record<string, any> {
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
          result[key] = this._mergeConfig(targetValue, sourceValue);
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
   * 子类应重写此方法以实现具体初始化逻辑
   */
  async init(): Promise<void> {
    if (this._status !== ModuleStatus.REGISTERED) {
      throw new ModuleLifecycleError(
        `模块${this.metadata.id}无法初始化：当前状态为${this._status}`,
        this.metadata.id,
        'init'
      );
    }

    try {
      this._status = ModuleStatus.INITIALIZING;

      // 初始化前钩子
      await this.onBeforeInit();

      // 主初始化逻辑
      await this.onInit();

      // 初始化后钩子
      await this.onAfterInit();

      this._status = ModuleStatus.INITIALIZED;
    } catch (error) {
      this._status = ModuleStatus.ERROR;
      this.onError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
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
      this.onError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * 停止模块
   * 子类应重写此方法以实现具体停止逻辑
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
      this.onError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * 销毁模块
   * 子类应重写此方法以实现具体销毁逻辑
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
      this.onError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * 错误处理方法
   *
   * @param error - 捕获的错误
   */
  onError(error: Error): void {
    console.error(`模块 ${this.metadata.id} 发生错误:`, error);

    if (this._eventBus) {
      this._eventBus.emit('module.error', {
        moduleId: this.metadata.id,
        error
      });
    }
  }

  /**
   * 订阅事件
   *
   * @param eventName 事件名称
   * @param handler 事件处理器
   * @returns 订阅ID，用于取消订阅
   */
  protected on<T>(eventName: string, handler: (data: T) => void): string {
    if (!this._eventBus) {
      throw new Error(`模块${this.metadata.id}尚未绑定事件总线，无法订阅事件`);
    }
    return this._eventBus.on(eventName, handler, { subscriberId: this.metadata.id });
  }

  /**
   * 订阅一次性事件
   *
   * @param eventName 事件名称
   * @param handler 事件处理器
   * @returns 订阅ID，用于取消订阅
   */
  protected once<T>(eventName: string, handler: (data: T) => void): string {
    if (!this._eventBus) {
      throw new Error(`模块${this.metadata.id}尚未绑定事件总线，无法订阅事件`);
    }
    return this._eventBus.once(eventName, handler, { subscriberId: this.metadata.id });
  }

  /**
   * 发布事件
   *
   * @param eventName 事件名称
   * @param eventData 事件数据
   */
  protected emit<T>(eventName: string, eventData: T): void {
    if (!this._eventBus) {
      throw new Error(`模块${this.metadata.id}尚未绑定事件总线，无法发布事件`);
    }
    this._eventBus.emit(eventName, eventData);
  }

  /**
   * 异步发布事件
   *
   * @param eventName 事件名称
   * @param eventData 事件数据
   * @returns Promise，解析为处理结果数组
   */
  protected async emitAsync<T>(eventName: string, eventData: T): Promise<void[]> {
    if (!this._eventBus) {
      throw new Error(`模块${this.metadata.id}尚未绑定事件总线，无法发布事件`);
    }
    return this._eventBus.emitAsync(eventName, eventData);
  }

  /**
   * 初始化前钩子
   * 子类可重写此方法以实现初始化前的准备工作
   */
  protected async onBeforeInit(): Promise<void> {
    // 默认实现为空，由子类重写
  }

  /**
   * 初始化钩子
   * 子类应重写此方法以实现具体初始化逻辑
   */
  protected async onInit(): Promise<void> {
    // 默认实现为空，由子类重写
  }

  /**
   * 初始化后钩子
   * 子类可重写此方法以实现初始化后的清理工作
   */
  protected async onAfterInit(): Promise<void> {
    // 默认实现为空，由子类重写
  }

  /**
   * 启动前钩子
   * 子类可重写此方法以实现启动前的准备工作
   */
  protected async onBeforeStart(): Promise<void> {
    // 默认实现为空，由子类重写
  }

  /**
   * 启动钩子
   * 子类应重写此方法以实现具体启动逻辑
   */
  protected async onStart(): Promise<void> {
    // 默认实现为空，由子类重写
  }

  /**
   * 启动后钩子
   * 子类可重写此方法以实现启动后的清理或初始化工作
   */
  protected async onAfterStart(): Promise<void> {
    // 默认实现为空，由子类重写
  }

  /**
   * 停止前钩子
   * 子类可重写此方法以实现停止前的准备工作
   */
  protected async onBeforeStop(): Promise<void> {
    // 默认实现为空，由子类重写
  }

  /**
   * 停止钩子
   * 子类应重写此方法以实现具体停止逻辑
   */
  protected async onStop(): Promise<void> {
    // 默认实现为空，由子类重写
  }

  /**
   * 停止后钩子
   * 子类可重写此方法以实现停止后的清理工作
   */
  protected async onAfterStop(): Promise<void> {
    // 默认实现为空，由子类重写
  }

  /**
   * 销毁前钩子
   * 子类可重写此方法以实现销毁前的准备工作
   */
  protected async onBeforeDestroy(): Promise<void> {
    // 默认实现为空，由子类重写
  }

  /**
   * 销毁钩子
   * 子类应重写此方法以实现具体销毁逻辑
   */
  protected async onDestroy(): Promise<void> {
    // 默认实现为空，由子类重写
  }

  /**
   * 销毁后钩子
   * 子类可重写此方法以实现销毁后的清理工作
   */
  protected async onAfterDestroy(): Promise<void> {
    // 默认实现为空，由子类重写
  }

  /**
   * 获取依赖的模块
   *
   * @param moduleId - 依赖模块ID
   * @returns 依赖模块实例
   */
  protected getModule<T extends Module>(moduleId: string): T {
    if (!this._kernel) {
      throw new Error(`模块${this.metadata.id}尚未绑定内核实例，无法获取依赖模块`);
    }

    const module = this._kernel.getModule(moduleId) as T;
    if (!module) {
      throw new Error(`找不到模块${this.metadata.id}所依赖的模块: ${moduleId}`);
    }

    return module;
  }

  /**
   * 获取可选的依赖模块
   * 与getModule不同，如果模块不存在不会抛出异常，而是返回undefined
   *
   * @param moduleId - 依赖模块ID
   * @returns 依赖模块实例或undefined
   */
  protected getOptionalModule<T extends Module>(moduleId: string): T | undefined {
    if (!this._kernel) {
      return undefined;
    }

    return this._kernel.getModule(moduleId) as T | undefined;
  }
}
