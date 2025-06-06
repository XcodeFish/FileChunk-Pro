/**
 * 内核模块接口
 */
export interface IModule {
  /**
   * 模块初始化
   * @param kernel 内核实例
   */
  init(kernel: IKernel): Promise<void> | void;
}

/**
 * 事件监听器类型
 */
export type EventListener<T = any> = (data: T) => void;

/**
 * 内核接口
 */
export interface IKernel {
  /**
   * 注册模块
   * @param name 模块名称
   * @param module 模块实例
   */
  registerModule<T extends IModule>(name: string, module: T): IKernel;

  /**
   * 获取模块
   * @param name 模块名称
   * @returns 模块实例
   */
  getModule<T>(name: string): T;

  /**
   * 添加事件监听器
   * @param event 事件名称
   * @param handler 处理函数
   */
  on<T = any>(event: string, handler: EventListener<T>): IKernel;

  /**
   * 移除事件监听器
   * @param event 事件名称
   * @param handler 处理函数
   */
  off<T = any>(event: string, handler: EventListener<T>): IKernel;

  /**
   * 触发事件
   * @param event 事件名称
   * @param data 事件数据
   */
  emit<T = any>(event: string, data: T): IKernel;

  /**
   * 更新状态
   * @param newState 新状态
   */
  updateState(newState: Record<string, any>): IKernel;
}
