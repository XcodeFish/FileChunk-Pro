/**
 * 类型定义导出
 */

export { PlatformFeatures } from '../platforms/platform-base';

/**
 * 文件分片类型定义
 */
export interface FileChunk {
  /** 分片索引 */
  index: number;
  /** 分片数据 */
  data: any;
  /** 起始位置（字节） */
  start: number;
  /** 结束位置（字节） */
  end: number;
  /** 分片大小（字节） */
  size: number;
  /** 文件路径（小程序环境使用） */
  path?: string;
  /** 临时文件路径（小程序环境使用） */
  tempPath?: string;
}

/**
 * 文件信息类型定义
 */
export interface FileInfo {
  /** 文件名 */
  name: string;
  /** 文件大小（字节） */
  size: number;
  /** 文件类型 MIME */
  type: string;
  /** 最后修改时间 */
  lastModified: number;
}

/**
 * 请求选项类型定义
 */
export interface RequestOptions {
  /** 请求头 */
  headers?: Record<string, string>;
  /** 超时时间(毫秒) */
  timeout?: number;
  /** 中止信号 */
  signal?: AbortSignal;
  /** 进度回调 */
  onProgress?: (progress: number) => void;
  /** 任务引用回调 */
  taskRef?: (task: any) => void;
}

/**
 * 文件选择选项类型定义
 */
export interface SelectFileOptions {
  /** 是否支持多选 */
  multiple?: boolean;
  /** 接受的文件类型 */
  accept?: string;
  /** 是否选择目录 */
  directory?: boolean;
}
