/**
 * 传输模块接口定义
 * 该接口定义了传输模块与其他模块交互的标准接口
 */

import { Module } from '../../../types/modules';

/**
 * 传输状态类型定义
 * 表示上传过程中的各种状态
 */
export enum TransportStatus {
  IDLE = 'idle', // 空闲状态
  PREPARING = 'preparing', // 准备中状态
  UPLOADING = 'uploading', // 上传中状态
  PAUSED = 'paused', // 已暂停状态
  COMPLETED = 'completed', // 已完成状态
  ERROR = 'error', // 错误状态
  CANCELED = 'canceled' // 已取消状态
}

/**
 * 传输事件类型定义
 * 传输过程中可能触发的事件
 */
export enum TransportEvent {
  PROGRESS = 'progress', // 进度更新事件
  SUCCESS = 'success', // 上传成功事件
  ERROR = 'error', // 上传错误事件
  START = 'start', // 开始上传事件
  PAUSE = 'pause', // 暂停上传事件
  RESUME = 'resume', // 恢复上传事件
  CANCEL = 'cancel', // 取消上传事件
  CHUNK_SUCCESS = 'chunk_success', // 分片上传成功事件
  CHUNK_ERROR = 'chunk_error', // 分片上传失败事件
  HASH_COMPLETE = 'hash_complete' // 文件哈希计算完成事件
}

/**
 * 分片信息接口
 * 表示文件分片的详细信息
 */
export interface FileChunk {
  index: number; // 分片索引
  data: Blob; // 分片数据
  start: number; // 分片在文件中的起始位置
  end: number; // 分片在文件中的结束位置
  size: number; // 分片大小
  hash?: string; // 分片哈希值(可选)
  uploaded?: boolean; // 是否已上传(可选)
}

/**
 * 传输选项接口
 * 配置传输行为的各种选项
 */
export interface TransportOptions {
  target: string; // 上传目标URL
  chunkSize?: number; // 分片大小（字节）
  concurrency?: number; // 并发上传数
  autoRetry?: boolean; // 是否自动重试失败的分片
  maxRetries?: number; // 最大重试次数
  retryDelay?: number; // 重试延迟时间（毫秒）
  headers?: Record<string, string>; // 自定义请求头
  timeout?: number; // 上传超时时间（毫秒）
  withCredentials?: boolean; // 是否携带凭证（cookies等）
  onProgress?: ProgressCallback; // 进度回调函数
  onSuccess?: SuccessCallback; // 成功回调函数
  onError?: ErrorCallback; // 错误回调函数
  baseUrl?: string; // 基础URL路径
  checkUrl?: string; // 检查文件是否存在的URL
  mergeUrl?: string; // 合并文件的URL
}

/**
 * 传输进度信息接口
 * 表示上传进度的详细信息
 */
export interface ProgressInfo {
  progress: number; // 上传进度百分比(0-100)
  loaded: number; // 已上传字节数
  total: number; // 总字节数
  speed?: number; // 上传速度(字节/秒)
  remainingTime?: number; // 预计剩余时间(秒)
  currentChunk?: number; // 当前上传的分片索引
  totalChunks?: number; // 总分片数
  startTime?: number; // 开始时间戳
  elapsedTime?: number; // 已用时间(毫秒)
}

/**
 * 上传结果接口
 * 表示上传完成后的结果信息
 */
export interface TransportResult {
  url: string; // 上传后的文件URL
  hash?: string; // 文件哈希值
  size?: number; // 文件大小
  name?: string; // 文件名
  type?: string; // 文件类型
  uploadTime?: number; // 上传耗时(毫秒)
  serverResponse?: any; // 服务器返回的完整响应
}

/**
 * 传输错误接口
 * 表示上传过程中的错误信息
 */
export interface TransportError {
  code: string; // 错误代码
  message: string; // 错误信息
  data?: any; // 错误相关数据
  chunkIndex?: number; // 出错的分片索引
  retryable?: boolean; // 是否可重试
  timestamp: number; // 错误发生的时间戳
}

/**
 * 回调函数类型定义
 */
export type ProgressCallback = (info: ProgressInfo) => void;
export type SuccessCallback = (result: TransportResult) => void;
export type ErrorCallback = (error: TransportError) => void;

/**
 * 事件处理函数类型定义
 */
export type EventHandler<T = unknown> = (eventData: T) => void;

/**
 * 传输状态接口
 * 表示上传过程中的状态信息
 */
export interface TransportState {
  status: TransportStatus; // 当前状态
  file: File | null; // 上传的文件
  progress: number; // 当前进度百分比(0-100)
  startTime?: number; // 开始时间
  speed?: number; // 当前速度(字节/秒)
  uploadedChunks?: Set<number>; // 已上传的分片索引集合
  result?: TransportResult; // 上传结果
  error?: TransportError; // 错误信息
  hash?: string; // 文件哈希
}

/**
 * 传输控制接口
 * 定义了传输模块的控制方法
 */
export interface TransportControl {
  uploadFile(file: File, platform: any): Promise<TransportResult>; // 开始上传文件（避免与Module.start冲突）
  pause(): void; // 暂停上传
  resume(): void; // 恢复上传
  cancel(): void; // 取消上传
  getProgress(): ProgressInfo; // 获取当前进度
  getState(): TransportState; // 获取当前状态
}

/**
 * 传输事件接口
 * 定义了传输模块的事件处理方法
 */
export interface TransportEvents {
  // 事件相关方法
  on(event: TransportEvent | string, handler: EventHandler<any>): void; // 注册事件处理函数
  off(event: TransportEvent | string, handler: EventHandler<any>): void; // 注销事件处理函数
}

/**
 * 传输文件处理接口
 * 定义了传输模块的文件处理方法
 */
export interface TransportFileHandling {
  // 文件处理方法
  checkFileExists(hash: string, file: File): Promise<boolean | Set<number>>; // 检查文件是否已存在
  calculateHash(file: File): Promise<string>; // 计算文件哈希

  // 分片处理方法
  createChunks(file: File, chunkSize: number): FileChunk[]; // 创建文件分片
  uploadChunk(
    chunk: FileChunk,
    hash: string,
    totalChunks: number,
    platform: any,
    signal?: AbortSignal
  ): Promise<any>; // 上传单个分片
  mergeChunks(hash: string, totalChunks: number, fileName: string): Promise<TransportResult>; // 合并所有分片
}

/**
 * 传输配置接口
 * 定义了传输模块的配置方法
 */
export interface TransportConfiguration {
  setOptions(options: Partial<TransportOptions>): void; // 设置/更新选项
}

/**
 * 传输模块接口
 * 通过组合多个接口来定义完整功能
 */
export interface Transport
  extends Module,
    TransportControl,
    TransportEvents,
    TransportFileHandling,
    TransportConfiguration {
  // 此接口通过组合上述接口构建完整的传输模块功能
  // 特定于传输模块的实现可以在这里添加
}

/**
 * 传输工厂接口
 * 用于创建不同类型的传输实例
 */
export interface TransportFactory {
  createTransport(type: string, options: TransportOptions): Transport; // 创建传输实例
}
