import { Module, ModuleMetadata, ModuleStatus, ModuleLifecycleError } from '../types/modules';

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
   * 构造函数
   *
   * @param metadata - 模块元数据
   */
  constructor(metadata: ModuleMetadata) {
    this.validateMetadata(metadata);
    this.metadata = { ...metadata };

    // 确保依赖项是数组
    if (!this.metadata.dependencies) {
      this.metadata.dependencies = [];
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
      await this.onInit();
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
      await this.onStart();
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
      await this.onStop();
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
      await this.onDestroy();
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
  }

  /**
   * 初始化钩子
   * 子类应重写此方法以实现具体初始化逻辑
   */
  protected async onInit(): Promise<void> {
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
   * 停止钩子
   * 子类应重写此方法以实现具体停止逻辑
   */
  protected async onStop(): Promise<void> {
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
}
