// @ts-nocheck
/* eslint-disable @typescript-eslint/no-var-requires */
/// <reference types="react-native" />

// 使用接口和类型声明代替命名空间，允许在非React Native环境编译
interface NativeModulesStatic {
  [moduleName: string]: any;
}

interface NativeEventEmitterType {
  new (nativeModule?: any): {
    addListener(eventType: string, listener: (event: any) => void): { remove: () => void };
    removeAllListeners(eventType: string): void;
  };
}

interface PlatformType {
  OS: string;
  Version: number;
}

// 使用动态导入或声明的类型
let NativeModules: NativeModulesStatic;
let NativeEventEmitter: NativeEventEmitterType;
let Platform: PlatformType;

// 动态初始化React Native相关模块
try {
  // 这里使用require而不是import是为了支持条件加载
  // 如果环境中没有React Native，代码也能正常编译
  // 这是微内核架构的关键设计，允许库在不同环境下使用
  const RN = require('react-native');
  NativeModules = RN.NativeModules;
  NativeEventEmitter = RN.NativeEventEmitter;
  Platform = RN.Platform;
} catch {
  // 如果未安装React Native，使用空对象模拟
  NativeModules = {};
  NativeEventEmitter = class MockEventEmitter {
    constructor() {}
    addListener() {
      return { remove: () => {} };
    }
    removeAllListeners() {}
  } as any;
  Platform = { OS: 'unknown', Version: 0 } as any;

  console.warn('React Native未安装，ReactNativeAdapter将无法正常工作');
}

import { PlatformAdapter, FileChunk, RequestOptions } from '../platform-base';
import { Kernel } from '../../core/kernel';
/*
 * 注意：针对React Native的特殊性，我们采用条件导入方式实现其功能
 * 这种方式可以让库在非React Native环境下正常编译和运行
 * 但会导致一些不可避免的linter错误，可以通过在项目级别的ESLint配置中添加例外规则解决
 */
// 使用类型导入而非变量导入，避免实际依赖React Native包
// 已删除未使用的导入
// import type { NativeEventEmitter as RNEventEmitter } from 'react-native';

/**
 * React Native 平台特有配置
 */
export interface ReactNativeAdapterConfig {
  /** 上传模块名称 */
  uploadModule?: string;
  /** 进度事件名称 */
  progressEventName?: string;
  /** 最大并发请求数 */
  maxConcurrentRequests?: number;
  /** 是否启用原生进度通知 */
  useNativeProgress?: boolean;
  /** 进度通知间隔(毫秒) */
  progressNotificationInterval?: number;
}

/**
 * React Native适配器
 * 提供与React Native原生模块的桥接功能
 */
export class ReactNativeAdapter extends PlatformAdapter {
  /** React Native 配置 */
  private config: ReactNativeAdapterConfig;
  /** 原生上传模块 */
  private nativeUploadModule: any;
  /** 原生事件监听器 */
  private nativeEventListener: { remove: () => void } | null;
  /** 进度订阅映射 */
  private progressSubscriptions: Map<string, Set<(progress: number) => void>>;
  /** 上传任务映射 */
  private uploadTasks: Map<string, any>;
  /** 任务计数器 */
  private taskCounter: number;
  /** 进度通知节流计时器 */
  private progressThrottleTimers: Map<string, NodeJS.Timeout>;
  /** 原生模块映射 */
  private nativeModules: Record<string, any>;
  /** React Native平台信息 */
  private platformInfo: any;

  /**
   * 构造函数
   * @param config React Native适配器配置
   */
  constructor(config: ReactNativeAdapterConfig = {}) {
    super('react-native');

    this.config = {
      uploadModule: 'FileChunkUploader',
      progressEventName: 'FileUploadProgress',
      maxConcurrentRequests: 4,
      useNativeProgress: true,
      progressNotificationInterval: 100,
      ...config
    };

    this.progressSubscriptions = new Map();
    this.uploadTasks = new Map();
    this.progressThrottleTimers = new Map();
    this.taskCounter = 0;
    this.nativeEventListener = null;
    this.nativeModules = {};
    this.platformInfo = {};

    // 初始化React Native模块
    this.initializeNativeModules();
  }

  /**
   * 初始化适配器
   * @param kernel 微内核实例
   */
  public override init(kernel: Kernel): void {
    super.init(kernel);
    this.setupProgressListener();
  }

  /**
   * 检测当前环境是否支持React Native
   */
  public isSupported(): boolean {
    try {
      // 此函数会尝试访问React Native API
      // 如果不在React Native环境，会抛出异常
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const reactNative = require('react-native');
      return !!reactNative.Platform && !!reactNative.NativeModules;
      // eslint-disable-next-line @typescript-eslint/no-empty-function
    } catch {
      return false;
    }
  }

  /**
   * 创建文件分片
   * @param file React Native文件对象
   * @param chunkSize 分片大小(字节)
   */
  public async createChunks(file: any, chunkSize: number): Promise<FileChunk[]> {
    try {
      // 检查文件对象是否有效
      if (!file || !file.uri) {
        throw new Error('无效的文件对象');
      }

      // 获取文件信息
      const fileInfo = await this.getFileInfo(file);

      // 计算分片数量
      const totalChunks = Math.ceil(fileInfo.size / chunkSize);
      const chunks: FileChunk[] = [];

      // 创建分片数据
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileInfo.size);

        chunks.push({
          index: i,
          data: {
            uri: file.uri,
            start,
            end,
            name: fileInfo.name
          },
          start,
          end,
          size: end - start
        });
      }

      return chunks;
    } catch (error) {
      throw this.handleError(error as Error, {
        operation: 'createChunks',
        file,
        chunkSize
      });
    }
  }

  /**
   * 发送网络请求
   * @param url 请求地址
   * @param method 请求方法
   * @param data 请求数据
   * @param options 请求选项
   */
  public async request(
    url: string,
    method: string,
    data?: any,
    options: RequestOptions = {}
  ): Promise<any> {
    try {
      // 如果是分片上传请求
      if (data && data.isChunk) {
        return this.uploadChunk(url, data.chunk, data.formData, options);
      }

      // 创建上传任务ID
      const taskId = this.generateTaskId();

      // 创建请求配置
      const requestConfig = {
        url,
        method,
        headers: options.headers || {},
        timeout: options.timeout || 30000,
        body: data
      };

      // 注册进度回调
      if (options.onProgress && this.config.useNativeProgress) {
        this.registerProgressCallback(taskId, options.onProgress);
      }

      // 执行请求
      const response = await this.performRequest(taskId, requestConfig);

      // 清理进度回调
      this.unregisterProgressCallback(taskId);

      return response;
    } catch (error) {
      throw this.handleError(error as Error, {
        operation: 'request',
        url,
        method
      });
    }
  }

  /**
   * 上传分片
   * @param url 上传地址
   * @param chunk 分片数据
   * @param formData 表单数据
   * @param options 请求选项
   */
  private async uploadChunk(
    url: string,
    chunk: FileChunk,
    formData: Record<string, any>,
    options: RequestOptions
  ): Promise<any> {
    try {
      // 检查是否有原生上传模块
      if (!this.nativeUploadModule || !this.nativeUploadModule.uploadChunk) {
        throw new Error('原生上传模块不可用');
      }

      // 创建上传任务ID
      const taskId = this.generateTaskId();

      // 保存上传任务引用
      if (options.taskRef) {
        const task = {
          cancel: () => this.cancelUpload(taskId)
        };
        options.taskRef(task);
        this.uploadTasks.set(taskId, task);
      }

      // 注册进度回调
      if (options.onProgress && this.config.useNativeProgress) {
        this.registerProgressCallback(taskId, options.onProgress);
      }

      // 准备上传参数
      const uploadParams = {
        taskId,
        url,
        headers: options.headers || {},
        fileUri: chunk.data.uri,
        start: chunk.start,
        end: chunk.end,
        fieldName: 'file',
        formData: formData || {},
        timeout: options.timeout || 30000
      };

      // 使用原生模块上传
      const response = await this.nativeUploadModule.uploadChunk(uploadParams);

      // 清理进度回调和任务引用
      this.unregisterProgressCallback(taskId);
      this.uploadTasks.delete(taskId);

      return response;
    } catch (error) {
      throw this.handleError(error as Error, {
        operation: 'uploadChunk',
        url,
        chunk
      });
    }
  }

  /**
   * 读取文件数据
   * @param file 文件对象
   * @param start 起始位置
   * @param end 结束位置
   */
  public async readFile(file: any, start?: number, end?: number): Promise<ArrayBuffer> {
    try {
      if (!file || !file.uri) {
        throw new Error('无效的文件对象');
      }

      // 如果原生模块不存在或不支持部分读取
      if (!this.nativeUploadModule || !this.nativeUploadModule.readFile) {
        throw new Error('原生文件读取功能不可用');
      }

      // 调用原生模块读取文件
      const result = await this.nativeUploadModule.readFile({
        uri: file.uri,
        start: start || 0,
        end: end || 0,
        returnBase64: false
      });

      // 将base64转换为ArrayBuffer
      if (result.base64) {
        const binaryString = globalThis.atob(result.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      }

      throw new Error('文件读取失败');
    } catch (error) {
      throw this.handleError(error as Error, {
        operation: 'readFile',
        file,
        start,
        end
      });
    }
  }

  /**
   * 获取文件信息
   * @param file 文件对象
   */
  public async getFileInfo(file: any): Promise<{
    name: string;
    size: number;
    type: string;
    lastModified: number;
  }> {
    try {
      if (!file || !file.uri) {
        throw new Error('无效的文件对象');
      }

      // 如果已经有文件信息，直接返回
      if (file.size !== undefined && file.name) {
        return {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          lastModified: file.lastModified || Date.now()
        };
      }

      // 否则使用原生模块获取信息
      if (!this.nativeUploadModule || !this.nativeUploadModule.getFileInfo) {
        throw new Error('原生文件信息功能不可用');
      }

      const info = await this.nativeUploadModule.getFileInfo({
        uri: file.uri
      });

      return {
        name: info.name || file.name || 'unknown',
        size: info.size || 0,
        type: info.type || file.type || 'application/octet-stream',
        lastModified: info.lastModified || Date.now()
      };
    } catch (error) {
      throw this.handleError(error as Error, {
        operation: 'getFileInfo',
        file
      });
    }
  }

  /**
   * 选择文件
   * @param options 选择文件选项
   */
  public async selectFile(
    options: {
      accept?: string;
      multiple?: boolean;
      directory?: boolean;
    } = {}
  ): Promise<any[]> {
    try {
      if (!this.nativeUploadModule || !this.nativeUploadModule.selectFile) {
        throw new Error('原生文件选择功能不可用');
      }

      const result = await this.nativeUploadModule.selectFile({
        multiple: options.multiple || false,
        type: options.accept || '*/*'
      });

      if (!result || !result.files || !Array.isArray(result.files)) {
        return [];
      }

      return result.files;
    } catch (error) {
      throw this.handleError(error as Error, {
        operation: 'selectFile',
        options
      });
    }
  }

  /**
   * 取消上传
   * @param taskId 任务ID
   */
  private async cancelUpload(taskId: string): Promise<void> {
    try {
      if (!this.nativeUploadModule || !this.nativeUploadModule.cancelUpload) {
        throw new Error('取消上传功能不可用');
      }

      await this.nativeUploadModule.cancelUpload({ taskId });

      // 清理进度回调和任务引用
      this.unregisterProgressCallback(taskId);
      this.uploadTasks.delete(taskId);
    } catch (error) {
      console.error('取消上传失败:', error);
    }
  }

  /**
   * 初始化原生模块
   */
  private initializeNativeModules(): void {
    try {
      // 尝试获取React Native模块
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const reactNative = require('react-native');
      this.nativeModules = reactNative.NativeModules || {};
      this.platformInfo = reactNative.Platform || {};

      // 获取上传模块引用
      const uploadModuleName = this.config.uploadModule as string;
      this.nativeUploadModule = this.nativeModules[uploadModuleName];

      if (!this.nativeUploadModule) {
        console.warn(`React Native原生模块 "${uploadModuleName}" 不可用，某些功能将受限`);
      }
      // eslint-disable-next-line @typescript-eslint/no-empty-function
    } catch {
      console.warn('初始化React Native模块失败，某些功能将不可用');
    }
  }

  /**
   * 设置进度监听器
   */
  private setupProgressListener(): void {
    if (!this.config.useNativeProgress) return;

    try {
      // 检查上传模块是否可用
      if (!this.nativeUploadModule) return;

      // 获取事件发射器
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const reactNative = require('react-native');
      if (!reactNative.NativeEventEmitter) {
        return;
      }

      // 创建事件监听器
      const eventEmitter = new reactNative.NativeEventEmitter(this.nativeUploadModule);

      // 监听进度事件
      this.nativeEventListener = eventEmitter.addListener(
        this.config.progressEventName as string,
        this.handleProgressEvent.bind(this)
      );
      // eslint-disable-next-line @typescript-eslint/no-empty-function
    } catch {
      console.warn('设置进度监听失败，上传进度将不可用');
      this.config.useNativeProgress = false;
    }
  }

  /**
   * 处理进度事件
   * @param event 进度事件
   */
  private handleProgressEvent(event: { taskId: string; loaded: number; total: number }): void {
    const { taskId, loaded, total } = event;

    // 获取任务的进度回调集合
    const callbacks = this.progressSubscriptions.get(taskId);
    if (!callbacks || callbacks.size === 0) return;

    // 计算进度
    const progress = total > 0 ? Math.min(Math.floor((loaded / total) * 100), 100) : 0;

    // 节流进度通知，避免过于频繁的更新
    this.throttleProgressNotification(taskId, progress, Array.from(callbacks));
  }

  /**
   * 节流进度通知
   * @param taskId 任务ID
   * @param progress 进度值
   * @param callbacks 回调函数数组
   */
  private throttleProgressNotification(
    taskId: string,
    progress: number,
    callbacks: ((progress: number) => void)[]
  ): void {
    // 清除之前的计时器
    if (this.progressThrottleTimers.has(taskId)) {
      clearTimeout(this.progressThrottleTimers.get(taskId));
    }

    // 设置新的计时器
    const timerId = setTimeout(() => {
      // 执行所有回调函数
      callbacks.forEach(callback => {
        try {
          callback(progress);
        } catch (error) {
          console.error('进度回调执行失败:', error);
        }
      });

      // 清理计时器引用
      this.progressThrottleTimers.delete(taskId);

      // 如果进度完成，清理该任务的回调
      if (progress >= 100) {
        this.unregisterProgressCallback(taskId);
      }
    }, this.config.progressNotificationInterval);

    // 保存计时器引用
    this.progressThrottleTimers.set(taskId, timerId);
  }

  /**
   * 注册进度回调
   * @param taskId 任务ID
   * @param callback 进度回调函数
   */
  private registerProgressCallback(taskId: string, callback: (progress: number) => void): void {
    if (!this.config.useNativeProgress) return;

    // 获取或创建任务回调集合
    if (!this.progressSubscriptions.has(taskId)) {
      this.progressSubscriptions.set(taskId, new Set());
    }

    // 添加回调函数
    const callbacks = this.progressSubscriptions.get(taskId);
    if (callbacks) {
      callbacks.add(callback);
    }
  }

  /**
   * 取消注册进度回调
   * @param taskId 任务ID
   * @param callback 可选的特定回调函数
   */
  private unregisterProgressCallback(taskId: string, callback?: (progress: number) => void): void {
    // 清除节流计时器
    if (this.progressThrottleTimers.has(taskId)) {
      clearTimeout(this.progressThrottleTimers.get(taskId));
      this.progressThrottleTimers.delete(taskId);
    }

    // 如果没有订阅，直接返回
    if (!this.progressSubscriptions.has(taskId)) return;

    const callbacks = this.progressSubscriptions.get(taskId);
    if (!callbacks) return;

    // 如果指定了回调，只移除该回调
    if (callback) {
      callbacks.delete(callback);

      // 如果没有回调了，清理整个订阅
      if (callbacks.size === 0) {
        this.progressSubscriptions.delete(taskId);
      }
    } else {
      // 否则清理整个任务的所有回调
      this.progressSubscriptions.delete(taskId);
    }
  }

  /**
   * 生成唯一的任务ID
   */
  private generateTaskId(): string {
    this.taskCounter = (this.taskCounter + 1) % Number.MAX_SAFE_INTEGER;
    return `rnupload_${Date.now()}_${this.taskCounter}`;
  }

  /**
   * 执行网络请求
   * @param taskId 任务ID
   * @param config 请求配置
   */
  private async performRequest(taskId: string, config: any): Promise<any> {
    // 如果有原生请求模块，优先使用
    if (this.nativeUploadModule && this.nativeUploadModule.request) {
      return await this.nativeUploadModule.request({
        ...config,
        taskId
      });
    }

    // 否则使用fetch API
    const response = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: typeof config.body === 'object' ? JSON.stringify(config.body) : config.body,
      signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined
    });

    // 解析响应
    if (!response.ok) {
      throw new Error(`请求失败: ${response.status} ${response.statusText}`);
    }

    // 尝试解析为JSON
    try {
      return await response.json();
    } catch {
      // 如果不是JSON，返回文本
      return await response.text();
    }
  }

  /**
   * 检测平台特性
   */
  protected detectFeatures(): void {
    // 根据平台类型和可用的原生模块检测功能
    const hasNativeModule = !!this.nativeUploadModule;

    this.features = {
      chunkedUpload: hasNativeModule && !!this.nativeUploadModule.uploadChunk,
      webWorker: false, // RN不支持WebWorker
      indexedDB: false, // RN不支持IndexedDB
      webCrypto: typeof globalThis.crypto !== 'undefined' && !!globalThis.crypto.subtle,
      streams: false, // RN不支持Streams API
      dragAndDrop: false, // RN不支持拖放
      folderUpload: false, // RN不支持文件夹上传
      maxConcurrentRequests: this.config.maxConcurrentRequests || 4,
      maxFileSize: Number.MAX_SAFE_INTEGER // RN没有硬性限制
    };

    // 触发特性检测完成事件
    this.eventBus.emit('featuresDetected', this.features);
  }

  /**
   * 销毁适配器
   * 释放资源并清理事件监听
   */
  public destroy(): void {
    // 取消所有进度节流计时器
    this.progressThrottleTimers.forEach(timerId => {
      clearTimeout(timerId);
    });
    this.progressThrottleTimers.clear();

    // 清理事件监听
    if (this.nativeEventListener) {
      this.nativeEventListener.remove();
      this.nativeEventListener = null;
    }

    // 取消所有上传任务
    this.uploadTasks.forEach((_task, taskId) => {
      this.cancelUpload(taskId).catch(console.error);
    });

    // 清理所有状态
    this.progressSubscriptions.clear();
    this.uploadTasks.clear();

    // 触发销毁事件
    this.eventBus.emit('destroyed');
  }
}
