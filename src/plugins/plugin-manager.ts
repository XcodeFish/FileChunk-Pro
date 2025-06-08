import { EventEmitter } from '../core/event-bus';
import { FileChunkKernel } from '../core/kernel';

export interface Plugin {
  name: string;
  version: string;
  dependencies?: string[];
  initialize: (api: PluginAPI) => Promise<void> | void;
  destroy?: () => Promise<void> | void;
}

export interface PluginAPI {
  kernel: FileChunkKernel;
  events: EventEmitter;
  registerHook: (hookName: string, callback: (...args: any[]) => any) => void;
  getPlugin: (name: string) => Plugin | undefined;
  configuration: Record<string, any>;
}

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private pluginApis: Map<string, PluginAPI> = new Map();
  private pluginConfigs: Map<string, any> = new Map();
  private kernel: FileChunkKernel;
  private eventBus: EventEmitter;
  private hooks: Map<string, Set<(...args: any[]) => any>> = new Map();
  private initialized: Set<string> = new Set();

  constructor(kernel: FileChunkKernel, eventBus: EventEmitter) {
    this.kernel = kernel;
    this.eventBus = eventBus;
  }

  /**
   * 注册插件
   */
  async register(plugin: Plugin, config?: any): Promise<boolean> {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin ${plugin.name} is already registered`);
      return false;
    }

    // 存储插件和配置
    this.plugins.set(plugin.name, plugin);
    this.pluginConfigs.set(plugin.name, config || {});

    // 检查依赖
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.plugins.has(dep)) {
          console.error(`Plugin ${plugin.name} depends on ${dep}, but it's not registered`);
          this.plugins.delete(plugin.name);
          return false;
        }
      }
    }

    // 创建插件API
    const api: PluginAPI = {
      kernel: this.kernel,
      events: this.eventBus,
      registerHook: (hookName: string, callback: (...args: any[]) => any) =>
        this.registerHook(plugin.name, hookName, callback),
      getPlugin: (name: string) => this.plugins.get(name),
      configuration: config || {}
    };

    this.pluginApis.set(plugin.name, api);

    // 在注册后不立即初始化，由用户显式调用初始化
    return true;
  }

  /**
   * 初始化插件
   */
  async initialize(pluginName: string): Promise<boolean> {
    if (!this.plugins.has(pluginName)) {
      console.error(`Cannot initialize plugin ${pluginName}: not found`);
      return false;
    }

    if (this.initialized.has(pluginName)) {
      return true; // 已经初始化
    }

    const plugin = this.plugins.get(pluginName)!;
    const api = this.pluginApis.get(pluginName)!;

    // 先初始化依赖
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.initialized.has(dep)) {
          const success = await this.initialize(dep);
          if (!success) {
            console.error(`Failed to initialize dependency ${dep} for plugin ${pluginName}`);
            return false;
          }
        }
      }
    }

    try {
      await Promise.resolve(plugin.initialize(api));
      this.initialized.add(pluginName);
      this.eventBus.emit('plugin:initialized', { name: pluginName });
      return true;
    } catch (error) {
      console.error(`Failed to initialize plugin ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * 初始化所有注册的插件
   */
  async initializeAll(): Promise<boolean> {
    let success = true;
    for (const pluginName of this.plugins.keys()) {
      if (!this.initialized.has(pluginName)) {
        const result = await this.initialize(pluginName);
        if (!result) {
          success = false;
        }
      }
    }
    return success;
  }

  /**
   * 卸载插件
   */
  async unload(pluginName: string): Promise<boolean> {
    if (!this.plugins.has(pluginName)) {
      console.warn(`Cannot unload plugin ${pluginName}: not found`);
      return false;
    }

    // 检查是否有其他插件依赖于这个插件
    for (const [name, plugin] of this.plugins.entries()) {
      if (plugin.dependencies?.includes(pluginName)) {
        console.error(`Cannot unload plugin ${pluginName}: it's a dependency of ${name}`);
        return false;
      }
    }

    const plugin = this.plugins.get(pluginName)!;

    // 执行插件的销毁方法
    if (this.initialized.has(pluginName) && plugin.destroy) {
      try {
        await Promise.resolve(plugin.destroy());
      } catch (error) {
        console.error(`Error during plugin ${pluginName} destruction:`, error);
        // 继续卸载，即使销毁失败
      }
    }

    // 移除所有该插件注册的钩子
    for (const [hookName, callbacks] of this.hooks.entries()) {
      const filteredCallbacks = Array.from(callbacks).filter(callback => {
        const pluginNameProp = (callback as any).__pluginName;
        return pluginNameProp !== pluginName;
      });
      this.hooks.set(hookName, new Set(filteredCallbacks));
    }

    // 清理插件状态
    this.initialized.delete(pluginName);
    this.pluginApis.delete(pluginName);
    this.pluginConfigs.delete(pluginName);
    this.plugins.delete(pluginName);

    this.eventBus.emit('plugin:unloaded', { name: pluginName });
    return true;
  }

  /**
   * 注册钩子
   */
  private registerHook(
    pluginName: string,
    hookName: string,
    callback: (...args: any[]) => any
  ): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, new Set());
    }

    // 给回调函数添加插件标识，便于卸载时清理
    (callback as any).__pluginName = pluginName;

    this.hooks.get(hookName)!.add(callback);
  }

  /**
   * 执行钩子
   */
  async executeHook(hookName: string, ...args: any[]): Promise<any[]> {
    if (!this.hooks.has(hookName)) {
      return [];
    }

    const results = [];
    for (const callback of this.hooks.get(hookName)!) {
      try {
        const result = await Promise.resolve(callback(...args));
        results.push(result);
      } catch (error) {
        console.error(`Error executing hook ${hookName}:`, error);
        results.push(null);
      }
    }
    return results;
  }

  /**
   * 获取已注册的插件列表
   */
  getRegisteredPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * 获取已初始化的插件列表
   */
  getInitializedPlugins(): string[] {
    return Array.from(this.initialized);
  }

  /**
   * 获取插件配置
   */
  getPluginConfig(pluginName: string): any {
    return this.pluginConfigs.get(pluginName) || {};
  }

  /**
   * 更新插件配置
   */
  updatePluginConfig(pluginName: string, config: any): boolean {
    if (!this.plugins.has(pluginName)) {
      return false;
    }

    this.pluginConfigs.set(pluginName, {
      ...this.pluginConfigs.get(pluginName),
      ...config
    });

    // 通知配置已更新
    this.eventBus.emit('plugin:config:updated', {
      name: pluginName,
      config: this.pluginConfigs.get(pluginName)
    });

    return true;
  }
}
