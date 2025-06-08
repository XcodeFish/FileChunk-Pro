import { CDNProviderManager } from './implementations/cdn-provider-manager';
import { CDNStatsAnalyzerImpl } from './implementations/cdn-stats-analyzer';
import {
  CDNUploadOptimizer,
  CDNUploadOptimizerOptions
} from './implementations/cdn-upload-optimizer';
import { CDNConfig, CDNProvider, CDNProviderType } from './interfaces';

/**
 * CDN集成插件
 * 提供多CDN提供商适配、CDN上传流程优化、CDN鉴权处理、CDN加速配置和CDN统计与分析功能
 */
export class CDNIntegrationPlugin {
  private providerManager: CDNProviderManager;
  private statsAnalyzer: CDNStatsAnalyzerImpl | null = null;
  private uploadOptimizer: CDNUploadOptimizer | null = null;

  /**
   * 构造函数
   * @param configs CDN配置列表
   * @param useMockData 是否使用模拟数据（开发环境下使用）
   */
  constructor(configs: CDNConfig[] = [], useMockData = false) {
    // 初始化CDN提供商管理器
    this.providerManager = new CDNProviderManager(configs);

    // 如果提供了配置并启用了统计，创建统计分析器
    if (configs.length > 0 && configs.some(config => config.enableStats)) {
      const statsConfig = configs.find(config => config.enableStats) || configs[0];
      this.statsAnalyzer = new CDNStatsAnalyzerImpl(statsConfig, useMockData);
    }
  }

  /**
   * 获取CDN提供商管理器
   * @returns CDN提供商管理器实例
   */
  public getProviderManager(): CDNProviderManager {
    return this.providerManager;
  }

  /**
   * 获取CDN统计分析器
   * @returns CDN统计分析器实例
   */
  public getStatsAnalyzer(): CDNStatsAnalyzerImpl {
    if (!this.statsAnalyzer) {
      throw new Error('CDN统计分析器未初始化，请确保配置中启用了enableStats选项');
    }
    return this.statsAnalyzer;
  }

  /**
   * 创建CDN上传优化器
   * @param options 上传优化选项
   * @returns CDN上传优化器实例
   */
  public createUploadOptimizer(options: CDNUploadOptimizerOptions = {}): CDNUploadOptimizer {
    this.uploadOptimizer = new CDNUploadOptimizer(this.providerManager, options);
    return this.uploadOptimizer;
  }

  /**
   * 获取CDN上传优化器
   * @returns CDN上传优化器实例
   */
  public getUploadOptimizer(): CDNUploadOptimizer {
    if (!this.uploadOptimizer) {
      // 创建默认优化器
      this.uploadOptimizer = new CDNUploadOptimizer(this.providerManager);
    }
    return this.uploadOptimizer;
  }

  /**
   * 注册CDN提供商
   * @param config CDN配置
   * @returns 注册的CDN提供商实例
   */
  public async registerProvider(config: CDNConfig): Promise<CDNProvider> {
    return this.providerManager.registerProvider(config);
  }

  /**
   * 设置默认CDN提供商
   * @param type 提供商类型
   * @param domain 可选的域名
   * @returns 是否设置成功
   */
  public setDefaultProvider(type: CDNProviderType, domain?: string): boolean {
    return this.providerManager.setDefaultProvider(type, domain);
  }

  /**
   * 获取默认CDN提供商
   * @returns 默认CDN提供商实例
   */
  public getDefaultProvider(): CDNProvider | null {
    return this.providerManager.getDefaultProvider();
  }

  /**
   * 销毁插件，释放资源
   */
  public destroy(): void {
    // 销毁上传优化器
    if (this.uploadOptimizer) {
      this.uploadOptimizer.destroy();
      this.uploadOptimizer = null;
    }

    // 清理其他资源...
  }
}

// 导出主要类和接口
export * from './interfaces';
export { CDNProviderManager } from './implementations/cdn-provider-manager';
export { CDNStatsAnalyzerImpl } from './implementations/cdn-stats-analyzer';
export {
  CDNUploadOptimizer,
  CDNUploadOptimizerOptions
} from './implementations/cdn-upload-optimizer';
