import { EventEmitter } from 'events';
import { Kernel } from '../core/kernel';

/**
 * 平台特性描述接口
 */
export interface PlatformFeatures {
  /** 是否支持分片上传 */
  chunkedUpload: boolean;
  /** 是否支持Web Worker */
  webWorker: boolean;
  /** 是否支持IndexedDB */
  indexedDB: boolean;
  /** 是否支持Web Crypto API */
  webCrypto: boolean;
  /** 是否支持Streams API */
  streams: boolean;
  /** 是否支持拖放上传 */
  dragAndDrop: boolean;
  /** 是否支持文件夹上传 */
  folderUpload: boolean;
  /** 最大并发请求数 */
  maxConcurrentRequests: number;
  /** 最大文件大小限制（字节） */
  maxFileSize: number;
}

/**
 * 网络请求参数接口
 */
export interface RequestOptions {
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求超时(毫秒) */
  timeout?: number;
  /** 中止信号 */
  signal?: AbortSignal;
  /** 进度回调 */
  onProgress?: (progress: number) => void;
  /** 任务引用回调 */
  taskRef?: (task: any) => void;
  /** 其他自定义选项 */
  [key: string]: any;
}

/**
 * 分片数据接口
 */
export interface FileChunk {
  /** 分片索引 */
  index: number;
  /** 分片数据 */
  data: Blob | ArrayBuffer | string | any;
  /** 起始位置 */
  start: number;
  /** 结束位置 */
  end: number;
  /** 分片大小 */
  size: number;
  /** 临时文件路径(小程序) */
  path?: string;
  /** 临时文件路径(小程序优化后) */
  tempPath?: string;
}

/**
 * 平台适配器基类
 * 提供跨平台统一接口，处理平台特性差异
 */
export abstract class PlatformAdapter {
  /** 平台支持的特性 */
  protected features: PlatformFeatures;
  /** 引用微内核实例 */
  protected kernel: Kernel | null = null;
  /** 事件总线 */
  protected eventBus: EventEmitter;
  /** 平台名称 */
  protected name: string;

  /**
   * 构造函数
   * @param name 平台名称
   */
  constructor(name: string) {
    this.name = name;
    this.eventBus = new EventEmitter();
    this.features = this.getDefaultFeatures();
  }

  /**
   * 初始化适配器
   * @param kernel 微内核实例
   */
  public init(kernel: Kernel): void {
    this.kernel = kernel;
    this.detectFeatures();
    this.eventBus.emit('init');
  }

  /**
   * 获取平台名称
   */
  public getPlatformName(): string {
    return this.name;
  }

  /**
   * 获取平台支持的特性
   */
  public getFeatures(): PlatformFeatures {
    return { ...this.features };
  }

  /**
   * 检测当前环境是否支持该平台
   */
  public abstract isSupported(): boolean;

  /**
   * 创建文件分片
   * @param file 需要分片的文件
   * @param chunkSize 分片大小(字节)
   */
  public abstract createChunks(file: any, chunkSize: number): Promise<FileChunk[]> | FileChunk[];

  /**
   * 发送网络请求
   * @param url 请求地址
   * @param method 请求方法
   * @param data 请求数据
   * @param options 请求选项
   */
  public abstract request(
    url: string,
    method: string,
    data?: any,
    options?: RequestOptions
  ): Promise<any>;

  /**
   * 读取文件数据
   * @param file 文件对象
   * @param start 起始位置
   * @param end 结束位置
   */
  public abstract readFile(file: any, start?: number, end?: number): Promise<ArrayBuffer | string>;

  /**
   * 获取文件信息
   * @param file 文件对象
   */
  public abstract getFileInfo(file: any): Promise<{
    name: string;
    size: number;
    type: string;
    lastModified: number;
  }>;

  /**
   * 选择文件
   * @param options 选择文件选项
   */
  public abstract selectFile(options?: {
    accept?: string;
    multiple?: boolean;
    directory?: boolean;
  }): Promise<any[]>;

  /**
   * 获取默认特性支持
   * 每个平台需覆盖此方法提供准确特性
   */
  protected getDefaultFeatures(): PlatformFeatures {
    return {
      chunkedUpload: false,
      webWorker: false,
      indexedDB: false,
      webCrypto: false,
      streams: false,
      dragAndDrop: false,
      folderUpload: false,
      maxConcurrentRequests: 2,
      maxFileSize: Number.MAX_SAFE_INTEGER
    };
  }

  /**
   * 检测平台特性
   * 实现此方法进行平台特性检测
   */
  protected abstract detectFeatures(): void;

  /**
   * 特性降级处理
   * @param feature 特性名称
   * @param fallbackFn 降级处理函数
   */
  protected fallback<T>(feature: keyof PlatformFeatures, fallbackFn: () => T): T {
    if (this.features[feature]) {
      try {
        // 尝试使用原生特性
        return fallbackFn();
      } catch (error) {
        console.warn(`${this.name}平台${String(feature)}特性使用失败，将降级处理`, error);
        this.features[feature] = false as never;
      }
    }

    // 使用降级实现
    this.kernel?.emit('featureFallback', { platform: this.name, feature });
    return fallbackFn();
  }

  /**
   * 统一错误处理
   * @param error 捕获的错误
   * @param context 错误上下文
   */
  protected handleError(error: Error, context?: any): Error {
    const enhancedError = new Error(`[${this.name}平台错误] ${error.message}`);
    (enhancedError as any)['originalError'] = error;
    (enhancedError as any)['context'] = context;
    (enhancedError as any)['platform'] = this.name;

    this.kernel?.emit('platformError', {
      error: enhancedError,
      platform: this.name,
      context
    });

    return enhancedError;
  }

  /**
   * 监听平台事件
   * @param event 事件名
   * @param handler 处理函数
   */
  public on(event: string, handler: (...args: any[]) => void): void {
    this.eventBus.on(event, handler);
  }

  /**
   * 移除事件监听
   * @param event 事件名
   * @param handler 处理函数
   */
  public off(event: string, handler: (...args: any[]) => void): void {
    this.eventBus.off(event, handler);
  }
}
