/**
 * 插件开发指南生成器
 *
 * 生成项目插件开发指南文档
 */
import * as fs from 'fs';
import * as path from 'path';
import { DocsGenerateOptions } from '../interfaces';
import { GeneratorResult } from './api-docs-generator';

/**
 * 插件指南部分结构
 */
interface PluginGuideSection {
  title: string;
  fileName: string;
  content: string;
}

/**
 * 插件开发指南生成器类
 */
export class PluginGuideGenerator {
  /**
   * 示例代码中使用的options
   * 仅用于类型检查，实际不会使用
   */
  private options: {
    prefix: string;
    logLevel: string;
  } = {
    prefix: '[FileChunk]',
    logLevel: 'info'
  };

  /**
   * 示例代码中使用的context
   * 仅用于类型检查，实际不会使用
   */
  private context: {
    logger: {
      info: (message: string) => void;
      error: (message: string) => void;
    };
    on: (event: string, handler: (...args: any[]) => void) => void;
    off: (event: string, handler: (...args: any[]) => void) => void;
  } = {
    logger: {
      info: () => {},
      error: () => {}
    },
    on: () => {},
    off: () => {}
  };

  /**
   * 生成插件开发指南
   *
   * @param options 生成选项
   * @returns 生成结果
   */
  async generate(options: DocsGenerateOptions): Promise<GeneratorResult> {
    try {
      const outputDir = options.outputDir || 'docs/plugin';

      // 确保输出目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 准备指南部分
      const sections = this.preparePluginGuideSections();

      // 生成所有部分文件
      const files: string[] = [];
      for (const section of sections) {
        const filePath = path.join(outputDir, section.fileName);
        fs.writeFileSync(filePath, section.content, 'utf8');
        files.push(filePath);
      }

      // 生成索引文件
      const indexPath = path.join(outputDir, 'index.html');
      fs.writeFileSync(indexPath, this.generateIndexPage(sections), 'utf8');
      files.push(indexPath);

      // 生成导航文件
      const navPath = path.join(outputDir, 'nav.json');
      fs.writeFileSync(navPath, JSON.stringify(this.generateNavData(sections), null, 2), 'utf8');
      files.push(navPath);

      // 复制样式文件
      const stylesPath = path.join(outputDir, 'styles.css');
      fs.writeFileSync(stylesPath, this.getStyles(), 'utf8');
      files.push(stylesPath);

      return {
        success: true,
        files
      };
    } catch (error) {
      return {
        success: false,
        files: [],
        error: (error as Error).message
      };
    }
  }

  /**
   * 准备插件指南部分
   */
  private preparePluginGuideSections(): PluginGuideSection[] {
    return [
      {
        title: '插件系统概述',
        fileName: 'plugin-system-overview.html',
        content: this.getFormattedContent(
          '插件系统概述',
          `
          <h1>FileChunk Pro 插件系统概述</h1>
          
          <p>FileChunk Pro 的插件系统允许开发者通过插件机制扩展和定制核心功能，而无需修改核心代码。本指南将帮助你了解插件系统的设计理念和基本使用方法。</p>
          
          <h2>插件系统设计理念</h2>
          
          <p>FileChunk Pro 的插件系统基于以下设计理念：</p>
          
          <ul>
            <li><strong>低耦合</strong>：插件与核心代码之间保持低耦合，通过定义明确的接口进行交互</li>
            <li><strong>可组合</strong>：多个插件可以组合使用，相互协作</li>
            <li><strong>生命周期管理</strong>：插件拥有完整的生命周期，可以在适当的时机执行初始化、启动和清理操作</li>
            <li><strong>扩展点机制</strong>：核心提供了丰富的扩展点，插件可以通过这些扩展点注入自定义行为</li>
          </ul>
          
          <h2>插件类型</h2>
          
          <p>FileChunk Pro 支持多种类型的插件：</p>
          
          <ul>
            <li><strong>传输插件</strong>：扩展文件传输功能，如自定义传输协议、特殊上传流程等</li>
            <li><strong>存储插件</strong>：提供额外的存储选项，如特定云存储服务的集成</li>
            <li><strong>UI插件</strong>：提供自定义的上传界面组件和交互元素</li>
            <li><strong>安全插件</strong>：增强文件上传的安全性，如加密、病毒扫描等</li>
            <li><strong>工具插件</strong>：提供辅助功能，如特定格式的文件预处理等</li>
          </ul>
          
          <h2>插件注册流程</h2>
          
          <p>插件的注册和使用流程如下：</p>
          
          <ol>
            <li>创建插件类，实现 <code>Plugin</code> 接口</li>
            <li>向插件管理器注册插件实例</li>
            <li>配置插件（可选）</li>
            <li>启用插件</li>
          </ol>
          
          <p>下一节将详细介绍如何<a href="creating-plugins.html">创建第一个插件</a>。</p>
          `
        )
      },
      {
        title: '创建插件',
        fileName: 'creating-plugins.html',
        content: this.getFormattedContent(
          '创建插件',
          `
          <h1>创建 FileChunk Pro 插件</h1>
          
          <p>本指南将引导你创建自己的 FileChunk Pro 插件。我们将从一个简单的示例开始，然后逐步深入探讨更复杂的插件开发技术。</p>
          
          <h2>基本插件结构</h2>
          
          <p>一个标准的 FileChunk Pro 插件通常具有以下文件结构：</p>
          
          <pre><code>my-plugin/
├── src/
│   ├── index.ts         # 插件主入口
│   ├── plugin.ts        # 插件实现
│   └── types.ts         # 类型定义
├── package.json
├── tsconfig.json
└── README.md</code></pre>
          
          <h2>创建第一个插件</h2>
          
          <p>下面是一个简单的插件示例，它添加了自定义的日志功能：</p>
          
          <pre><code>import { Plugin, PluginContext } from '@filechunk-pro/core';

// 插件选项接口
export interface LoggerPluginOptions {
  logLevel: 'info' | 'warn' | 'error';
  prefix?: string;
}

// 插件实现
export class LoggerPlugin implements Plugin {
  // 插件元数据
  public static readonly id = 'logger-plugin';
  public static readonly version = '1.0.0';
  
  private options: LoggerPluginOptions;
  private context: PluginContext;
  
  constructor(options?: Partial<LoggerPluginOptions>) {
    // 设置默认选项
    this.options = {
      logLevel: 'info',
      prefix: '[FileChunk]',
      ...options
    };
  }
  
  // 初始化方法，在插件注册时调用
  async init(context: PluginContext): Promise<void> {
    this.context = context;
    this.context.logger.info(\`${this.options.prefix} 插件初始化成功\`);
    
    // 注册钩子函数
    this.context.on('beforeUpload', this.handleBeforeUpload.bind(this));
    this.context.on('afterUpload', this.handleAfterUpload.bind(this));
    this.context.on('error', this.handleError.bind(this));
  }
  
  // 插件卸载时的清理工作
  async destroy(): Promise<void> {
    // 移除所有监听器
    this.context.off('beforeUpload', this.handleBeforeUpload);
    this.context.off('afterUpload', this.handleAfterUpload);
    this.context.off('error', this.handleError);
    
    this.context.logger.info(\`${this.options.prefix} 插件已卸载\`);
  }
  
  // 钩子处理函数
  private handleBeforeUpload(_file: { name: string; size: number }): void {
    // 仅用于类型检查
  }
  
  private handleAfterUpload(_result: unknown): void {
    // 仅用于类型检查
  }
  
  private handleError(_error: { message: string }): void {
    // 仅用于类型检查
  }
}</code></pre>
          
          <h2>注册和使用插件</h2>
          
          <p>插件创建后，你可以这样注册和使用它：</p>
          
          <pre><code>import { FileChunkPro } from 'filechunk-pro';
import { LoggerPlugin } from './logger-plugin';

// 创建 FileChunk Pro 实例
const uploader = new FileChunkPro({
  endpoint: 'https://your-api.com/upload'
});

// 注册插件
uploader.registerPlugin(
  new LoggerPlugin({
    logLevel: 'info',
    prefix: '[自定义日志]'
  })
);

// 现在插件已启用，可以开始上传文件
uploader.upload(file);</code></pre>
          
          <p>在下一节中，我们将探讨<a href="plugin-lifecycle.html">插件生命周期</a>的详细内容。</p>
          `
        )
      },
      {
        title: '插件生命周期',
        fileName: 'plugin-lifecycle.html',
        content: this.getFormattedContent(
          '插件生命周期',
          `
          <h1>FileChunk Pro 插件生命周期</h1>
          
          <p>了解插件生命周期对于开发健壮、可靠的插件至关重要。本节将详细介绍 FileChunk Pro 插件的完整生命周期以及各个阶段可以执行的操作。</p>
          
          <h2>生命周期阶段</h2>
          
          <p>FileChunk Pro 插件的生命周期包括以下几个关键阶段：</p>
          
          <ol>
            <li><strong>注册 (Register)</strong>：插件实例被创建并注册到插件管理器</li>
            <li><strong>初始化 (Init)</strong>：调用插件的 <code>init</code> 方法，传入插件上下文</li>
            <li><strong>配置 (Configure)</strong>：应用用户定义的配置到插件</li>
            <li><strong>激活 (Activate)</strong>：插件被激活，开始正常工作</li>
            <li><strong>停用 (Deactivate)</strong>：暂时停用插件，但不卸载</li>
            <li><strong>卸载 (Uninstall)</strong>：完全卸载插件，清理资源</li>
          </ol>
          
          <h2>生命周期钩子</h2>
          
          <p>插件可以实现以下生命周期钩子方法来响应不同的生命周期事件：</p>
          
          <pre><code>export interface Plugin {
  // 必需方法
  init(context: PluginContext): Promise<void>;
  
  // 可选方法
  configure?(options: any): Promise<void>;
  activate?(): Promise<void>;
  deactivate?(): Promise<void>;
  destroy?(): Promise<void>;
}</code></pre>
          
          <h3>init 方法</h3>
          <p>初始化方法是每个插件必须实现的方法，在这个阶段，插件应该：</p>
          <ul>
            <li>存储插件上下文（<code>PluginContext</code>）</li>
            <li>注册事件监听器和钩子</li>
            <li>初始化内部状态</li>
            <li>但不要执行耗时操作，这会延迟启动过程</li>
          </ul>
          
          <h3>configure 方法</h3>
          <p>当用户提供插件配置时，会调用此方法：</p>
          <ul>
            <li>验证和处理配置选项</li>
            <li>更新插件的内部状态</li>
            <li>根据新配置调整行为</li>
          </ul>
          
          <h3>activate 方法</h3>
          <p>插件被激活时调用，此时插件应该：</p>
          <ul>
            <li>启动后台任务或服务</li>
            <li>分配资源</li>
            <li>开始监听事件</li>
          </ul>
          
          <h3>deactivate 方法</h3>
          <p>插件被临时停用时调用，此时插件应该：</p>
          <ul>
            <li>暂停后台任务</li>
            <li>释放不必要的资源</li>
            <li>保持状态以便重新激活</li>
          </ul>
          
          <h3>destroy 方法</h3>
          <p>插件被卸载时调用，此时插件必须：</p>
          <ul>
            <li>清理所有资源</li>
            <li>移除所有事件监听器</li>
            <li>完全恢复系统状态</li>
          </ul>
          
          <h2>示例：完整的生命周期实现</h2>
          
          <pre><code>import { Plugin, PluginContext } from '@filechunk-pro/core';

export class CompleteLifecyclePlugin implements Plugin {
  private context: PluginContext;
  private timer: NodeJS.Timeout | null = null;
  
  // 初始化
  async init(context: PluginContext): Promise<void> {
    this.context = context;
    this.context.logger.info('插件初始化');
    
    // 注册事件监听器
    this.context.on('fileAdded', this.handleFileAdded.bind(this));
  }
  
  // 配置
  async configure(options: any): Promise<void> {
    this.context.logger.info('应用插件配置', options);
    // 根据配置更新内部状态...
  }
  
  // 激活
  async activate(): Promise<void> {
    this.context.logger.info('插件已激活');
    
    // 启动定期任务
    this.timer = setInterval(() => {
      this.context.logger.debug('插件后台任务运行中...');
    }, 60000);
  }
  
  // 停用
  async deactivate(): Promise<void> {
    this.context.logger.info('插件已停用');
    
    // 暂停后台任务
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  
  // 卸载
  async destroy(): Promise<void> {
    this.context.logger.info('插件正在卸载');
    
    // 清理定时器
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    // 移除事件监听器
    this.context.off('fileAdded', this.handleFileAdded);
    
    this.context.logger.info('插件卸载完成');
  }
  
  // 事件处理器
  private handleFileAdded(_file: { name: string }): void {
    // 仅用于类型检查
  }
}</code></pre>
          
          <p>在<a href="plugin-api.html">下一节</a>中，我们将详细介绍插件 API 及其使用方法。</p>
          `
        )
      },
      {
        title: '插件 API',
        fileName: 'plugin-api.html',
        content: this.getFormattedContent(
          '插件 API',
          `
          <h1>FileChunk Pro 插件 API</h1>
          
          <p>FileChunk Pro 为插件开发者提供了丰富的 API，以便插件可以与核心系统进行交互并扩展其功能。本节将详细介绍插件可用的 API 以及它们的用法。</p>
          
          <h2>插件上下文 (PluginContext)</h2>
          
          <p>插件初始化时会收到一个 <code>PluginContext</code> 对象，它是插件与核心系统交互的主要接口。</p>
          
          <pre><code>export interface PluginContext {
  // 核心模块访问
  kernel: FileChunkKernel;                  // 访问微内核
  getModule<T>(id: string): T;              // 获取其他模块
  
  // 事件系统
  on(event: string, handler: Function): void;      // 注册事件监听器
  off(event: string, handler: Function): void;     // 移除事件监听器
  once(event: string, handler: Function): void;    // 注册一次性事件监听器
  emit(event: string, ...args: any[]): void;       // 触发事件
  
  // 配置系统
  getConfig<T>(key: string, defaultValue?: T): T;  // 获取配置
  setConfig<T>(key: string, value: T): void;       // 设置配置
  
  // 日志系统
  logger: Logger;                                  // 日志记录器
  
  // 钩子系统
  registerHook(name: string, callback: Function): void;  // 注册钩子
  removeHook(name: string, callback: Function): void;    // 移除钩子
}</code></pre>

          <h2>核心 API 使用示例</h2>
          
          <h3>1. 访问其他模块</h3>
          <p>插件可以通过上下文获取并使用其他模块的功能：</p>
          
          <pre><code>// 在插件内部
async init(context: PluginContext): Promise<void> {
  this.context = context;
  
  // 获取传输模块
  const transportModule = this.context.getModule<TransportModuleInterface>('transport');
  
  // 使用传输模块的功能
  transportModule.setChunkSize(2 * 1024 * 1024);
}</code></pre>
          
          <h3>2. 使用事件系统</h3>
          <p>插件可以监听和触发系统事件：</p>
          
          <pre><code>// 在插件内部
async init(context: PluginContext): Promise<void> {
  this.context = context;
  
  // 监听文件上传开始事件
  this.context.on('beforeUpload', this.handleBeforeUpload.bind(this));
  
  // 监听错误事件
  this.context.on('error', this.handleError.bind(this));
}

private handleBeforeUpload(_file: { name: string; size: number }): void {
  // 仅用于类型检查
}

private handleAfterUpload(_result: unknown): void {
  // 仅用于类型检查
}

private handleError(_error: { message: string }): void {
  // 仅用于类型检查
}
</code></pre>
          
          <h3>3. 使用配置系统</h3>
          <p>插件可以读取和修改系统配置：</p>
          
          <pre><code>async configure(options: any): Promise<void> {
  // 读取全局配置
  const globalChunkSize = this.context.getConfig<number>('transport.chunkSize', 1024 * 1024);
  
  // 根据插件选项设置配置
  if (options.useCustomChunkSize) {
    this.context.setConfig('transport.chunkSize', options.chunkSize);
  }
}</code></pre>
          
          <h3>4. 使用钩子系统</h3>
          <p>钩子系统允许插件在特定的处理流程中注入自定义逻辑：</p>
          
          <pre><code>async init(context: PluginContext): Promise<void> {
  this.context = context;
  
  // 注册文件处理钩子
  this.context.registerHook('processFile', this.processFile.bind(this));
}

// 文件处理钩子，可能会在上传前对文件进行处理
private processFile(file: File, next: (processedFile: File) => void): void {
  // 执行一些文件处理逻辑
  const processedFile = /* 处理文件 */ file;
  
  // 调用 next 继续处理链
  next(processedFile);
}</code></pre>
          
          <h2>插件间通信</h2>
          
          <p>插件之间可以通过事件系统进行通信：</p>
          
          <pre><code>// 插件 A
this.context.emit('pluginA:dataReady', { data: processedData });

// 插件 B
this.context.on('pluginA:dataReady', (payload) => {
  this.handleDataFromPluginA(payload.data);
});</code></pre>
          
          <h2>最佳实践</h2>
          
          <ul>
            <li>使用命名空间前缀（如 <code>pluginName:</code>）来避免事件名冲突</li>
            <li>总是在插件卸载时移除所有事件监听器</li>
            <li>遵循最小权限原则，只访问插件所需的功能</li>
            <li>使用类型化接口来获取模块，以获得更好的类型安全性和开发体验</li>
            <li>在修改全局配置前先备份原始值，在插件卸载时恢复</li>
          </ul>
          
          <p>在<a href="testing-plugins.html">下一节</a>中，我们将介绍如何测试你的插件。</p>
          `
        )
      },
      {
        title: '测试插件',
        fileName: 'testing-plugins.html',
        content: this.getFormattedContent(
          '测试插件',
          `
          <h1>测试 FileChunk Pro 插件</h1>
          
          <p>为你的插件编写测试是确保其质量和可靠性的重要步骤。本节将介绍测试 FileChunk Pro 插件的各种方法和最佳实践。</p>
          
          <h2>测试环境设置</h2>
          
          <p>首先，你需要为你的插件项目设置合适的测试环境：</p>
          
          <pre><code>// 安装测试工具
npm install --save-dev jest @types/jest ts-jest</code></pre>
          
          <p>配置 Jest 测试环境 (jest.config.js)：</p>
          
          <pre><code>module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};</code></pre>
          
          <h2>测试类型</h2>
          
          <h3>1. 单元测试</h3>
          
          <p>单元测试用于测试插件的独立功能单元：</p>
          
          <pre><code>// tests/unit/logger-plugin.test.ts
import { LoggerPlugin } from '../../src/logger-plugin';
import { createMockContext } from '../mocks/plugin-context.mock';

describe('LoggerPlugin', () => {
  let plugin: LoggerPlugin;
  let mockContext: any;
  
  beforeEach(() => {
    // 创建模拟上下文
    mockContext = createMockContext();
    
    // 初始化插件
    plugin = new LoggerPlugin({
      logLevel: 'info',
      prefix: '[Test]'
    });
  });
  
  test('应正确初始化', async () => {
    await plugin.init(mockContext);
    
    expect(mockContext.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Test] 插件初始化成功')
    );
  });
  
  test('应注册适当的事件监听器', async () => {
    await plugin.init(mockContext);
    
    expect(mockContext.on).toHaveBeenCalledWith('beforeUpload', expect.any(Function));
    expect(mockContext.on).toHaveBeenCalledWith('afterUpload', expect.any(Function));
    expect(mockContext.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
  
  test('应在销毁时移除事件监听器', async () => {
    await plugin.init(mockContext);
    await plugin.destroy();
    
    expect(mockContext.off).toHaveBeenCalledWith('beforeUpload', expect.any(Function));
    expect(mockContext.off).toHaveBeenCalledWith('afterUpload', expect.any(Function));
    expect(mockContext.off).toHaveBeenCalledWith('error', expect.any(Function));
  });
});</code></pre>
          
          <h3>2. 集成测试</h3>
          
          <p>集成测试验证插件与其他组件的交互：</p>
          
          <pre><code>// tests/integration/plugin-with-core.test.ts
import { FileChunkPro } from 'filechunk-pro';
import { LoggerPlugin } from '../../src/logger-plugin';

describe('LoggerPlugin 与 FileChunkPro 集成', () => {
  let uploader: FileChunkPro;
  let plugin: LoggerPlugin;
  
  beforeEach(() => {
    // 创建真实的 FileChunkPro 实例
    uploader = new FileChunkPro({
      endpoint: 'https://mock-api.example.com/upload'
    });
    
    // 创建插件实例
    plugin = new LoggerPlugin({
      logLevel: 'info'
    });
    
    // 注册插件
    uploader.registerPlugin(plugin);
  });
  
  test('应正确集成到上传流程', async () => {
    // 模拟文件
    const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
    
    // 模拟 fetch API
    global.fetch = jest.fn().mockImplementation(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })
    );
    
    // 执行上传
    const result = await uploader.upload(file);
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    
    // 验证插件正常工作（可以通过检查日志或其他副作用）
  });
});</code></pre>
          
          <h3>3. 模拟上下文</h3>
          
          <p>创建模拟的插件上下文对象以便测试：</p>
          
          <pre><code>// tests/mocks/plugin-context.mock.ts
export function createMockContext() {
  return {
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    getConfig: jest.fn().mockImplementation((key, defaultValue) => defaultValue),
    setConfig: jest.fn(),
    kernel: {
      // 微内核功能的模拟...
    },
    getModule: jest.fn().mockImplementation((id) => {
      // 返回模拟模块...
      return {};
    }),
    registerHook: jest.fn(),
    removeHook: jest.fn(),
  };
}</code></pre>
          
          <h2>测试特定场景</h2>
          
          <h3>异步操作测试</h3>
          
          <pre><code>test('应正确处理异步操作', async () => {
  // 为模拟上下文的方法创建返回 Promise 的版本
  mockContext.getModule.mockImplementation(() => ({
    processAsync: jest.fn().mockResolvedValue({ result: 'success' })
  }));
  
  await plugin.init(mockContext);
  
  // 触发使用异步操作的功能
  const result = await plugin.someAsyncMethod();
  
  expect(result).toEqual({ result: 'success' });
});</code></pre>
          
          <h3>生命周期测试</h3>
          
          <pre><code>test('应正确执行完整生命周期', async () => {
  await plugin.init(mockContext);
  await plugin.configure({ customOption: true });
  await plugin.activate();
  
  // 测试功能
  const file = new File(['test'], 'test.txt', { type: 'text/plain' });
  const handleFileAddedSpy = jest.spyOn(plugin as any, 'handleFileAdded');
  
  // 触发事件
  mockContext.emit('fileAdded', file);
  
  expect(handleFileAddedSpy).toHaveBeenCalledWith(file);
  
  // 测试停用和销毁
  await plugin.deactivate();
  await plugin.destroy();
  
  // 验证清理逻辑
  expect(mockContext.off).toHaveBeenCalled();
});</code></pre>
          
          <h2>性能测试</h2>
          
          <p>确保你的插件不会显著影响上传性能：</p>
          
          <pre><code>test('插件性能影响应在可接受范围内', async () => {
  // 创建大文件
  const largeFile = new File([new ArrayBuffer(5 * 1024 * 1024)], 'large.bin');
  
  // 不使用插件的上传
  const uploaderWithoutPlugin = new FileChunkPro({ endpoint: 'mock://api' });
  const startTimeWithout = Date.now();
  await uploaderWithoutPlugin.upload(largeFile);
  const timeWithout = Date.now() - startTimeWithout;
  
  // 使用插件的上传
  const uploaderWithPlugin = new FileChunkPro({ endpoint: 'mock://api' });
  uploaderWithPlugin.registerPlugin(new YourPlugin());
  const startTimeWith = Date.now();
  await uploaderWithPlugin.upload(largeFile);
  const timeWith = Date.now() - startTimeWith;
  
  // 性能影响不应超过 10%
  expect(timeWith).toBeLessThanOrEqual(timeWithout * 1.1);
});</code></pre>
          
          <h2>测试覆盖率</h2>
          
          <p>配置测试覆盖率报告：</p>
          
          <pre><code>// jest.config.js 添加
collectCoverage: true,
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/**/*.d.ts',
],
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80
  }
}</code></pre>
          
          <h2>持续集成</h2>
          
          <p>设置 GitHub Actions 工作流程：</p>
          
          <pre><code>// .github/workflows/test.yml
name: Test

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    - name: Use Node.js
      uses: actions/setup-node@v1
      with:
        node-version: '16.x'
    - name: Install dependencies
      run: npm ci
    - name: Run tests
      run: npm test
    - name: Upload coverage
      uses: codecov/codecov-action@v1</code></pre>
          
          <p>在<a href="publishing-plugins.html">下一节</a>中，我们将介绍如何发布和分享你的插件。</p>
          `
        )
      }
    ];
  }

  /**
   * 生成导航数据
   * @param sections 指南部分
   */
  private generateNavData(sections: PluginGuideSection[]): any {
    return {
      title: 'FileChunk Pro 插件开发指南',
      sections: sections.map(section => ({
        title: section.title,
        url: section.fileName
      }))
    };
  }

  /**
   * 生成索引页面
   * @param sections 指南部分
   */
  private generateIndexPage(sections: PluginGuideSection[]): string {
    const sectionLinks = sections
      .map(section => `<li><a href="${section.fileName}">${section.title}</a></li>`)
      .join('\n');

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FileChunk Pro 插件开发指南</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>FileChunk Pro</h2>
        <p>插件开发指南</p>
      </div>
      <nav>
        <ul>
          ${sectionLinks}
        </ul>
      </nav>
    </div>
    <div class="content">
      <h1>FileChunk Pro 插件开发指南</h1>
      
      <p>欢迎使用 FileChunk Pro 插件开发指南！本指南将帮助你开发自己的插件以扩展 FileChunk Pro 的功能。</p>
      
      <h2>指南内容</h2>
      
      <ul class="guide-list">
        ${sectionLinks}
      </ul>
      
            <h2>其他资源</h2>
      
      <ul>
        <li><a href="../api/index.html">API 参考文档</a></li>
        <li><a href="../guide/index.html">用户使用指南</a></li>
        <li><a href="../examples/index.html">代码示例</a></li>
        <li><a href="../architecture/index.html">架构文档</a></li>
      </ul>
    </div>
  </div>
  
  <script>
    // 简单导航脚本
    document.addEventListener('DOMContentLoaded', () => {
      const links = document.querySelectorAll('nav a');
      const url = window.location.href.split('/').pop();
      
      links.forEach(link => {
        if (link.getAttribute('href') === url) {
          link.classList.add('active');
        }
      });
    });
  </script>
</body>
</html>
    `.trim();
  }

  /**
   * 获取格式化内容
   * @param title 标题
   * @param content 内容
   * @returns 格式化后的HTML内容
   */
  private getFormattedContent(title: string, content: string): string {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - FileChunk Pro 插件开发指南</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>FileChunk Pro</h2>
        <p>插件开发指南</p>
      </div>
      <nav id="nav-placeholder">
        <!-- 导航将通过JavaScript加载 -->
      </nav>
    </div>
    <div class="content">
      ${content.trim()}
    </div>
  </div>
  
  <script>
    // 加载导航
    fetch('nav.json')
      .then(response => response.json())
      .then(data => {
        const nav = document.getElementById('nav-placeholder');
        if (nav) {
          const ul = document.createElement('ul');
          
          data.sections.forEach(section => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = section.url;
            a.textContent = section.title;
            
            // 标记当前页面
            if (window.location.href.endsWith(section.url)) {
              a.classList.add('active');
            }
            
            li.appendChild(a);
            ul.appendChild(li);
          });
          
          nav.appendChild(ul);
        }
      })
      .catch(error => console.error('加载导航失败:', error));
  </script>
</body>
</html>
    `.trim();
  }

  /**
   * 获取样式
   * @returns CSS样式内容
   */
  private getStyles(): string {
    return `
/* 插件指南样式 */
:root {
  --primary-color: #0066cc;
  --secondary-color: #4d94ff;
  --text-color: #333;
  --light-bg: #f8f9fa;
  --border-color: #e0e0e0;
  --code-bg: #282c34;
  --code-color: #abb2bf;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
  line-height: 1.6;
  color: var(--text-color);
  background-color: #fff;
}

.container {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 280px;
  background-color: var(--light-bg);
  border-right: 1px solid var(--border-color);
  padding: 20px 0;
  position: fixed;
  height: 100vh;
  overflow-y: auto;
}

.sidebar-header {
  padding: 0 20px 20px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-header h2 {
  margin-bottom: 5px;
  color: var(--primary-color);
}

nav ul {
  list-style: none;
  padding: 20px;
}

nav li {
  margin-bottom: 10px;
}

nav a {
  color: var(--text-color);
  text-decoration: none;
  display: block;
  padding: 8px 10px;
  border-radius: 4px;
  transition: all 0.3s ease;
}

nav a:hover {
  background-color: rgba(0, 102, 204, 0.1);
  color: var(--primary-color);
}

nav a.active {
  background-color: var(--primary-color);
  color: white;
}

.content {
  margin-left: 280px;
  padding: 30px;
  flex-grow: 1;
  max-width: 900px;
}

h1 {
  margin-bottom: 20px;
  color: var(--primary-color);
}

h2 {
  margin: 30px 0 15px;
  color: var(--primary-color);
}

h3 {
  margin: 20px 0 10px;
}

p, ul, ol {
  margin-bottom: 15px;
}

ul, ol {
  padding-left: 25px;
}

pre {
  background-color: var(--code-bg);
  color: var(--code-color);
  padding: 15px;
  border-radius: 5px;
  overflow-x: auto;
  margin: 15px 0;
}

code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 0.9em;
  padding: 0.2em 0.4em;
  background-color: rgba(0, 0, 0, 0.05);
  border-radius: 3px;
}

pre code {
  background-color: transparent;
  padding: 0;
}

a {
  color: var(--primary-color);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.guide-list {
  list-style: none;
  padding: 0;
}

.guide-list li {
  margin-bottom: 10px;
  padding: 10px;
  background-color: var(--light-bg);
  border-radius: 5px;
}

.guide-list a {
  display: block;
  font-weight: bold;
  font-size: 1.1em;
}

@media (max-width: 768px) {
  .container {
    flex-direction: column;
  }
  
  .sidebar {
    width: 100%;
    height: auto;
    position: relative;
  }
  
  .content {
    margin-left: 0;
    padding: 20px;
  }
}
    `.trim();
  }

  // 在类的末尾，添加这些方法的空实现
  private handleBeforeUpload(_file: { name: string; size: number }): void {
    // 仅用于类型检查
  }

  private handleAfterUpload(_result: unknown): void {
    // 仅用于类型检查
  }

  private handleError(_error: { message: string }): void {
    // 仅用于类型检查
  }

  private handleFileAdded(_file: { name: string }): void {
    // 仅用于类型检查
  }
}
