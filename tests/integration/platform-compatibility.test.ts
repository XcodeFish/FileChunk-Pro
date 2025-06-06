/**
 * FileChunk Pro 集成测试 - 平台兼容性
 *
 * 测试不同平台适配器的兼容性和正确性
 */

import { createTestKernel, createMockFile, MockServer } from './setup';

// 平台类型列表
const PLATFORMS = ['browser', 'wechat-miniprogram', 'taro', 'uniapp', 'react-native'];

describe('平台兼容性集成测试', () => {
  let mockServer: MockServer;

  beforeEach(() => {
    mockServer = new MockServer();
    // 初始化服务器模拟响应...
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockServer.reset();
  });

  // 测试所有支持的平台
  test.each(PLATFORMS)('平台适配器基本功能 - %s', async platformType => {
    // 创建内核实例
    const kernel = await createTestKernel();

    // 获取平台适配器管理模块
    const platformManagerModule = kernel.getModule('platform-manager');
    expect(platformManagerModule).toBeDefined();

    // 切换平台类型
    await platformManagerModule.switchPlatform(platformType);

    // 获取当前平台适配器
    const currentPlatform = platformManagerModule.getCurrentPlatform();
    expect(currentPlatform).toBeDefined();
    expect(currentPlatform.type).toBe(platformType);

    // 检查平台是否提供必要的API
    expect(typeof currentPlatform.getFile).toBe('function');
    expect(typeof currentPlatform.createRequest).toBe('function');
    expect(typeof currentPlatform.getStorage).toBe('function');
  });

  test('浏览器平台文件选择和读取', async () => {
    // 创建内核实例
    const kernel = await createTestKernel();

    // 获取平台适配器管理模块
    const platformManagerModule = kernel.getModule('platform-manager');

    // 切换到浏览器平台
    await platformManagerModule.switchPlatform('browser');

    // 获取浏览器平台适配器
    const browserPlatform = platformManagerModule.getCurrentPlatform();

    // 模拟文件选择
    const mockFile = createMockFile(1024 * 1024, 'test.txt', 'text/plain');
    const mockFileList = [mockFile];

    // 模拟文件选择器
    jest.spyOn(browserPlatform, 'selectFile').mockResolvedValue(mockFileList);

    // 调用选择文件
    const selectedFiles = await browserPlatform.selectFile({
      accept: '.txt,.doc',
      multiple: true
    });

    // 验证选择的文件
    expect(selectedFiles).toHaveLength(1);
    expect(selectedFiles[0].name).toBe('test.txt');
    expect(selectedFiles[0].type).toBe('text/plain');
    expect(selectedFiles[0].size).toBe(1024 * 1024);

    // 测试文件读取
    const fileContent = await browserPlatform.readFile(selectedFiles[0], 'arrayBuffer');
    expect(fileContent).toBeDefined();
    expect(fileContent instanceof ArrayBuffer).toBe(true);
    expect(fileContent.byteLength).toBe(1024 * 1024);
  });

  test('微信小程序平台上传接口兼容性', async () => {
    // 创建内核实例
    const kernel = await createTestKernel();

    // 获取平台适配器管理模块
    const platformManagerModule = kernel.getModule('platform-manager');

    // 切换到微信小程序平台
    await platformManagerModule.switchPlatform('wechat-miniprogram');

    // 获取微信小程序平台适配器
    const wechatPlatform = platformManagerModule.getCurrentPlatform();

    // 模拟wx API
    const mockWx = {
      uploadFile: jest.fn().mockImplementation(options => {
        setTimeout(() => {
          options.success({
            statusCode: 200,
            data: JSON.stringify({ success: true })
          });
        }, 100);
        return {
          onProgressUpdate: jest.fn(),
          abort: jest.fn()
        };
      }),
      getFileSystemManager: jest.fn().mockReturnValue({
        readFile: jest.fn().mockImplementation(options => {
          setTimeout(() => {
            options.success({
              data: new ArrayBuffer(100)
            });
          }, 50);
        })
      })
    };

    // 注入模拟的wx对象
    (global as any).wx = mockWx;

    // 创建临时文件路径
    const tempFilePath = 'wxfile://temp/test.png';

    // 调用上传方法
    const uploadTask = wechatPlatform.uploadFile({
      url: 'https://example.com/upload',
      filePath: tempFilePath,
      name: 'file',
      header: { 'content-type': 'multipart/form-data' }
    });

    // 等待上传完成
    const result = await new Promise(resolve => {
      uploadTask.onSuccess(resolve);
    });

    // 验证上传结果
    expect(result).toEqual(expect.objectContaining({ success: true }));

    // 验证wx.uploadFile被调用
    expect(mockWx.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/upload',
        filePath: tempFilePath,
        name: 'file'
      })
    );

    // 清理模拟对象
    delete (global as any).wx;
  });

  test('动态切换平台测试', async () => {
    // 创建内核实例
    const kernel = await createTestKernel();

    // 获取平台适配器管理模块
    const platformManagerModule = kernel.getModule('platform-manager');

    // 初始平台是浏览器
    await platformManagerModule.switchPlatform('browser');
    expect(platformManagerModule.getCurrentPlatform().type).toBe('browser');

    // 切换到Taro平台
    await platformManagerModule.switchPlatform('taro');
    expect(platformManagerModule.getCurrentPlatform().type).toBe('taro');

    // 创建文件并上传，确保是通过Taro适配器上传的
    const mockTaroUpload = jest
      .spyOn(platformManagerModule.getCurrentPlatform(), 'uploadFile')
      .mockResolvedValue({ success: true, data: 'taro upload response' });

    // 获取传输模块
    const transportModule = kernel.getModule('transport');

    // 执行上传
    const file = createMockFile(1024, 'test.txt');
    await transportModule.upload({
      file,
      url: 'https://example.com/upload'
    });

    // 验证调用了Taro的上传方法
    expect(mockTaroUpload).toHaveBeenCalled();

    // 切换到UniApp平台
    await platformManagerModule.switchPlatform('uniapp');
    expect(platformManagerModule.getCurrentPlatform().type).toBe('uniapp');

    // 模拟UniApp上传方法
    const mockUniAppUpload = jest
      .spyOn(platformManagerModule.getCurrentPlatform(), 'uploadFile')
      .mockResolvedValue({ success: true, data: 'uniapp upload response' });

    // 再次执行上传
    await transportModule.upload({
      file,
      url: 'https://example.com/upload'
    });

    // 验证调用了UniApp的上传方法
    expect(mockUniAppUpload).toHaveBeenCalled();

    // 验证之前的Taro方法没有被再次调用
    expect(mockTaroUpload).toHaveBeenCalledTimes(1);
  });
});
