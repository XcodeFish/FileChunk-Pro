/**
 * 边缘情况测试
 * 测试文件上传在各种极端条件下的表现
 */
import {
  installMockServer,
  setupMockTimeoutResponse,
  setupMockErrorResponse,
  setupMockNetworkError
} from '../utils/mock-server';
import { HttpTransport } from '../../src/modules/transport/implementations/http-transport';
import { Kernel } from '../../src/core/kernel';

describe('边缘情况测试', () => {
  let uninstallMockServer: () => void;
  let kernel: Kernel;
  let httpTransport: HttpTransport;

  beforeEach(() => {
    // 安装模拟服务器
    uninstallMockServer = installMockServer();

    // 创建内核和传输模块
    kernel = new Kernel();
    httpTransport = new HttpTransport();
    httpTransport.setKernel(kernel);

    // 配置上传URL
    kernel.setConfig(
      'transport.http.uploadUrl',
      'https://mock-server.example.com/api/upload/chunk'
    );
    kernel.setConfig('transport.http.mergeUrl', 'https://mock-server.example.com/api/upload/merge');
  });

  afterEach(() => {
    // 卸载模拟服务器
    uninstallMockServer();
  });

  test('处理超大文件上传', async () => {
    // 配置更小的分片以便于测试
    kernel.setConfig('transport.http.chunkSize', 1024 * 2); // 2KB

    // 创建一个大文件
    const largeFile = new File([new ArrayBuffer(1024 * 1024 * 10)], 'large-file.bin'); // 10MB

    // 初始化传输模块
    await httpTransport.init();

    // 执行上传
    const result = await httpTransport.upload(largeFile);

    // 验证结果
    expect(result.success).toBe(true);
  }, 30000); // 增加超时时间

  test('处理零字节文件上传', async () => {
    // 创建空文件
    const emptyFile = new File([], 'empty-file.txt');

    // 初始化传输模块
    await httpTransport.init();

    // 执行上传
    const result = await httpTransport.upload(emptyFile);

    // 验证结果
    expect(result.success).toBe(true);
  });

  test('处理特殊字符文件名上传', async () => {
    // 创建带特殊字符的文件名
    const specialNameFile = new File(['content'], '特殊字符!@#$%^&*()_+.txt');

    // 初始化传输模块
    await httpTransport.init();

    // 执行上传
    const result = await httpTransport.upload(specialNameFile);

    // 验证结果
    expect(result.success).toBe(true);
  });

  test('处理网络超时', async () => {
    // 模拟超时响应
    setupMockTimeoutResponse('https://mock-server.example.com/api/upload/chunk', 3000);

    // 设置较短的超时时间
    kernel.setConfig('transport.http.timeout', 1000);

    // 创建测试文件
    const testFile = new File(['content'], 'test.txt');

    // 初始化传输模块
    await httpTransport.init();

    // 添加错误处理器
    const errorHandler = jest.fn();

    // 执行上传并期望失败
    try {
      await httpTransport.upload(testFile, {
        onError: errorHandler,
        retryCount: 0
      });

      // 不应该执行到这里
      fail('Upload should have failed with timeout');
    } catch (error) {
      // 验证错误被正确处理
      expect(error).toBeDefined();
      expect(errorHandler).toHaveBeenCalled();
    }
  });

  test('处理网络断开', async () => {
    // 模拟网络错误
    setupMockNetworkError('https://mock-server.example.com/api/upload/chunk');

    // 创建测试文件
    const testFile = new File(['content'], 'test.txt');

    // 初始化传输模块
    await httpTransport.init();

    // 添加错误处理器
    const errorHandler = jest.fn();

    // 执行上传并期望失败
    try {
      await httpTransport.upload(testFile, {
        onError: errorHandler,
        retryCount: 0
      });

      // 不应该执行到这里
      fail('Upload should have failed with network error');
    } catch (error) {
      // 验证错误被正确处理
      expect(error).toBeDefined();
      expect(errorHandler).toHaveBeenCalled();
    }
  });

  test('处理服务器错误', async () => {
    // 模拟服务器错误
    setupMockErrorResponse(
      'https://mock-server.example.com/api/upload/chunk',
      500,
      'Internal Server Error'
    );

    // 创建测试文件
    const testFile = new File(['content'], 'test.txt');

    // 初始化传输模块
    await httpTransport.init();

    // 添加错误处理器
    const errorHandler = jest.fn();

    // 执行上传并期望失败
    try {
      await httpTransport.upload(testFile, {
        onError: errorHandler,
        retryCount: 0
      });

      // 不应该执行到这里
      fail('Upload should have failed with server error');
    } catch (error) {
      // 验证错误被正确处理
      expect(error).toBeDefined();
      expect(errorHandler).toHaveBeenCalled();
      expect(error.status).toBe(500);
    }
  });

  test('处理并发上传限制', async () => {
    // 设置并发限制
    kernel.setConfig('transport.http.maxConcurrentUploads', 2);

    // 创建多个文件
    const files = Array(5)
      .fill(null)
      .map((_, i) => new File(['content'], `file-${i}.txt`));

    // 初始化传输模块
    await httpTransport.init();

    // 同时上传所有文件
    const uploadPromises = files.map(file => httpTransport.upload(file));

    // 等待所有上传完成
    const results = await Promise.all(uploadPromises);

    // 验证所有上传都成功
    expect(results.every(result => result.success)).toBe(true);

    // 验证并发控制有效
    // 注意：这部分很难在单元测试中精确验证，因为异步执行顺序难以保证
    // 实际项目中可以添加日志记录或自定义事件监听来验证
  });

  test('处理取消上传后的资源清理', async () => {
    // 创建测试文件
    const testFile = new File(['content'], 'test-cancel.txt');

    // 初始化传输模块
    await httpTransport.init();

    // 开始上传
    const uploadPromise = httpTransport.upload(testFile);

    // 立即取消
    setTimeout(() => {
      httpTransport.cancel();
    }, 10);

    // 等待上传被取消
    try {
      await uploadPromise;
      // 不应该执行到这里
      fail('Upload should have been cancelled');
    } catch (error) {
      // 验证错误是取消操作
      expect(error.message).toContain('cancel');
    }

    // 验证资源被正确清理
    // 此处可以添加对内存使用或持久化存储的检查
  });

  test('处理不支持的文件类型', async () => {
    // 配置不支持的文件类型
    kernel.setConfig('transport.http.allowedFileTypes', ['image/jpeg', 'image/png']);

    // 创建不支持的文件类型
    const unsupportedFile = new File(['content'], 'document.pdf', {
      type: 'application/pdf'
    });

    // 初始化传输模块
    await httpTransport.init();

    // 执行上传并期望失败
    try {
      await httpTransport.upload(unsupportedFile);
      // 不应该执行到这里
      fail('Upload should have failed due to unsupported file type');
    } catch (error) {
      // 验证错误包含文件类型信息
      expect(error.message).toContain('file type');
    }
  });
});
