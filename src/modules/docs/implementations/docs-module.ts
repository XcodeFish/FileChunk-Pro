/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * 文档模块实现
 *
 * 提供API文档自动生成、使用指南编写、示例代码开发等功能
 */

import { BaseModule } from '../../../core/module-base';
import { FileChunkKernel } from '../../../core/kernel';
import { ModuleMetadata, ModuleStatus } from '../../../types/modules';
import { DocsGenerateOptions, DocsGenerationResult, DocsModuleInterface } from '../interfaces';
import { ApiDocsGenerator } from './api-docs-generator';
import { GuideGenerator } from './guide-generator';
import { ExamplesGenerator } from './examples-generator';
import { ArchitectureDocsGenerator } from './architecture-docs-generator';
import { PluginGuideGenerator } from './plugin-guide-generator';
import path from 'path';
import fs from 'fs';

/**
 * 文档模块实现类
 */
export class DocsModule extends BaseModule implements DocsModuleInterface {
  private apiDocsGenerator: ApiDocsGenerator;
  private guideGenerator: GuideGenerator;
  private examplesGenerator: ExamplesGenerator;
  private architectureDocsGenerator: ArchitectureDocsGenerator;
  private pluginGuideGenerator: PluginGuideGenerator;

  /**
   * 构造函数
   * @param config 模块配置
   */
  constructor(config?: Record<string, unknown>) {
    // 定义模块元数据
    const metadata: ModuleMetadata = {
      id: 'docs',
      name: '文档生成模块',
      version: '1.0.0',
      description: '提供API文档自动生成、使用指南编写、示例代码开发等功能',
      author: 'FileChunk Pro团队',
      dependencies: []
    };

    super(metadata, config);

    // 初始化生成器
    this.apiDocsGenerator = new ApiDocsGenerator();
    this.guideGenerator = new GuideGenerator();
    this.examplesGenerator = new ExamplesGenerator();
    this.architectureDocsGenerator = new ArchitectureDocsGenerator({
      outputDir: 'docs/architecture'
    });
    this.pluginGuideGenerator = new PluginGuideGenerator();
  }

  /**
   * 初始化时调用
   */
  protected onInit(): void {
    this.logInfo('文档模块已初始化');
  }

  /**
   * 启动模块
   */
  async start(): Promise<void> {
    this._status = ModuleStatus.STARTING;

    try {
      await this.onBeforeStart();
      await this.onStart();

      this._status = ModuleStatus.RUNNING;
      this.logInfo('文档模块已启动');

      await this.onAfterStart();
    } catch (error) {
      this._status = ModuleStatus.ERROR;
      this.logError('文档模块启动失败', error as Error);
      throw error;
    }
  }

  /**
   * 停止模块
   */
  async stop(): Promise<void> {
    this._status = ModuleStatus.STOPPING;

    try {
      await this.onBeforeStop();
      await this.onStop();

      this._status = ModuleStatus.STOPPED;
      this.logInfo('文档模块已停止');

      await this.onAfterStop();
    } catch (error) {
      this._status = ModuleStatus.ERROR;
      this.logError('文档模块停止失败', error as Error);
      throw error;
    }
  }

  /**
   * 处理默认选项
   */
  private getDefaultOptions(options?: DocsGenerateOptions): DocsGenerateOptions {
    return {
      outputDir: options?.outputDir || 'docs',
      sourceDir: options?.sourceDir || 'src',
      generateApiDocs: options?.generateApiDocs !== undefined ? options.generateApiDocs : true,
      includePrivate: options?.includePrivate || false,
      includeInternal: options?.includeInternal || false,
      include: options?.include || [],
      exclude: options?.exclude || []
    };
  }

  /**
   * 确保输出目录存在
   */
  private ensureOutputDir(outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  /**
   * 记录日志
   */
  private logInfo(message: string): void {
    if (this._eventBus) {
      this._eventBus.emit('docs.info', { message });
    }
    console.log(`[DocsModule] ${message}`);
  }

  /**
   * 记录错误
   */
  private logError(message: string, error?: Error): void {
    if (this._eventBus) {
      this._eventBus.emit('docs.error', { message, error });
    }
    console.error(`[DocsModule] ${message}`, error);
  }

  /**
   * 生成API文档
   */
  async generateApiDocs(options?: DocsGenerateOptions): Promise<DocsGenerationResult> {
    try {
      this.logInfo('开始生成API文档');
      const mergedOptions = this.getDefaultOptions(options);
      const apiOutputDir = path.join(mergedOptions.outputDir!, 'api');

      this.ensureOutputDir(apiOutputDir);

      const result = await this.apiDocsGenerator.generate({
        ...mergedOptions,
        outputDir: apiOutputDir
      });

      this.logInfo(`API文档生成完成，输出至: ${apiOutputDir}`);
      return {
        success: true,
        outputPath: apiOutputDir,
        generatedFiles: result.files
      };
    } catch (error) {
      this.logError('API文档生成失败', error as Error);
      return {
        success: false,
        outputPath: options?.outputDir || 'docs/api',
        generatedFiles: [],
        error: (error as Error).message
      };
    }
  }

  /**
   * 生成使用指南
   */
  async generateGuides(options?: DocsGenerateOptions): Promise<DocsGenerationResult> {
    try {
      this.logInfo('开始生成使用指南');
      const mergedOptions = this.getDefaultOptions(options);
      const guideOutputDir = path.join(mergedOptions.outputDir!, 'guide');

      this.ensureOutputDir(guideOutputDir);

      const result = await this.guideGenerator.generate({
        ...mergedOptions,
        outputDir: guideOutputDir
      });

      this.logInfo(`使用指南生成完成，输出至: ${guideOutputDir}`);
      return {
        success: true,
        outputPath: guideOutputDir,
        generatedFiles: result.files
      };
    } catch (error) {
      this.logError('使用指南生成失败', error as Error);
      return {
        success: false,
        outputPath: options?.outputDir || 'docs/guide',
        generatedFiles: [],
        error: (error as Error).message
      };
    }
  }

  /**
   * 生成架构文档
   */
  async generateArchitectureDocs(options?: DocsGenerateOptions): Promise<DocsGenerationResult> {
    try {
      this.logInfo('开始生成架构文档');
      const mergedOptions = this.getDefaultOptions(options);
      const archOutputDir = path.join(mergedOptions.outputDir!, 'architecture');

      this.ensureOutputDir(archOutputDir);

      const result = await this.architectureDocsGenerator.generate();

      this.logInfo(`架构文档生成完成，输出至: ${archOutputDir}`);
      return {
        success: true,
        outputPath: archOutputDir,
        generatedFiles: result.generatedFiles || []
      };
    } catch (error) {
      this.logError('架构文档生成失败', error as Error);
      return {
        success: false,
        outputPath: options?.outputDir || 'docs/architecture',
        generatedFiles: [],
        error: (error as Error).message
      };
    }
  }

  /**
   * 生成插件开发指南
   */
  async generatePluginGuides(options?: DocsGenerateOptions): Promise<DocsGenerationResult> {
    try {
      this.logInfo('开始生成插件开发指南');
      const mergedOptions = this.getDefaultOptions(options);
      const pluginOutputDir = path.join(mergedOptions.outputDir!, 'plugin');

      this.ensureOutputDir(pluginOutputDir);

      const result = await this.pluginGuideGenerator.generate({
        ...mergedOptions,
        outputDir: pluginOutputDir
      });

      this.logInfo(`插件开发指南生成完成，输出至: ${pluginOutputDir}`);
      return {
        success: true,
        outputPath: pluginOutputDir,
        generatedFiles: result.files
      };
    } catch (error) {
      this.logError('插件开发指南生成失败', error as Error);
      return {
        success: false,
        outputPath: options?.outputDir || 'docs/plugin',
        generatedFiles: [],
        error: (error as Error).message
      };
    }
  }

  /**
   * 生成示例代码
   */
  async generateExamples(options?: DocsGenerateOptions): Promise<DocsGenerationResult> {
    try {
      this.logInfo('开始生成示例代码');
      const mergedOptions = this.getDefaultOptions(options);
      const examplesOutputDir = path.join(mergedOptions.outputDir!, 'examples');

      this.ensureOutputDir(examplesOutputDir);

      const result = await this.examplesGenerator.generate({
        ...mergedOptions,
        outputDir: examplesOutputDir
      });

      this.logInfo(`示例代码生成完成，输出至: ${examplesOutputDir}`);
      return {
        success: true,
        outputPath: examplesOutputDir,
        generatedFiles: result.files
      };
    } catch (error) {
      this.logError('示例代码生成失败', error as Error);
      return {
        success: false,
        outputPath: options?.outputDir || 'docs/examples',
        generatedFiles: [],
        error: (error as Error).message
      };
    }
  }

  /**
   * 生成所有文档
   */
  async generateAllDocs(options?: DocsGenerateOptions): Promise<DocsGenerationResult> {
    try {
      this.logInfo('开始生成所有文档');
      const mergedOptions = this.getDefaultOptions(options);

      this.ensureOutputDir(mergedOptions.outputDir!);

      // 并行生成所有文档
      const [apiResult, guideResult, archResult, pluginResult, examplesResult] = await Promise.all([
        this.generateApiDocs(mergedOptions),
        this.generateGuides(mergedOptions),
        this.generateArchitectureDocs(mergedOptions),
        this.generatePluginGuides(mergedOptions),
        this.generateExamples(mergedOptions)
      ]);

      const allFiles = [
        ...apiResult.generatedFiles,
        ...guideResult.generatedFiles,
        ...archResult.generatedFiles,
        ...pluginResult.generatedFiles,
        ...examplesResult.generatedFiles
      ];

      this.logInfo(`所有文档生成完成，输出至: ${mergedOptions.outputDir}`);

      // 生成主页
      const indexPath = path.join(mergedOptions.outputDir!, 'index.html');
      const indexContent = this.generateIndexPage(mergedOptions.outputDir!);
      fs.writeFileSync(indexPath, indexContent);

      return {
        success: true,
        outputPath: mergedOptions.outputDir!,
        generatedFiles: [...allFiles, indexPath]
      };
    } catch (error) {
      this.logError('所有文档生成失败', error as Error);
      return {
        success: false,
        outputPath: options?.outputDir || 'docs',
        generatedFiles: [],
        error: (error as Error).message
      };
    }
  }

  /**
   * 生成文档主页
   */
  private generateIndexPage(outputDir: string): string {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FileChunk Pro 文档</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      border-bottom: 1px solid #eee;
      margin-bottom: 30px;
      padding-bottom: 20px;
    }
    h1 {
      font-size: 2.5rem;
      font-weight: 600;
      margin-bottom: 10px;
      color: #2c3e50;
    }
    h2 {
      font-size: 1.8rem;
      font-weight: 500;
      margin: 1.5em 0 0.8em;
      color: #2c3e50;
    }
    p {
      margin-bottom: 1em;
    }
    .container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 20px;
    }
    .card {
      border: 1px solid #e1e4e8;
      border-radius: 6px;
      padding: 20px;
      transition: box-shadow 0.3s ease, transform 0.3s ease;
    }
    .card:hover {
      box-shadow: 0 8px 16px rgba(0,0,0,0.1);
      transform: translateY(-2px);
    }
    .card h3 {
      margin-top: 0;
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
      color: #0366d6;
    }
    a {
      color: #0366d6;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .description {
      font-size: 14px;
      color: #586069;
    }
    footer {
      margin-top: 40px;
      border-top: 1px solid #eee;
      padding-top: 20px;
      font-size: 14px;
      color: #586069;
    }
  </style>
</head>
<body>
  <header>
    <h1>FileChunk Pro 文档中心</h1>
    <p>高性能、跨平台的大文件上传解决方案，支持React、Vue、原生JS和小程序环境</p>
  </header>
  
  <main>
    <div class="container">
      <div class="card">
        <h3><a href="./api/index.html">API文档</a></h3>
        <div class="description">
          详细的API参考文档，包含所有类、接口、方法和属性的完整说明。
        </div>
      </div>
      
      <div class="card">
        <h3><a href="./guide/index.html">使用指南</a></h3>
        <div class="description">
          从基础到高级的使用教程，包含丰富的代码示例和最佳实践。
        </div>
      </div>
      
      <div class="card">
        <h3><a href="./architecture/index.html">架构文档</a></h3>
        <div class="description">
          深入了解FileChunk Pro的微内核架构设计、模块化系统和扩展机制。
        </div>
      </div>
      
      <div class="card">
        <h3><a href="./plugin/index.html">插件开发指南</a></h3>
        <div class="description">
          学习如何开发自定义插件，扩展FileChunk Pro的功能。
        </div>
      </div>
      
      <div class="card">
        <h3><a href="./examples/index.html">代码示例</a></h3>
        <div class="description">
          包含各种使用场景的完整代码示例，从简单上传到复杂应用。
        </div>
      </div>
    </div>
    
    <h2>快速开始</h2>
    <p>
      访问 <a href="./guide/getting-started.html">快速开始指南</a> 了解如何在5分钟内将FileChunk Pro集成到你的项目中。
    </p>
  </main>
  
  <footer>
    <p>FileChunk Pro &copy; ${new Date().getFullYear()}. 使用TypeScript构建的现代文件上传库。</p>
  </footer>
</body>
</html>
    `.trim();
  }
}
