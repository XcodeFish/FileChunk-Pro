import { BehaviorSubject, Observable } from './observable';
import { map, filter, distinctUntilChanged } from './operators';
import { FileChunkKernel } from '../core/kernel';
import { HttpTransport } from '../modules/transport/implementations/http-transport';
import { BrowserAdapter } from '../platforms/browser/browser-adapter';
import { WechatAdapter } from '../platforms/miniapp/wechat-adapter';
import { IndexedDBStorage } from '../modules/storage/indexeddb-storage';
import { TaroAdapter } from '../platforms/miniapp/taro-adapter';
import { UniAppAdapter } from '../platforms/miniapp/uniapp-adapter';

/**
 * 上传状态类型
 */
export type UploadStatus =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'paused'
  | 'completed'
  | 'error'
  | 'canceled';

/**
 * 上传状态接口
 */
export interface UploadState {
  status: UploadStatus;
  progress: number;
  file: File | null;
  error: Error | null;
  result: any;
}

/**
 * 上传配置选项
 */
export interface ReactiveUploaderOptions {
  /** 上传目标URL */
  target: string;
  /** 分片大小（字节） */
  chunkSize?: number;
  /** 并发上传数 */
  concurrency?: number;
  /** 自动重试 */
  autoRetry?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟(ms) */
  retryDelay?: number;
  /** 上传超时(ms) */
  timeout?: number;
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** 自动检测最佳分片大小 */
  autoChunkSize?: boolean;
  /** 自定义平台适配器 */
  platform?: string;
  /** 背压阈值 - 当队列中未处理项超过此值时应用背压策略 */
  backpressureThreshold?: number;
  /** 背压高水位线 - 当达到此阈值时暂停添加新项 */
  highWaterMark?: number;
}

/**
 * 响应式上传器 - 提供基于Observable的文件上传API
 */
export class ReactiveUploader {
  /** 内部微内核实例 */
  private kernel: FileChunkKernel;

  /** 内部状态流 */
  private _state$: BehaviorSubject<UploadState>;

  /** 公开状态流（只读） */
  public state$: Observable<UploadState>;

  /** 上传进度流 */
  public progress$: Observable<number>;

  /** 上传状态流 */
  public status$: Observable<UploadStatus>;

  /** 错误流 */
  public error$: Observable<Error>;

  /** 完成流 */
  public completed$: Observable<any>;

  /** 当前队列长度 */
  private queueSize = 0;

  /** 是否应用背压 */
  private backpressureApplied = false;

  /**
   * 创建响应式上传器实例
   * @param options 上传配置选项
   */
  constructor(private options: ReactiveUploaderOptions) {
    // 创建微内核实例
    this.kernel = new FileChunkKernel();

    // 初始化状态
    this._state$ = new BehaviorSubject<UploadState>({
      status: 'idle',
      progress: 0,
      file: null,
      error: null,
      result: null
    });

    // 状态流（只读）
    this.state$ = this._state$.asObservable();

    // 派生的特定流
    this.progress$ = this.state$.pipe(
      map(state => state.progress),
      distinctUntilChanged()
    );

    this.status$ = this.state$.pipe(
      map(state => state.status),
      distinctUntilChanged()
    );

    this.error$ = this.state$.pipe(
      filter(state => state.status === 'error'),
      map(state => state.error as Error)
    );

    this.completed$ = this.state$.pipe(
      filter(state => state.status === 'completed'),
      map(state => state.result)
    );

    // 初始化模块
    this.initializeModules();

    // 连接内核事件到状态流
    this.connectKernelEvents();
  }

  /**
   * 初始化上传模块
   */
  private initializeModules(): void {
    this.kernel
      // 注册传输模块
      .registerModule(
        'transport',
        new HttpTransport({
          target: this.options.target,
          chunkSize: this.options.chunkSize || 2 * 1024 * 1024, // 默认2MB
          concurrency: this.options.concurrency || 3,
          autoRetry: this.options.autoRetry !== false, // 默认启用
          maxRetries: this.options.maxRetries || 3,
          retryDelay: this.options.retryDelay || 1000,
          timeout: this.options.timeout || 30000,
          headers: this.options.headers || {}
        })
      )
      // 注册平台适配器
      .registerModule('platform', this.detectPlatform())
      // 注册存储模块
      .registerModule('storage', new IndexedDBStorage());
  }

  /**
   * 检测平台并返回适配器
   */
  private detectPlatform() {
    // 如果指定了平台，使用指定平台
    if (this.options.platform) {
      switch (this.options.platform.toLowerCase()) {
        case 'browser':
          return new BrowserAdapter();
        case 'wechat':
          return new WechatAdapter();
        case 'taro':
          return new TaroAdapter();
        case 'uniapp':
          return new UniAppAdapter();
        default:
          throw new Error(`不支持的平台: ${this.options.platform}`);
      }
    }

    // 自动检测平台
    if (typeof window !== 'undefined') {
      return new BrowserAdapter();
    }

    if (typeof wx !== 'undefined' && typeof wx.uploadFile === 'function') {
      return new WechatAdapter();
    }

    // Taro环境检测
    if (typeof process !== 'undefined' && process.env && process.env.TARO_ENV) {
      return new TaroAdapter();
    }

    // UniApp环境检测
    if (typeof window !== 'undefined' && typeof (window as any).uni !== 'undefined') {
      return new UniAppAdapter();
    }

    throw new Error('未检测到支持的运行环境');
  }

  /**
   * 连接内核事件到状态流
   */
  private connectKernelEvents(): void {
    this.kernel.on('stateChange', state => {
      this._state$.next({ ...this._state$.value, ...state });
    });

    // 进度更新
    this.kernel.on('progress', (progress?: number) => {
      if (progress !== undefined) {
        this.updateState({ progress });
      }
    });

    // 上传成功
    this.kernel.on('success', (result: any) => {
      this.updateState({
        status: 'completed',
        progress: 100,
        result
      });
    });

    // 上传错误
    this.kernel.on('error', (error?: Error) => {
      if (error) {
        this.updateState({
          status: 'error',
          error
        });
      }
    });
  }

  /**
   * 更新内部状态
   */
  private updateState(newState: Partial<UploadState>): void {
    this._state$.next({ ...this._state$.value, ...newState });
  }

  /**
   * 上传文件
   * @param file 要上传的文件
   */
  public upload(file: File): Observable<UploadState> {
    // 应用背压策略
    if (
      this.backpressureApplied &&
      this.options.highWaterMark &&
      this.queueSize >= this.options.highWaterMark
    ) {
      return new Observable(observer => {
        observer.error(new Error('上传队列已满，请稍后再试'));
        return {
          unsubscribe: () => {},
          closed: false
        };
      });
    }

    // 增加队列计数
    this.queueSize++;

    // 检查是否需要应用背压
    this.checkBackpressure();

    // 更新状态
    this.updateState({
      file,
      status: 'preparing',
      progress: 0,
      error: null,
      result: null
    });

    // 触发上传
    (this.kernel as any)
      .upload(file)
      .then((_result: any) => {
        // 上传成功处理，已通过事件处理
        this.queueSize = Math.max(0, this.queueSize - 1);
        this.checkBackpressure();
      })
      .catch((_error: any) => {
        // 错误处理，已通过事件处理
        this.queueSize = Math.max(0, this.queueSize - 1);
        this.checkBackpressure();
      });

    // 返回状态流
    return this.state$;
  }

  /**
   * 检查并应用背压策略
   */
  private checkBackpressure(): void {
    if (!this.options.backpressureThreshold) return;

    if (!this.backpressureApplied && this.queueSize >= this.options.backpressureThreshold) {
      this.backpressureApplied = true;
      // 触发背压事件，可用于通知UI暂停接受新的上传
      this.kernel.emit('backpressure', { applied: true, queueSize: this.queueSize });
    } else if (this.backpressureApplied && this.queueSize < this.options.backpressureThreshold) {
      this.backpressureApplied = false;
      // 解除背压，恢复接受新的上传
      this.kernel.emit('backpressure', { applied: false, queueSize: this.queueSize });
    }
  }

  /**
   * 暂停上传
   */
  public pause(): void {
    if (this._state$.value.status !== 'uploading') return;

    (this.kernel as any).pause();
    this.updateState({ status: 'paused' });
  }

  /**
   * 恢复上传
   */
  public resume(): void {
    if (this._state$.value.status !== 'paused') return;

    (this.kernel as any).resume();
    this.updateState({ status: 'uploading' });
  }

  /**
   * 取消上传
   */
  public cancel(): void {
    (this.kernel as any).cancel();
    this.updateState({
      status: 'canceled',
      progress: 0,
      error: null,
      result: null
    });
  }
}
