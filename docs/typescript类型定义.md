
# FileChunk Pro - 类型定义

1. 接口定义
2. 类型声明
3. 泛型支持
4. 枚举类型

下面是核心模块的TypeScript改造示例：

## 核心接口定义

```typescript
// src/types/index.ts

// 上传状态枚举
export enum UploadStatus {
  IDLE = 'idle',
  PREPARING = 'preparing',
  CALCULATING_HASH = 'calculating_hash',
  UPLOADING = 'uploading',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
  CANCELED = 'canceled'
}

// 核心模块接口
export interface IModule {
  init(kernel: FileChunkKernel): void;
}

// 平台适配器接口
export interface IPlatformAdapter extends IModule {
  features: Record<string, boolean>;
  createChunks(file: File | Blob | any, chunkSize: number): Promise<IChunk[]> | IChunk[];
  request(url: string, method: string, data: any, options?: RequestOptions): Promise<any>;
}

// 传输模块接口
export interface ITransportModule extends IModule {
  start(file: File | Blob | any, platform: IPlatformAdapter): Promise<string>;
  pause(): void;
  resume(): void;
  cancel(): void;
}

// 存储模块接口
export interface IStorageModule extends IModule {
  save(key: string, data: any): Promise<void>;
  get(key: string): Promise<any>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

// 分片接口
export interface IChunk {
  index: number;
  start: number;
  end: number;
  size: number;
  data?: Blob | ArrayBuffer;
  path?: string;
  tempPath?: string;
}

// 事件处理器类型
export type EventHandler = (...args: any[]) => void;

// 核心配置接口
export interface IKernelConfig {
  target?: string;
  chunkSize?: number;
  concurrency?: number;
  autoRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  baseUrl?: string;
}

// 上传状态接口
export interface IUploadState {
  status: UploadStatus;
  file: File | Blob | any | null;
  progress: number;
  result?: string;
  error?: Error;
}

// 请求选项接口
export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
  taskRef?: (task: any) => void;
}
```

### 微内核核心实现

```typescript
// src/core/kernel.ts
import { EventEmitter } from 'events';
import {
  IModule,
  IUploadState,
  EventHandler,
  UploadStatus,
  ITransportModule,
  IPlatformAdapter,
  IKernelConfig
} from '../types';

export class FileChunkKernel {
  private modules: Map<string, IModule> = new Map();
  private eventBus: EventEmitter = new EventEmitter();
  private state: IUploadState = {
    status: UploadStatus.IDLE,
    file: null,
    progress: 0
  };

  constructor(config?: IKernelConfig) {
    // 配置初始化
  }

  // 模块注册系统
  public registerModule<T extends IModule>(name: string, module: T): this {
    this.modules.set(name, module);
    module.init(this);
    return this;
  }

  // 获取模块
  public getModule<T extends IModule>(name: string): T {
    const module = this.modules.get(name);
    if (!module) {
      throw new Error(`Module ${name} not registered`);
    }
    return module as T;
  }

  // 事件系统
  public on(event: string, handler: EventHandler): this {
    this.eventBus.on(event, handler);
    return this;
  }

  public emit(event: string, ...args: any[]): this {
    this.eventBus.emit(event, ...args);
    return this;
  }

  // 状态管理
  public updateState(newState: Partial<IUploadState>): void {
    this.state = {...this.state, ...newState};
    this.emit('stateChange', this.state);

    if (newState.progress !== undefined) {
      this.emit('progress', newState.progress);
    }

    if (newState.status === UploadStatus.COMPLETED) {
      this.emit('success', this.state.result);
    }

    if (newState.status === UploadStatus.ERROR) {
      this.emit('error', this.state.error);
    }
  }

  // 上传入口
  public async upload(file: File | Blob | any): Promise<string> {
    try {
      this.updateState({
        file,
        status: UploadStatus.PREPARING,
        progress: 0
      });

      // 获取传输模块
      const transport = this.getModule<ITransportModule>('transport');

      // 获取平台适配器
      const platform = this.getModule<IPlatformAdapter>('platform');

      // 验证文件
      await this.validateFile(file);

      // 执行上传
      const result = await transport.start(file, platform);

      this.updateState({
        status: UploadStatus.COMPLETED,
        result,
        progress: 100
      });

      return result;
    } catch (error) {
      this.updateState({
        status: UploadStatus.ERROR,
        error: error as Error
      });
      throw error;
    }
  }

  // 文件验证
  private async validateFile(file: File | Blob | any): Promise<boolean> {
    if (!file) throw new Error('文件不能为空');

    // 执行验证钩子
    await this.emit('beforeUpload', file);

    return true;
  }

  // 暂停上传
  public pause(): void {
    const transport = this.getModule<ITransportModule>('transport');
    transport.pause();
    this.updateState({status: UploadStatus.PAUSED});
  }

  // 恢复上传
  public resume(): void {
    const transport = this.getModule<ITransportModule>('transport');
    transport.resume();
    this.updateState({status: UploadStatus.UPLOADING});
  }

  // 取消上传
  public cancel(): void {
    const transport = this.getModule<ITransportModule>('transport');
    transport.cancel();
    this.updateState({status: UploadStatus.CANCELED});
  }
}
```
