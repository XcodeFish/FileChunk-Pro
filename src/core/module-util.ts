import { Module, ModuleMetadata, ModuleStatus, ModuleDependencyError } from '../types/modules';

/**
 * 模块工具类
 *
 * 提供模块相关的辅助功能
 */
export class ModuleUtil {
  /**
   * 创建模块元数据
   *
   * @param id 模块ID
   * @param name 模块名称
   * @param version 模块版本
   * @param options 其他元数据选项
   * @returns 模块元数据对象
   */
  static createMetadata(
    id: string,
    name: string,
    version: string,
    options?: Partial<Omit<ModuleMetadata, 'id' | 'name' | 'version'>>
  ): ModuleMetadata {
    return {
      id,
      name,
      version,
      ...options
    };
  }

  /**
   * 检查模块依赖
   * 确保所有需要的依赖模块都存在并且处于正确状态
   *
   * @param module 要检查的模块
   * @param kernel 内核实例
   * @param requiredStatus 依赖模块需要的状态，默认为RUNNING
   */
  static checkDependencies(
    module: Module,
    kernel: any,
    requiredStatus: ModuleStatus = ModuleStatus.RUNNING
  ): void {
    const dependencies = module.metadata.dependencies || [];

    for (const depId of dependencies) {
      const depModule = kernel.getModule(depId);

      if (!depModule) {
        throw new ModuleDependencyError(
          `模块 ${module.metadata.id} 缺少依赖: ${depId}`,
          module.metadata.id,
          depId
        );
      }

      if (depModule.status !== requiredStatus) {
        throw new ModuleDependencyError(
          `模块 ${module.metadata.id} 的依赖 ${depId} 状态不正确，当前: ${depModule.status}，需要: ${requiredStatus}`,
          module.metadata.id,
          depId
        );
      }
    }
  }

  /**
   * 检测模块依赖图中是否存在循环依赖
   *
   * @param moduleId 起始模块ID
   * @param kernel 内核实例
   * @returns 如果存在循环依赖，返回循环路径；否则返回null
   */
  static detectCircularDependency(moduleId: string, kernel: any): string[] | null {
    const visited: Set<string> = new Set();
    const path: string[] = [];

    function dfs(currentId: string): string[] | null {
      // 已经在当前路径中，发现循环
      if (path.includes(currentId)) {
        path.push(currentId);
        return path.slice(path.indexOf(currentId));
      }

      // 已经检查过，没有问题
      if (visited.has(currentId)) {
        return null;
      }

      visited.add(currentId);
      path.push(currentId);

      const module = kernel.getModule(currentId);
      if (!module) return null;

      const dependencies = module.metadata.dependencies || [];

      for (const depId of dependencies) {
        const result = dfs(depId);
        if (result) return result;
      }

      path.pop();
      return null;
    }

    return dfs(moduleId);
  }

  /**
   * 获取模块依赖树
   *
   * @param moduleId 模块ID
   * @param kernel 内核实例
   * @returns 依赖树对象
   */
  static getDependencyTree(moduleId: string, kernel: any): Record<string, any> {
    const module = kernel.getModule(moduleId);
    if (!module) return {};

    const dependencies = module.metadata.dependencies || [];
    const result: Record<string, any> = {};

    for (const depId of dependencies) {
      result[depId] = this.getDependencyTree(depId, kernel);
    }

    return result;
  }

  /**
   * 创建模块工厂函数
   *
   * @param moduleClass 模块类
   * @param metadata 模块元数据
   * @param configFactory 配置工厂函数（可选）
   * @returns 模块工厂函数
   */
  static createFactory<T extends Module>(
    moduleClass: new (metadata: ModuleMetadata, config?: any) => T,
    metadata: ModuleMetadata,
    configFactory?: () => any
  ): () => T {
    return () => {
      const config = configFactory ? configFactory() : undefined;
      return new moduleClass(metadata, config);
    };
  }

  /**
   * 格式化模块状态为人类可读字符串
   *
   * @param status 模块状态
   * @returns 格式化后的状态字符串
   */
  static formatStatus(status: ModuleStatus): string {
    const statusMap: Record<ModuleStatus, string> = {
      [ModuleStatus.REGISTERED]: '已注册',
      [ModuleStatus.INITIALIZING]: '正在初始化',
      [ModuleStatus.INITIALIZED]: '已初始化',
      [ModuleStatus.STARTING]: '正在启动',
      [ModuleStatus.RUNNING]: '运行中',
      [ModuleStatus.STOPPING]: '正在停止',
      [ModuleStatus.STOPPED]: '已停止',
      [ModuleStatus.ERROR]: '错误'
    };

    return statusMap[status] || status;
  }
}
