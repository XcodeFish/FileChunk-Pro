import {
  Module,
  ModuleRegistry,
  ModuleRegistrationOptions,
  ModuleRegistration,
  ModuleRegistrationError,
  ModuleDependencyError,
  ModuleStatus
} from '../types/modules';

/**
 * 默认模块注册选项
 */
const DEFAULT_REGISTRATION_OPTIONS: ModuleRegistrationOptions = {
  override: false,
  autoInit: false,
  autoStart: false,
  initTimeout: 30000, // 30秒
  startTimeout: 30000 // 30秒
};

/**
 * 模块注册中心实现
 *
 * 负责管理所有模块的注册、注销和依赖关系
 */
export class ModuleRegistryImpl implements ModuleRegistry {
  /**
   * 模块注册表 - 存储模块ID与注册信息的映射
   */
  private _modules: Map<string, ModuleRegistration> = new Map();

  /**
   * 依赖关系图 - 存储模块间的依赖关系
   * key: 模块ID, value: 依赖该模块的其他模块ID数组
   */
  private _dependencyGraph: Map<string, string[]> = new Map();

  /**
   * 注册模块
   *
   * @param module - 模块实例
   * @param options - 注册选项
   * @throws {ModuleRegistrationError} 当注册失败时抛出
   */
  register(module: Module, options?: Partial<ModuleRegistrationOptions>): void {
    if (!module) {
      throw new ModuleRegistrationError('无法注册空模块', 'unknown');
    }

    const moduleId = module.metadata.id;

    // 合并选项，使用默认值填充未提供的选项
    const mergedOptions: ModuleRegistrationOptions = {
      ...DEFAULT_REGISTRATION_OPTIONS,
      ...options
    };

    // 检查模块是否已经注册
    if (this._modules.has(moduleId)) {
      if (mergedOptions.override) {
        this.unregister(moduleId);
      } else {
        throw new ModuleRegistrationError(
          `模块 ${moduleId} 已经注册，设置 override 选项为 true 以覆盖`,
          moduleId
        );
      }
    }

    // 验证依赖项
    this.validateDependencies(module);

    // 创建注册信息
    const registration: ModuleRegistration = {
      module,
      options: mergedOptions,
      registeredAt: Date.now()
    };

    // 注册模块
    this._modules.set(moduleId, registration);

    // 更新依赖图
    this.updateDependencyGraph(module);

    // 根据选项决定是否自动初始化和启动模块
    const initializeAndStart = async (): Promise<void> => {
      if (mergedOptions.autoInit) {
        try {
          await this.initializeModule(module, mergedOptions.initTimeout);

          if (mergedOptions.autoStart) {
            await this.startModule(module, mergedOptions.startTimeout);
          }
        } catch (error) {
          // 初始化或启动失败时，从注册表中移除该模块
          this.unregister(moduleId);
          throw error;
        }
      }
    };

    // 异步执行初始化和启动，不阻塞注册过程
    if (mergedOptions.autoInit) {
      initializeAndStart().catch(error => {
        console.error(`模块 ${moduleId} 自动初始化或启动失败:`, error);
      });
    }
  }

  /**
   * 注销模块
   *
   * @param moduleId - 模块ID
   * @returns 是否成功注销
   */
  unregister(moduleId: string): boolean {
    if (!this._modules.has(moduleId)) {
      return false;
    }

    // 检查是否有其他模块依赖此模块
    const dependents = this.getDependentModules(moduleId);
    if (dependents.length > 0) {
      throw new ModuleDependencyError(
        `无法注销模块 ${moduleId}，还有其他模块依赖它: ${dependents.join(', ')}`,
        moduleId,
        dependents[0]
      );
    }

    // 从依赖图中移除
    this._dependencyGraph.delete(moduleId);

    // 清理其他模块的依赖列表
    for (const [depId, dependents] of this._dependencyGraph.entries()) {
      this._dependencyGraph.set(
        depId,
        dependents.filter(id => id !== moduleId)
      );
    }

    // 从注册表中移除
    return this._modules.delete(moduleId);
  }

  /**
   * 获取模块实例
   *
   * @param moduleId - 模块ID
   * @returns 模块实例，如果未找到则返回undefined
   */
  get<T extends Module>(moduleId: string): T | undefined {
    const registration = this._modules.get(moduleId);
    return registration ? (registration.module as T) : undefined;
  }

  /**
   * 检查模块是否已注册
   *
   * @param moduleId - 模块ID
   * @returns 是否已注册
   */
  has(moduleId: string): boolean {
    return this._modules.has(moduleId);
  }

  /**
   * 获取所有注册的模块
   *
   * @returns 模块数组
   */
  getAllModules(): Module[] {
    return Array.from(this._modules.values()).map(reg => reg.module);
  }

  /**
   * 获取所有模块ID
   *
   * @returns 模块ID数组
   */
  getModuleIds(): string[] {
    return Array.from(this._modules.keys());
  }

  /**
   * 获取特定状态的所有模块
   *
   * @param status - 模块状态
   * @returns 符合状态的模块数组
   */
  getModulesByStatus(status: ModuleStatus): Module[] {
    return Array.from(this._modules.values())
      .filter(reg => reg.module.status === status)
      .map(reg => reg.module);
  }

  /**
   * 获取模块的依赖项
   *
   * @param moduleId - 模块ID
   * @returns 依赖模块ID数组
   */
  getModuleDependencies(moduleId: string): string[] {
    const module = this.get(moduleId);
    return module?.metadata.dependencies || [];
  }

  /**
   * 获取依赖特定模块的所有模块
   *
   * @param moduleId - 模块ID
   * @returns 依赖该模块的模块ID数组
   */
  getDependentModules(moduleId: string): string[] {
    return this._dependencyGraph.get(moduleId) || [];
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this._modules.clear();
    this._dependencyGraph.clear();
  }

  /**
   * 验证模块依赖
   *
   * @param module - 要验证的模块
   * @throws {ModuleDependencyError} 当依赖无效时抛出
   */
  private validateDependencies(module: Module): void {
    const { id: moduleId, dependencies = [] } = module.metadata;

    for (const depId of dependencies) {
      // 检查自依赖
      if (depId === moduleId) {
        throw new ModuleDependencyError(`模块 ${moduleId} 不能依赖自身`, moduleId, depId);
      }

      // 检查依赖的模块是否已注册
      if (!this._modules.has(depId)) {
        throw new ModuleDependencyError(
          `模块 ${moduleId} 依赖未注册的模块: ${depId}`,
          moduleId,
          depId
        );
      }

      // 检查循环依赖
      if (this.hasCircularDependency(moduleId, depId, new Set())) {
        throw new ModuleDependencyError(`检测到循环依赖: ${moduleId} -> ${depId}`, moduleId, depId);
      }
    }
  }

  /**
   * 检查是否存在循环依赖
   *
   * @param sourceId - 源模块ID
   * @param targetId - 目标模块ID
   * @param visited - 已访问的模块ID集合
   * @returns 是否存在循环依赖
   */
  private hasCircularDependency(sourceId: string, targetId: string, visited: Set<string>): boolean {
    if (sourceId === targetId) {
      return true;
    }

    if (visited.has(targetId)) {
      return false;
    }

    visited.add(targetId);

    const targetModule = this.get(targetId);
    if (!targetModule || !targetModule.metadata.dependencies) {
      return false;
    }

    for (const depId of targetModule.metadata.dependencies) {
      if (this.hasCircularDependency(sourceId, depId, new Set([...visited]))) {
        return true;
      }
    }

    return false;
  }

  /**
   * 更新依赖关系图
   *
   * @param module - 模块实例
   */
  private updateDependencyGraph(module: Module): void {
    const { id: moduleId, dependencies = [] } = module.metadata;

    // 初始化该模块的被依赖列表
    if (!this._dependencyGraph.has(moduleId)) {
      this._dependencyGraph.set(moduleId, []);
    }

    // 更新依赖项的被依赖列表
    for (const depId of dependencies) {
      if (!this._dependencyGraph.has(depId)) {
        this._dependencyGraph.set(depId, []);
      }

      const dependents = this._dependencyGraph.get(depId) as string[];
      if (!dependents.includes(moduleId)) {
        dependents.push(moduleId);
      }
    }
  }

  /**
   * 初始化模块
   *
   * @param module - 模块实例
   * @param timeout - 超时时间(ms)
   */
  private async initializeModule(module: Module, timeout?: number): Promise<void> {
    if (timeout) {
      // 创建带超时的初始化Promise
      const initPromise = module.init();
      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(() => {
          clearTimeout(id);
          reject(new Error(`模块 ${module.metadata.id} 初始化超时`));
        }, timeout);
      });

      await Promise.race([initPromise, timeoutPromise]);
    } else {
      await module.init();
    }
  }

  /**
   * 启动模块
   *
   * @param module - 模块实例
   * @param timeout - 超时时间(ms)
   */
  private async startModule(module: Module, timeout?: number): Promise<void> {
    if (timeout) {
      // 创建带超时的启动Promise
      const startPromise = module.start();
      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(() => {
          clearTimeout(id);
          reject(new Error(`模块 ${module.metadata.id} 启动超时`));
        }, timeout);
      });

      await Promise.race([startPromise, timeoutPromise]);
    } else {
      await module.start();
    }
  }
}
