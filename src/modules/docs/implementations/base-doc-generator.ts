import * as fs from 'fs';
import { DocsGenerateOptions, DocsGenerationResult } from '../interfaces';

/**
 * 文档生成器基类
 * 提供所有文档生成器共用的基础功能
 */
export abstract class BaseDocGenerator {
  /**
   * 文档生成选项
   */
  protected options: DocsGenerateOptions;

  /**
   * 记录生成的文件列表
   */
  private generatedFiles: string[] = [];

  /**
   * 日志记录器
   */
  protected logger = {
    info: (message: string, ...args: any[]) => {
      console.log(`[INFO] ${message}`, ...args);
    },
    error: (message: string, ...args: any[]) => {
      console.error(`[ERROR] ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
      console.warn(`[WARN] ${message}`, ...args);
    },
    debug: (message: string, ...args: any[]) => {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  };

  /**
   * 构造函数
   * @param options 文档生成选项
   */
  constructor(options: DocsGenerateOptions) {
    this.options = {
      outputDir: 'docs',
      ...options
    };
  }

  /**
   * 生成文档（抽象方法，子类必须实现）
   */
  public abstract generate(): Promise<DocsGenerationResult>;

  /**
   * 确保目录存在，如果不存在则创建
   * @param dir 目录路径
   */
  protected async ensureDir(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }

  /**
   * 渲染模板
   * @param templateName 模板名称
   * @param data 模板数据
   * @returns 渲染后的内容
   */
  protected renderTemplate(templateName: string, data: Record<string, any>): string {
    // 简单模板渲染实现
    // 实际项目中可能使用更复杂的模板引擎如 Handlebars, EJS 等
    try {
      // 这里仅作为示例，实际实现应该加载真实模板
      return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${data.title || 'FileChunk Pro 文档'}</title>
  <meta name="description" content="${data.description || ''}">
  ${(data.stylesheets || []).map((s: string) => `<link rel="stylesheet" href="${s}">`).join('\n  ')}
</head>
<body>
  <header>
    <h1>${data.title || 'FileChunk Pro 文档'}</h1>
    ${data.description ? `<p>${data.description}</p>` : ''}
  </header>
  <main>
    ${this.renderTemplateContent(templateName, data)}
  </main>
  <footer>
    <p>© ${new Date().getFullYear()} FileChunk Pro</p>
  </footer>
  ${(data.scripts || []).map((s: string) => `<script src="${s}"></script>`).join('\n  ')}
</body>
</html>
      `.trim();
    } catch (error) {
      this.logger.error(`模板渲染失败: ${templateName}`, error);
      return `<html><body><h1>模板渲染错误</h1><p>${error}</p></body></html>`;
    }
  }

  /**
   * 根据模板名称渲染不同内容
   * @param templateName 模板名称
   * @param data 模板数据
   * @returns 渲染后的内容
   */
  private renderTemplateContent(templateName: string, data: Record<string, any>): string {
    // 根据不同模板类型渲染内容
    // 实际项目中应该加载真实模板文件

    switch (templateName) {
      case 'architecture/index':
        return this.renderArchitectureIndex(data);
      case 'architecture/core-architecture':
        return this.renderCoreArchitecture(data);
      case 'architecture/module-relationships':
        return this.renderModuleRelationships(data);
      case 'architecture/data-flow':
        return this.renderDataFlow(data);
      case 'architecture/extension-points':
        return this.renderExtensionPoints(data);
      case 'architecture/diagrams':
        return this.renderDiagrams(data);
      default:
        return `<div class="error">未找到模板: ${templateName}</div>`;
    }
  }

  /**
   * 渲染架构索引模板
   */
  private renderArchitectureIndex(data: Record<string, any>): string {
    return `
      <div class="architecture-index">
        ${
          data.sections
            ?.map(
              (section: any) => `
          <div class="section-card">
            <h2>${section.title}</h2>
            <p>${section.description}</p>
            <a href="${section.url}" class="view-button">查看详情</a>
          </div>
        `
            )
            .join('') || ''
        }
      </div>
    `;
  }

  /**
   * 渲染核心架构模板
   */
  private renderCoreArchitecture(data: Record<string, any>): string {
    return `
      <div class="architecture-content">
        ${
          data.sections
            ?.map(
              (section: any) => `
          <section id="${section.id}" class="content-section">
            <h2>${section.title}</h2>
            <div class="section-content">${section.content}</div>
          </section>
        `
            )
            .join('') || ''
        }
      </div>
    `;
  }

  /**
   * 渲染模块关系模板
   */
  private renderModuleRelationships(data: Record<string, any>): string {
    return `
      <div class="module-relationships">
        ${
          data.modules
            ?.map(
              (module: any) => `
          <div class="module-relationship">
            <div class="module-name">${module.name}</div>
            <div class="relationship-details">
              <div class="dependencies">
                <h3>依赖:</h3>
                <ul>
                  ${module.dependencies.map((dep: string) => `<li>${dep}</li>`).join('') || '<li>无依赖</li>'}
                </ul>
              </div>
              <div class="dependents">
                <h3>被依赖:</h3>
                <ul>
                  ${module.dependents.map((dep: string) => `<li>${dep}</li>`).join('') || '<li>无模块依赖此模块</li>'}
                </ul>
              </div>
            </div>
          </div>
        `
            )
            .join('') || ''
        }
      </div>
    `;
  }

  /**
   * 渲染数据流模板
   */
  private renderDataFlow(data: Record<string, any>): string {
    return `
      <div class="data-flows">
        ${
          data.flows
            ?.map(
              (flow: any) => `
          <div id="${flow.id}" class="data-flow">
            <h2>${flow.title}</h2>
            <div class="flow-steps">
              ${
                flow.steps
                  .map(
                    (step: string, index: number) => `
                <div class="data-flow-step">
                  <div class="step-number">${index + 1}</div>
                  <div class="step-content">${step}</div>
                </div>
              `
                  )
                  .join('') || ''
              }
            </div>
          </div>
        `
            )
            .join('') || ''
        }
      </div>
    `;
  }

  /**
   * 渲染扩展点模板
   */
  private renderExtensionPoints(data: Record<string, any>): string {
    return `
      <div class="extension-points">
        ${
          data.extensionPoints
            ?.map(
              (point: any) => `
          <div id="${point.id}" class="extension-point">
            <h2>${point.title}</h2>
            <p>${point.description}</p>
            <pre><code>${point.example}</code></pre>
          </div>
        `
            )
            .join('') || ''
        }
      </div>
    `;
  }

  /**
   * 渲染图表模板
   */
  private renderDiagrams(data: Record<string, any>): string {
    return `
      <div class="diagrams">
        ${
          data.diagrams
            ?.map(
              (diagram: any) => `
          <div id="${diagram.id}" class="architecture-diagram">
            <h2>${diagram.title}</h2>
            ${
              diagram.type === 'mermaid'
                ? `<div class="mermaid">${diagram.code}</div>`
                : `<pre><code>${diagram.code}</code></pre>`
            }
          </div>
        `
            )
            .join('') || ''
        }
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            if (typeof mermaid !== 'undefined') {
              mermaid.initialize({ startOnLoad: true });
            }
          });
        </script>
      </div>
    `;
  }

  /**
   * 添加生成的文件到列表
   * @param filePath 文件路径
   */
  protected addGeneratedFile(filePath: string): void {
    this.generatedFiles.push(filePath);
  }

  /**
   * 获取所有生成的文件列表
   * @returns 文件路径列表
   */
  protected getGeneratedFiles(): string[] {
    return [...this.generatedFiles];
  }
}
