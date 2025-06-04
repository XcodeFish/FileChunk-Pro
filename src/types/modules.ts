/**
 * 模块状态枚举
 */
export enum ModuleStatus {
  REGISTERED = 'registered', // 已注册但未初始化
  INITIALIZING = 'initializing', // 正在初始化
  INITIALIZED = 'initialized', // 已初始化但未启用
  STARTING = 'starting', // 正在启动
  RUNNING = 'running', // 正在运行
  STOPPING = 'stopping', // 正在停止
  STOPPED = 'stopped', // 已停止
  ERROR = 'error' // 错误状态
}

/**
 * 模块元数据接口
 */
export interface ModuleMetadata {
  id: string; // 模块唯一标识
  name: string; // 模块名称
  version: string; // 模块版本
  description?: string; // 模块描述
  author?: string; // 作者信息
  dependencies?: string[]; // 依赖的其他模块ID
  implements?: string; // 该模块实现的接口ID（用于接口与实现分离）
  isInterface?: boolean; // 标记该模块是否为接口定义
}

/**
 * 模块实例接口
 */
export interface Module {
  metadata: ModuleMetadata; // 模块元数据
  status: ModuleStatus; // 模块当前状态

  // 生命周期方法
  init(): Promise<void> | void; // 初始化模块
  start(): Promise<void> | void; // 启动模块
  stop(): Promise<void> | void; // 停止模块
  destroy(): Promise<void> | void; // 销毁模块

  // 状态方法
  isRunning(): boolean; // 检查模块是否正在运行
  getStatus(): ModuleStatus; // 获取模块当前状态

  // 事件处理
  onError(error: Error): void; // 错误处理方法
}

/**
 * 模块构造器类型
 */
export interface ModuleConstructor {
  new (...args: any[]): Module;
}

/**
 * 模块工厂接口
 */
export interface ModuleFactory {
  create(...args: any[]): Module;
}

/**
 * 模块注册选项
 */
export interface ModuleRegistrationOptions {
  override?: boolean; // 是否覆盖已存在的同ID模块
  autoInit?: boolean; // 注册后是否自动初始化
  autoStart?: boolean; // 初始化后是否自动启动
  initTimeout?: number; // 初始化超时时间(ms)
  startTimeout?: number; // 启动超时时间(ms)
}

/**
 * 模块注册信息
 */
export interface ModuleRegistration {
  module: Module; // 模块实例
  options: ModuleRegistrationOptions; // 注册选项
  registeredAt: number; // 注册时间戳
}

/**
 * 模块注册表接口
 */
export interface ModuleRegistry {
  register(module: Module, options?: ModuleRegistrationOptions): void;
  unregister(moduleId: string): boolean;
  get<T extends Module>(moduleId: string): T | undefined;
  has(moduleId: string): boolean;
  getAllModules(): Module[];
  getModuleIds(): string[];
  getModulesByStatus(status: ModuleStatus): Module[];
  getModuleDependencies(moduleId: string): string[];
  getDependentModules(moduleId: string): string[];
  clear(): void;
}

/**
 * 模块注册错误类型
 */
export class ModuleRegistrationError extends Error {
  moduleId: string;

  constructor(message: string, moduleId: string) {
    super(message);
    this.name = 'ModuleRegistrationError';
    this.moduleId = moduleId;
  }
}

/**
 * 模块依赖错误类型
 */
export class ModuleDependencyError extends Error {
  moduleId: string;
  dependencyId: string;

  constructor(message: string, moduleId: string, dependencyId: string) {
    super(message);
    this.name = 'ModuleDependencyError';
    this.moduleId = moduleId;
    this.dependencyId = dependencyId;
  }
}

/**
 * 模块生命周期错误类型
 */
export class ModuleLifecycleError extends Error {
  moduleId: string;
  lifecycle: string;

  constructor(message: string, moduleId: string, lifecycle: string) {
    super(message);
    this.name = 'ModuleLifecycleError';
    this.moduleId = moduleId;
    this.lifecycle = lifecycle;
  }
}
