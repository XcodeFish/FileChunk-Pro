import { Kernel, BaseModule } from '../core';

/**
 * 日志模块示例
 */
class LoggerModule extends BaseModule {
  constructor() {
    super({
      id: 'logger',
      name: '日志模块',
      version: '1.0.0',
      description: '提供日志记录功能'
    });
  }

  protected async onInit(): Promise<void> {
    console.log('日志模块正在初始化...');
    // 模拟初始化过程
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('日志模块初始化完成');
  }

  protected async onStart(): Promise<void> {
    console.log('日志模块正在启动...');
    // 模拟启动过程
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('日志模块启动完成');
  }

  protected async onStop(): Promise<void> {
    console.log('日志模块正在停止...');
    // 模拟停止过程
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('日志模块停止完成');
  }

  log(message: string, level: string = 'info'): void {
    console.log(`[${level.toUpperCase()}] ${message}`);
  }
}

/**
 * 配置模块示例，依赖日志模块
 */
class ConfigModule extends BaseModule {
  private _config: Record<string, any> = {
    appName: 'FileChunk Pro',
    version: '1.0.0',
    maxChunkSize: 2 * 1024 * 1024 // 2MB
  };

  constructor() {
    super({
      id: 'config',
      name: '配置模块',
      version: '1.0.0',
      description: '提供配置管理功能',
      dependencies: ['logger'] // 声明依赖日志模块
    });
  }

  protected async onInit(): Promise<void> {
    const logger = this.getModule<LoggerModule>('logger');
    logger.log('配置模块正在初始化...', 'debug');

    // 模拟初始化过程
    await new Promise(resolve => setTimeout(resolve, 100));

    logger.log('配置模块初始化完成', 'debug');
  }

  protected async onStart(): Promise<void> {
    const logger = this.getModule<LoggerModule>('logger');
    logger.log('配置模块正在启动...', 'debug');

    // 模拟启动过程
    await new Promise(resolve => setTimeout(resolve, 100));

    logger.log('配置模块启动完成', 'debug');
  }

  protected async onStop(): Promise<void> {
    const logger = this.getModule<LoggerModule>('logger');
    logger.log('配置模块正在停止...', 'debug');

    // 模拟停止过程
    await new Promise(resolve => setTimeout(resolve, 100));

    logger.log('配置模块停止完成', 'debug');
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this._config[key] as T) || defaultValue;
  }

  set<T>(key: string, value: T): void {
    this._config[key] = value;

    // 使用日志模块记录配置变更
    const logger = this.getModule<LoggerModule>('logger');
    logger.log(`配置项 ${key} 已更新为 ${value}`, 'info');
  }
}

/**
 * 运行示例
 */
async function runExample(): Promise<void> {
  console.log('====== 模块注册机制示例 ======');

  // 创建内核实例
  const kernel = new Kernel({
    debug: true, // 启用调试日志
    autoStartModules: true // 自动启动已初始化的模块
  });

  // 创建模块实例
  const loggerModule = new LoggerModule();
  const configModule = new ConfigModule();

  // 注册模块
  kernel.registerModule(loggerModule, {
    autoInit: true, // 自动初始化
    autoStart: true // 自动启动
  });

  kernel.registerModule(configModule, {
    autoInit: true, // 自动初始化
    autoStart: true // 自动启动
  });

  // 初始化内核
  console.log('\n[1] 初始化内核');
  await kernel.init();

  // 启动内核
  console.log('\n[2] 启动内核');
  await kernel.start();

  // 使用已注册的模块执行操作
  console.log('\n[3] 使用模块');
  const config = kernel.getModule<ConfigModule>('config');
  config?.set('maxChunkSize', 4 * 1024 * 1024); // 更新配置为4MB

  const chunkSize = config?.get<number>('maxChunkSize');
  console.log(`当前块大小配置: ${chunkSize} 字节`);

  // 停止内核
  console.log('\n[4] 停止内核');
  await kernel.stop();

  // 销毁内核
  console.log('\n[5] 销毁内核');
  await kernel.destroy();

  console.log('\n====== 示例结束 ======');
}

// 运行示例
runExample().catch(error => {
  console.error('示例运行出错:', error);
});
