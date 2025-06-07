/**
 * API文档生成器
 *
 * 基于TypeDoc生成API文档
 */
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { DocsGenerateOptions } from '../interfaces';

/**
 * 文档生成结果接口
 */
export interface GeneratorResult {
  success: boolean;
  files: string[];
  error?: string;
}

/**
 * API文档生成器类
 */
export class ApiDocsGenerator {
  /**
   * 生成API文档
   *
   * @param options 生成选项
   * @returns 生成结果
   */
  async generate(options: DocsGenerateOptions): Promise<GeneratorResult> {
    try {
      const sourceDir = options.sourceDir || 'src';
      const outputDir = options.outputDir || 'docs/api';

      // 生成TypeDoc配置文件
      const typedocConfig = this.generateTypedocConfig({
        ...options,
        entryPoints: [sourceDir],
        out: outputDir
      });

      const configPath = path.join(process.cwd(), 'typedoc.json');
      fs.writeFileSync(configPath, JSON.stringify(typedocConfig, null, 2));

      // 执行TypeDoc命令
      await this.executeTypeDoc();

      // 增加自定义样式和脚本
      this.enhanceGeneratedDocs(outputDir);

      // 获取生成的文件列表
      const files = this.getGeneratedFiles(outputDir);

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
   * 生成TypeDoc配置
   */
  private generateTypedocConfig(options: Record<string, any>): Record<string, any> {
    return {
      entryPoints: options.entryPoints || ['src'],
      out: options.out || 'docs/api',
      name: 'FileChunk Pro API文档',
      includeVersion: true,
      excludePrivate: !options.includePrivate,
      excludeInternal: !options.includeInternal,
      excludeExternals: true,
      excludeNotDocumented: false,
      disableSources: false,
      plugin: ['typedoc-plugin-markdown'],
      theme: options.templatePath || 'default',
      readme: 'README.md',
      exclude: ['node_modules/**/*', ...(options.exclude || [])],
      categorizeByGroup: true,
      categoryOrder: ['Core', 'Modules', 'Platforms', 'Utils', 'Types', '*'],
      sort: ['source-order'],
      tsconfig: 'tsconfig.json'
    };
  }

  /**
   * 执行TypeDoc命令
   */
  private executeTypeDoc(): Promise<void> {
    return new Promise((resolve, reject) => {
      const typedoc = spawn('npx', ['typedoc', '--options', 'typedoc.json'], {
        stdio: 'inherit',
        shell: true
      });

      typedoc.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`TypeDoc 进程退出，错误码: ${code}`));
        }
      });

      typedoc.on('error', err => {
        reject(new Error(`TypeDoc 执行错误: ${err.message}`));
      });
    });
  }

  /**
   * 增强生成的文档
   */
  private enhanceGeneratedDocs(outputDir: string): void {
    // 添加自定义CSS
    const cssPath = path.join(outputDir, 'assets/custom.css');
    const cssDir = path.dirname(cssPath);

    if (!fs.existsSync(cssDir)) {
      fs.mkdirSync(cssDir, { recursive: true });
    }

    fs.writeFileSync(cssPath, this.getCustomCSS());

    // 修改生成的index.html文件，添加自定义CSS引用
    const indexPath = path.join(outputDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      let indexContent = fs.readFileSync(indexPath, 'utf8');
      indexContent = indexContent.replace(
        '</head>',
        '<link rel="stylesheet" href="assets/custom.css">\n</head>'
      );
      fs.writeFileSync(indexPath, indexContent);
    }
  }

  /**
   * 获取生成的文件列表
   */
  private getGeneratedFiles(dir: string): string[] {
    const results: string[] = [];

    const walk = (currentDir: string) => {
      const items = fs.readdirSync(currentDir);

      for (const item of items) {
        const itemPath = path.join(currentDir, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          walk(itemPath);
        } else {
          results.push(itemPath);
        }
      }
    };

    if (fs.existsSync(dir)) {
      walk(dir);
    }

    return results;
  }

  /**
   * 获取自定义CSS
   */
  private getCustomCSS(): string {
    return `
/* FileChunk Pro 自定义文档样式 */
:root {
  --light-color-primary: #3a86ff;
  --light-color-secondary: #4361ee;
  --light-color-accent: #4cc9f0;
  --light-color-background: #ffffff;
  --light-color-text: #333333;
  --light-color-heading: #213547;
  --light-color-border: #e2e8f0;
  
  --dark-color-primary: #4cc9f0;
  --dark-color-secondary: #4361ee;
  --dark-color-accent: #3a86ff;
  --dark-color-background: #1a1a1a;
  --dark-color-text: #e2e8f0;
  --dark-color-heading: #f0f0f0;
  --dark-color-border: #333333;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

.tsd-page-toolbar {
  background-color: var(--light-color-primary);
}

.tsd-page-title h1 {
  color: var(--light-color-heading);
  font-weight: 600;
}

.tsd-navigation.primary a {
  transition: color 0.2s ease;
}

.tsd-navigation.primary a:hover {
  color: var(--light-color-primary);
}

code {
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  border-radius: 3px;
  padding: 2px 5px;
}

.tsd-member .tsd-anchor + h3 {
  font-weight: 600;
}

@media (prefers-color-scheme: dark) {
  body {
    color: var(--dark-color-text);
    background-color: var(--dark-color-background);
  }
  
  .tsd-page-toolbar {
    background-color: var(--dark-color-primary);
  }
  
  .tsd-page-title h1 {
    color: var(--dark-color-heading);
  }
  
  code {
    background-color: #2a2a2a;
  }
}
    `.trim();
  }
}
