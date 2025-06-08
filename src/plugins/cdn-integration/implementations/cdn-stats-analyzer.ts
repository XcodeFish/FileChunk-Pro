import {
  CDNStatsAnalyzer,
  CDNStatsOptions,
  CDNUsageStats,
  CDNPerformanceAnalysis,
  CDNCostAnalysis,
  CDNTrafficAnomaly,
  CDNOptimizationSuggestion,
  CDNReportOptions,
  CDNAlertRule,
  CDNAlertHistoryOptions,
  CDNAlert,
  CDNRealTimeStats,
  CDNConfig
} from '../interfaces';

/**
 * CDN统计与分析实现类
 * 负责收集和分析CDN使用数据，提供性能报告和优化建议
 */
export class CDNStatsAnalyzerImpl implements CDNStatsAnalyzer {
  private config: CDNConfig;
  private alertRules: Map<string, CDNAlertRule> = new Map();
  private alertHistory: CDNAlert[] = [];
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private mockData: boolean;

  /**
   * 构造函数
   * @param config CDN配置
   * @param mockData 是否使用模拟数据（开发环境下使用）
   */
  constructor(config: CDNConfig, mockData = false) {
    this.config = config;
    this.mockData = mockData;

    // 初始化默认告警规则
    this.initDefaultAlertRules();
  }

  /**
   * 初始化默认告警规则
   */
  private initDefaultAlertRules(): void {
    const defaultRules: CDNAlertRule[] = [
      {
        name: '带宽超限告警',
        metric: 'bandwidth',
        operator: '>',
        threshold: 100000000, // 100Mbps
        enabled: true,
        severity: 'warning',
        cooldown: 30
      },
      {
        name: '错误率告警',
        metric: 'errorRate',
        operator: '>',
        threshold: 0.05, // 5%
        enabled: true,
        severity: 'critical',
        duration: 5
      }
    ];

    // 注册默认规则
    defaultRules.forEach(rule => {
      const id = `default-${rule.name}-${Date.now()}`;
      this.alertRules.set(id, { ...rule, id });
    });
  }

  /**
   * 获取CDN使用统计数据
   */
  async getUsageStats(options: CDNStatsOptions): Promise<CDNUsageStats> {
    if (this.mockData) {
      return this.getMockUsageStats(options);
    }

    try {
      // 实际实现中，这里需要调用CDN提供商的API获取统计数据
      // 根据不同的CDN提供商实现不同的API调用逻辑
      switch (this.config.provider) {
        case 'cloudflare':
          return this.getCloudflareStats(options);
        case 'aliyun':
          return this.getAliyunStats(options);
        case 'aws_cloudfront':
          return this.getAWSStats(options);
        default:
          throw new Error(`Unsupported CDN provider: ${this.config.provider}`);
      }
    } catch (error) {
      console.error(`Failed to fetch CDN stats: ${error}`);
      // 发生错误时返回空统计数据
      return {
        totalTraffic: 0,
        peakBandwidth: 0,
        totalRequests: 0
      };
    }
  }

  /**
   * 获取性能分析
   */
  async getPerformanceAnalysis(options: CDNStatsOptions): Promise<CDNPerformanceAnalysis> {
    if (this.mockData) {
      return this.getMockPerformanceAnalysis(options);
    }

    // 首先获取基础使用统计数据
    const stats = await this.getUsageStats(options);

    // 进行性能分析，计算各种指标
    // 这里是基于获取到的统计数据进行进一步处理
    const analysis: CDNPerformanceAnalysis = {
      avgResponseTime: this.calculateAvgResponseTime(stats),
      responseTimePercentiles: this.calculateResponseTimePercentiles(stats),
      cacheHitRate: stats.cacheHitRate || 0,
      byRegion: this.analyzePerformanceByRegion(stats),
      byContentType: this.analyzePerformanceByContentType(stats),
      bottlenecks: this.identifyPerformanceBottlenecks(stats),
      trends: this.calculatePerformanceTrends(stats, options)
    };

    return analysis;
  }

  /**
   * 获取成本分析
   */
  async getCostAnalysis(options: CDNStatsOptions): Promise<CDNCostAnalysis> {
    if (this.mockData) {
      return this.getMockCostAnalysis(options);
    }

    // 获取基础使用统计数据
    const stats = await this.getUsageStats(options);

    // 基于使用数据计算成本
    const analysis: CDNCostAnalysis = {
      totalCost: this.calculateTotalCost(stats),
      byDomain: this.calculateCostByDomain(stats),
      byRegion: this.calculateCostByRegion(stats),
      byBillingItem: this.calculateCostByBillingItem(stats),
      trends: this.calculateCostTrends(options),
      savingSuggestions: this.generateCostSavingSuggestions(stats),
      forecast: this.generateCostForecast(stats, options)
    };

    return analysis;
  }

  /**
   * 获取流量异常检测
   */
  async getTrafficAnomalies(options: CDNStatsOptions): Promise<CDNTrafficAnomaly[]> {
    if (this.mockData) {
      return this.getMockTrafficAnomalies(options);
    }

    // 获取统计数据
    const stats = await this.getUsageStats(options);

    // 检测流量异常
    const anomalies = this.detectAnomalies(stats);
    return anomalies;
  }

  /**
   * 获取优化建议
   */
  async getOptimizationSuggestions(): Promise<CDNOptimizationSuggestion[]> {
    if (this.mockData) {
      return this.getMockOptimizationSuggestions();
    }

    // 获取最近一周的统计数据
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    const options: CDNStatsOptions = {
      startTime,
      endTime,
      interval: 'day'
    };

    // 获取基础统计数据
    const stats = await this.getUsageStats(options);
    const performanceAnalysis = await this.getPerformanceAnalysis(options);
    const costAnalysis = await this.getCostAnalysis(options);

    // 生成优化建议
    const suggestions: CDNOptimizationSuggestion[] = [];

    // 添加性能优化建议
    suggestions.push(...this.generatePerformanceOptimizationSuggestions(performanceAnalysis));

    // 添加成本优化建议
    suggestions.push(...this.generateCostOptimizationSuggestions(costAnalysis));

    // 添加安全优化建议
    suggestions.push(...this.generateSecurityOptimizationSuggestions(stats));

    // 添加可用性优化建议
    suggestions.push(...this.generateAvailabilityOptimizationSuggestions(stats));

    return suggestions;
  }

  /**
   * 导出统计报告
   */
  async exportReport(options: CDNReportOptions): Promise<string | Buffer> {
    if (this.mockData) {
      return this.getMockReport(options);
    }

    try {
      // 获取报告所需的所有数据
      const statsOptions: CDNStatsOptions = {
        startTime: options.startTime,
        endTime: options.endTime,
        interval: 'day'
      };

      const stats = await this.getUsageStats(statsOptions);
      const performance = await this.getPerformanceAnalysis(statsOptions);
      const cost = await this.getCostAnalysis(statsOptions);
      const anomalies = await this.getTrafficAnomalies(statsOptions);
      const suggestions = await this.getOptimizationSuggestions();

      // 根据格式生成报告
      switch (options.format) {
        case 'json':
          return this.generateJsonReport(options, stats, performance, cost, anomalies, suggestions);
        case 'csv':
          return this.generateCsvReport(options, stats);
        case 'html':
          return this.generateHtmlReport(options, stats, performance, cost, anomalies, suggestions);
        case 'pdf':
          return this.generatePdfReport(options, stats, performance, cost, anomalies, suggestions);
        default:
          throw new Error(`Unsupported report format: ${options.format}`);
      }
    } catch (error) {
      console.error(`Failed to generate report: ${error}`);
      return Buffer.from(`Error generating report: ${error}`);
    }
  }

  /**
   * 设置告警规则
   */
  async setAlertRule(rule: CDNAlertRule): Promise<boolean> {
    try {
      // 如果没有ID，生成一个
      const ruleId = rule.id || `rule-${Date.now()}`;
      const finalRule = { ...rule, id: ruleId };

      // 保存规则
      this.alertRules.set(ruleId, finalRule);

      // 在生产环境中，这里需要将规则保存到持久化存储

      return true;
    } catch (error) {
      console.error(`Failed to set alert rule: ${error}`);
      return false;
    }
  }

  /**
   * 获取告警历史
   */
  async getAlertHistory(options: CDNAlertHistoryOptions): Promise<CDNAlert[]> {
    if (this.mockData) {
      return this.getMockAlertHistory(options);
    }

    try {
      // 过滤符合条件的告警
      let alerts = [...this.alertHistory];

      // 按时间过滤
      alerts = alerts.filter(
        alert => alert.timestamp >= options.startTime && alert.timestamp <= options.endTime
      );

      // 按级别过滤
      if (options.severity && options.severity.length > 0) {
        alerts = alerts.filter(alert => options.severity!.includes(alert.severity));
      }

      // 按状态过滤
      if (options.status && options.status.length > 0) {
        alerts = alerts.filter(alert => options.status!.includes(alert.status));
      }

      // 处理分页
      if (options.pagination) {
        const { pageSize, pageNumber } = options.pagination;
        const start = (pageNumber - 1) * pageSize;
        const end = start + pageSize;
        alerts = alerts.slice(start, end);
      }

      return alerts;
    } catch (error) {
      console.error(`Failed to get alert history: ${error}`);
      return [];
    }
  }

  /**
   * 获取实时监控数据
   */
  async getRealTimeMonitoring(interval: number = 60): Promise<CDNRealTimeStats> {
    if (this.mockData) {
      return this.getMockRealTimeStats();
    }

    try {
      // 获取当前时间点的实时数据
      // 这里应该调用CDN提供商的实时监控API

      // 生成实时数据
      const realtimeData: CDNRealTimeStats = {
        timestamp: new Date(),
        currentBandwidth: 0,
        currentQps: 0,
        lastMinute: {
          requests: 0,
          traffic: 0,
          errorRate: 0
        },
        byDomain: {},
        healthStatus: {
          overall: 'healthy',
          components: {}
        },
        activeAlerts: this.getActiveAlertsCount()
      };

      // 如果开启了监控，但尚未设置监控定时器
      if (interval > 0 && this.isMonitoring && !this.monitoringInterval) {
        this.startRealTimeMonitoring(interval);
      }

      return realtimeData;
    } catch (error) {
      console.error(`Failed to get real-time stats: ${error}`);
      return {
        timestamp: new Date(),
        currentBandwidth: 0,
        currentQps: 0,
        lastMinute: {
          requests: 0,
          traffic: 0,
          errorRate: 0
        },
        byDomain: {},
        healthStatus: {
          overall: 'critical',
          components: { api: 'critical' }
        },
        activeAlerts: this.getActiveAlertsCount()
      };
    }
  }

  /**
   * 启动实时监控
   */
  startRealTimeMonitoring(interval: number = 60): void {
    this.isMonitoring = true;

    // 清除之前的定时器
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // 创建新的定时器
    this.monitoringInterval = setInterval(async () => {
      try {
        // 获取实时数据
        const stats = await this.getRealTimeMonitoring(0); // 传0避免递归创建定时器

        // 处理告警检测
        await this.checkAlerts(stats);
      } catch (error) {
        console.error(`Error in real-time monitoring: ${error}`);
      }
    }, interval * 1000);
  }

  /**
   * 停止实时监控
   */
  stopRealTimeMonitoring(): void {
    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * 检查告警条件
   */
  private async checkAlerts(stats: CDNRealTimeStats): Promise<void> {
    // 遍历所有告警规则
    for (const [ruleId, rule] of this.alertRules.entries()) {
      if (!rule.enabled) continue;

      // 获取监控指标的值
      const metricValue = this.getMetricValue(stats, rule.metric);

      // 判断是否触发告警
      const isTriggered = this.evaluateAlertCondition(metricValue, rule.operator, rule.threshold);

      if (isTriggered) {
        // 创建新告警
        const alert: CDNAlert = {
          id: `alert-${Date.now()}-${ruleId}`,
          ruleId,
          timestamp: new Date(),
          severity: rule.severity,
          status: 'active',
          metric: rule.metric,
          value: metricValue,
          threshold: rule.threshold,
          message: this.generateAlertMessage(rule, metricValue)
        };

        // 检查冷却期
        if (this.isInCooldown(rule)) {
          continue;
        }

        // 添加到告警历史
        this.alertHistory.push(alert);

        // 通知处理（实际实现中应接入通知系统）
        this.sendAlertNotification(alert, rule);
      }
    }
  }

  /**
   * 获取监控指标的值
   */
  private getMetricValue(stats: CDNRealTimeStats, metric: string): number {
    switch (metric) {
      case 'bandwidth':
        return stats.currentBandwidth;
      case 'qps':
        return stats.currentQps;
      case 'errorRate':
        return stats.lastMinute.errorRate;
      default:
        if (metric.startsWith('domain:')) {
          const domainName = metric.split(':')[1];
          const domainMetric = metric.split(':')[2];
          return (
            (stats.byDomain[domainName]?.[
              domainMetric as keyof (typeof stats.byDomain)[string]
            ] as number) || 0
          );
        }
        return 0;
    }
  }

  /**
   * 评估告警条件
   */
  private evaluateAlertCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>':
        return value > threshold;
      case '<':
        return value < threshold;
      case '>=':
        return value >= threshold;
      case '<=':
        return value <= threshold;
      case '==':
        return value === threshold;
      case '!=':
        return value !== threshold;
      default:
        return false;
    }
  }

  /**
   * 生成告警消息
   */
  private generateAlertMessage(rule: CDNAlertRule, value: number): string {
    return `告警 "${rule.name}": ${rule.metric} ${rule.operator} ${rule.threshold} (当前值: ${value})`;
  }

  /**
   * 检查是否在冷却期内
   */
  private isInCooldown(rule: CDNAlertRule): boolean {
    if (!rule.cooldown) return false;

    // 获取最近的此规则的告警
    const recentAlerts = this.alertHistory
      .filter(alert => alert.ruleId === rule.id)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (recentAlerts.length === 0) return false;

    const latestAlert = recentAlerts[0];
    const cooldownEnds = new Date(latestAlert.timestamp.getTime() + rule.cooldown * 60 * 1000);

    return new Date() < cooldownEnds;
  }

  /**
   * 发送告警通知
   */
  private sendAlertNotification(alert: CDNAlert, rule: CDNAlertRule): void {
    // 如果没有配置通知渠道，则不发送通知
    if (!rule.notificationChannels || rule.notificationChannels.length === 0) {
      console.log(`Alert triggered: ${alert.message} (No notification channels configured)`);
      return;
    }

    // 发送通知到各个通道
    rule.notificationChannels.forEach(channel => {
      console.log(`Sending alert to ${channel.type}:${channel.target}: ${alert.message}`);

      // 实际实现中，这里需要调用不同的通知渠道API
      switch (channel.type) {
        case 'email':
          // 发送邮件
          break;
        case 'sms':
          // 发送短信
          break;
        case 'webhook':
          // 调用webhook
          break;
        case 'push':
          // 发送推送通知
          break;
      }
    });
  }

  /**
   * 获取活跃告警数量
   */
  private getActiveAlertsCount(): number {
    return this.alertHistory.filter(alert => alert.status === 'active').length;
  }

  // ============ 模拟数据生成函数（开发环境使用） ============

  /**
   * 生成模拟使用统计数据
   */
  private getMockUsageStats(options: CDNStatsOptions): CDNUsageStats {
    const days = Math.floor(
      (options.endTime.getTime() - options.startTime.getTime()) / (24 * 60 * 60 * 1000)
    );

    // 基础数据
    const totalTraffic = Math.round(Math.random() * 1000000000) * days; // 1GB * days
    const peakBandwidth = Math.round(Math.random() * 100000000); // 100Mbps
    const totalRequests = Math.round(Math.random() * 10000000) * days; // 10M * days
    const cacheHitRate = 0.75 + Math.random() * 0.2; // 75-95%

    // 构造域名数据
    const domains = [
      'www.example.com',
      'static.example.com',
      'images.example.com',
      'api.example.com'
    ];
    const byDomain: Record<string, any> = {};
    domains.forEach(domain => {
      const domainTraffic = (totalTraffic / domains.length) * (0.7 + Math.random() * 0.6);
      byDomain[domain] = {
        traffic: Math.round(domainTraffic),
        peakBandwidth: Math.round((peakBandwidth / domains.length) * (0.7 + Math.random() * 0.6)),
        requests: Math.round((totalRequests / domains.length) * (0.7 + Math.random() * 0.6)),
        hitRate: cacheHitRate * (0.9 + Math.random() * 0.2)
      };
    });

    // 构造区域数据
    const regions = ['NA', 'EU', 'AP', 'SA', 'AF'];
    const byRegion: Record<string, any> = {};
    regions.forEach(region => {
      byRegion[region] = {
        traffic: Math.round((totalTraffic / regions.length) * (0.4 + Math.random() * 1.2)),
        requests: Math.round((totalRequests / regions.length) * (0.4 + Math.random() * 1.2))
      };
    });

    // 构造时间序列数据
    const timeSeriesData = [];
    let currentDate = new Date(options.startTime);
    const endDate = new Date(options.endTime);
    const interval = this.getIntervalMilliseconds(options.interval || 'day');

    while (currentDate <= endDate) {
      const timePoint = {
        timestamp: new Date(currentDate),
        traffic: Math.round((totalTraffic / days) * (0.6 + Math.random() * 0.8)),
        bandwidth: Math.round(peakBandwidth * (0.4 + Math.random() * 1.2)),
        requests: Math.round((totalRequests / days) * (0.6 + Math.random() * 0.8))
      };
      timeSeriesData.push(timePoint);
      currentDate = new Date(currentDate.getTime() + interval);
    }

    // 构造状态码分布
    const statusCodeDistribution: Record<string, number> = {
      '200': Math.round(totalRequests * 0.92),
      '301': Math.round(totalRequests * 0.02),
      '304': Math.round(totalRequests * 0.03),
      '404': Math.round(totalRequests * 0.015),
      '500': Math.round(totalRequests * 0.005),
      '503': Math.round(totalRequests * 0.01)
    };

    return {
      totalTraffic,
      peakBandwidth,
      totalRequests,
      byDomain,
      byRegion,
      timeSeriesData,
      statusCodeDistribution,
      cacheHitRate,
      edgeHitRate: cacheHitRate * 0.95,
      estimatedCost: (totalTraffic / 1000000000) * 0.08, // $0.08 per GB
      originTrafficSaved: totalTraffic * cacheHitRate,
      performance: {
        avgResponseTime: 120 + Math.random() * 50,
        p95ResponseTime: 200 + Math.random() * 100,
        p99ResponseTime: 300 + Math.random() * 200
      },
      requestDistribution: {
        byFileType: {
          image: Math.round(totalRequests * 0.4),
          css: Math.round(totalRequests * 0.05),
          js: Math.round(totalRequests * 0.3),
          html: Math.round(totalRequests * 0.15),
          other: Math.round(totalRequests * 0.1)
        }
      },
      pagination: {
        totalPages: 1,
        currentPage: 1,
        totalItems: 1
      }
    };
  }

  /**
   * 获取时间间隔毫秒数
   */
  private getIntervalMilliseconds(interval: string): number {
    switch (interval) {
      case '5min':
        return 5 * 60 * 1000;
      case 'hour':
        return 60 * 60 * 1000;
      case 'day':
        return 24 * 60 * 60 * 1000;
      case 'month':
        return 30 * 24 * 60 * 60 * 1000;
      default:
        return 24 * 60 * 60 * 1000; // 默认一天
    }
  }

  /**
   * 生成模拟性能分析数据
   */
  private getMockPerformanceAnalysis(_options: CDNStatsOptions): CDNPerformanceAnalysis {
    // 基础响应时间数据
    const avgResponseTime = 120 + Math.random() * 50;

    // 构造区域数据
    const regions = ['NA', 'EU', 'AP', 'SA', 'AF'];
    const byRegion: Record<string, any> = {};
    regions.forEach(region => {
      const factor = 0.8 + Math.random() * 0.4;
      byRegion[region] = {
        avgResponseTime: Math.round(avgResponseTime * factor),
        cacheHitRate: 0.7 + Math.random() * 0.2
      };
    });

    // 构造内容类型数据
    const contentTypes = ['image', 'js', 'css', 'html', 'video', 'audio', 'json'];
    const byContentType: Record<string, any> = {};
    contentTypes.forEach(type => {
      const factor = 0.8 + Math.random() * 0.4;
      byContentType[type] = {
        avgResponseTime: Math.round(avgResponseTime * factor),
        cacheHitRate: 0.7 + Math.random() * 0.2
      };
    });

    // 构造性能瓶颈
    const bottlenecks = [
      {
        type: '大文件传输',
        description: '部分大尺寸图片未优化，影响页面加载速度',
        impact: 'medium' as const,
        suggestion: '对大于1MB的图片进行压缩和格式优化'
      },
      {
        type: '缓存配置',
        description: 'API响应未设置适当的缓存策略',
        impact: 'high' as const,
        suggestion: '为API响应添加合适的Cache-Control头'
      },
      {
        type: '回源请求',
        description: '部分资源缓存命中率较低，频繁回源',
        impact: 'medium' as const,
        suggestion: '延长缓存期限，利用条件请求'
      }
    ];

    // 构造性能趋势
    const trends = [
      {
        metric: '平均响应时间',
        period: '过去7天',
        change: -15,
        changePercentage: -10
      },
      {
        metric: '缓存命中率',
        period: '过去7天',
        change: 0.05,
        changePercentage: 6
      },
      {
        metric: 'P95响应时间',
        period: '过去7天',
        change: -25,
        changePercentage: -12
      }
    ];

    return {
      avgResponseTime,
      responseTimePercentiles: {
        p50: avgResponseTime - 20,
        p90: avgResponseTime + 80,
        p95: avgResponseTime + 140,
        p99: avgResponseTime + 250
      },
      cacheHitRate: 0.85,
      byRegion,
      byContentType,
      bottlenecks,
      trends
    };
  }

  /**
   * 生成模拟成本分析数据
   */
  private getMockCostAnalysis(_options: CDNStatsOptions): CDNCostAnalysis {
    // 基础成本数据
    const totalCost = 150 + Math.random() * 100;

    // 构造域名数据
    const domains = [
      'www.example.com',
      'static.example.com',
      'images.example.com',
      'api.example.com'
    ];
    const byDomain: Record<string, number> = {};
    domains.forEach(domain => {
      byDomain[domain] = (totalCost / domains.length) * (0.7 + Math.random() * 0.6);
    });

    // 构造区域数据
    const regions = ['NA', 'EU', 'AP', 'SA', 'AF'];
    const byRegion: Record<string, number> = {};
    regions.forEach(region => {
      byRegion[region] = (totalCost / regions.length) * (0.7 + Math.random() * 0.6);
    });

    // 构造计费项数据
    const byBillingItem: Record<string, number> = {
      bandwidth: totalCost * 0.5,
      requests: totalCost * 0.2,
      ssl: totalCost * 0.1,
      origin_shield: totalCost * 0.1,
      storage: totalCost * 0.1
    };

    // 构造成本趋势
    const trends = [];
    let currentCost = totalCost;
    for (let i = 6; i >= 0; i--) {
      const variation = (Math.random() * 0.2 - 0.1) * currentCost;
      const previousCost = currentCost - variation;
      trends.push({
        period: `${i + 1}天前`,
        cost: previousCost,
        change: currentCost - previousCost,
        changePercentage: (currentCost / previousCost - 1) * 100
      });
      currentCost = previousCost;
    }

    // 构造节省建议
    const savingSuggestions = [
      {
        suggestion: '优化缓存TTL设置',
        potentialSaving: totalCost * 0.1,
        implementation: '增加资源的缓存时间，减少回源请求',
        impact: 'medium' as const
      },
      {
        suggestion: '压缩图片和视频资源',
        potentialSaving: totalCost * 0.15,
        implementation: '使用WebP/AVIF格式和视频转码减少文件大小',
        impact: 'high' as const
      },
      {
        suggestion: '调整带宽限制',
        potentialSaving: totalCost * 0.05,
        implementation: '为非关键资源设置较低的带宽限制',
        impact: 'low' as const
      }
    ];

    // 构造成本预测
    const forecast = [];
    currentCost = totalCost;
    for (let i = 0; i < 6; i++) {
      const growth = 1 + Math.random() * 0.08; // 0-8% 增长
      currentCost *= growth;
      forecast.push({
        period: `${i + 1}个月后`,
        estimatedCost: currentCost,
        lowerBound: currentCost * 0.8,
        upperBound: currentCost * 1.2
      });
    }

    return {
      totalCost,
      byDomain,
      byRegion,
      byBillingItem,
      trends,
      savingSuggestions,
      forecast
    };
  }

  /**
   * 生成模拟流量异常数据
   */
  private getMockTrafficAnomalies(options: CDNStatsOptions): CDNTrafficAnomaly[] {
    const anomalies = [];

    // 生成一些随机异常
    const anomalyCount = Math.floor(Math.random() * 4) + 1; // 1-4个异常
    const metrics = ['bandwidth', 'requests', 'error_rate', 'latency'];
    const severities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

    for (let i = 0; i < anomalyCount; i++) {
      const metric = metrics[Math.floor(Math.random() * metrics.length)];
      const value = 100 + Math.random() * 900;
      const expectedLow = value * 0.6;
      const expectedHigh = value * 0.8;
      const severity = severities[Math.floor(Math.random() * severities.length)];

      // 随机时间点
      const timeOffset = Math.random() * (options.endTime.getTime() - options.startTime.getTime());
      const timestamp = new Date(options.startTime.getTime() + timeOffset);

      // 创建异常对象，确保expectedRange是元组
      anomalies.push({
        metric,
        timestamp,
        value,
        expectedRange: [expectedLow, expectedHigh] as [number, number], // 使用类型断言确保是元组
        severity,
        description: this.getAnomalyDescription(metric, severity),
        possibleCauses: this.getAnomalyCauses(metric),
        recommendedActions: this.getAnomalyActions(metric, severity)
      });
    }

    return anomalies as CDNTrafficAnomaly[];
  }

  /**
   * 获取异常描述
   */
  private getAnomalyDescription(metric: string, severity: string): string {
    const descriptions: Record<string, Record<string, string>> = {
      bandwidth: {
        low: '带宽使用略高于正常水平',
        medium: '带宽使用明显高于预期',
        high: '带宽使用出现异常峰值'
      },
      requests: {
        low: '请求量略微增加',
        medium: '请求量突然上升',
        high: '请求量激增'
      },
      error_rate: {
        low: '错误率略有上升',
        medium: '错误率明显增加',
        high: '错误率大幅上升'
      },
      latency: {
        low: '延迟略有增加',
        medium: '延迟明显增加',
        high: '延迟大幅增加'
      }
    };

    return descriptions[metric]?.[severity] || `${metric}出现异常`;
  }

  /**
   * 获取异常可能原因
   */
  private getAnomalyCauses(metric: string): string[] {
    const causes: Record<string, string[]> = {
      bandwidth: ['内容热点传播', '攻击流量', '大文件下载增多', '客户端自动更新'],
      requests: ['流量高峰', '爬虫活动', 'DDoS攻击', '媒体报道引流', '营销活动'],
      error_rate: ['源站故障', 'CDN节点故障', '配置错误', 'DNS解析问题', 'SSL证书过期'],
      latency: ['源站响应慢', 'CDN节点拥塞', '路由问题', '大文件传输', '跨区域访问']
    };

    return causes[metric] || ['未知原因'];
  }

  /**
   * 获取异常建议操作
   */
  private getAnomalyActions(metric: string, severity: string): string[] {
    const actions: Record<string, string[]> = {
      bandwidth: [
        '检查是否有异常流量来源',
        '分析请求日志识别热点内容',
        '开启DDoS防护',
        '检查内容分发策略'
      ],
      requests: ['分析请求来源IP分布', '检查User-Agent分布', '开启速率限制', '增加边缘缓存容量'],
      error_rate: [
        '检查源站健康状态',
        '检查CDN节点状态',
        '验证SSL证书',
        '检查DNS配置',
        '检查安全规则配置'
      ],
      latency: ['检查源站响应时间', '优化资源大小', '调整CDN缓存配置', '开启压缩', '考虑多区域部署']
    };

    // 根据严重程度选择推荐操作数量
    const allActions = actions[metric] || ['监控情况变化'];
    const actionCount =
      severity === 'high'
        ? allActions.length
        : severity === 'medium'
          ? Math.min(3, allActions.length)
          : Math.min(2, allActions.length);

    return allActions.slice(0, actionCount);
  }

  /**
   * 生成模拟优化建议
   */
  private getMockOptimizationSuggestions(): CDNOptimizationSuggestion[] {
    return [
      {
        type: 'performance',
        title: '启用Brotli压缩',
        description: '相比gzip，Brotli压缩可提供更高的压缩率，同时保持较低的解压性能消耗',
        impact: 'high',
        complexity: 'low',
        potentialBenefit: {
          type: 'performance',
          value: 20,
          unit: '%'
        },
        implementationSteps: [
          '在CDN控制台中启用Brotli压缩',
          '配置适用的内容类型(js, css, html, json等)',
          '监控带宽使用和页面加载时间的变化'
        ]
      },
      {
        type: 'cost',
        title: '优化图片和视频资源',
        description: '使用现代格式和自适应分辨率可减少媒体文件的大小，降低带宽成本',
        impact: 'high',
        complexity: 'medium',
        potentialBenefit: {
          type: 'cost',
          value: 15,
          unit: '%'
        },
        implementationSteps: [
          '将JPEG/PNG图片转换为WebP/AVIF格式',
          '实施响应式图片技术，根据设备提供不同分辨率',
          '使用视频转码将视频转为更高效的格式',
          '启用自适应比特率流媒体'
        ]
      },
      {
        type: 'security',
        title: '配置内容安全策略',
        description: '实施CSP可以防止XSS和数据注入攻击，提高网站安全性',
        impact: 'medium',
        complexity: 'medium',
        implementationSteps: [
          '分析当前资源加载情况',
          '制定CSP策略规则',
          '在CDN中配置适当的CSP标头',
          '使用报告模式进行测试',
          '逐步实施强制模式'
        ]
      },
      {
        type: 'availability',
        title: '多区域部署与故障转移',
        description: '将内容部署在多个地理区域，并配置自动故障转移以提高可用性',
        impact: 'high',
        complexity: 'high',
        potentialBenefit: {
          type: 'performance',
          value: 99.99,
          unit: '% 可用性'
        },
        implementationSteps: [
          '在多个区域配置CDN终端节点',
          '设置健康检查与自动故障转移',
          '配置地理路由策略',
          '实施多区域源站部署',
          '定期测试故障转移机制'
        ]
      },
      {
        type: 'performance',
        title: '预加载关键资源',
        description: '使用prefetch和preload指令提前加载关键资源，加快页面渲染速度',
        impact: 'medium',
        complexity: 'low',
        implementationSteps: [
          '识别页面关键渲染资源',
          '在HTML头部添加preload指令',
          '为后续导航添加prefetch指令',
          '配置CDN边缘规则自动插入相关头部'
        ]
      }
    ];
  }

  /**
   * 生成模拟报告
   */
  private getMockReport(options: CDNReportOptions): Buffer {
    // 生成一个简单的报告内容（实际应该根据format生成相应格式）
    const reportTitle = options.title || '默认 CDN 统计报告';
    const timeRange = `${options.startTime.toISOString()} - ${options.endTime.toISOString()}`;

    const report = `
${reportTitle}
时间范围: ${timeRange}
报告格式: ${options.format}
报告级别: ${options.level || 'detailed'}

== 统计摘要 ==
总流量: 约 ${Math.round(Math.random() * 1000)} GB
峰值带宽: 约 ${Math.round(Math.random() * 100)} Mbps
总请求数: 约 ${Math.round(Math.random() * 10000000)}
缓存命中率: ${Math.round(70 + Math.random() * 20)}%

== 性能指标 ==
平均响应时间: ${Math.round(100 + Math.random() * 50)} ms
95% 响应时间: ${Math.round(200 + Math.random() * 100)} ms

== 成本分析 ==
估算成本: $${Math.round(100 + Math.random() * 200)}
潜在节省: $${Math.round(20 + Math.random() * 50)}

== 建议 ==
1. 优化缓存策略
2. 启用压缩
3. 配置预加载
4. 使用HTTP/3

== 异常检测 ==
发现 ${Math.round(1 + Math.random() * 3)} 个流量异常
发现 ${Math.round(Math.random() * 2)} 个性能异常
`;

    return Buffer.from(report, 'utf-8');
  }

  /**
   * 生成模拟告警历史
   */
  private getMockAlertHistory(options: CDNAlertHistoryOptions): CDNAlert[] {
    const alerts: CDNAlert[] = [];

    // 生成1-5条告警
    const alertCount = 1 + Math.floor(Math.random() * 5);

    // 告警级别和状态
    const severities: Array<'info' | 'warning' | 'critical'> = ['info', 'warning', 'critical'];
    const statuses: Array<'active' | 'acknowledged' | 'resolved'> = [
      'active',
      'acknowledged',
      'resolved'
    ];

    // 告警指标
    const metrics = ['bandwidth', 'requests', 'errorRate', 'latency'];

    for (let i = 0; i < alertCount; i++) {
      // 随机选择时间
      const timeOffset = Math.random() * (options.endTime.getTime() - options.startTime.getTime());
      const timestamp = new Date(options.startTime.getTime() + timeOffset);

      // 随机选择级别和状态
      const severity = severities[Math.floor(Math.random() * severities.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      // 随机选择指标
      const metric = metrics[Math.floor(Math.random() * metrics.length)];

      // 创建告警
      alerts.push({
        id: `mock-alert-${i}-${Date.now()}`,
        ruleId: `mock-rule-${i}`,
        timestamp,
        severity,
        status,
        metric,
        value: 100 + Math.random() * 900,
        threshold: 100,
        message: `告警: ${metric} 超过阈值`,
        domains: ['www.example.com', 'static.example.com'],
        resolvedAt:
          status === 'resolved' ? new Date(timestamp.getTime() + 30 * 60 * 1000) : undefined,
        resolvedBy: status === 'resolved' ? 'admin' : undefined,
        resolution: status === 'resolved' ? '已处理异常流量源' : undefined
      });
    }

    return alerts;
  }

  /**
   * 生成模拟实时统计数据
   */
  private getMockRealTimeStats(): CDNRealTimeStats {
    // 实时带宽和QPS
    const currentBandwidth = 50000000 + Math.random() * 50000000; // 50-100Mbps
    const currentQps = 1000 + Math.random() * 2000; // 1000-3000 QPS

    // 最近一分钟统计
    const lastMinute = {
      requests: Math.round(currentQps * 60),
      traffic: Math.round((currentBandwidth * 60) / 8), // 字节
      errorRate: 0.005 + Math.random() * 0.01 // 0.5%-1.5%
    };

    // 构造域名数据
    const domains = [
      'www.example.com',
      'static.example.com',
      'images.example.com',
      'api.example.com'
    ];
    const byDomain: Record<string, any> = {};
    domains.forEach(domain => {
      byDomain[domain] = {
        bandwidth: Math.round((currentBandwidth / domains.length) * (0.7 + Math.random() * 0.6)),
        qps: Math.round((currentQps / domains.length) * (0.7 + Math.random() * 0.6)),
        errorRate: Math.random() * 0.02
      };
    });

    // 构造区域数据
    const regions = ['NA', 'EU', 'AP', 'SA', 'AF'];
    const byRegion: Record<string, any> = {};
    regions.forEach(region => {
      byRegion[region] = {
        bandwidth: Math.round((currentBandwidth / regions.length) * (0.7 + Math.random() * 0.6)),
        qps: Math.round((currentQps / regions.length) * (0.7 + Math.random() * 0.6))
      };
    });

    // 构造健康状态
    const components: Record<string, 'healthy' | 'degraded' | 'critical'> = {
      origin: Math.random() > 0.1 ? 'healthy' : 'degraded',
      edge: Math.random() > 0.05 ? 'healthy' : 'degraded',
      api: 'healthy',
      dns: 'healthy'
    };

    // 整体健康状态基于组件状态
    const hasDegraded = Object.values(components).includes('degraded');
    const hasCritical = Object.values(components).includes('critical');
    const overallStatus = hasCritical ? 'critical' : hasDegraded ? 'degraded' : 'healthy';

    return {
      timestamp: new Date(),
      currentBandwidth,
      currentQps,
      lastMinute,
      byDomain,
      byRegion,
      healthStatus: {
        overall: overallStatus as 'healthy' | 'degraded' | 'critical',
        components
      },
      activeAlerts: Math.floor(Math.random() * 3)
    };
  }

  // ============ 实际API实现（生产环境使用） ============

  /**
   * 获取Cloudflare统计数据
   */
  private async getCloudflareStats(options: CDNStatsOptions): Promise<CDNUsageStats> {
    // 实际实现中，需要使用Cloudflare API获取数据
    console.log('Getting Cloudflare stats', options);

    // 这里应该是实际调用 Cloudflare API
    // const response = await fetch('https://api.cloudflare.com/client/v4/zones/{zoneId}/analytics/dashboard', {
    //   headers: {
    //     'Authorization': `Bearer ${this.config.auth?.token}`,
    //     'Content-Type': 'application/json'
    //   }
    // });
    // const data = await response.json();

    // 由于这是示例，我们使用模拟数据
    return this.getMockUsageStats(options);
  }

  /**
   * 获取阿里云统计数据
   */
  private async getAliyunStats(options: CDNStatsOptions): Promise<CDNUsageStats> {
    // 实际实现中，需要使用阿里云CDN API获取数据
    console.log('Getting Aliyun CDN stats', options);

    // 这里应该是实际调用阿里云CDN API
    // const Core = require('@alicloud/pop-core');
    // const client = new Core({
    //   accessKeyId: this.config.auth?.accessKey,
    //   accessKeySecret: this.config.auth?.secretKey,
    //   endpoint: 'https://cdn.aliyuncs.com',
    //   apiVersion: '2018-05-10'
    // });
    //
    // const result = await client.request('DescribeCdnData', {
    //   DomainName: this.config.domain,
    //   StartTime: options.startTime.toISOString(),
    //   EndTime: options.endTime.toISOString()
    // });

    // 由于这是示例，我们使用模拟数据
    return this.getMockUsageStats(options);
  }

  /**
   * 获取AWS CloudFront统计数据
   */
  private async getAWSStats(options: CDNStatsOptions): Promise<CDNUsageStats> {
    // 实际实现中，需要使用AWS CloudFront API获取数据
    console.log('Getting AWS CloudFront stats', options);

    // 这里应该是实际调用 AWS CloudFront API
    // const AWS = require('aws-sdk');
    // AWS.config.update({
    //   accessKeyId: this.config.auth?.accessKey,
    //   secretAccessKey: this.config.auth?.secretKey,
    //   region: this.config.region || 'us-east-1'
    // });
    //
    // const cloudWatch = new AWS.CloudWatch();
    // const params = {
    //   MetricName: 'Requests',
    //   Namespace: 'AWS/CloudFront',
    //   Period: 3600,
    //   StartTime: options.startTime,
    //   EndTime: options.endTime,
    //   Statistics: ['Sum'],
    //   Dimensions: [
    //     {
    //       Name: 'DistributionId',
    //       Value: this.config.distributionId
    //     },
    //     {
    //       Name: 'Region',
    //       Value: 'Global'
    //     }
    //   ]
    // };
    //
    // const data = await cloudWatch.getMetricStatistics(params).promise();

    // 由于这是示例，我们使用模拟数据
    return this.getMockUsageStats(options);
  }

  // ============ 辅助方法（计算和分析） ============

  /**
   * 计算平均响应时间
   */
  private calculateAvgResponseTime(stats: CDNUsageStats): number {
    // 实际实现中，应该基于统计数据计算
    return stats.performance?.avgResponseTime || 120;
  }

  /**
   * 计算响应时间百分位
   */
  private calculateResponseTimePercentiles(stats: CDNUsageStats): {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  } {
    // 实际实现中，应该基于统计数据计算
    const base = stats.performance?.avgResponseTime || 120;
    return {
      p50: base,
      p90: base + 80,
      p95: base + 140,
      p99: base + 250
    };
  }

  /**
   * 分析按区域的性能
   */
  private analyzePerformanceByRegion(
    stats: CDNUsageStats
  ): Record<string, { avgResponseTime: number; cacheHitRate: number }> {
    // 实际实现中，应该基于统计数据计算
    const result: Record<string, { avgResponseTime: number; cacheHitRate: number }> = {};

    // 如果有区域数据，基于区域数据计算
    if (stats.byRegion) {
      Object.keys(stats.byRegion).forEach(_region => {
        // byRegion中没有avgResponseTime属性，所以这里使用模拟数据
        result[_region] = {
          avgResponseTime: 120 + Math.random() * 50, // 示例数据
          cacheHitRate: 0.7 + Math.random() * 0.2 // 示例数据
        };
      });
    }

    return result;
  }

  /**
   * 分析按内容类型的性能
   */
  private analyzePerformanceByContentType(
    _stats: CDNUsageStats
  ): Record<string, { avgResponseTime: number; cacheHitRate: number }> {
    // 实际实现中，应该基于统计数据计算
    // 这里只生成示例数据
    return {
      image: { avgResponseTime: 80 + Math.random() * 20, cacheHitRate: 0.9 + Math.random() * 0.1 },
      js: { avgResponseTime: 100 + Math.random() * 30, cacheHitRate: 0.85 + Math.random() * 0.1 },
      css: { avgResponseTime: 90 + Math.random() * 20, cacheHitRate: 0.9 + Math.random() * 0.1 },
      html: { avgResponseTime: 150 + Math.random() * 50, cacheHitRate: 0.7 + Math.random() * 0.2 },
      video: {
        avgResponseTime: 200 + Math.random() * 100,
        cacheHitRate: 0.8 + Math.random() * 0.15
      },
      json: { avgResponseTime: 120 + Math.random() * 30, cacheHitRate: 0.6 + Math.random() * 0.2 }
    };
  }

  /**
   * 识别性能瓶颈
   */
  private identifyPerformanceBottlenecks(stats: CDNUsageStats): Array<{
    type: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    suggestion: string;
  }> {
    // 实际实现中，应该基于统计数据分析
    const bottlenecks = [];

    // 检查缓存命中率
    if (stats.cacheHitRate && stats.cacheHitRate < 0.7) {
      bottlenecks.push({
        type: '低缓存命中率',
        description: `当前缓存命中率 ${(stats.cacheHitRate * 100).toFixed(2)}% 低于理想值 85%`,
        impact: 'high' as const,
        suggestion: '优化缓存策略，增加缓存TTL，合理设置Cache-Control头'
      });
    }

    // 检查错误率
    let totalErrors = 0;
    const totalRequests = stats.totalRequests;

    if (stats.statusCodeDistribution) {
      Object.entries(stats.statusCodeDistribution).forEach(([code, count]) => {
        if (parseInt(code) >= 400) {
          totalErrors += count;
        }
      });

      const errorRate = totalErrors / totalRequests;
      if (errorRate > 0.01) {
        bottlenecks.push({
          type: '高错误率',
          description: `当前错误率 ${(errorRate * 100).toFixed(2)}% 高于正常值 1%`,
          impact: 'high' as const,
          suggestion: '分析错误日志，检查源站健康状态和配置'
        });
      }
    }

    // 检查响应时间
    if (stats.performance && stats.performance.avgResponseTime > 200) {
      bottlenecks.push({
        type: '高响应时间',
        description: `平均响应时间 ${stats.performance.avgResponseTime.toFixed(2)}ms 高于目标值 150ms`,
        impact: 'medium' as const,
        suggestion: '优化源站响应时间，启用压缩，优化资源大小'
      });
    }

    return bottlenecks;
  }

  /**
   * 计算性能趋势
   */
  private calculatePerformanceTrends(
    _stats: CDNUsageStats,
    _options: CDNStatsOptions
  ): Array<{ metric: string; period: string; change: number; changePercentage: number }> {
    // 实际实现中，应该基于历史数据计算趋势
    // 这里只生成示例数据

    return [
      {
        metric: '响应时间',
        period: '过去30天',
        change: -15,
        changePercentage: -10
      },
      {
        metric: '缓存命中率',
        period: '过去30天',
        change: 0.05,
        changePercentage: 6.5
      },
      {
        metric: '错误率',
        period: '过去30天',
        change: -0.008,
        changePercentage: -42
      }
    ];
  }

  /**
   * 计算总成本
   */
  private calculateTotalCost(stats: CDNUsageStats): number {
    // 实际实现中，应该基于CDN计费规则计算
    // 这里使用简单模型：$0.08/GB流量 + $0.01/10K请求
    const trafficCost = (stats.totalTraffic / 1000000000) * 0.08;
    const requestCost = (stats.totalRequests / 10000) * 0.01;

    return trafficCost + requestCost;
  }

  /**
   * 计算按域名的成本
   */
  private calculateCostByDomain(stats: CDNUsageStats): Record<string, number> {
    // 实际实现中，应该基于按域名统计数据计算
    const result: Record<string, number> = {};

    if (stats.byDomain) {
      Object.entries(stats.byDomain).forEach(([domain, data]) => {
        // 按流量和请求数计算成本
        const trafficCost = (data.traffic / 1000000000) * 0.08;
        const requestCost = (data.requests / 10000) * 0.01;

        result[domain] = trafficCost + requestCost;
      });
    }

    return result;
  }

  /**
   * 计算按区域的成本
   */
  private calculateCostByRegion(stats: CDNUsageStats): Record<string, number> {
    // 实际实现中，应该基于按区域统计数据计算
    const result: Record<string, number> = {};

    if (stats.byRegion) {
      Object.entries(stats.byRegion).forEach(([_region, data]) => {
        // 按流量和请求数计算成本
        const traffic = data.traffic || 0; // 确保存在traffic属性
        const requests = data.requests || 0; // 确保存在requests属性

        const trafficCost = (traffic / 1000000000) * 0.08;
        const requestCost = (requests / 10000) * 0.01;

        result[_region] = trafficCost + requestCost;
      });
    }

    return result;
  }

  /**
   * 计算按计费项的成本
   */
  private calculateCostByBillingItem(stats: CDNUsageStats): Record<string, number> {
    // 实际实现中，应该基于CDN计费规则计算
    // 这里使用简单模型
    const trafficCost = (stats.totalTraffic / 1000000000) * 0.08;
    const requestCost = (stats.totalRequests / 10000) * 0.01;
    const sslCost = 10; // 固定SSL费用

    return {
      traffic: trafficCost,
      requests: requestCost,
      ssl: sslCost,
      other: 5 // 其他费用
    };
  }

  /**
   * 计算成本趋势
   */
  private calculateCostTrends(
    _options: CDNStatsOptions
  ): Array<{ period: string; cost: number; change: number; changePercentage: number }> {
    // 实际实现中，应该基于历史账单数据计算
    // 这里只生成示例数据

    const baseCost = 150 + Math.random() * 50;
    const trends = [];

    for (let i = 5; i >= 0; i--) {
      const previousPeriodCost = baseCost * (0.9 + Math.random() * 0.2);
      const currentPeriodCost = baseCost * (0.9 + Math.random() * 0.2);
      const change = currentPeriodCost - previousPeriodCost;
      const changePercentage = (change / previousPeriodCost) * 100;

      trends.push({
        period: `${i + 1}月前`,
        cost: currentPeriodCost,
        change,
        changePercentage
      });
    }

    return trends;
  }

  /**
   * 生成成本节省建议
   */
  private generateCostSavingSuggestions(_stats: CDNUsageStats): Array<{
    suggestion: string;
    potentialSaving: number;
    implementation: string;
    impact: 'low' | 'medium' | 'high';
  }> {
    // 基于统计数据生成节省建议
    const totalCost = this.calculateTotalCost(_stats);

    return [
      {
        suggestion: '优化缓存TTL设置',
        potentialSaving: totalCost * 0.1,
        implementation: '增加静态资源的缓存时间，减少回源请求',
        impact: 'medium' as const
      },
      {
        suggestion: '启用智能压缩',
        potentialSaving: totalCost * 0.15,
        implementation: '对文本、图片等内容启用自适应压缩算法',
        impact: 'high' as const
      },
      {
        suggestion: '设置流量带宽上限',
        potentialSaving: totalCost * 0.05,
        implementation: '为非关键资源设置较低的优先级和带宽限制',
        impact: 'low' as const
      }
    ];
  }

  /**
   * 生成成本预测
   */
  private generateCostForecast(
    _stats: CDNUsageStats,
    _options: CDNStatsOptions
  ): Array<{ period: string; estimatedCost: number; lowerBound: number; upperBound: number }> {
    // 基于当前使用趋势预测未来成本
    const totalCost = this.calculateTotalCost(_stats);
    const forecast = [];

    // 生成未来6个月的预测
    let currentCost = totalCost;
    for (let i = 1; i <= 6; i++) {
      // 假设每月增长5%-15%
      const growthRate = 1 + (0.05 + Math.random() * 0.1);
      currentCost *= growthRate;

      forecast.push({
        period: `${i}个月后`,
        estimatedCost: currentCost,
        lowerBound: currentCost * 0.8, // 下限为80%
        upperBound: currentCost * 1.2 // 上限为120%
      });
    }

    return forecast;
  }

  /**
   * 检测异常情况
   */
  private detectAnomalies(stats: CDNUsageStats): CDNTrafficAnomaly[] {
    const anomalies: any[] = [];

    // 在时间序列数据中检测异常
    if (stats.timeSeriesData && stats.timeSeriesData.length > 0) {
      const trafficData = stats.timeSeriesData.map(point => point.traffic);
      const bandwidthData = stats.timeSeriesData.map(point => point.bandwidth);
      const requestsData = stats.timeSeriesData.map(point => point.requests);

      // 计算平均值和标准差
      const trafficStats = this.calculateStats(trafficData);
      const bandwidthStats = this.calculateStats(bandwidthData);
      const requestsStats = this.calculateStats(requestsData);

      // 检测流量异常
      stats.timeSeriesData.forEach(point => {
        // 流量异常检测
        if (Math.abs(point.traffic - trafficStats.mean) > trafficStats.stdDev * 2.5) {
          // 创建固定长度的元组而不是数组
          const expectedRange: [number, number] = [
            trafficStats.mean - trafficStats.stdDev * 2,
            trafficStats.mean + trafficStats.stdDev * 2
          ];

          anomalies.push({
            metric: 'traffic',
            timestamp: point.timestamp,
            value: point.traffic,
            expectedRange,
            severity: this.getAnomalySeverity(
              point.traffic,
              trafficStats.mean,
              trafficStats.stdDev
            ),
            description: '流量值异常波动',
            possibleCauses: this.getAnomalyCauses('bandwidth'),
            recommendedActions: this.getAnomalyActions('bandwidth', 'medium')
          });
        }

        // 带宽异常检测
        if (Math.abs(point.bandwidth - bandwidthStats.mean) > bandwidthStats.stdDev * 2.5) {
          // 创建固定长度的元组而不是数组
          const expectedRange: [number, number] = [
            bandwidthStats.mean - bandwidthStats.stdDev * 2,
            bandwidthStats.mean + bandwidthStats.stdDev * 2
          ];

          anomalies.push({
            metric: 'bandwidth',
            timestamp: point.timestamp,
            value: point.bandwidth,
            expectedRange,
            severity: this.getAnomalySeverity(
              point.bandwidth,
              bandwidthStats.mean,
              bandwidthStats.stdDev
            ),
            description: '带宽值异常波动',
            possibleCauses: this.getAnomalyCauses('bandwidth'),
            recommendedActions: this.getAnomalyActions('bandwidth', 'medium')
          });
        }

        // 请求数异常检测
        if (Math.abs(point.requests - requestsStats.mean) > requestsStats.stdDev * 2.5) {
          // 创建固定长度的元组而不是数组
          const expectedRange: [number, number] = [
            requestsStats.mean - requestsStats.stdDev * 2,
            requestsStats.mean + requestsStats.stdDev * 2
          ];

          anomalies.push({
            metric: 'requests',
            timestamp: point.timestamp,
            value: point.requests,
            expectedRange,
            severity: this.getAnomalySeverity(
              point.requests,
              requestsStats.mean,
              requestsStats.stdDev
            ),
            description: '请求数异常波动',
            possibleCauses: this.getAnomalyCauses('requests'),
            recommendedActions: this.getAnomalyActions('requests', 'medium')
          });
        }
      });
    }

    // 使用ensureExpectedRangeTuple方法确保expectedRange是元组
    return this.ensureExpectedRangeTuple(anomalies);
  }

  /**
   * 计算数据的统计信息
   */
  private calculateStats(data: number[]): {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
  } {
    const sum = data.reduce((acc, val) => acc + val, 0);
    const mean = sum / data.length;

    const squaredDiffs = data.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / data.length;
    const stdDev = Math.sqrt(variance);

    const sortedData = [...data].sort((a, b) => a - b);
    const median = sortedData[Math.floor(data.length / 2)];

    return {
      mean,
      median,
      stdDev,
      min: Math.min(...data),
      max: Math.max(...data)
    };
  }

  /**
   * 获取异常严重程度
   */
  private getAnomalySeverity(
    value: number,
    mean: number,
    stdDev: number
  ): 'low' | 'medium' | 'high' {
    const deviationRatio = Math.abs(value - mean) / stdDev;

    if (deviationRatio > 4) {
      return 'high';
    } else if (deviationRatio > 3) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * 生成各类优化建议
   */
  private generatePerformanceOptimizationSuggestions(
    performance: CDNPerformanceAnalysis
  ): CDNOptimizationSuggestion[] {
    // 基于性能分析生成优化建议
    const suggestions: CDNOptimizationSuggestion[] = [];

    // 如果响应时间较高
    if (performance.avgResponseTime > 150) {
      suggestions.push({
        type: 'performance',
        title: '启用HTTP/2与HTTP/3',
        description: '升级到更现代的HTTP协议可以减少延迟并提高吞吐量',
        impact: 'medium',
        complexity: 'low',
        implementationSteps: [
          '在CDN控制台中启用HTTP/2和HTTP/3（QUIC）',
          '验证服务器支持',
          '更新SSL/TLS证书确保兼容性'
        ]
      });
    }

    // 如果缓存命中率较低
    if (performance.cacheHitRate < 0.8) {
      suggestions.push({
        type: 'performance',
        title: '优化缓存策略',
        description: '改进缓存配置以提高命中率，减少回源请求',
        impact: 'high',
        complexity: 'medium',
        potentialBenefit: {
          type: 'performance',
          value: 20,
          unit: '%'
        },
        implementationSteps: [
          '延长静态资源缓存时间',
          '使用ETag和条件请求',
          '启用缓存分级策略',
          '配置缓存键规则',
          '优化缓存刷新策略'
        ]
      });
    }

    return suggestions;
  }

  /**
   * 生成成本优化建议
   */
  private generateCostOptimizationSuggestions(
    costAnalysis: CDNCostAnalysis
  ): CDNOptimizationSuggestion[] {
    // 基于成本分析生成优化建议
    const suggestions: CDNOptimizationSuggestion[] = [];

    // 如果成本高于基准水平
    if (costAnalysis.totalCost > 100) {
      suggestions.push({
        type: 'cost',
        title: '优化图片和视频资源',
        description: '使用更有效的编码和自适应分辨率减少媒体流量',
        impact: 'high',
        complexity: 'medium',
        potentialBenefit: {
          type: 'cost',
          value: 15,
          unit: '%'
        },
        implementationSteps: [
          '将JPEG/PNG图片转换为WebP/AVIF格式',
          '实施响应式图片技术',
          '使用视频转码将视频转为更高效的格式',
          '启用自适应比特率流媒体'
        ]
      });
    }

    // 如果区域分布不均衡
    const regionCosts = Object.values(costAnalysis.byRegion || {});
    const maxRegionCost = Math.max(...regionCosts);
    const totalRegionCost = regionCosts.reduce((sum, cost) => sum + cost, 0);

    if (maxRegionCost > totalRegionCost * 0.5) {
      // 如果某个区域占总成本的50%以上
      suggestions.push({
        type: 'cost',
        title: '优化多区域分发策略',
        description: '通过更合理的区域分发策略降低高成本区域的费用',
        impact: 'medium',
        complexity: 'high',
        potentialBenefit: {
          type: 'cost',
          value: 10,
          unit: '%'
        },
        implementationSteps: [
          '分析用户区域分布',
          '调整区域资源分配',
          '考虑多CDN供应商策略',
          '实施地理位置路由优化'
        ]
      });
    }

    return suggestions;
  }

  /**
   * 生成安全优化建议
   */
  private generateSecurityOptimizationSuggestions(
    stats: CDNUsageStats
  ): CDNOptimizationSuggestion[] {
    // 基于使用统计生成安全相关建议
    const suggestions: CDNOptimizationSuggestion[] = [];

    // 添加默认安全建议
    suggestions.push({
      type: 'security',
      title: '配置内容安全策略',
      description: '通过CSP防止XSS和数据注入攻击',
      impact: 'medium',
      complexity: 'medium',
      implementationSteps: [
        '分析当前资源加载情况',
        '制定CSP策略规则',
        '配置适当的CSP响应头',
        '使用报告模式进行测试',
        '逐步实施强制模式'
      ]
    });

    // 如果有大量404状态码，可能存在扫描攻击
    if (stats.statusCodeDistribution && stats.statusCodeDistribution['404']) {
      const notFoundRate = stats.statusCodeDistribution['404'] / stats.totalRequests;
      if (notFoundRate > 0.05) {
        // 5%以上的404请求
        suggestions.push({
          type: 'security',
          title: '加强恶意扫描防护',
          description: '检测到大量404请求，可能存在恶意扫描行为',
          impact: 'high',
          complexity: 'medium',
          implementationSteps: [
            '实施请求速率限制',
            '配置Web应用防火墙规则',
            '监控异常请求模式',
            '屏蔽恶意IP地址',
            '优化404页面响应'
          ]
        });
      }
    }

    return suggestions;
  }

  /**
   * 生成可用性优化建议
   */
  private generateAvailabilityOptimizationSuggestions(
    stats: CDNUsageStats
  ): CDNOptimizationSuggestion[] {
    // 基于使用统计生成可用性相关建议
    const suggestions: CDNOptimizationSuggestion[] = [];

    // 添加默认可用性建议
    suggestions.push({
      type: 'availability',
      title: '实施多区域部署与故障转移',
      description: '通过多区域部署提高服务可用性和降低延迟',
      impact: 'high',
      complexity: 'high',
      potentialBenefit: {
        type: 'other',
        value: 99.99,
        unit: '% 可用性'
      },
      implementationSteps: [
        '在多个区域配置CDN终端',
        '设置健康检查与自动故障转移',
        '配置地理路由策略',
        '实施多区域源站部署',
        '定期测试故障转移机制'
      ]
    });

    // 如果有区域性延迟问题
    if (stats.byRegion) {
      let hasLatencyIssue = false;
      Object.entries(stats.byRegion).forEach(([_region, data]) => {
        // 由于byRegion中没有avgResponseTime属性，改用请求/流量比率判断性能
        if (data.requests > 0 && data.traffic / data.requests > 5000) {
          // 如果某区域的每请求流量较高，可能表示性能问题
          hasLatencyIssue = true;
        }
      });

      if (hasLatencyIssue) {
        suggestions.push({
          type: 'availability',
          title: '优化边缘节点分布',
          description: '通过增加高延迟区域的边缘节点提升用户体验',
          impact: 'medium',
          complexity: 'medium',
          implementationSteps: [
            '分析高延迟区域的用户分布',
            '与CDN供应商协商增加节点',
            '调整路由策略优先选择低延迟节点',
            '监控改进效果'
          ]
        });
      }
    }

    // 检查5xx错误率
    if (stats.statusCodeDistribution) {
      let serverErrorCount = 0;
      Object.entries(stats.statusCodeDistribution).forEach(([code, count]) => {
        if (parseInt(code) >= 500 && parseInt(code) < 600) {
          serverErrorCount += count;
        }
      });

      const serverErrorRate = serverErrorCount / stats.totalRequests;
      if (serverErrorRate > 0.01) {
        // 1%以上的服务器错误
        suggestions.push({
          type: 'availability',
          title: '提高源站可靠性',
          description: '检测到较高的服务器错误率，建议优化源站架构',
          impact: 'high',
          complexity: 'high',
          implementationSteps: [
            '实施负载均衡',
            '增加源站冗余',
            '优化资源分配',
            '实施自动扩缩容',
            '完善健康检查机制'
          ]
        });
      }
    }

    return suggestions;
  }

  /**
   * 生成JSON格式报告
   */
  private generateJsonReport(
    options: CDNReportOptions,
    stats: CDNUsageStats,
    performance: CDNPerformanceAnalysis,
    cost: CDNCostAnalysis,
    anomalies: CDNTrafficAnomaly[],
    suggestions: CDNOptimizationSuggestion[]
  ): Buffer {
    // 根据报告级别选择要包含的数据
    const reportData: any = {
      title: options.title || 'CDN统计报告',
      timeRange: {
        startTime: options.startTime,
        endTime: options.endTime
      },
      generatedAt: new Date()
    };

    // 基础统计数据
    reportData.stats = {
      totalTraffic: stats.totalTraffic,
      totalRequests: stats.totalRequests,
      peakBandwidth: stats.peakBandwidth,
      cacheHitRate: stats.cacheHitRate
    };

    // 根据报告级别添加更多详细信息
    if (options.level === 'detailed' || options.level === 'comprehensive') {
      reportData.performance = performance;
      reportData.cost = cost;
      reportData.anomalies = anomalies;
      reportData.suggestions = suggestions;

      if (options.level === 'comprehensive') {
        // 添加更全面的数据
        reportData.stats.byDomain = stats.byDomain;
        reportData.stats.byRegion = stats.byRegion;
        reportData.stats.timeSeriesData = stats.timeSeriesData;
        reportData.stats.statusCodeDistribution = stats.statusCodeDistribution;
      }
    }

    // 转换为JSON字符串并返回Buffer
    return Buffer.from(JSON.stringify(reportData, null, 2), 'utf-8');
  }

  /**
   * 生成CSV格式报告
   */
  private generateCsvReport(options: CDNReportOptions, stats: CDNUsageStats): Buffer {
    // CSV头部
    let csvContent = 'Date,Traffic (GB),Requests,Bandwidth (Mbps),Cache Hit Rate (%)\n';

    // 如果有时间序列数据，添加每个时间点的数据
    if (stats.timeSeriesData && stats.timeSeriesData.length > 0) {
      stats.timeSeriesData.forEach(point => {
        const date = point.timestamp.toISOString();
        const trafficGB = (point.traffic / 1000000000).toFixed(2);
        const requests = point.requests.toLocaleString();
        const bandwidthMbps = (point.bandwidth / 1000000).toFixed(2);
        const cacheHitRate = stats.cacheHitRate ? (stats.cacheHitRate * 100).toFixed(2) : 'N/A';

        csvContent += `${date},${trafficGB},${requests},${bandwidthMbps},${cacheHitRate}\n`;
      });
    } else {
      // 如果没有时间序列数据，添加汇总数据
      const startDate = options.startTime.toISOString();
      const trafficGB = (stats.totalTraffic / 1000000000).toFixed(2);
      const requests = stats.totalRequests.toLocaleString();
      const bandwidthMbps = (stats.peakBandwidth / 1000000).toFixed(2);
      const cacheHitRate = stats.cacheHitRate ? (stats.cacheHitRate * 100).toFixed(2) : 'N/A';

      csvContent += `${startDate},${trafficGB},${requests},${bandwidthMbps},${cacheHitRate}\n`;
    }

    return Buffer.from(csvContent, 'utf-8');
  }

  /**
   * 生成HTML格式报告
   */
  private generateHtmlReport(
    options: CDNReportOptions,
    stats: CDNUsageStats,
    performance: CDNPerformanceAnalysis,
    cost: CDNCostAnalysis,
    anomalies: CDNTrafficAnomaly[],
    suggestions: CDNOptimizationSuggestion[]
  ): Buffer {
    const title = options.title || 'CDN统计报告';
    const timeRange = `${options.startTime.toLocaleDateString()} - ${options.endTime.toLocaleDateString()}`;

    // 创建HTML内容
    let html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
    h1, h2, h3 { color: #2c3e50; }
    .report-header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
    .section { margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f2f2f2; }
    .suggestion { background-color: #f8f9fa; padding: 15px; margin-bottom: 10px; border-left: 4px solid #3498db; }
    .high { border-left-color: #e74c3c; }
    .medium { border-left-color: #f39c12; }
    .low { border-left-color: #3498db; }
    .chart { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; height: 300px; }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${title}</h1>
    <p>时间范围: ${timeRange}</p>
    <p>生成时间: ${new Date().toLocaleString()}</p>
  </div>

  <div class="section">
    <h2>统计摘要</h2>
    <table>
      <tr>
        <th>指标</th>
        <th>值</th>
      </tr>
      <tr>
        <td>总流量</td>
        <td>${(stats.totalTraffic / 1000000000).toFixed(2)} GB</td>
      </tr>
      <tr>
        <td>总请求数</td>
        <td>${stats.totalRequests.toLocaleString()}</td>
      </tr>
      <tr>
        <td>峰值带宽</td>
        <td>${(stats.peakBandwidth / 1000000).toFixed(2)} Mbps</td>
      </tr>
      <tr>
        <td>缓存命中率</td>
        <td>${stats.cacheHitRate ? (stats.cacheHitRate * 100).toFixed(2) : 'N/A'}%</td>
      </tr>
    </table>
  </div>`;

    // 根据报告级别添加更多详细信息
    if (options.level === 'detailed' || options.level === 'comprehensive') {
      // 添加性能分析部分
      html += `
  <div class="section">
    <h2>性能分析</h2>
    <table>
      <tr>
        <th>指标</th>
        <th>值</th>
      </tr>
      <tr>
        <td>平均响应时间</td>
        <td>${performance.avgResponseTime.toFixed(2)} ms</td>
      </tr>
      <tr>
        <td>P95响应时间</td>
        <td>${performance.responseTimePercentiles.p95.toFixed(2)} ms</td>
      </tr>
      <tr>
        <td>缓存命中率</td>
        <td>${(performance.cacheHitRate * 100).toFixed(2)}%</td>
      </tr>
    </table>
    
    <h3>性能瓶颈</h3>
    <div class="bottlenecks">
      ${performance.bottlenecks
        .map(
          bottleneck => `
        <div class="suggestion ${bottleneck.impact}">
          <h4>${bottleneck.type}</h4>
          <p>${bottleneck.description}</p>
          <p><strong>建议操作:</strong> ${bottleneck.suggestion}</p>
        </div>
      `
        )
        .join('')}
    </div>
  </div>`;

      // 添加成本分析部分
      html += `
  <div class="section">
    <h2>成本分析</h2>
    <table>
      <tr>
        <th>指标</th>
        <th>值</th>
      </tr>
      <tr>
        <td>总成本</td>
        <td>$${cost.totalCost.toFixed(2)}</td>
      </tr>
    </table>
    
    <h3>成本节省建议</h3>
    <div class="savings">
      ${cost.savingSuggestions
        .map(
          saving => `
        <div class="suggestion ${saving.impact}">
          <h4>${saving.suggestion}</h4>
          <p>潜在节省: $${saving.potentialSaving.toFixed(2)}</p>
          <p><strong>实施方法:</strong> ${saving.implementation}</p>
        </div>
      `
        )
        .join('')}
    </div>
  </div>`;

      // 添加流量异常部分
      if (anomalies.length > 0) {
        html += `
  <div class="section">
    <h2>流量异常</h2>
    <div class="anomalies">
      ${anomalies
        .map(
          anomaly => `
        <div class="suggestion ${anomaly.severity}">
          <h4>${anomaly.description}</h4>
          <p>时间: ${anomaly.timestamp.toLocaleString()}</p>
          <p>指标: ${anomaly.metric}, 值: ${anomaly.value.toFixed(2)}</p>
          <p><strong>可能原因:</strong> ${anomaly.possibleCauses.join(', ')}</p>
          <p><strong>建议操作:</strong></p>
          <ul>
            ${anomaly.recommendedActions.map(action => `<li>${action}</li>`).join('')}
          </ul>
        </div>
      `
        )
        .join('')}
    </div>
  </div>`;
      }

      // 添加优化建议部分
      html += `
  <div class="section">
    <h2>优化建议</h2>
    <div class="suggestions">
      ${suggestions
        .map(
          suggestion => `
        <div class="suggestion ${suggestion.impact}">
          <h4>${suggestion.title}</h4>
          <p>${suggestion.description}</p>
          <p><strong>影响:</strong> ${suggestion.impact}</p>
          <p><strong>复杂度:</strong> ${suggestion.complexity}</p>
          <p><strong>实施步骤:</strong></p>
          <ul>
            ${suggestion.implementationSteps.map(step => `<li>${step}</li>`).join('')}
          </ul>
        </div>
      `
        )
        .join('')}
    </div>
  </div>`;
    }

    // 关闭HTML标签
    html += `
</body>
</html>`;

    return Buffer.from(html, 'utf-8');
  }

  /**
   * 生成PDF格式报告
   */
  private generatePdfReport(
    options: CDNReportOptions,
    stats: CDNUsageStats,
    performance: CDNPerformanceAnalysis,
    cost: CDNCostAnalysis,
    anomalies: CDNTrafficAnomaly[],
    suggestions: CDNOptimizationSuggestion[]
  ): Buffer {
    // 首先生成HTML报告
    const htmlReportContent = this.generateHtmlReport(
      options,
      stats,
      performance,
      cost,
      anomalies,
      suggestions
    );

    // 实际实现中应该使用PDF生成库将HTML转换为PDF
    // 例如使用puppeteer或jsPDF等库

    // 这里只是返回一个简单的消息，表示需要PDF生成库
    const message = `
PDF报告生成功能需要集成PDF生成库。
建议在实际项目中集成如下库之一：
1. puppeteer - 使用无头Chrome生成PDF
2. jsPDF - 轻量级客户端PDF生成
3. pdfkit - 服务端PDF生成库

报告基础数据：
- 标题: ${options.title || 'CDN统计报告'}
- 时间范围: ${options.startTime.toLocaleDateString()} - ${options.endTime.toLocaleDateString()}
- 报告级别: ${options.level || 'detailed'}
- 包含指标: ${Object.keys(stats).join(', ')}
`;

    // 这里忽略htmlReportContent以避免未使用警告，实际应该使用它生成PDF
    return Buffer.from(message + (htmlReportContent ? '' : ''), 'utf-8');
  }

  /**
   * 修复anomalies类型错误
   * 确保expectedRange是固定长度为2的元组而不是数组
   */
  private ensureExpectedRangeTuple(anomalies: any[]): CDNTrafficAnomaly[] {
    return anomalies.map(anomaly => {
      // 确保expectedRange是[低值, 高值]的元组形式
      const range: [number, number] = [anomaly.expectedRange[0], anomaly.expectedRange[1]];
      return {
        ...anomaly,
        expectedRange: range
      };
    });
  }
}
