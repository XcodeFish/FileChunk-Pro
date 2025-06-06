import { HttpTransport } from '../../../../src/modules/transport/implementations/http-transport';
import { testHelpers } from '../../../setupTests';
import { Kernel } from '../../../../src/core/kernel';

// 模拟依赖模块
jest.mock('../../../../src/modules/storage/implementations/memory-storage', () => {
  return {
    MemoryStorage: jest.fn().mockImplementation(() => ({
      getName: jest.fn().mockReturnValue('storage'),
      getChunkInfo: jest.fn().mockResolvedValue(null),
      saveChunkInfo: jest.fn().mockResolvedValue(true),
      getFileInfo: jest.fn().mockResolvedValue(null),
      saveFileInfo: jest.fn().mockResolvedValue(true),
      clearFileInfo: jest.fn().mockResolvedValue(true)
    }))
  };
});

describe('HttpTransport', () => {
  let httpTransport: HttpTransport;
  let kernel: Kernel;
  let mockFile: File;

  beforeEach(() => {
    // 重置网络请求模拟
    testHelpers.resetMocks();

    // 创建内核
    kernel = new Kernel();

    // 创建模拟文件
    mockFile = new File(['test file content'], 'test.txt', {
      type: 'text/plain'
    });

    // 创建HTTP传输实例
    httpTransport = new HttpTransport();
    httpTransport.setKernel(kernel);

    // 配置上传URL
    kernel.setConfig('transport.http.uploadUrl', 'https://api.example.com/upload');
    kernel.setConfig('transport.http.mergeUrl', 'https://api.example.com/merge');
  });

  afterEach(async () => {
    await kernel.shutdown();
  });

  test('应正确初始化HTTP传输', async () => {
    await httpTransport.init();
    expect(httpTransport.getName()).toBe('http-transport');
  });

  test('应能上传单个文件', async () => {
    await httpTransport.init();

    const progressCallback = jest.fn();
    const uploadResult = await httpTransport.upload(mockFile, {
      onProgress: progressCallback
    });

    expect(uploadResult).toBeDefined();
    expect(uploadResult.success).toBe(true);
    expect(progressCallback).toHaveBeenCalled();
  });

  test('应能处理上传错误', async () => {
    await httpTransport.init();

    // 模拟网络失败
    testHelpers.mockNetworkFailure();

    const errorCallback = jest.fn();
    try {
      await httpTransport.upload(mockFile, {
        onError: errorCallback
      });

      // 应该不会执行到这里
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
      expect(errorCallback).toHaveBeenCalled();
    }
  });

  test('应支持分片上传', async () => {
    // 配置分片大小
    kernel.setConfig('transport.http.chunkSize', 1024);

    await httpTransport.init();

    const mockBigFile = new File(['a'.repeat(3000)], 'big.txt', {
      type: 'text/plain'
    });

    // 分片上传
    const uploadResult = await httpTransport.upload(mockBigFile);

    expect(uploadResult).toBeDefined();
    expect(uploadResult.success).toBe(true);
    // 应该发送了合并请求
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/merge'), expect.any(Object));
  });

  test('应能暂停和恢复上传', async () => {
    await httpTransport.init();

    // 开始上传
    const uploadTask = httpTransport.upload(mockFile);

    // 暂停上传
    httpTransport.pause();

    // 恢复上传
    httpTransport.resume();

    // 等待上传完成
    const result = await uploadTask;

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  test('应能取消上传', async () => {
    await httpTransport.init();

    // 开始上传
    const uploadPromise = httpTransport.upload(mockFile);

    // 立即取消上传
    httpTransport.cancel();

    try {
      await uploadPromise;
      // 不应该执行到这里
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
      expect(error.message).toContain('canceled');
    }
  });

  test('应支持自定义请求头', async () => {
    // 配置自定义请求头
    kernel.setConfig('transport.http.headers', {
      'X-Custom-Header': 'test-value'
    });

    await httpTransport.init();

    await httpTransport.upload(mockFile);

    // 验证请求头
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Custom-Header': 'test-value'
        })
      })
    );
  });

  test('应支持上传URL动态生成', async () => {
    const urlGenerator = jest.fn().mockReturnValue('https://dynamic.example.com/upload');
    kernel.setConfig('transport.http.urlGenerator', urlGenerator);

    await httpTransport.init();

    await httpTransport.upload(mockFile);

    expect(urlGenerator).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('https://dynamic.example.com/upload', expect.any(Object));
  });
});
