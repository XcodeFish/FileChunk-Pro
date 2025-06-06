/**
 * FileChunk Pro 集成测试设置
 * 提供集成测试所需的辅助函数和模拟环境
 */

import { FileChunkKernel } from '../../src/core/kernel';

// 网络条件模拟
type NetworkCondition = {
  name: string;
  downloadSpeed: number; // kB/s
  uploadSpeed: number; // kB/s
  latency: number; // ms
  packetLoss: number; // 0-1
  jitter: number; // ms
};

// 预设的网络条件
export const NETWORK_CONDITIONS: Record<string, NetworkCondition> = {
  EXCELLENT: {
    name: '极好',
    downloadSpeed: 10000, // 10MB/s
    uploadSpeed: 5000, // 5MB/s
    latency: 5,
    packetLoss: 0,
    jitter: 0
  },
  GOOD: {
    name: '良好',
    downloadSpeed: 5000, // 5MB/s
    uploadSpeed: 1000, // 1MB/s
    latency: 20,
    packetLoss: 0,
    jitter: 5
  },
  AVERAGE: {
    name: '一般',
    downloadSpeed: 2000, // 2MB/s
    uploadSpeed: 500, // 500kB/s
    latency: 50,
    packetLoss: 0.01, // 1%
    jitter: 10
  },
  POOR: {
    name: '较差',
    downloadSpeed: 500, // 500kB/s
    uploadSpeed: 100, // 100kB/s
    latency: 100,
    packetLoss: 0.05, // 5%
    jitter: 20
  },
  TERRIBLE: {
    name: '糟糕',
    downloadSpeed: 100, // 100kB/s
    uploadSpeed: 20, // 20kB/s
    latency: 500,
    packetLoss: 0.1, // 10%
    jitter: 50
  },
  DISCONNECTING: {
    name: '断断续续',
    downloadSpeed: 50, // 50kB/s
    uploadSpeed: 10, // 10kB/s
    latency: 1000,
    packetLoss: 0.3, // 30%
    jitter: 200
  },
  OFFLINE: {
    name: '离线',
    downloadSpeed: 0,
    uploadSpeed: 0,
    latency: 10000, // 超时
    packetLoss: 1, // 100%
    jitter: 0
  }
};

// 创建网络条件模拟中间件
export function createNetworkMiddleware(condition: NetworkCondition) {
  return {
    intercept: async (request: any, next: () => Promise<any>) => {
      // 延迟响应模拟延迟
      const delay = condition.latency + Math.random() * condition.jitter;

      // 模拟丢包
      if (Math.random() < condition.packetLoss) {
        return Promise.reject(new Error('Network request failed (packet loss)'));
      }

      // 延迟处理请求
      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        // 处理响应
        const response = await next();

        // 限制上传速度 (简化模拟)
        if (request.data && request.data.size) {
          const uploadTime = (request.data.size / (condition.uploadSpeed * 1024)) * 1000;
          await new Promise(resolve => setTimeout(resolve, uploadTime));
        }

        return response;
      } catch (error) {
        // 根据网络条件，有几率将其他错误转换为网络错误
        if (Math.random() < condition.packetLoss * 0.5) {
          throw new Error('Random network failure during request');
        }
        throw error;
      }
    }
  };
}

// 创建模拟文件
export function createMockFile(
  size: number,
  name = 'test.dat',
  type = 'application/octet-stream'
): File {
  const buffer = new ArrayBuffer(size);
  const view = new Uint8Array(buffer);

  // 填充一些随机数据
  for (let i = 0; i < size; i++) {
    view[i] = Math.floor(Math.random() * 256);
  }

  return new File([buffer], name, { type });
}

// 创建测试内核实例
export async function createTestKernel(): Promise<FileChunkKernel> {
  const kernel = new FileChunkKernel();
  // 初始化内核
  await kernel.start();
  return kernel;
}

// 模拟服务器响应
export class MockServer {
  private chunks: Map<string, Map<number, ArrayBuffer>> = new Map();
  private completedFiles: Map<string, ArrayBuffer> = new Map();

  // 处理分片上传
  handleChunkUpload(
    fileId: string,
    chunkIndex: number,
    chunkData: ArrayBuffer
  ): { success: boolean } {
    if (!this.chunks.has(fileId)) {
      this.chunks.set(fileId, new Map());
    }

    const fileChunks = this.chunks.get(fileId)!;
    fileChunks.set(chunkIndex, chunkData);

    return { success: true };
  }

  // 处理合并请求
  handleMergeRequest(
    fileId: string,
    totalChunks: number
  ): { success: boolean; url?: string; error?: string } {
    if (!this.chunks.has(fileId)) {
      return { success: false };
    }

    const fileChunks = this.chunks.get(fileId)!;

    // 检查是否所有分片都已上传
    if (fileChunks.size !== totalChunks) {
      return {
        success: false,
        error: `Missing chunks: expected ${totalChunks}, got ${fileChunks.size}`
      };
    }

    // 合并文件
    const sortedChunks = Array.from({ length: totalChunks }, (_, i) => fileChunks.get(i)!);
    const totalSize = sortedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);

    const mergedFile = new Uint8Array(totalSize);
    let offset = 0;

    for (const chunk of sortedChunks) {
      mergedFile.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    // 保存合并后的文件
    this.completedFiles.set(fileId, mergedFile.buffer);

    return {
      success: true,
      url: `https://example.com/files/${fileId}`
    };
  }

  // 验证文件是否已完成并可访问
  verifyFile(fileId: string): boolean {
    return this.completedFiles.has(fileId);
  }

  // 重置服务器状态
  reset(): void {
    this.chunks.clear();
    this.completedFiles.clear();
  }
}
