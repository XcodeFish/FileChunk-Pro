import { Plugin, PluginAPI } from './plugin-manager';

/**
 * 核心功能扩展点枚举
 */
export enum ExtensionPoint {
  // 传输模块扩展点
  TRANSPORT_BEFORE_UPLOAD = 'transport:beforeUpload',
  TRANSPORT_AFTER_UPLOAD = 'transport:afterUpload',
  TRANSPORT_BEFORE_CHUNK_UPLOAD = 'transport:beforeChunkUpload',
  TRANSPORT_AFTER_CHUNK_UPLOAD = 'transport:afterChunkUpload',

  // 存储模块扩展点
  STORAGE_BEFORE_SAVE = 'storage:beforeSave',
  STORAGE_AFTER_SAVE = 'storage:afterSave',

  // 安全模块扩展点
  SECURITY_VALIDATE_FILE = 'security:validateFile',
  SECURITY_BEFORE_ENCRYPTION = 'security:beforeEncryption',
  SECURITY_AFTER_ENCRYPTION = 'security:afterEncryption',

  // 网络模块扩展点
  NETWORK_REQUEST_INTERCEPTOR = 'network:requestInterceptor',
  NETWORK_RESPONSE_INTERCEPTOR = 'network:responseInterceptor',
  NETWORK_CDN_SELECT = 'network:cdnSelect',

  // 队列模块扩展点
  QUEUE_BEFORE_ADD = 'queue:beforeAdd',
  QUEUE_AFTER_ADD = 'queue:afterAdd',
  QUEUE_BEFORE_PROCESS = 'queue:beforeProcess',

  // UI扩展点
  UI_RENDER_UPLOAD_BUTTON = 'ui:renderUploadButton',
  UI_RENDER_PROGRESS = 'ui:renderProgress',
  UI_RENDER_FILE_LIST = 'ui:renderFileList'
}

/**
 * 创建标准化的插件API辅助函数
 * 用于在插件管理器中为每个插件创建标准API实例
 */
export function createPluginAPI(
  plugin: Plugin,
  config: any,
  callbacks: {
    registerHook: (hookName: string, callback: (...args: any[]) => any) => void;
    getPlugin: (name: string) => Plugin | undefined;
    getKernel: () => any;
    getEventBus: () => any;
  }
): PluginAPI {
  return {
    kernel: callbacks.getKernel(),
    events: callbacks.getEventBus(),
    registerHook: (hookName: string, callback: (...args: any[]) => any) =>
      callbacks.registerHook(hookName, callback),
    getPlugin: callbacks.getPlugin,
    configuration: config
  };
}

/**
 * 辅助函数：插件注册钩子
 * 提供类型安全和更好的开发体验
 */
export function registerExtensionPoint<T extends (...args: any[]) => any>(
  api: PluginAPI,
  point: ExtensionPoint,
  handler: T
): void {
  api.registerHook(point, handler);
}

/**
 * 插件开发者助手
 * 提供用于插件开发的实用函数
 */
export class PluginHelper {
  /**
   * 创建插件脚手架
   */
  static createPlugin(options: {
    name: string;
    version: string;
    dependencies?: string[];
    initialize: (api: PluginAPI) => Promise<void> | void;
    destroy?: () => Promise<void> | void;
  }): Plugin {
    return {
      name: options.name,
      version: options.version,
      dependencies: options.dependencies,
      initialize: options.initialize,
      destroy: options.destroy
    };
  }

  /**
   * 注册多个扩展点
   */
  static registerExtensionPoints(
    api: PluginAPI,
    handlers: Partial<Record<ExtensionPoint, (...args: any[]) => any>>
  ): void {
    Object.entries(handlers).forEach(([point, handler]) => {
      if (handler) {
        registerExtensionPoint(api, point as ExtensionPoint, handler);
      }
    });
  }
}
