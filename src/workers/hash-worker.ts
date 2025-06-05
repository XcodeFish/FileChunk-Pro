/**
 * FileChunk Pro - 哈希计算Worker
 *
 * 该Worker负责在独立线程中计算文件哈希值，支持大文件分块计算，
 * 并提供进度报告和内存优化。
 */

import SparkMD5 from 'spark-md5';

/**
 * Worker消息类型定义
 */
type WorkerMessage = {
  type: 'HASH_FILE' | 'HASH_BLOB' | 'HASH_CHUNKS';
  data: ArrayBuffer | ArrayBuffer[] | null;
  chunkSize?: number;
  totalSize?: number;
  fileId?: string;
};

/**
 * Worker响应类型定义
 */
type WorkerResponse = {
  type: 'PROGRESS' | 'COMPLETE' | 'ERROR';
  hash?: string;
  progress?: number;
  fileId?: string;
  error?: string;
};

/**
 * 发送消息到主线程
 */
function postToMain(message: WorkerResponse): void {
  self.postMessage(message);
}

/**
 * 计算单个Blob或ArrayBuffer的哈希值
 */
function calculateHashForBlob(data: ArrayBuffer): string {
  try {
    const spark = new SparkMD5.ArrayBuffer();
    spark.append(data);
    return spark.end();
  } catch (error) {
    throw new Error(`哈希计算错误: ${(error as Error).message}`);
  }
}

/**
 * 计算多个分块的哈希值
 * 采用增量计算方式，减少内存占用
 */
async function calculateHashForChunks(
  chunks: ArrayBuffer[],
  totalSize: number,
  fileId?: string
): Promise<string> {
  try {
    const spark = new SparkMD5.ArrayBuffer();
    let processedSize = 0;

    // 逐块处理，并报告进度
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // 追加当前块到哈希计算器
      spark.append(chunk);

      // 更新进度
      processedSize += chunk.byteLength;
      const progress = Math.min(Math.floor((processedSize / totalSize) * 100), 100);

      // 向主线程报告进度
      postToMain({
        type: 'PROGRESS',
        progress,
        fileId
      });

      // 每处理完一个块后给主线程一点时间响应
      // 这有助于避免Worker阻塞过长时间
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // 完成所有块的处理，返回最终哈希值
    return spark.end();
  } catch (error) {
    throw new Error(`分块哈希计算错误: ${(error as Error).message}`);
  }
}

/**
 * 将大文件分割成多个小块进行哈希计算
 * 这种方式可以处理超大文件而不会导致内存溢出
 */
async function calculateHashForFile(
  fileData: ArrayBuffer,
  chunkSize: number,
  totalSize: number,
  fileId?: string
): Promise<string> {
  try {
    const chunks: ArrayBuffer[] = [];
    let offset = 0;

    // 分块
    while (offset < fileData.byteLength) {
      const end = Math.min(offset + chunkSize, fileData.byteLength);
      const chunk = fileData.slice(offset, end);
      chunks.push(chunk);
      offset = end;
    }

    // 计算分块哈希
    return await calculateHashForChunks(chunks, totalSize || fileData.byteLength, fileId);
  } catch (error) {
    throw new Error(`文件哈希计算错误: ${(error as Error).message}`);
  }
}

// 监听主线程消息
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  try {
    const { type, data, chunkSize = 2 * 1024 * 1024, totalSize, fileId } = event.data;
    let hash: string;

    switch (type) {
      case 'HASH_BLOB':
        // 处理单个Blob/ArrayBuffer
        if (!data || (!ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer))) {
          throw new Error('无效的数据格式');
        }

        hash = calculateHashForBlob(data as ArrayBuffer);

        postToMain({
          type: 'COMPLETE',
          hash,
          fileId
        });
        break;

      case 'HASH_FILE':
        // 处理大文件，需要分块计算
        if (!data || (!ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer))) {
          throw new Error('无效的文件数据');
        }

        hash = await calculateHashForFile(
          data as ArrayBuffer,
          chunkSize,
          totalSize || (data as ArrayBuffer).byteLength,
          fileId
        );

        postToMain({
          type: 'COMPLETE',
          hash,
          fileId
        });
        break;

      case 'HASH_CHUNKS':
        // 处理已经分块的数据
        if (!Array.isArray(data)) {
          throw new Error('无效的分块数据');
        }

        hash = await calculateHashForChunks(
          data as ArrayBuffer[],
          totalSize || data.reduce((sum, chunk) => sum + (chunk as ArrayBuffer).byteLength, 0),
          fileId
        );

        postToMain({
          type: 'COMPLETE',
          hash,
          fileId
        });
        break;

      default:
        throw new Error(`不支持的操作类型: ${type}`);
    }
  } catch (error) {
    // 统一的错误处理
    postToMain({
      type: 'ERROR',
      error: (error as Error).message,
      fileId: event.data.fileId
    });
  }
});

// 当Worker发生未捕获错误时的处理
self.addEventListener('error', error => {
  postToMain({
    type: 'ERROR',
    error: `Worker错误: ${error.message}`
  });
});
