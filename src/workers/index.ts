/**
 * FileChunk Pro - Workers 模块
 *
 * 导出所有与Web Workers相关的功能，包括哈希计算Worker和Worker管理器。
 */

export {
  WorkerManager,
  getWorkerManager,
  WorkerType,
  WorkerEventType,
  type WorkerEvent,
  type WorkerOptions,
  type HashTask
} from './worker-manager';

// 将所有Worker文件作为可能的Worker条目点导出
// 注意：Worker文件不能直接导入，应该通过Worker构造函数加载
export const WORKER_PATHS = {
  HASH_WORKER: './hash-worker.ts'
};
