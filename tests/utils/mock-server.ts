/**
 * 模拟服务器响应工具
 * 提供模拟上传服务器各种响应的工具函数
 */

// 模拟服务器URL基础地址
export const MOCK_SERVER_BASE_URL = 'https://mock-server.example.com';

// 存储模拟的响应处理函数
const mockHandlers: Record<string, MockResponseHandler> = {};

// 响应处理函数类型
type MockResponseHandler = (request: Request) => Promise<Response>;

/**
 * 注册模拟响应处理器
 * @param path - URL路径
 * @param handler - 响应处理函数
 */
export function registerMockHandler(path: string, handler: MockResponseHandler): void {
  const fullPath = new URL(path, MOCK_SERVER_BASE_URL).toString();
  mockHandlers[fullPath] = handler;
}

/**
 * 重置所有模拟处理器
 */
export function resetMockHandlers(): void {
  Object.keys(mockHandlers).forEach(key => {
    delete mockHandlers[key];
  });
}

/**
 * 设置模拟上传处理器
 * 模拟文件上传响应，支持分片上传和秒传
 */
export function setupMockUploadHandlers(): void {
  // 存储上传的文件信息
  const uploadedFiles: Record<
    string,
    {
      chunks: Record<string, ArrayBuffer>;
      fileInfo?: {
        name: string;
        size: number;
        type: string;
        hash: string;
      };
    }
  > = {};

  // 模拟检查文件是否已存在（模拟秒传）
  registerMockHandler('/api/upload/check', async request => {
    const data = await request.json();
    const { hash } = data;

    // 检查是否存在具有相同哈希的文件
    const fileExists = Object.values(uploadedFiles).some(file => file.fileInfo?.hash === hash);

    return new Response(
      JSON.stringify({
        exists: fileExists,
        url: fileExists ? `${MOCK_SERVER_BASE_URL}/files/${hash}` : null
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  });

  // 模拟分片上传
  registerMockHandler('/api/upload/chunk', async request => {
    const formData = await request.formData();
    const chunkIndex = formData.get('chunkIndex')?.toString() || '0';
    const fileId = formData.get('fileId')?.toString() || '';
    const chunkData = formData.get('chunk');

    if (!uploadedFiles[fileId]) {
      uploadedFiles[fileId] = { chunks: {} };
    }

    // 存储分片数据
    if (chunkData instanceof Blob) {
      uploadedFiles[fileId].chunks[chunkIndex] = await chunkData.arrayBuffer();
    }

    // 模拟上传延迟
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

    return new Response(
      JSON.stringify({
        success: true,
        chunkIndex
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  });

  // 模拟合并分片
  registerMockHandler('/api/upload/merge', async request => {
    const data = await request.json();
    const { fileId, fileName, fileSize, fileType, hash, chunkCount } = data;

    if (!uploadedFiles[fileId]) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'File not found'
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 检查是否所有分片都已上传
    const receivedChunks = Object.keys(uploadedFiles[fileId].chunks).length;
    if (receivedChunks !== parseInt(chunkCount, 10)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Incomplete chunks. Expected ${chunkCount}, got ${receivedChunks}`
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 保存文件信息
    uploadedFiles[fileId].fileInfo = {
      name: fileName,
      size: fileSize,
      type: fileType,
      hash
    };

    // 模拟合并延迟
    await new Promise(resolve => setTimeout(resolve, 200));

    return new Response(
      JSON.stringify({
        success: true,
        url: `${MOCK_SERVER_BASE_URL}/files/${hash}`,
        fileId
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  });
}

/**
 * 设置模拟错误响应
 * @param path - URL路径
 * @param errorStatus - HTTP错误状态码
 * @param errorMessage - 错误消息
 */
export function setupMockErrorResponse(
  path: string,
  errorStatus: number,
  errorMessage: string
): void {
  registerMockHandler(path, async () => {
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        status: errorStatus,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  });
}

/**
 * 设置模拟网络错误
 * 用于模拟断网等情况
 */
export function setupMockNetworkError(path: string): void {
  registerMockHandler(path, async () => {
    throw new Error('Network error');
  });
}

/**
 * 设置模拟超时响应
 * @param path - URL路径
 * @param timeoutMs - 超时毫秒数
 */
export function setupMockTimeoutResponse(path: string, timeoutMs: number): void {
  registerMockHandler(path, async () => {
    await new Promise(resolve => setTimeout(resolve, timeoutMs));
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Request timeout'
      }),
      {
        status: 408,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  });
}

/**
 * 安装模拟服务器
 * 重写全局fetch以处理模拟响应
 */
export function installMockServer(): () => void {
  const originalFetch = global.fetch;

  // 替换全局fetch
  global.fetch = jest
    .fn()
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      // 查找匹配的处理器
      const handler = mockHandlers[url];
      if (handler) {
        return await handler(new Request(url, init));
      }

      // 如果没有找到处理器，返回默认的成功响应
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Default mock response'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    });

  // 返回卸载函数
  return () => {
    global.fetch = originalFetch;
    resetMockHandlers();
  };
}
