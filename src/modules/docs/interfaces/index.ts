/**
 * 文档模块接口定义
 */

import { Module as ModuleInterface } from '../../../types/modules';

/**
 * 文档生成选项
 */
export interface DocsGenerateOptions {
  /**
   * 输出目录
   */
  outputDir?: string;

  /**
   * 源代码目录
   */
  sourceDir?: string;

  /**
   * 是否生成详细的API文档
   */
  generateApiDocs?: boolean;

  /**
   * 是否包含私有成员
   */
  includePrivate?: boolean;

  /**
   * 是否包含内部成员
   */
  includeInternal?: boolean;

  /**
   * 自定义模板路径
   */
  templatePath?: string;

  /**
   * 特定模块或文件路径进行文档生成
   */
  include?: string[];

  /**
   * 排除特定模块或文件路径
   */
  exclude?: string[];
}

/**
 * 文档生成结果
 */
export interface DocsGenerationResult {
  /**
   * 生成是否成功
   */
  success: boolean;

  /**
   * 生成路径
   */
  outputPath: string;

  /**
   * 生成的文件列表
   */
  generatedFiles: string[];

  /**
   * 错误信息（如果有）
   */
  error?: string;
}

/**
 * 文档模块接口
 */
export interface DocsModuleInterface extends ModuleInterface {
  /**
   * 生成API文档
   * @param options 文档生成选项
   * @returns 文档生成结果
   */
  generateApiDocs(options?: DocsGenerateOptions): Promise<DocsGenerationResult>;

  /**
   * 生成使用指南
   * @param options 文档生成选项
   * @returns 文档生成结果
   */
  generateGuides(options?: DocsGenerateOptions): Promise<DocsGenerationResult>;

  /**
   * 生成架构文档
   * @param options 文档生成选项
   * @returns 文档生成结果
   */
  generateArchitectureDocs(options?: DocsGenerateOptions): Promise<DocsGenerationResult>;

  /**
   * 生成插件开发指南
   * @param options 文档生成选项
   * @returns 文档生成结果
   */
  generatePluginGuides(options?: DocsGenerateOptions): Promise<DocsGenerationResult>;

  /**
   * 生成示例代码
   * @param options 文档生成选项
   * @returns 文档生成结果
   */
  generateExamples(options?: DocsGenerateOptions): Promise<DocsGenerationResult>;

  /**
   * 生成完整文档（包含所有类型的文档）
   * @param options 文档生成选项
   * @returns 文档生成结果
   */
  generateAllDocs(options?: DocsGenerateOptions): Promise<DocsGenerationResult>;
}
