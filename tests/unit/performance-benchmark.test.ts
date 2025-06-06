/**
 * 性能基准测试
 * 测试文件上传的性能表现，包括不同大小文件和不同网络条件下的表现
 */
import { installMockServer } from '../utils/mock-server';
import { HttpTransport } from '../../src/modules/transport/implementations/http-transport';
import { FileChunkKernel } from '../../src/core/kernel';
import { BrowserAdapter } from '../../src/platforms/browser/browser-adapter';

// 性能测试的基准标准
const PERFORMANCE_BENCHMARKS = {
  // 文件大小与期望完成时间（毫秒）
  smallFile: {
    size: 1024 * 10, // 10KB
    expectedTime: 500
  },
  mediumFile: {
    size: 1024 * 1024, // 1MB
    expectedTime: 5000
  },
  largeFile: {
    size: 1024 * 1024 * 10, // 10MB
    expectedTime: 20000
  }
};

/**
 * 创建指定大小的测试文件
 * @param size - 文件大小（字节）
 * @param name - 文件名
 */
function createTestFile(size: number, name: string): File {
  // 创建随机数据
  const buffer = new ArrayBuffer(size);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < size; i += 1024) {
    // 每1KB填充一次随机数据，提高性能
    view[i] = Math.floor(Math.random() * 256);
  }

  return new File([buffer], name);
}

/**
 * 测量函数执行时间
 * @param fn - 要测量的异步函数
 * @returns 执行时间（毫秒）
 */
async function measureExecutionTime(fn: () => Promise<any>): Promise<number> {
  const startTime = performance.now();
  await fn();
  const endTime = performance.now();
  return endTime - startTime;
}

// 跳过性能测试，只在需要时执行
describe.skip('性能基准测试', () => {
  let uninstallMockServer: () => void;
  let kernel: FileChunkKernel;
  let httpTransport: HttpTransport;
  let platform: BrowserAdapter;

  beforeEach(() => {
    // 安装模拟服务器
    uninstallMockServer = installMockServer();

    // 创建内核、平台适配器和传输模块
    kernel = new FileChunkKernel();
    platform = new BrowserAdapter();
    platform.init(kernel);

    httpTransport = new HttpTransport({
      target: 'http'
    });

    // 后续再设置 kernel
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

  test('基准测试 - 小文件上传性能', async () => {
    // 配置适合小文件的参数
    kernel.setConfig('transport.http.chunkSize', 1024 * 5); // 5KB

    // 创建测试文件
    const testFile = createTestFile(
      PERFORMANCE_BENCHMARKS.smallFile.size,
      'small-file-benchmark.dat'
    );

    // 初始化传输模块
    await httpTransport.init();

    // 测量上传时间
    const uploadTime = await measureExecutionTime(async () => {
      await httpTransport.uploadFile(testFile, platform);
    });

    // 验证性能符合预期
    expect(uploadTime).toBeLessThanOrEqual(PERFORMANCE_BENCHMARKS.smallFile.expectedTime);

    // 记录性能数据
    console.log(`小文件(${testFile.size}字节)上传时间: ${uploadTime.toFixed(2)}ms`);
  });

  test('基准测试 - 中等文件上传性能', async () => {
    // 配置适合中等文件的参数
    kernel.setConfig('transport.http.chunkSize', 1024 * 100); // 100KB

    // 创建测试文件
    const testFile = createTestFile(
      PERFORMANCE_BENCHMARKS.mediumFile.size,
      'medium-file-benchmark.dat'
    );

    // 初始化传输模块
    await httpTransport.init();

    // 测量上传时间
    const uploadTime = await measureExecutionTime(async () => {
      await httpTransport.uploadFile(testFile, platform);
    });

    // 验证性能符合预期
    expect(uploadTime).toBeLessThanOrEqual(PERFORMANCE_BENCHMARKS.mediumFile.expectedTime);

    // 记录性能数据
    console.log(`中等文件(${testFile.size}字节)上传时间: ${uploadTime.toFixed(2)}ms`);
  });

  test('基准测试 - 大文件上传性能', async () => {
    // 配置适合大文件的参数
    kernel.setConfig('transport.http.chunkSize', 1024 * 1024); // 1MB

    // 创建测试文件
    const testFile = createTestFile(
      PERFORMANCE_BENCHMARKS.largeFile.size,
      'large-file-benchmark.dat'
    );

    // 初始化传输模块
    await httpTransport.init();

    // 测量上传时间
    const uploadTime = await measureExecutionTime(async () => {
      await httpTransport.uploadFile(testFile, platform);
    });

    // 验证性能符合预期
    expect(uploadTime).toBeLessThanOrEqual(PERFORMANCE_BENCHMARKS.largeFile.expectedTime);

    // 记录性能数据
    console.log(`大文件(${testFile.size}字节)上传时间: ${uploadTime.toFixed(2)}ms`);
  });

  test('基准测试 - 并发性能', async () => {
    // 配置并发参数
    kernel.setConfig('transport.http.maxConcurrentUploads', 3);
    kernel.setConfig('transport.http.chunkSize', 1024 * 50); // 50KB

    // 创建多个测试文件
    const testFiles = [
      createTestFile(1024 * 100, 'concurrent-1.dat'),
      createTestFile(1024 * 200, 'concurrent-2.dat'),
      createTestFile(1024 * 300, 'concurrent-3.dat'),
      createTestFile(1024 * 400, 'concurrent-4.dat'),
      createTestFile(1024 * 500, 'concurrent-5.dat')
    ];

    // 初始化传输模块
    await httpTransport.init();

    // 测量并发上传时间
    const uploadTime = await measureExecutionTime(async () => {
      await Promise.all(testFiles.map(file => httpTransport.uploadFile(file, platform)));
    });

    // 计算总数据量
    const totalSize = testFiles.reduce((sum, file) => sum + file.size, 0);

    // 记录性能数据
    console.log(
      `并发上传性能: ${testFiles.length}个文件, 总计${totalSize}字节, 耗时${uploadTime.toFixed(2)}ms`
    );
    console.log(`平均吞吐量: ${(totalSize / 1024 / 1024 / (uploadTime / 1000)).toFixed(2)}MB/s`);

    // 验证并发性能合理
    expect(uploadTime).toBeLessThan(10000); // 期望10秒内完成
  });

  test('基准测试 - 内存使用', async () => {
    // 配置适合测试内存使用的参数
    kernel.setConfig('transport.http.chunkSize', 1024 * 1024); // 1MB

    // 创建大文件
    const largeFile = createTestFile(1024 * 1024 * 50, 'memory-test.dat'); // 50MB

    // 检查初始内存使用
    const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;

    // 初始化传输模块
    await httpTransport.init();

    // 执行上传
    await httpTransport.uploadFile(largeFile, platform);

    // 检查上传后内存使用
    const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    const memoryIncrease = finalMemory - initialMemory;

    // 记录内存使用情况
    console.log(
      `大文件上传内存使用: 初始${initialMemory.toFixed(2)}MB, 最终${finalMemory.toFixed(2)}MB, 增加${memoryIncrease.toFixed(2)}MB`
    );

    // 验证内存使用在合理范围内(应小于原文件大小的10%)
    expect(memoryIncrease).toBeLessThan((largeFile.size / 1024 / 1024) * 0.1);
  }, 60000); // 长时间测试
});
