/**
 * FileChunk Pro 集成测试 - 上传流程
 *
 * 测试完整的上传流程，包括文件分片、上传、合并等步骤
 */

import {
  createMockFile,
  createTestKernel,
  MockServer,
  NETWORK_CONDITIONS,
  createNetworkMiddleware
} from './setup';

// 模拟上传端点
const MOCK_ENDPOINTS = {
  UPLOAD_CHUNK: 'https://api.example.com/upload/chunk',
  MERGE_REQUEST: 'https://api.example.com/upload/merge',
  UPLOAD_STATUS: 'https://api.example.com/upload/status'
};

describe('上传流程集成测试', () => {
  let mockServer: MockServer;

  beforeEach(() => {
    mockServer = new MockServer();

    // 重写全局fetch以使用模拟服务器
    global.fetch = jest.fn().mockImplementation(async (url: string, options: any) => {
      const path = url.toString();
      const body = options.body;

      if (path === MOCK_ENDPOINTS.UPLOAD_CHUNK) {
        const fileId = options.headers['X-File-Id'];
        const chunkIndex = parseInt(options.headers['X-Chunk-Index']);
        const result = mockServer.handleChunkUpload(fileId, chunkIndex, await body.arrayBuffer());
        return {
          ok: result.success,
          status: result.success ? 200 : 400,
          json: async () => result
        } as Response;
      }

      if (path === MOCK_ENDPOINTS.MERGE_REQUEST) {
        const data = JSON.parse(await body.text());
        const result = mockServer.handleMergeRequest(data.fileId, data.totalChunks);
        return {
          ok: result.success,
          status: result.success ? 200 : 400,
          json: async () => result
        } as Response;
      }

      if (path === MOCK_ENDPOINTS.UPLOAD_STATUS) {
        const fileId = new URL(url).searchParams.get('fileId');
        const exists = fileId ? mockServer.verifyFile(fileId) : false;
        return {
          ok: true,
          status: 200,
          json: async () => ({ exists })
        } as Response;
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' })
      } as Response;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockServer.reset();
  });

  test('基础上传流程 - 分片上传并合并', async () => {
    // 创建一个1MB的测试文件
    const testFile = createMockFile(1024 * 1024, 'test.txt', 'text/plain');

    // 创建内核实例
    const kernel = await createTestKernel();

    // 获取传输模块
    const transportModule = kernel.getModule('transport');
    expect(transportModule).toBeDefined();

    // 设置上传参数
    const uploadOptions = {
      file: testFile,
      chunkSize: 256 * 1024, // 256KB分片
      url: MOCK_ENDPOINTS.UPLOAD_CHUNK,
      mergeUrl: MOCK_ENDPOINTS.MERGE_REQUEST,
      headers: {
        'X-File-Id': 'test-file-001'
      },
      onProgress: jest.fn(),
      onSuccess: jest.fn(),
      onError: jest.fn()
    };

    // 开始上传
    const uploadTask = transportModule.upload(uploadOptions);

    // 等待上传完成
    await expect(uploadTask).resolves.toEqual(
      expect.objectContaining({
        success: true,
        fileId: 'test-file-001'
      })
    );

    // 验证进度回调被调用
    expect(uploadOptions.onProgress).toHaveBeenCalled();

    // 验证成功回调被调用
    expect(uploadOptions.onSuccess).toHaveBeenCalled();

    // 验证错误回调未被调用
    expect(uploadOptions.onError).not.toHaveBeenCalled();

    // 验证文件在服务器端已合并
    expect(mockServer.verifyFile('test-file-001')).toBe(true);
  });

  test('文件上传测试 - 不同网络条件', async () => {
    // 创建测试内核
    const kernel = await createTestKernel();

    // 注册网络中间件
    const networkModule = kernel.getModule('network');
    const originalMiddleware = networkModule.getMiddleware();

    // 测试不同网络条件
    for (const [conditionName, condition] of Object.entries(NETWORK_CONDITIONS)) {
      // 跳过离线测试，单独测试
      if (conditionName === 'OFFLINE') continue;

      console.log(`测试网络条件: ${condition.name}`);

      // 设置网络中间件
      const networkMiddleware = createNetworkMiddleware(condition);
      networkModule.setMiddleware(networkMiddleware);

      // 创建一个较小的文件用于测试
      const testFile = createMockFile(512 * 1024, `test-${conditionName}.txt`);

      // 获取传输模块
      const transportModule = kernel.getModule('transport');

      // 设置上传参数
      const uploadOptions = {
        file: testFile,
        chunkSize: 128 * 1024, // 128KB分片
        url: MOCK_ENDPOINTS.UPLOAD_CHUNK,
        mergeUrl: MOCK_ENDPOINTS.MERGE_REQUEST,
        headers: {
          'X-File-Id': `test-file-${conditionName}`
        },
        retryTimes: 3,
        retryDelay: 1000,
        onProgress: jest.fn(),
        onSuccess: jest.fn(),
        onError: jest.fn()
      };

      try {
        // 开始上传
        await transportModule.upload(uploadOptions);

        // 验证文件在服务器端已合并
        expect(mockServer.verifyFile(`test-file-${conditionName}`)).toBe(true);

        // 验证成功回调被调用
        expect(uploadOptions.onSuccess).toHaveBeenCalled();
      } catch {
        // 在较差的网络条件下可能会失败，但应该触发错误回调
        expect(uploadOptions.onError).toHaveBeenCalled();
      }
    }

    // 离线测试
    console.log(`测试网络条件: ${NETWORK_CONDITIONS.OFFLINE.name}`);
    networkModule.setMiddleware(createNetworkMiddleware(NETWORK_CONDITIONS.OFFLINE));

    // 创建一个小文件用于测试
    const testFile = createMockFile(64 * 1024, 'test-OFFLINE.txt');

    // 获取传输模块
    const transportModule = kernel.getModule('transport');

    // 设置上传参数
    const uploadOptions = {
      file: testFile,
      chunkSize: 32 * 1024,
      url: MOCK_ENDPOINTS.UPLOAD_CHUNK,
      mergeUrl: MOCK_ENDPOINTS.MERGE_REQUEST,
      headers: {
        'X-File-Id': 'test-file-OFFLINE'
      },
      retryTimes: 2,
      retryDelay: 500,
      onProgress: jest.fn(),
      onSuccess: jest.fn(),
      onError: jest.fn()
    };

    // 上传应该失败
    await expect(transportModule.upload(uploadOptions)).rejects.toThrow();

    // 验证错误回调被调用
    expect(uploadOptions.onError).toHaveBeenCalled();

    // 恢复原始中间件
    networkModule.setMiddleware(originalMiddleware);
  });

  test('暂停和恢复上传测试', async () => {
    // 创建较大测试文件以确保有足够时间暂停
    const testFile = createMockFile(2 * 1024 * 1024, 'pause-resume.txt');

    // 创建内核实例
    const kernel = await createTestKernel();

    // 获取传输模块
    const transportModule = kernel.getModule('transport');

    // 设置上传参数
    const uploadOptions = {
      file: testFile,
      chunkSize: 256 * 1024, // 256KB分片
      url: MOCK_ENDPOINTS.UPLOAD_CHUNK,
      mergeUrl: MOCK_ENDPOINTS.MERGE_REQUEST,
      headers: {
        'X-File-Id': 'test-file-pause-resume'
      },
      onProgress: jest.fn(),
      onSuccess: jest.fn(),
      onError: jest.fn()
    };

    // 开始上传
    const uploadTask = transportModule.upload(uploadOptions);

    // 等待一小段时间后暂停
    await new Promise(resolve => setTimeout(resolve, 200));

    // 暂停上传
    uploadTask.pause();

    // 验证上传已暂停
    expect(uploadTask.isPaused()).toBe(true);

    // 等待一小段时间
    await new Promise(resolve => setTimeout(resolve, 500));

    // 恢复上传
    uploadTask.resume();

    // 验证上传已恢复
    expect(uploadTask.isPaused()).toBe(false);

    // 等待上传完成
    await uploadTask;

    // 验证文件在服务器端已合并
    expect(mockServer.verifyFile('test-file-pause-resume')).toBe(true);

    // 验证成功回调被调用
    expect(uploadOptions.onSuccess).toHaveBeenCalled();
  });

  test('文件秒传测试', async () => {
    // 创建测试文件
    const testFile = createMockFile(1024 * 1024, 'quick-upload.txt');

    // 创建内核实例
    const kernel = await createTestKernel();

    // 模拟秒传，假设文件已存在
    jest.spyOn(global, 'fetch').mockImplementationOnce(async url => {
      if (url.toString().includes('/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ exists: true, url: 'https://example.com/files/already-exists' })
        } as unknown as Response;
      }
      return global.fetch(url);
    });

    // 获取传输模块
    const transportModule = kernel.getModule('transport');

    // 设置上传参数
    const uploadOptions = {
      file: testFile,
      chunkSize: 256 * 1024,
      url: MOCK_ENDPOINTS.UPLOAD_CHUNK,
      mergeUrl: MOCK_ENDPOINTS.MERGE_REQUEST,
      statusUrl: MOCK_ENDPOINTS.UPLOAD_STATUS,
      headers: {
        'X-File-Id': 'quick-upload'
      },
      onProgress: jest.fn(),
      onSuccess: jest.fn(),
      onError: jest.fn()
    };

    // 开始上传
    await transportModule.upload(uploadOptions);

    // 验证成功回调被调用
    expect(uploadOptions.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        fileId: 'quick-upload',
        skipUpload: true
      })
    );

    // 验证进度回调不应该被调用(应该直接完成)
    expect(uploadOptions.onProgress).not.toHaveBeenCalled();
  });
});
