/**
 * CDN提供商类型
 */
export enum CDNProviderType {
  CLOUDFLARE = 'cloudflare',
  ALIYUN = 'aliyun',
  QCLOUD = 'qcloud',
  AWS_CLOUDFRONT = 'aws_cloudfront',
  FASTLY = 'fastly',
  AKAMAI = 'akamai',
  CUSTOM = 'custom'
}

/**
 * CDN配置接口
 */
export interface CDNConfig {
  // CDN提供商类型
  provider: CDNProviderType;

  // CDN域名配置
  domain: string;

  // 授权信息
  auth?: {
    accessKey?: string;
    secretKey?: string;
    token?: string;
    [key: string]: any;
  };

  // 路径前缀
  pathPrefix?: string;

  // 用于URL生成的自定义参数
  urlParams?: Record<string, string>;

  // 请求头
  headers?: Record<string, string>;

  // CDN区域
  region?: string;

  // 是否启用HTTPS
  useHttps?: boolean;

  // 是否启用数据统计
  enableStats?: boolean;

  // 用于选择最近的CDN节点
  geoRouting?: boolean;

  // 最大可用性故障转移配置
  failover?: {
    enabled: boolean;
    maxRetries?: number;
    timeout?: number;
    fallbackDomains?: string[];
  };

  // 自定义字段
  [key: string]: any;
}

/**
 * CDN提供商接口
 */
export interface CDNProvider {
  // 提供商类型标识
  type: CDNProviderType;

  // 提供商名称
  name: string;

  // 初始化提供商
  initialize(config: CDNConfig): Promise<void>;

  // 生成上传URL
  generateUploadUrl(options: CDNUploadOptions): Promise<string>;

  // 获取资源URL
  getResourceUrl(key: string, options?: CDNResourceOptions): string;

  // 刷新资源缓存
  refreshResource(resourceUrls: string[]): Promise<CDNRefreshResult>;

  // 预热资源
  prefetchResource(resourceUrls: string[]): Promise<CDNPrefetchResult>;

  // 获取资源信息
  getResourceInfo(key: string): Promise<CDNResourceInfo>;

  // 获取CDN使用统计
  getUsageStats(options: CDNStatsOptions): Promise<CDNUsageStats>;

  // 删除资源
  deleteResource(keys: string[]): Promise<CDNDeleteResult>;
}

/**
 * CDN上传选项
 */
export interface CDNUploadOptions {
  // 存储路径/键
  key: string;

  // 文件类型
  contentType?: string;

  // 文件大小
  contentLength?: number;

  // 过期时间（秒）
  expires?: number;

  // 自定义元数据
  metadata?: Record<string, string>;

  // 上传回调URL
  callbackUrl?: string;

  // 自定义字段
  [key: string]: any;
}

/**
 * CDN资源选项
 */
export interface CDNResourceOptions {
  // 过期时间（秒）
  expires?: number;

  // 查询参数
  queryParams?: Record<string, string>;

  // 样式处理参数（图片处理等）
  process?: string;

  // 自定义字段
  [key: string]: any;
}

/**
 * CDN刷新结果
 */
export interface CDNRefreshResult {
  // 成功刷新的URL列表
  successful: string[];

  // 失败的URL列表
  failed: Array<{ url: string; reason: string }>;

  // 刷新任务ID
  taskId?: string;

  // 剩余刷新配额
  remainingQuota?: number;

  // 请求ID
  requestId?: string;
}

/**
 * CDN预热结果
 */
export interface CDNPrefetchResult {
  // 成功预热的URL列表
  successful: string[];

  // 失败的URL列表
  failed: Array<{ url: string; reason: string }>;

  // 预热任务ID
  taskId?: string;

  // 剩余预热配额
  remainingQuota?: number;

  // 请求ID
  requestId?: string;
}

/**
 * CDN删除结果
 */
export interface CDNDeleteResult {
  // 成功删除的资源键列表
  successful: string[];

  // 删除失败的资源键列表
  failed: Array<{ key: string; reason: string }>;

  // 请求ID
  requestId?: string;
}

/**
 * CDN资源信息
 */
export interface CDNResourceInfo {
  // 资源键
  key: string;

  // 资源URL
  url: string;

  // 文件大小（字节）
  size: number;

  // 最后修改时间
  lastModified: Date;

  // 文件类型
  contentType?: string;

  // ETag
  etag?: string;

  // 存储类别
  storageClass?: string;

  // 自定义元数据
  metadata?: Record<string, string>;
}

/**
 * CDN统计选项
 */
export interface CDNStatsOptions {
  // 开始时间
  startTime: Date;

  // 结束时间
  endTime: Date;

  // 统计粒度: 5min, hour, day, month
  interval?: string;

  // 需要查询的指标: traffic, bandwidth, requests, status_code, etc.
  metrics?: string[];

  // 域名列表，不提供则返回所有域名
  domains?: string[];

  // 区域
  regions?: string[];

  // 是否分页
  pagination?: {
    pageSize: number;
    pageNumber: number;
  };

  // 时区
  timezone?: string;

  // 自定义字段
  [key: string]: any;
}

/**
 * CDN使用统计数据
 */
export interface CDNUsageStats {
  // 总流量（字节）
  totalTraffic: number;

  // 总带宽（bps）
  peakBandwidth: number;

  // 总请求数
  totalRequests: number;

  // 按域名统计
  byDomain?: Record<
    string,
    {
      traffic: number;
      peakBandwidth: number;
      requests: number;
      hitRate?: number;
    }
  >;

  // 按区域统计
  byRegion?: Record<
    string,
    {
      traffic: number;
      requests: number;
    }
  >;

  // 按时间段统计
  timeSeriesData?: Array<{
    timestamp: Date;
    traffic: number;
    bandwidth: number;
    requests: number;
  }>;

  // 按HTTP状态码统计
  statusCodeDistribution?: Record<string, number>;

  // 缓存命中率
  cacheHitRate?: number;

  // 边缘请求命中率
  edgeHitRate?: number;

  // 费用估算（美元）
  estimatedCost?: number;

  // 节省的回源流量（字节）
  originTrafficSaved?: number;

  // 请求性能数据
  performance?: {
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };

  // 异常数据
  anomalies?: Array<{
    metric: string;
    timestamp: Date;
    value: number;
    expectedRange: [number, number];
    severity: 'low' | 'medium' | 'high';
  }>;

  // 请求分布
  requestDistribution?: {
    byFileType?: Record<string, number>;
    byFileSize?: Record<string, number>;
  };

  // 分页信息
  pagination?: {
    totalPages: number;
    currentPage: number;
    totalItems: number;
  };

  // 更多自定义统计数据
  [key: string]: any;
}

/**
 * CDN统计与分析接口
 */
export interface CDNStatsAnalyzer {
  // 获取CDN使用统计数据
  getUsageStats(options: CDNStatsOptions): Promise<CDNUsageStats>;

  // 获取性能分析
  getPerformanceAnalysis(options: CDNStatsOptions): Promise<CDNPerformanceAnalysis>;

  // 获取成本分析
  getCostAnalysis(options: CDNStatsOptions): Promise<CDNCostAnalysis>;

  // 获取流量异常检测
  getTrafficAnomalies(options: CDNStatsOptions): Promise<CDNTrafficAnomaly[]>;

  // 获取优化建议
  getOptimizationSuggestions(): Promise<CDNOptimizationSuggestion[]>;

  // 导出统计报告
  exportReport(options: CDNReportOptions): Promise<string | Buffer>;

  // 设置告警规则
  setAlertRule(rule: CDNAlertRule): Promise<boolean>;

  // 获取告警历史
  getAlertHistory(options: CDNAlertHistoryOptions): Promise<CDNAlert[]>;

  // 获取实时监控数据
  getRealTimeMonitoring(interval?: number): Promise<CDNRealTimeStats>;
}

/**
 * CDN性能分析
 */
export interface CDNPerformanceAnalysis {
  // 平均响应时间（毫秒）
  avgResponseTime: number;

  // 响应时间百分位数（毫秒）
  responseTimePercentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };

  // 缓存命中率
  cacheHitRate: number;

  // 按区域的性能数据
  byRegion: Record<
    string,
    {
      avgResponseTime: number;
      cacheHitRate: number;
    }
  >;

  // 按内容类型的性能数据
  byContentType: Record<
    string,
    {
      avgResponseTime: number;
      cacheHitRate: number;
    }
  >;

  // 性能瓶颈
  bottlenecks: Array<{
    type: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    suggestion: string;
  }>;

  // 性能趋势
  trends: Array<{
    metric: string;
    period: string;
    change: number;
    changePercentage: number;
  }>;

  // 性能与竞争对手比较
  benchmarks?: Record<string, number>;
}

/**
 * CDN成本分析
 */
export interface CDNCostAnalysis {
  // 总成本（美元）
  totalCost: number;

  // 按域名的成本
  byDomain: Record<string, number>;

  // 按区域的成本
  byRegion: Record<string, number>;

  // 按计费项的成本
  byBillingItem: Record<string, number>;

  // 成本趋势
  trends: Array<{
    period: string;
    cost: number;
    change: number;
    changePercentage: number;
  }>;

  // 成本节省建议
  savingSuggestions: Array<{
    suggestion: string;
    potentialSaving: number;
    implementation: string;
    impact: 'low' | 'medium' | 'high';
  }>;

  // 成本预测
  forecast: Array<{
    period: string;
    estimatedCost: number;
    lowerBound: number;
    upperBound: number;
  }>;
}

/**
 * CDN流量异常
 */
export interface CDNTrafficAnomaly {
  // 异常指标
  metric: string;

  // 发生时间
  timestamp: Date;

  // 异常值
  value: number;

  // 预期范围
  expectedRange: [number, number];

  // 异常严重程度
  severity: 'low' | 'medium' | 'high';

  // 异常描述
  description: string;

  // 可能原因
  possibleCauses: string[];

  // 建议操作
  recommendedActions: string[];
}

/**
 * CDN优化建议
 */
export interface CDNOptimizationSuggestion {
  // 建议类型
  type: 'performance' | 'cost' | 'security' | 'availability';

  // 建议标题
  title: string;

  // 建议描述
  description: string;

  // 影响程度
  impact: 'low' | 'medium' | 'high';

  // 实施复杂度
  complexity: 'low' | 'medium' | 'high';

  // 潜在收益估算
  potentialBenefit?: {
    type: 'cost' | 'performance' | 'other';
    value: number;
    unit: string;
  };

  // 实施步骤
  implementationSteps: string[];
}

/**
 * CDN报告选项
 */
export interface CDNReportOptions {
  // 报告格式
  format: 'pdf' | 'csv' | 'json' | 'html';

  // 开始时间
  startTime: Date;

  // 结束时间
  endTime: Date;

  // 报告标题
  title?: string;

  // 包含的指标
  metrics?: string[];

  // 报告接收邮箱
  recipient?: string;

  // 报告语言
  language?: string;

  // 报告级别：简报、详细、全面
  level?: 'brief' | 'detailed' | 'comprehensive';
}

/**
 * CDN告警规则
 */
export interface CDNAlertRule {
  // 规则ID
  id?: string;

  // 规则名称
  name: string;

  // 监控指标
  metric: string;

  // 比较操作符
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';

  // 阈值
  threshold: number;

  // 持续时间（分钟），持续超过阈值多久才触发告警
  duration?: number;

  // 是否启用
  enabled: boolean;

  // 告警级别
  severity: 'info' | 'warning' | 'critical';

  // 通知渠道
  notificationChannels?: Array<{
    type: 'email' | 'sms' | 'webhook' | 'push';
    target: string;
  }>;

  // 冷却时间（分钟），告警触发后多久内不再重复告警
  cooldown?: number;
}

/**
 * CDN告警历史查询选项
 */
export interface CDNAlertHistoryOptions {
  // 开始时间
  startTime: Date;

  // 结束时间
  endTime: Date;

  // 告警级别
  severity?: ('info' | 'warning' | 'critical')[];

  // 告警状态
  status?: ('active' | 'acknowledged' | 'resolved')[];

  // 分页
  pagination?: {
    pageSize: number;
    pageNumber: number;
  };
}

/**
 * CDN告警记录
 */
export interface CDNAlert {
  // 告警ID
  id: string;

  // 对应的规则ID
  ruleId: string;

  // 告警时间
  timestamp: Date;

  // 告警级别
  severity: 'info' | 'warning' | 'critical';

  // 告警状态
  status: 'active' | 'acknowledged' | 'resolved';

  // 告警指标
  metric: string;

  // 触发值
  value: number;

  // 阈值
  threshold: number;

  // 告警信息
  message: string;

  // 受影响的域名
  domains?: string[];

  // 处理时间
  resolvedAt?: Date;

  // 处理人
  resolvedBy?: string;

  // 处理备注
  resolution?: string;
}

/**
 * CDN实时统计数据
 */
export interface CDNRealTimeStats {
  // 当前时间
  timestamp: Date;

  // 实时带宽（bps）
  currentBandwidth: number;

  // 实时请求率（QPS）
  currentQps: number;

  // 最近一分钟统计
  lastMinute: {
    requests: number;
    traffic: number;
    errorRate: number;
  };

  // 按域名实时数据
  byDomain: Record<
    string,
    {
      bandwidth: number;
      qps: number;
      errorRate: number;
    }
  >;

  // 按区域实时数据
  byRegion?: Record<
    string,
    {
      bandwidth: number;
      qps: number;
    }
  >;

  // 健康状态
  healthStatus: {
    overall: 'healthy' | 'degraded' | 'critical';
    components: Record<string, 'healthy' | 'degraded' | 'critical'>;
  };

  // 活跃告警数
  activeAlerts: number;
}
