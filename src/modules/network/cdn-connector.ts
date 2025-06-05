import { EventEmitter } from 'events';

/**
 * CDN提供商配置接口
 */
export interface CDNProvider {
  /** 提供商标识 */
  id: string;
  /** 提供商名称 */
  name: string;
  /** CDN基础URL */
  baseUrl: string;
  /** API端点 */
  apiEndpoint?: string;
  /** API密钥 */
  apiKey?: string;
  /** 认证令牌 */
  authToken?: string;
  /** 失败次数 */
  failureCount?: number;
  /** 上次失败时间 */
  lastFailureTime?: number;
  /** 上次检查时间 */
  lastCheckTime?: number;
  /** 状态：'active', 'degraded', 'offline' */
  status?: 'active' | 'degraded' | 'offline';
  /** 额外配置项 */
  options?: Record<string, any>;
}

/**
 * CDN失效检查结果
 */
export interface CDNHealthCheckResult {
  /** CDN提供商ID */
  providerId: string;
  /** 是否可用 */
  isAvailable: boolean;
  /** 延迟时间(ms) */
  latency?: number;
  /** 状态码 */
  statusCode?: number;
  /** 错误信息 */
  error?: string;
  /** 检查时间 */
  timestamp: number;
}

/**
 * CDN连接器配置选项
 */
export interface CDNConnectorOptions {
  /** CDN提供商列表 */
  providers: CDNProvider[];
  /** 自动检测失效 */
  autoDetectInvalidation?: boolean;
  /** 健康检查间隔(毫秒) */
  healthCheckInterval?: number;
  /** 故障转移阈值(失败次数) */
  failoverThreshold?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟(毫秒) */
  retryDelay?: number;
  /** 最大重试延迟(毫秒) */
  maxRetryDelay?: number;
  /** 退避因子 */
  backoffFactor?: number;
  /** 状态刷新时间(毫秒) */
  statusRefreshInterval?: number;
  /** 缓存刷新URL */
  cacheInvalidationEndpoint?: string;
  /** 健康检查路径 */
  healthCheckPath?: string;
  /** 测试文件路径 */
  testFilePath?: string;
  /** 启用日志 */
  enableLogging?: boolean;
}

/**
 * CDN连接器类
 * 负责管理CDN连接、检测CDN失效并进行处理
 */
export class CDNConnector {
  private options: CDNConnectorOptions;
  private providers: Map<string, CDNProvider> = new Map();
  private activeCDN: string | null = null;
  private backupCDN: string | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private statusRefreshTimer: NodeJS.Timeout | null = null;
  private eventEmitter: EventEmitter = new EventEmitter();
  private kernel: any;
  private isMonitoring: boolean = false;
  private providerFailureCounters: Map<string, number> = new Map();
  private invalidationStatus: Map<string, { urls: string[]; timestamp: number }> = new Map();

  /**
   * 创建CDN连接器实例
   * @param options CDN连接器配置选项
   */
  constructor(options: CDNConnectorOptions) {
    this.options = {
      autoDetectInvalidation: true,
      healthCheckInterval: 30000, // 30秒
      failoverThreshold: 3, // 3次失败触发故障转移
      maxRetries: 5,
      retryDelay: 1000, // 1秒
      maxRetryDelay: 30000, // 30秒
      backoffFactor: 2,
      statusRefreshInterval: 300000, // 5分钟
      healthCheckPath: '/health',
      testFilePath: '/test-file.txt',
      enableLogging: false,
      ...options
    };

    // 初始化CDN提供商
    this.initProviders();
  }

  /**
   * 初始化模块
   * @param kernel 微内核实例
   */
  public init(kernel: any): void {
    this.kernel = kernel;
    this.log('CDN连接器初始化');

    // 如果配置了自动检测，启动监控
    if (this.options.autoDetectInvalidation) {
      this.startMonitoring();
    }
  }

  /**
   * 初始化CDN提供商列表
   */
  private initProviders(): void {
    // 清空现有提供商
    this.providers.clear();
    this.providerFailureCounters.clear();

    // 添加所有提供商
    for (const provider of this.options.providers) {
      this.providers.set(provider.id, {
        ...provider,
        failureCount: 0,
        lastCheckTime: 0,
        status: 'active'
      });
      this.providerFailureCounters.set(provider.id, 0);
    }

    // 设置默认活跃CDN
    if (this.options.providers.length > 0) {
      this.activeCDN = this.options.providers[0].id;
    }

    // 如果有备用CDN，设置备用
    if (this.options.providers.length > 1) {
      this.backupCDN = this.options.providers[1].id;
    }
  }

  /**
   * 开始监控CDN状态
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.log('开始监控CDN状态');

    // 立即执行一次健康检查
    this.checkAllCDNHealth();

    // 设置定时健康检查
    this.healthCheckTimer = setInterval(() => {
      this.checkAllCDNHealth();
    }, this.options.healthCheckInterval);

    // 设置定时状态刷新
    this.statusRefreshTimer = setInterval(() => {
      this.refreshProvidersStatus();
    }, this.options.statusRefreshInterval);

    // 发射监控开始事件
    this.eventEmitter.emit('monitoring:started');
  }

  /**
   * 停止监控CDN状态
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    this.log('停止监控CDN状态');

    // 清除定时器
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.statusRefreshTimer) {
      clearInterval(this.statusRefreshTimer);
      this.statusRefreshTimer = null;
    }

    // 发射监控停止事件
    this.eventEmitter.emit('monitoring:stopped');
  }

  /**
   * 检查所有CDN提供商的健康状态
   */
  private async checkAllCDNHealth(): Promise<void> {
    this.log('检查所有CDN提供商健康状态');
    const results: CDNHealthCheckResult[] = [];

    // 检查每个提供商
    const providerIds = Array.from(this.providers.keys());
    for (const providerId of providerIds) {
      try {
        const result = await this.checkCDNHealth(providerId);
        results.push(result);

        // 更新提供商状态
        const updatedProvider = this.providers.get(providerId);
        if (updatedProvider) {
          updatedProvider.lastCheckTime = Date.now();
          updatedProvider.status = result.isAvailable ? 'active' : 'degraded';

          // 重置或增加失败计数
          if (result.isAvailable) {
            this.providerFailureCounters.set(providerId, 0);
          } else {
            const currentFailures = this.providerFailureCounters.get(providerId) || 0;
            this.providerFailureCounters.set(providerId, currentFailures + 1);
            updatedProvider.failureCount = currentFailures + 1;
            updatedProvider.lastFailureTime = Date.now();

            // 如果达到故障转移阈值，触发故障转移
            if (currentFailures + 1 >= this.options.failoverThreshold!) {
              if (providerId === this.activeCDN) {
                this.handleCDNFailover(providerId);
              } else {
                // 更新状态为离线
                updatedProvider.status = 'offline';
              }
            }
          }
        }
      } catch (error) {
        this.log(`检查CDN健康状态失败: ${providerId}`, 'error');
        // 记录检查失败
        results.push({
          providerId,
          isAvailable: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now()
        });

        // 更新失败计数
        const currentFailures = this.providerFailureCounters.get(providerId) || 0;
        this.providerFailureCounters.set(providerId, currentFailures + 1);

        const provider = this.providers.get(providerId);
        if (provider) {
          provider.failureCount = currentFailures + 1;
          provider.lastFailureTime = Date.now();
          provider.lastCheckTime = Date.now();
          provider.status =
            currentFailures + 1 >= this.options.failoverThreshold! ? 'offline' : 'degraded';
        }

        // 检查是否需要故障转移
        if (
          currentFailures + 1 >= this.options.failoverThreshold! &&
          providerId === this.activeCDN
        ) {
          this.handleCDNFailover(providerId);
        }
      }
    }

    // 发射健康检查完成事件
    this.eventEmitter.emit('healthCheck:complete', results);
  }

  /**
   * 检查单个CDN提供商的健康状态
   * @param providerId CDN提供商ID
   */
  private async checkCDNHealth(providerId: string): Promise<CDNHealthCheckResult> {
    const provider = this.providers.get(providerId);

    if (!provider) {
      throw new Error(`未找到CDN提供商: ${providerId}`);
    }

    this.log(`检查CDN健康状态: ${provider.name} (${providerId})`);

    const testUrl = this.buildHealthCheckUrl(provider);
    const startTime = Date.now();

    try {
      // 发送请求检查CDN健康状态
      const response = await fetch(testUrl, {
        method: 'HEAD',
        cache: 'no-store',
        headers: this.getAuthHeaders(provider)
      });

      const endTime = Date.now();
      const latency = endTime - startTime;

      // 判断是否可用 (2xx 或 304)
      const isAvailable = response.ok || response.status === 304;

      return {
        providerId,
        isAvailable,
        latency,
        statusCode: response.status,
        timestamp: endTime
      };
    } catch (error) {
      // 网络错误或其他异常
      return {
        providerId,
        isAvailable: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
    }
  }

  /**
   * 处理CDN故障转移
   * @param failedProviderId 失败的CDN提供商ID
   */
  private async handleCDNFailover(failedProviderId: string): Promise<void> {
    if (failedProviderId !== this.activeCDN || !this.backupCDN) {
      return;
    }

    const failedProvider = this.providers.get(failedProviderId);
    if (!failedProvider) return;

    this.log(`主要CDN失效: ${failedProvider.name} (${failedProviderId})`);

    // 更新失败的CDN状态
    failedProvider.status = 'offline';

    // 查找可用的备用CDN
    const availableCDNs = Array.from(this.providers.entries())
      .filter(
        ([id, provider]) =>
          id !== failedProviderId &&
          provider.status === 'active' &&
          (this.providerFailureCounters.get(id) || 0) < this.options.failoverThreshold!
      )
      .map(([id]) => id);

    if (availableCDNs.length > 0) {
      // 切换到第一个可用的备用CDN
      const newActiveCDN = availableCDNs[0];
      const oldActiveCDN = this.activeCDN;
      this.activeCDN = newActiveCDN;

      // 如果有多个备用，更新备用CDN
      if (availableCDNs.length > 1) {
        this.backupCDN = availableCDNs[1];
      } else {
        this.backupCDN = null;
      }

      const newProvider = this.providers.get(newActiveCDN);

      // 发射故障转移事件
      this.eventEmitter.emit('cdn:failover', {
        from: oldActiveCDN,
        to: newActiveCDN,
        failedProvider: failedProvider.name,
        newProvider: newProvider ? newProvider.name : 'unknown',
        timestamp: Date.now()
      });

      this.log(
        `故障转移: 从 ${failedProvider.name} 切换到 ${newProvider ? newProvider.name : newActiveCDN}`
      );
    } else {
      // 没有可用的备用CDN，进入降级模式
      this.activeCDN = null;

      this.eventEmitter.emit('cdn:allFailed', {
        message: '所有CDN提供商都不可用',
        timestamp: Date.now()
      });

      this.log('所有CDN提供商都不可用，进入降级模式', 'error');
    }
  }

  /**
   * 刷新CDN提供商状态
   */
  private async refreshProvidersStatus(): Promise<void> {
    this.log('刷新CDN提供商状态');

    // 检查离线CDN是否可以恢复
    const offlineProviders = Array.from(this.providers.entries())
      .filter(([, provider]) => provider.status === 'offline')
      .map(([id]) => id);

    for (const providerId of offlineProviders) {
      try {
        const result = await this.checkCDNHealth(providerId);

        if (result.isAvailable) {
          // 恢复CDN状态
          const provider = this.providers.get(providerId);
          if (provider) {
            provider.status = 'active';
            provider.failureCount = 0;
            this.providerFailureCounters.set(providerId, 0);

            this.log(`CDN已恢复在线状态: ${provider.name} (${providerId})`);

            // 如果当前没有活跃CDN，将其设置为活跃
            if (!this.activeCDN) {
              this.activeCDN = providerId;

              this.eventEmitter.emit('cdn:recovered', {
                providerId,
                providerName: provider.name,
                timestamp: Date.now()
              });
            }
            // 如果没有备用CDN，将其设置为备用
            else if (!this.backupCDN) {
              this.backupCDN = providerId;

              this.eventEmitter.emit('cdn:backupAdded', {
                providerId,
                providerName: provider.name,
                timestamp: Date.now()
              });
            }
          }
        }
      } catch (error) {
        this.log(
          `刷新CDN状态失败: ${providerId}, 错误: ${error instanceof Error ? error.message : String(error)}`,
          'error'
        );
      }
    }
  }

  /**
   * 主动使CDN缓存失效
   * @param urls 需要使缓存失效的URL列表
   * @param providerId 指定CDN提供商，为空时使用当前活跃CDN
   */
  public async invalidateCache(urls: string[], providerId?: string): Promise<boolean> {
    const targetProviderId = providerId || this.activeCDN;

    if (!targetProviderId) {
      throw new Error('没有可用的CDN提供商');
    }

    const provider = this.providers.get(targetProviderId);
    if (!provider) {
      throw new Error(`未找到CDN提供商: ${targetProviderId}`);
    }

    if (!provider.apiEndpoint && !this.options.cacheInvalidationEndpoint) {
      throw new Error(`CDN提供商 ${provider.name} 不支持缓存失效操作`);
    }

    try {
      const endpoint = provider.apiEndpoint || this.options.cacheInvalidationEndpoint;
      if (!endpoint) {
        throw new Error('缺少缓存失效API端点');
      }

      this.log(`执行缓存失效: ${provider.name}, URLs: ${urls.length}个`);

      // 准备请求数据
      const requestData = {
        urls,
        provider: provider.id
      };

      // 发送请求
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(provider)
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        throw new Error(`缓存失效请求失败: ${response.status} ${response.statusText}`);
      }

      // 记录缓存失效状态
      this.invalidationStatus.set(targetProviderId, {
        urls,
        timestamp: Date.now()
      });

      // 发射缓存失效事件
      this.eventEmitter.emit('cache:invalidated', {
        providerId: targetProviderId,
        providerName: provider.name,
        urlCount: urls.length,
        timestamp: Date.now()
      });

      this.log(`缓存失效成功: ${provider.name}`);
      return true;
    } catch (error) {
      this.log(
        `缓存失效失败: ${provider.name} - ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );

      // 发射缓存失效失败事件
      this.eventEmitter.emit('cache:invalidationFailed', {
        providerId: targetProviderId,
        providerName: provider.name,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });

      return false;
    }
  }

  /**
   * 获取文件的CDN URL
   * @param fileHash 文件哈希
   * @param fileName 文件名
   * @param forceProvider 强制使用指定的CDN提供商
   */
  public getCdnUrl(fileHash: string, fileName: string, forceProvider?: string): string | null {
    // 确定使用哪个CDN提供商
    const providerId = forceProvider || this.activeCDN;

    if (!providerId) {
      return null; // 没有可用的CDN
    }

    const provider = this.providers.get(providerId);
    if (!provider) {
      return null;
    }

    // 构建CDN URL
    return `${provider.baseUrl}/${fileHash}/${encodeURIComponent(fileName)}`;
  }

  /**
   * 处理CDN失效的文件访问
   * @param fileHash 文件哈希
   * @param fileName 文件名
   */
  public async handleInvalidatedFile(fileHash: string, fileName: string): Promise<string | null> {
    this.log(`处理失效的文件: ${fileName} (${fileHash})`);

    // 尝试使用当前活跃CDN
    if (this.activeCDN) {
      const currentUrl = this.getCdnUrl(fileHash, fileName);
      if (currentUrl) {
        try {
          // 检查URL是否可访问
          const response = await this.checkUrlAvailability(currentUrl);
          if (response.ok) {
            return currentUrl;
          }
        } catch (error) {
          this.log(
            `检查URL可用性失败: ${currentUrl}, 错误: ${error instanceof Error ? error.message : String(error)}`,
            'error'
          );
        }
      }
    }

    // 当前活跃CDN不可用或文件不存在，尝试所有其他CDN
    for (const [providerId, provider] of this.providers.entries()) {
      // 跳过当前活跃CDN，因为已经检查过了
      if (providerId === this.activeCDN) continue;

      // 跳过离线的CDN
      if (provider.status === 'offline') continue;

      const url = this.getCdnUrl(fileHash, fileName, providerId);
      if (url) {
        try {
          // 检查URL是否可访问
          const response = await this.checkUrlAvailability(url);
          if (response.ok) {
            this.log(`在备用CDN找到文件: ${provider.name}`);
            return url;
          }
        } catch (error) {
          this.log(
            `检查备用CDN失败: ${provider.name}, 错误: ${error instanceof Error ? error.message : String(error)}`,
            'error'
          );
        }
      }
    }

    // 所有CDN都失效，尝试回退到源站
    this.log('所有CDN都无法访问文件，尝试回退到源站', 'warn');

    // 在这里可以添加回退到源站的逻辑
    // ...

    // 触发事件通知
    this.eventEmitter.emit('file:allCdnsFailed', {
      fileHash,
      fileName,
      timestamp: Date.now()
    });

    return null; // 所有CDN均不可用
  }

  /**
   * 检查URL是否可访问
   * @param url 要检查的URL
   */
  private async checkUrlAvailability(url: string): Promise<Response> {
    return fetch(url, {
      method: 'HEAD',
      cache: 'no-store'
    });
  }

  /**
   * 获取当前活跃的CDN提供商
   */
  public getActiveCDN(): CDNProvider | null {
    if (!this.activeCDN) return null;
    return this.providers.get(this.activeCDN) || null;
  }

  /**
   * 获取所有CDN提供商及其状态
   */
  public getAllCDNStatus(): Array<{
    id: string;
    name: string;
    status: string;
    failureCount: number;
  }> {
    return Array.from(this.providers.values()).map(provider => ({
      id: provider.id,
      name: provider.name,
      status: provider.status || 'unknown',
      failureCount: provider.failureCount || 0
    }));
  }

  /**
   * 手动切换活跃CDN
   * @param providerId 目标CDN提供商ID
   */
  public switchCDN(providerId: string): boolean {
    if (!this.providers.has(providerId)) {
      return false;
    }

    const provider = this.providers.get(providerId)!;
    const oldActiveCDN = this.activeCDN;

    // 只有活跃状态的CDN可以切换
    if (provider.status !== 'active') {
      this.log(`无法切换到不活跃的CDN: ${provider.name}`, 'warn');
      return false;
    }

    this.activeCDN = providerId;

    // 如果原活跃CDN状态良好，将其设为备用
    if (oldActiveCDN && oldActiveCDN !== providerId) {
      const oldProvider = this.providers.get(oldActiveCDN);
      if (oldProvider && oldProvider.status === 'active') {
        this.backupCDN = oldActiveCDN;
      }
    }

    this.log(`手动切换CDN: ${provider.name}`);

    // 触发CDN切换事件
    this.eventEmitter.emit('cdn:switched', {
      from: oldActiveCDN,
      to: providerId,
      manual: true,
      timestamp: Date.now()
    });

    return true;
  }

  /**
   * 构建健康检查URL
   * @param provider CDN提供商
   */
  private buildHealthCheckUrl(provider: CDNProvider): string {
    // 使用测试文件路径或健康检查路径
    const path = this.options.testFilePath || this.options.healthCheckPath;
    return `${provider.baseUrl}${path}?t=${Date.now()}`;
  }

  /**
   * 获取认证请求头
   * @param provider CDN提供商
   */
  private getAuthHeaders(provider: CDNProvider): Record<string, string> {
    const headers: Record<string, string> = {};

    if (provider.apiKey) {
      headers['X-API-Key'] = provider.apiKey;
    }

    if (provider.authToken) {
      headers['Authorization'] = `Bearer ${provider.authToken}`;
    }

    return headers;
  }

  /**
   * 重试操作，使用指数退避策略
   * @param operation 要重试的操作函数
   * @param maxRetries 最大重试次数
   */
  private async retryWithExponentialBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.options.maxRetries!
  ): Promise<T> {
    let lastError: Error | null = null;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;

        if (retryCount >= maxRetries) {
          break;
        }

        // 计算退避延迟
        const delay = Math.min(
          this.options.retryDelay! * Math.pow(this.options.backoffFactor!, retryCount),
          this.options.maxRetryDelay!
        );

        this.log(`操作失败，${retryCount}/${maxRetries}次重试，等待${delay}ms`, 'warn');

        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('操作失败，已达到最大重试次数');
  }

  /**
   * 注册事件处理器
   * @param event 事件名称
   * @param handler 事件处理函数
   */
  public on(event: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.on(event, handler);
  }

  /**
   * 取消注册事件处理器
   * @param event 事件名称
   * @param handler 事件处理函数
   */
  public off(event: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.off(event, handler);
  }

  /**
   * 日志记录
   * @param message 日志消息
   * @param level 日志级别
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.options.enableLogging) return;

    const prefix = '[CDN连接器]';

    switch (level) {
      case 'warn':
        console.warn(`${prefix} ${message}`);
        break;
      case 'error':
        console.error(`${prefix} ${message}`);
        break;
      default:
        console.log(`${prefix} ${message}`);
    }

    // 如果有内核，也发送日志事件
    if (this.kernel) {
      this.kernel.emit('log', {
        module: 'cdn-connector',
        level,
        message,
        timestamp: Date.now()
      });
    }
  }
}
