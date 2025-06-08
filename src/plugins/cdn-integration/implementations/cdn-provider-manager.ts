import {
  CDNProvider,
  CDNProviderType,
  CDNConfig,
  CDNUploadOptions,
  CDNResourceOptions,
  CDNRefreshResult,
  CDNPrefetchResult,
  CDNResourceInfo,
  CDNStatsOptions,
  CDNUsageStats,
  CDNDeleteResult
} from '../interfaces';
import { CloudflareProvider } from './providers/cloudflare-provider';
import { AliyunProvider } from './providers/aliyun-provider';
// import { AWSCloudFrontProvider } from './providers/aws-cloudfront-provider';
// import { FastlyProvider } from './providers/fastly-provider';
// import { AkamaiProvider } from './providers/akamai-provider';
// import { CustomProvider } from './providers/custom-provider';
// import { QCloudProvider } from './providers/qcloud-provider';

/**
 * CDN提供商管理器
 * 负责创建、管理和协调不同的CDN提供商实现
 */
export class CDNProviderManager {
  private providers: Map<string, CDNProvider> = new Map();
  private defaultProvider: CDNProvider | null = null;

  /**
   * 构造函数
   * @param configs CDN配置列表
   */
  constructor(configs: CDNConfig[] = []) {
    // 注册所有提供的配置
    for (const config of configs) {
      this.registerProvider(config);
    }
  }

  /**
   * 注册CDN提供商
   * @param config CDN配置
   * @returns 注册的CDN提供商实例
   */
  public async registerProvider(config: CDNConfig): Promise<CDNProvider> {
    const provider = this.createProvider(config);

    // 初始化提供商
    await provider.initialize(config);

    // 存储提供商实例
    const key = this.getProviderKey(config.provider, config.domain);
    this.providers.set(key, provider);

    // 如果没有默认提供商，将此设为默认
    if (!this.defaultProvider) {
      this.defaultProvider = provider;
    }

    return provider;
  }

  /**
   * 获取CDN提供商
   * @param type 提供商类型
   * @param domain 可选的域名（用于区分同一类型的不同实例）
   * @returns CDN提供商实例
   */
  public getProvider(type: CDNProviderType, domain?: string): CDNProvider | null {
    const key = this.getProviderKey(type, domain);
    return this.providers.get(key) || null;
  }

  /**
   * 获取默认CDN提供商
   * @returns 默认CDN提供商实例
   */
  public getDefaultProvider(): CDNProvider | null {
    return this.defaultProvider;
  }

  /**
   * 设置默认CDN提供商
   * @param type 提供商类型
   * @param domain 可选的域名
   * @returns 是否设置成功
   */
  public setDefaultProvider(type: CDNProviderType, domain?: string): boolean {
    const provider = this.getProvider(type, domain);
    if (provider) {
      this.defaultProvider = provider;
      return true;
    }
    return false;
  }

  /**
   * 移除CDN提供商
   * @param type 提供商类型
   * @param domain 可选的域名
   * @returns 是否移除成功
   */
  public removeProvider(type: CDNProviderType, domain?: string): boolean {
    const key = this.getProviderKey(type, domain);
    const isRemoved = this.providers.delete(key);

    // 如果移除的是默认提供商，则尝试设置新的默认提供商
    if (
      isRemoved &&
      this.defaultProvider &&
      this.getProviderKey(this.defaultProvider.type, domain) === key
    ) {
      this.defaultProvider =
        this.providers.size > 0 ? Array.from(this.providers.values())[0] : null;
    }

    return isRemoved;
  }

  /**
   * 获取所有注册的CDN提供商
   * @returns CDN提供商列表
   */
  public getAllProviders(): CDNProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 批量生成上传URL
   * @param options 上传选项
   * @returns 各提供商对应的上传URL映射
   */
  public async generateUploadUrls(options: CDNUploadOptions): Promise<Record<string, string>> {
    const results: Record<string, string> = {};

    for (const [key, provider] of this.providers.entries()) {
      try {
        const url = await provider.generateUploadUrl(options);
        results[key] = url;
      } catch (err) {
        console.error(`Failed to generate upload URL for provider ${key}:`, err);
      }
    }

    return results;
  }

  /**
   * 通过默认提供商生成上传URL
   * @param options 上传选项
   * @returns 上传URL
   */
  public async generateUploadUrl(options: CDNUploadOptions): Promise<string> {
    if (!this.defaultProvider) {
      throw new Error('No default CDN provider available');
    }

    return this.defaultProvider.generateUploadUrl(options);
  }

  /**
   * 通过默认提供商获取资源URL
   * @param key 资源键
   * @param options 资源选项
   * @returns 资源URL
   */
  public getResourceUrl(key: string, options?: CDNResourceOptions): string {
    if (!this.defaultProvider) {
      throw new Error('No default CDN provider available');
    }

    return this.defaultProvider.getResourceUrl(key, options);
  }

  /**
   * 通过默认提供商刷新资源缓存
   * @param resourceUrls 资源URL列表
   * @returns 刷新结果
   */
  public async refreshResource(resourceUrls: string[]): Promise<CDNRefreshResult> {
    if (!this.defaultProvider) {
      throw new Error('No default CDN provider available');
    }

    return this.defaultProvider.refreshResource(resourceUrls);
  }

  /**
   * 通过默认提供商预热资源
   * @param resourceUrls 资源URL列表
   * @returns 预热结果
   */
  public async prefetchResource(resourceUrls: string[]): Promise<CDNPrefetchResult> {
    if (!this.defaultProvider) {
      throw new Error('No default CDN provider available');
    }

    return this.defaultProvider.prefetchResource(resourceUrls);
  }

  /**
   * 通过默认提供商获取资源信息
   * @param key 资源键
   * @returns 资源信息
   */
  public async getResourceInfo(key: string): Promise<CDNResourceInfo> {
    if (!this.defaultProvider) {
      throw new Error('No default CDN provider available');
    }

    return this.defaultProvider.getResourceInfo(key);
  }

  /**
   * 通过默认提供商获取CDN使用统计
   * @param options 统计选项
   * @returns 使用统计数据
   */
  public async getUsageStats(options: CDNStatsOptions): Promise<CDNUsageStats> {
    if (!this.defaultProvider) {
      throw new Error('No default CDN provider available');
    }

    return this.defaultProvider.getUsageStats(options);
  }

  /**
   * 通过默认提供商删除资源
   * @param keys 资源键列表
   * @returns 删除结果
   */
  public async deleteResource(keys: string[]): Promise<CDNDeleteResult> {
    if (!this.defaultProvider) {
      throw new Error('No default CDN provider available');
    }

    return this.defaultProvider.deleteResource(keys);
  }

  /**
   * 创建CDN提供商实例
   * @param config CDN配置
   * @returns CDN提供商实例
   */
  private createProvider(config: CDNConfig): CDNProvider {
    switch (config.provider) {
      case CDNProviderType.CLOUDFLARE:
        return new CloudflareProvider();
      case CDNProviderType.ALIYUN:
        return new AliyunProvider();
      // 注释掉未实现的提供商
      // case CDNProviderType.QCLOUD:
      //   return new QCloudProvider();
      // case CDNProviderType.AWS_CLOUDFRONT:
      //   return new AWSCloudFrontProvider();
      // case CDNProviderType.FASTLY:
      //   return new FastlyProvider();
      // case CDNProviderType.AKAMAI:
      //   return new AkamaiProvider();
      // case CDNProviderType.CUSTOM:
      //   return new CustomProvider();
      default:
        throw new Error(`Unsupported CDN provider type: ${config.provider}`);
    }
  }

  /**
   * 生成提供商唯一键
   * @param type 提供商类型
   * @param domain 可选的域名
   * @returns 唯一键
   */
  private getProviderKey(type: CDNProviderType, domain?: string): string {
    return domain ? `${type}:${domain}` : type;
  }
}
