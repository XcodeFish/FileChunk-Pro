/**
 * 文件检测器配置选项
 */
export interface FileInspectorOptions {
  /** 是否启用MIME类型检测 */
  enableMimeDetection: boolean;
  /** 是否启用内容扫描 */
  enableContentScanning: boolean;
  /** 是否启用病毒扫描 */
  enableVirusScan: boolean;
  /** 内容扫描大小限制(字节) */
  scanSizeLimit: number;
  /** 是否缓存检查结果 */
  cacheResults: boolean;
  /** 缓存有效期(毫秒) */
  cacheMaxAge: number;
  /** 风险阈值(0-100) */
  riskThreshold: number;
  /** 最大允许风险值 */
  maxAllowedRisk: number;
  /** 最大文件大小(字节) */
  maxFileSize: number;
  /** 外部病毒扫描API端点 */
  scanApiEndpoint: string;
  /** 扫描API密钥 */
  scanApiKey: string;
}

/**
 * 风险等级
 */
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

/**
 * 文件信息
 */
export interface FileInfo {
  /** 文件名 */
  name: string;
  /** 文件大小(字节) */
  size: number;
  /** 文件类型(MIME) */
  type: string;
  /** 最后修改时间 */
  lastModified: number;
  /** 文件指纹 */
  fingerprint: string;
}

/**
 * 检查结果
 */
export interface InspectionResult {
  /** 文件信息 */
  fileInfo: FileInfo;
  /** 文件是否有效 */
  isValid: boolean;
  /** 风险评分(0-100) */
  riskScore: number;
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 无效原因列表 */
  reasons: string[];
  /** 警告信息列表 */
  warnings: string[];
  /** 详细检查结果 */
  details: {
    /** 各规则检查结果 */
    rules: Record<string, ScanResult>;
    /** MIME类型检测结果 */
    mimeInfo?: MimeDetectionResult | null;
    /** 内容扫描结果 */
    contentScanInfo?: ContentScanResult | null;
    /** 病毒扫描结果 */
    virusScanInfo?: VirusScanResult | null;
    /** 错误信息 */
    error?: string;
  };
  /** 检查时间戳 */
  timestamp: number;
  /** 是否来自缓存 */
  cached: boolean;
}

/**
 * 检查规则
 */
export interface InspectionRule {
  /** 规则ID */
  id: string;
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description: string;
  /** 是否启用 */
  enabled: boolean;
  /** 权重(用于计算风险评分) */
  weight: number;
  /** 检查函数 */
  check: (file: File, options: FileInspectorOptions) => Promise<ScanResult>;
}

/**
 * 单项扫描结果
 */
export interface ScanResult {
  /** 风险评分(0-100) */
  riskScore: number;
  /** 是否存在严重问题 */
  critical: boolean;
  /** 问题列表 */
  issues: string[];
  /** 警告列表 */
  warnings: string[];
  /** 详细信息(可选) */
  details?: any;
}

/**
 * MIME类型检测结果
 */
export interface MimeDetectionResult {
  /** 检测到的MIME类型 */
  mimeType: string;
  /** 文件声明的MIME类型 */
  declaredMimeType: string;
  /** 扩展名是否与MIME类型匹配 */
  extensionMatch: boolean;
  /** 是否为恶意文件类型 */
  isMalicious: boolean;
  /** 预期扩展名 */
  expectedExtension?: string;
}

/**
 * 内容扫描结果
 */
export interface ContentScanResult {
  /** 是否包含恶意内容 */
  isMalicious: boolean;
  /** 检测到的恶意模式 */
  pattern?: string;
  /** 是否包含敏感数据 */
  containsSensitiveData?: boolean;
  /** 敏感数据类型 */
  sensitiveDataTypes?: string[];
  /** 内容样本(用于调试) */
  contentSample?: string;
  /** 外部扫描API的结果 */
  externalScanResults?: Record<string, any>;
  /** 外部扫描错误信息 */
  externalScanError?: string;
}

/**
 * 病毒扫描结果
 */
export interface VirusScanResult {
  /** 是否已扫描 */
  scanned: boolean;
  /** 是否感染病毒 */
  infected: boolean;
  /** 威胁名称 */
  threatName?: string;
  /** 扫描分数 */
  scanScore?: number;
  /** 是否可疑 */
  suspicious?: boolean;
  /** 可疑原因 */
  suspicionReason?: string;
}
