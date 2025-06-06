import { FileChunkKernel } from '../../../src/core/kernel';
import { ModuleBase } from '../../../src/core/module-base';

// 创建测试模块类
class TestModule extends ModuleBase {
  public initialized = false;
  public started = false;
  public stopped = false;

  getName(): string {
    return 'test';
  }

  async init(kernel: FileChunkKernel): Promise<void> {
    this.kernel = kernel;
    this.initialized = true;
  }

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }
}

class DependentModule extends ModuleBase {
  public testModuleRef: TestModule | null = null;

  getName(): string {
    return 'dependent';
  }

  getDependencies(): string[] {
    return ['test'];
  }

  async init(kernel: FileChunkKernel): Promise<void> {
    // 保存内核引用
    this.kernel = kernel;

    // 获取依赖模块引用
    this.testModuleRef = this.kernel.getModule<TestModule>('test');
  }
}

describe('FileChunkKernel', () => {
  let kernel: FileChunkKernel;

  beforeEach(() => {
    kernel = new FileChunkKernel();
  });

  afterEach(async () => {
    await kernel.stop();
  });

  test('应能正确创建内核实例', () => {
    expect(kernel).toBeInstanceOf(FileChunkKernel);
  });

  test('应能注册模块', async () => {
    const testModule = new TestModule();
    await kernel.registerModule('test', testModule);

    expect(kernel.getModule('test')).toBe(testModule);
  });

  test('应能获取已注册模块', async () => {
    const testModule = new TestModule();
    await kernel.registerModule('test', testModule);

    const retrievedModule = kernel.getModule<TestModule>('test');
    expect(retrievedModule).toBe(testModule);
  });

  test('获取未注册模块应抛出错误', () => {
    expect(() => {
      kernel.getModule('nonexistent');
    }).toThrow();
  });

  test('应能正确初始化模块', async () => {
    const testModule = new TestModule();
    await kernel.registerModule('test', testModule);
    await kernel.start();

    expect(testModule.initialized).toBe(true);
  });

  test('应能正确启动模块', async () => {
    const testModule = new TestModule();
    await kernel.registerModule('test', testModule);
    await kernel.start();

    expect(testModule.started).toBe(true);
  });

  test('应能正确停止模块', async () => {
    const testModule = new TestModule();
    await kernel.registerModule('test', testModule);
    await kernel.start();
    await kernel.stop();

    expect(testModule.stopped).toBe(true);
  });

  test('应能解决模块依赖关系', async () => {
    const testModule = new TestModule();
    const dependentModule = new DependentModule();

    await kernel.registerModule('test', testModule);
    await kernel.registerModule('dependent', dependentModule);
    await kernel.start();

    expect(dependentModule.testModuleRef).toBe(testModule);
  });

  test('应能处理配置', async () => {
    kernel.setConfig('test.key', 'value');

    expect(kernel.getConfig('test.key')).toBe('value');
  });

  test('应能使用默认配置值', () => {
    expect(kernel.getConfig('nonexistent.key', 'default')).toBe('default');
  });

  test('应能批量更新配置', () => {
    kernel.setConfig('test.key1', 'value1');
    kernel.setConfig('test.key2', 'value2');

    expect(kernel.getConfig('test.key1')).toBe('value1');
    expect(kernel.getConfig('test.key2')).toBe('value2');
  });
});
