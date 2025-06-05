/**
 * FileChunk Pro - Worker管理器
 *
 * 负责创建、管理和协调Web Worker的生命周期，
 * 支持哈希计算Worker和其他潜在的Worker类型。
 */

import { EventEmitter } from '../core/event-bus';
import SparkMD5 from 'spark-md5';

/**
 * Worker类型枚举
 */
export enum WorkerType {
  HASH = 'hash'
}

/**
 * Worker事件类型
 */
export enum WorkerEventType {
  PROGRESS = 'progress',
  COMPLETE = 'complete',
  ERROR = 'error'
}

/**
 * Worker事件接口
 */
export interface WorkerEvent {
  type: WorkerEventType;
  workerId: string;
  fileId?: string;
  progress?: number;
  hash?: string;
  error?: Error;
}

/**
 * Worker配置选项
 */
export interface WorkerOptions {
  maxConcurrency?: number;
  terminateOnComplete?: boolean;
  enableWorkerPool?: boolean;
  /**
   * 是否在不支持Worker时自动降级为同步处理
   */
  autoFallback?: boolean;
}

/**
 * 哈希计算任务接口
 */
export interface HashTask {
  fileId: string;
  data: ArrayBuffer | ArrayBuffer[] | Blob;
  chunkSize?: number;
  totalSize?: number;
  onProgress?: (progress: number) => void;
  onComplete?: (hash: string) => void;
  onError?: (error: Error) => void;
}

/**
 * 等待中的任务项
 */
interface QueuedTask {
  /**
   * 任务数据
   */
  task: HashTask;

  /**
   * 任务Promise解析函数
   */
  resolve: (hash: string) => void;

  /**
   * 任务Promise拒绝函数
   */
  reject: (error: Error) => void;
}

/**
 * Worker管理器类
 *
 * 负责创建、管理和协调Web Worker的操作
 */
export class WorkerManager extends EventEmitter {
  private workers: Map<string, Worker> = new Map();
  private taskQueue: Map<string, any> = new Map();
  private activeWorkers: Map<string, boolean> = new Map();
  private workerPool: Map<WorkerType, Worker[]> = new Map();

  /**
   * 等待处理的任务队列
   */
  private waitingTasks: Map<WorkerType, QueuedTask[]> = new Map();

  private options: WorkerOptions;
  private isWorkerSupported: boolean;

  /**
   * 构造函数
   */
  constructor(options: WorkerOptions = {}) {
    super();

    this.options = {
      maxConcurrency: 3,
      terminateOnComplete: false,
      enableWorkerPool: true,
      autoFallback: true,
      ...options
    };

    // 检查当前环境是否支持Web Worker
    this.isWorkerSupported = typeof Worker !== 'undefined';

    // 初始化Worker池
    if (this.options.enableWorkerPool) {
      Object.values(WorkerType).forEach(type => {
        this.workerPool.set(type as WorkerType, []);
      });
    }

    // 初始化任务队列
    Object.values(WorkerType).forEach(type => {
      this.waitingTasks.set(type as WorkerType, []);
    });
  }

  /**
   * 创建指定类型的Worker
   */
  private createWorker(type: WorkerType): Worker | null {
    if (!this.isWorkerSupported) {
      return null;
    }

    try {
      let worker: Worker;

      switch (type) {
        case WorkerType.HASH:
          worker = new Worker(new URL('./hash-worker.ts', import.meta.url), { type: 'module' });
          break;
        default:
          throw new Error(`不支持的Worker类型: ${type}`);
      }

      return worker;
    } catch (error) {
      console.error(`创建Worker失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 获取一个空闲的Worker（从池中或创建新的）
   */
  private getWorker(type: WorkerType): Worker | null {
    // 如果环境不支持Worker，返回null
    if (!this.isWorkerSupported) {
      return null;
    }

    // 如果启用了Worker池且有可用Worker
    if (this.options.enableWorkerPool) {
      const pool = this.workerPool.get(type) || [];

      // 查找空闲的Worker
      for (const worker of pool) {
        const workerId = this.getWorkerId(worker);
        if (!this.activeWorkers.get(workerId)) {
          return worker;
        }
      }

      // 如果活跃Worker数量已达到最大并发数，返回null（稍后会将任务加入队列）
      if (this.getActiveWorkerCount() >= (this.options.maxConcurrency || 3)) {
        return null;
      }

      // 否则创建新Worker并添加到池
      const worker = this.createWorker(type);
      if (worker) {
        const workerId = this.getWorkerId(worker);
        pool.push(worker);
        this.workerPool.set(type, pool);
        this.activeWorkers.set(workerId, false);
      }
      return worker;
    }

    // 不使用Worker池，直接创建新Worker
    return this.createWorker(type);
  }

  /**
   * 生成唯一的Worker ID
   */
  private getWorkerId(worker: Worker): string {
    return `worker_${worker.toString()}_${Date.now()}`;
  }

  /**
   * 获取当前活跃Worker数量
   */
  private getActiveWorkerCount(): number {
    let count = 0;
    this.activeWorkers.forEach(active => {
      if (active) count++;
    });
    return count;
  }

  /**
   * 标记Worker为活跃状态
   */
  private markWorkerActive(workerId: string, active: boolean): void {
    this.activeWorkers.set(workerId, active);

    // 当Worker变为非活跃状态时，尝试处理队列中的下一个任务
    if (!active) {
      this.processNextQueuedTask();
    }
  }

  /**
   * 处理队列中的下一个任务
   */
  private processNextQueuedTask(): void {
    // 为每种类型的Worker检查队列
    for (const queue of this.waitingTasks.values()) {
      if (queue.length === 0) continue;

      // 如果活跃Worker数量已达到最大并发数，暂时不处理
      if (this.getActiveWorkerCount() >= (this.options.maxConcurrency || 3)) {
        return;
      }

      // 取出队列中的下一个任务
      const nextTask = queue.shift();
      if (!nextTask) continue;

      // 处理任务
      this.calculateHash(nextTask.task)
        .then(hash => nextTask.resolve(hash))
        .catch(error => nextTask.reject(error))
        .finally(() => {
          // 处理完一个任务后继续检查队列
          this.processNextQueuedTask();
        });
    }
  }

  /**
   * 处理Worker消息
   */
  private handleWorkerMessage(
    event: MessageEvent,
    worker: Worker,
    workerId: string,
    task: any
  ): void {
    const { hash, progress, error, fileId, type: messageType } = event.data;

    switch (messageType) {
      case 'PROGRESS':
        // 处理进度更新
        if (task && typeof task.onProgress === 'function') {
          task.onProgress(progress);
        }

        this.emit(WorkerEventType.PROGRESS, {
          type: WorkerEventType.PROGRESS,
          workerId,
          fileId: fileId || task.fileId,
          progress
        });
        break;

      case 'COMPLETE':
        // 处理完成事件
        if (task && typeof task.onComplete === 'function') {
          task.onComplete(hash);
        }

        this.emit(WorkerEventType.COMPLETE, {
          type: WorkerEventType.COMPLETE,
          workerId,
          fileId: fileId || task.fileId,
          hash
        });

        // 清理任务
        this.taskQueue.delete(workerId);
        this.markWorkerActive(workerId, false);

        // 是否需要终止Worker
        if (this.options.terminateOnComplete && !this.options.enableWorkerPool) {
          worker.terminate();
          this.workers.delete(workerId);
        }
        break;

      case 'ERROR': {
        // 处理错误
        const errorObj = new Error(error);

        if (task && typeof task.onError === 'function') {
          task.onError(errorObj);
        }

        this.emit(WorkerEventType.ERROR, {
          type: WorkerEventType.ERROR,
          workerId,
          fileId: fileId || task.fileId,
          error: errorObj
        });

        // 清理任务
        this.taskQueue.delete(workerId);
        this.markWorkerActive(workerId, false);
        break;
      }
    }
  }

  /**
   * 计算文件或数据块的哈希值
   */
  public async calculateHash(task: HashTask): Promise<string> {
    // 如果环境不支持Web Worker且启用了自动降级
    if (!this.isWorkerSupported && this.options.autoFallback) {
      return this.calculateHashSync(task);
    } else if (!this.isWorkerSupported) {
      throw new Error('当前环境不支持Web Worker');
    }

    return new Promise((resolve, reject) => {
      // 获取一个可用的哈希Worker
      const worker = this.getWorker(WorkerType.HASH);

      // 如果没有可用的Worker（达到并发限制或创建失败）
      if (!worker) {
        // 加入等待队列
        const queuedTask: QueuedTask = { task, resolve, reject };
        const queue = this.waitingTasks.get(WorkerType.HASH) || [];
        queue.push(queuedTask);
        this.waitingTasks.set(WorkerType.HASH, queue);

        // 通知用户任务已加入队列
        console.log(`任务已加入队列，当前队列长度: ${queue.length}`);
        return;
      }

      // 生成一个唯一的Worker ID
      const workerId = this.getWorkerId(worker);

      // 注册Worker
      this.workers.set(workerId, worker);
      this.activeWorkers.set(workerId, true);

      // 保存任务信息
      const taskWithCallbacks = {
        ...task,
        onComplete: (hash: string) => {
          if (typeof task.onComplete === 'function') {
            task.onComplete(hash);
          }
          resolve(hash);
        },
        onError: (error: Error) => {
          if (typeof task.onError === 'function') {
            task.onError(error);
          }
          reject(error);
        }
      };

      this.taskQueue.set(workerId, taskWithCallbacks);

      // 设置消息处理器
      worker.onmessage = event => {
        this.handleWorkerMessage(event, worker, workerId, taskWithCallbacks);
      };

      worker.onerror = event => {
        const error = new Error(`Worker错误: ${event.message}`);

        // 调用错误回调
        if (typeof task.onError === 'function') {
          task.onError(error);
        }

        this.emit(WorkerEventType.ERROR, {
          type: WorkerEventType.ERROR,
          workerId,
          fileId: task.fileId,
          error
        });

        // 清理
        this.taskQueue.delete(workerId);
        this.markWorkerActive(workerId, false);

        reject(error);
      };

      // 准备数据，区分不同类型
      const messageData: any = {
        fileId: task.fileId,
        chunkSize: task.chunkSize || 2 * 1024 * 1024,
        totalSize: task.totalSize
      };

      // 处理不同类型的输入数据
      if (Array.isArray(task.data)) {
        // 如果是预先分好块的ArrayBuffer数组
        messageData.type = 'HASH_CHUNKS';
        messageData.data = task.data;
      } else if (task.data instanceof Blob) {
        // 如果是Blob，需要转换为ArrayBuffer
        const reader = new FileReader();
        reader.onload = e => {
          messageData.type = 'HASH_FILE';
          messageData.data = e.target?.result as ArrayBuffer;
          messageData.totalSize = messageData.totalSize || (task.data as Blob).size;
          worker.postMessage(messageData, [messageData.data]);
        };
        reader.onerror = () => {
          reject(new Error('读取Blob数据失败'));
        };
        reader.readAsArrayBuffer(task.data as Blob);
        return;
      } else {
        // 如果是单个ArrayBuffer
        messageData.type = 'HASH_FILE';
        messageData.data = task.data;
        messageData.totalSize = messageData.totalSize || (task.data as ArrayBuffer).byteLength;
      }

      // 发送消息到Worker，使用Transferable Objects优化性能
      if (messageData.data && !Array.isArray(messageData.data)) {
        worker.postMessage(messageData, [messageData.data]);
      } else if (Array.isArray(messageData.data)) {
        // 如果是数组，转移每个ArrayBuffer的所有权
        worker.postMessage(messageData, messageData.data as Transferable[]);
      } else {
        worker.postMessage(messageData);
      }
    });
  }

  /**
   * 同步计算哈希值（降级方案）
   *
   * 当环境不支持Web Worker时，在主线程中计算哈希值
   */
  private async calculateHashSync(task: HashTask): Promise<string> {
    try {
      // 通知开始计算
      if (typeof task.onProgress === 'function') {
        task.onProgress(0);
      }

      this.emit(WorkerEventType.PROGRESS, {
        type: WorkerEventType.PROGRESS,
        workerId: 'main-thread',
        fileId: task.fileId,
        progress: 0
      });

      let data: ArrayBuffer;
      let chunks: ArrayBuffer[] = [];

      // 处理不同类型的输入数据
      if (Array.isArray(task.data)) {
        chunks = task.data;
      } else if (task.data instanceof Blob) {
        // 将Blob转换为ArrayBuffer
        data = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target?.result as ArrayBuffer);
          reader.onerror = () => reject(new Error('读取Blob数据失败'));
          reader.readAsArrayBuffer(task.data as Blob);
        });

        // 分块处理
        const chunkSize = task.chunkSize || 2 * 1024 * 1024;
        const totalSize = data.byteLength;
        let offset = 0;

        while (offset < totalSize) {
          const end = Math.min(offset + chunkSize, totalSize);
          chunks.push(data.slice(offset, end));
          offset = end;
        }
      } else {
        // 直接使用ArrayBuffer
        data = task.data as ArrayBuffer;

        // 分块处理
        const chunkSize = task.chunkSize || 2 * 1024 * 1024;
        const totalSize = data.byteLength;
        let offset = 0;

        while (offset < totalSize) {
          const end = Math.min(offset + chunkSize, totalSize);
          chunks.push(data.slice(offset, end));
          offset = end;
        }
      }

      // 计算总大小
      const totalSize = task.totalSize || chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);

      // 使用SparkMD5计算哈希值
      const spark = new SparkMD5.ArrayBuffer();
      let processedSize = 0;

      // 逐块处理
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        // 添加块到哈希计算器
        spark.append(chunk);

        // 更新进度
        processedSize += chunk.byteLength;
        const progress = Math.min(Math.round((processedSize / totalSize) * 100), 100);

        // 通知进度
        if (typeof task.onProgress === 'function') {
          task.onProgress(progress);
        }

        this.emit(WorkerEventType.PROGRESS, {
          type: WorkerEventType.PROGRESS,
          workerId: 'main-thread',
          fileId: task.fileId,
          progress
        });

        // 防止UI阻塞，给主线程喘息的机会
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // 计算最终哈希值
      const hash = spark.end();

      // 通知完成
      if (typeof task.onComplete === 'function') {
        task.onComplete(hash);
      }

      this.emit(WorkerEventType.COMPLETE, {
        type: WorkerEventType.COMPLETE,
        workerId: 'main-thread',
        fileId: task.fileId,
        hash
      });

      return hash;
    } catch (error) {
      const err = error as Error;

      // 通知错误
      if (typeof task.onError === 'function') {
        task.onError(err);
      }

      this.emit(WorkerEventType.ERROR, {
        type: WorkerEventType.ERROR,
        workerId: 'main-thread',
        fileId: task.fileId,
        error: err
      });

      throw err;
    }
  }

  /**
   * 获取指定类型的队列长度
   */
  public getQueueLength(type: WorkerType): number {
    const queue = this.waitingTasks.get(type);
    return queue ? queue.length : 0;
  }

  /**
   * 清空指定类型的任务队列
   */
  public clearQueue(type: WorkerType): void {
    const queue = this.waitingTasks.get(type);
    if (queue) {
      // 为所有等待中的任务触发拒绝
      queue.forEach(task => {
        task.reject(new Error('队列已被清空'));
      });

      // 清空队列
      queue.length = 0;
    }
  }

  /**
   * 终止指定的Worker
   */
  public terminateWorker(workerId: string): boolean {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.terminate();
      this.workers.delete(workerId);
      this.activeWorkers.delete(workerId);
      this.taskQueue.delete(workerId);
      return true;
    }
    return false;
  }

  /**
   * 终止所有Worker
   */
  public terminateAll(): void {
    // 终止所有单独管理的Worker
    this.workers.forEach((worker, workerId) => {
      worker.terminate();
      this.workers.delete(workerId);
      this.activeWorkers.delete(workerId);
      this.taskQueue.delete(workerId);
    });

    // 终止所有Worker池中的Worker
    this.workerPool.forEach((pool, type) => {
      pool.forEach(worker => {
        worker.terminate();
      });
      this.workerPool.set(type, []);
    });

    // 清空所有任务队列
    Object.values(WorkerType).forEach(type => {
      this.clearQueue(type as WorkerType);
    });
  }

  /**
   * 判断环境是否支持Web Worker
   */
  public isSupported(): boolean {
    return this.isWorkerSupported;
  }

  /**
   * 获取活跃Worker的统计信息
   */
  public getStats(): {
    totalWorkers: number;
    activeWorkers: number;
    queuedTasks: number;
    workerSupported: boolean;
  } {
    let queuedTasks = 0;
    this.waitingTasks.forEach(queue => {
      queuedTasks += queue.length;
    });

    return {
      totalWorkers: this.workers.size,
      activeWorkers: this.getActiveWorkerCount(),
      queuedTasks,
      workerSupported: this.isWorkerSupported
    };
  }

  /**
   * 清理和销毁管理器
   */
  public dispose(): void {
    this.terminateAll();
    this.removeAllListeners();
  }

  /**
   * 更新Worker管理器选项
   */
  public updateOptions(options: Partial<WorkerOptions>): void {
    this.options = {
      ...this.options,
      ...options
    };
  }
}

/**
 * 创建一个单例WorkerManager实例
 */
let workerManagerInstance: WorkerManager | null = null;

export function getWorkerManager(options?: WorkerOptions): WorkerManager {
  if (!workerManagerInstance) {
    workerManagerInstance = new WorkerManager(options);
  } else if (options) {
    // 更新现有实例的选项
    workerManagerInstance.updateOptions(options);
  }
  return workerManagerInstance;
}
