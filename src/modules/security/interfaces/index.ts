/**
 * 表示加密算法类型
 */
export type EncryptionAlgorithm = 'AES-GCM' | 'AES-CBC' | 'RSA' | 'NONE';

/**
 * 表示签名算法类型
 */
export type SignatureAlgorithm = 'HMAC-SHA256' | 'HMAC-SHA512' | 'RSA-SHA256' | 'NONE';

/**
 * 表示哈希算法类型
 */
export type HashAlgorithm = 'MD5' | 'SHA1' | 'SHA256' | 'SHA512';

/**
 * 表示安全规则级别
 */
export type SecurityLevel = 'low' | 'medium' | 'high' | 'custom';

/**
 * 模块基本接口，后续会在 module-base.ts 中实现
 */
export interface ModuleInterface {
  init(kernel: any): Promise<void> | void;
}

/**
 * 安全模块配置选项
 */
export interface SecurityOptions {
  /**
   * 是否启用加密
   */
  encryptionEnabled?: boolean;

  /**
   * 加密算法
   */
  encryptionAlgorithm?: EncryptionAlgorithm;

  /**
   * 加密密钥
   */
  encryptionKey?: string;

  /**
   * 是否启用签名验证
   */
  signatureEnabled?: boolean;

  /**
   * 签名算法
   */
  signatureAlgorithm?: SignatureAlgorithm;

  /**
   * 签名密钥
   */
  signatureKey?: string;

  /**
   * 是否启用文件完整性检查
   */
  integrityCheck?: boolean;

  /**
   * 完整性检查算法
   */
  integrityAlgorithm?: HashAlgorithm;

  /**
   * 认证令牌提供者
   */
  tokenProvider?: () => Promise<string> | string;

  /**
   * 安全规则级别
   */
  securityLevel?: SecurityLevel;

  /**
   * 自定义安全规则
   */
  customRules?: SecurityRule[];

  /**
   * 是否启用速率限制
   */
  rateLimit?: boolean;

  /**
   * 速率限制配置
   */
  rateLimitOptions?: RateLimitOptions;
}

/**
 * 速率限制选项
 */
export interface RateLimitOptions {
  /**
   * 每分钟最大上传次数
   */
  maxUploadsPerMinute: number;

  /**
   * 最大并发上传数
   */
  maxConcurrentUploads: number;
}

/**
 * 安全规则接口
 */
export interface SecurityRule {
  /**
   * 规则唯一标识
   */
  id: string;

  /**
   * 规则名称
   */
  name: string;

  /**
   * 规则描述
   */
  description?: string;

  /**
   * 规则验证函数
   */
  validate: (file: File, context?: any) => Promise<boolean> | boolean;

  /**
   * 规则优先级
   */
  priority: number;

  /**
   * 规则失败消息
   */
  failureMessage: string;
}

/**
 * 加密接口
 */
export interface EncryptionInterface {
  /**
   * 初始化加密模块
   */
  init(): Promise<void>;

  /**
   * 加密数据
   * @param data - 要加密的数据
   * @returns 加密结果，包含加密后的数据和IV
   */
  encrypt(data: string | ArrayBuffer): Promise<{
    data: string | ArrayBuffer;
    iv: string;
  }>;

  /**
   * 解密数据
   * @param encryptedData - 加密的数据
   * @param iv - 初始化向量
   * @returns 解密后的数据
   */
  decrypt(encryptedData: string | ArrayBuffer, iv: string): Promise<string | ArrayBuffer>;

  /**
   * 导入密钥
   * @param key - 密钥数据
   * @param algorithm - 算法名称
   * @returns 导入的密钥对象
   */
  importKey(key: string | ArrayBuffer, algorithm: string): Promise<CryptoKey>;
}

/**
 * 签名验证接口
 */
export interface SignatureInterface {
  /**
   * 生成请求签名
   * @param method - HTTP方法
   * @param url - 请求URL
   * @param timestamp - 时间戳
   * @param body - 请求体（可选）
   * @returns 签名字符串
   */
  generateSignature(method: string, url: string, timestamp: string, body?: any): Promise<string>;

  /**
   * 验证签名
   * @param signature - 签名字符串
   * @param method - HTTP方法
   * @param url - 请求URL
   * @param timestamp - 时间戳
   * @param body - 请求体（可选）
   * @returns 签名是否有效
   */
  verifySignature(
    signature: string,
    method: string,
    url: string,
    timestamp: string,
    body?: any
  ): Promise<boolean>;
}

/**
 * 文件完整性验证接口
 */
export interface IntegrityCheckerInterface {
  /**
   * 计算文件哈希
   * @param file - 文件对象
   * @param algorithm - 哈希算法（可选）
   * @returns 哈希字符串
   */
  calculateHash(file: File, algorithm?: HashAlgorithm): Promise<string>;

  /**
   * 验证文件哈希
   * @param file - 文件对象
   * @param expectedHash - 期望的哈希值
   * @param algorithm - 哈希算法（可选）
   * @returns 哈希是否匹配
   */
  verifyHash(file: File, expectedHash: string, algorithm?: HashAlgorithm): Promise<boolean>;

  /**
   * 生成文件指纹
   * @param file - 文件对象
   * @returns 文件指纹数据
   */
  generateFingerprint(file: File): Promise<{
    hash: string;
    size: number;
    name: string;
    type: string;
    lastModified: number;
  }>;
}

/**
 * 安全防御接口
 */
export interface SecurityDefenseInterface {
  /**
   * 检查速率限制
   * @returns 清理函数
   */
  checkRateLimit(): () => void;

  /**
   * 验证文件安全性
   * @param file - 文件对象
   * @returns 文件是否安全
   */
  validateFile(file: File): boolean | Promise<boolean>;

  /**
   * 扫描文件内容
   * @param file - 文件对象
   * @returns 扫描结果
   */
  scanFile(file: File): Promise<{
    scanned: boolean;
    infected: boolean;
    threatName?: string;
    scanScore?: number;
  }>;
}

/**
 * 认证接口
 */
export interface AuthenticationInterface {
  /**
   * 获取认证令牌
   * @returns 认证令牌
   */
  getAuthToken(): Promise<string>;

  /**
   * 创建认证头
   * @returns HTTP认证头
   */
  createAuthHeaders(): Promise<Record<string, string>>;

  /**
   * 验证令牌有效性
   * @param token - 认证令牌
   * @returns 令牌是否有效
   */
  verifyToken(token: string): Promise<boolean>;
}

/**
 * 安全上下文接口
 */
export interface SecurityContext {
  /**
   * 用户ID
   */
  userId?: string;

  /**
   * 会话ID
   */
  sessionId?: string;

  /**
   * 设备信息
   */
  deviceInfo?: {
    userAgent: string;
    platform: string;
    screenSize?: string;
  };

  /**
   * IP地址
   */
  ipAddress?: string;

  /**
   * 地理位置信息
   */
  geoLocation?: {
    country?: string;
    city?: string;
    coordinates?: [number, number];
  };

  /**
   * 自定义安全属性
   */
  [key: string]: any;
}

/**
 * 安全模块接口
 */
export interface SecurityInterface extends ModuleInterface {
  /**
   * 初始化安全模块
   * @param kernel - 微内核实例
   */
  init(kernel: any): Promise<void>;

  /**
   * 请求拦截器
   * @param config - 请求配置
   * @returns 修改后的请求配置
   */
  beforeRequest(config: any): Promise<any>;

  /**
   * 响应拦截器
   * @param response - 响应对象
   * @returns 处理后的响应
   */
  afterResponse(response: any): Promise<any>;

  /**
   * 获取认证接口
   * @returns 认证接口实现
   */
  getAuthenticationInterface(): AuthenticationInterface;

  /**
   * 获取加密接口
   * @returns 加密接口实现
   */
  getEncryptionInterface(): EncryptionInterface;

  /**
   * 获取签名接口
   * @returns 签名接口实现
   */
  getSignatureInterface(): SignatureInterface;

  /**
   * 获取完整性检查接口
   * @returns 完整性检查接口实现
   */
  getIntegrityCheckerInterface(): IntegrityCheckerInterface;

  /**
   * 获取安全防御接口
   * @returns 安全防御接口实现
   */
  getSecurityDefenseInterface(): SecurityDefenseInterface;

  /**
   * 创建安全上下文
   * @param contextData - 上下文数据
   * @returns 安全上下文对象
   */
  createSecurityContext(contextData?: Partial<SecurityContext>): SecurityContext;

  /**
   * 验证文件上传安全性
   * @param file - 文件对象
   * @param context - 安全上下文
   * @returns 验证结果
   */
  validateFileUpload(
    file: File,
    context?: SecurityContext
  ): Promise<{
    isValid: boolean;
    reasons?: string[];
    warnings?: string[];
  }>;

  /**
   * 应用安全规则
   * @param file - 文件对象
   * @param rules - 规则集合
   * @param context - 安全上下文
   * @returns 规则验证结果
   */
  applySecurityRules(
    file: File,
    rules?: SecurityRule[],
    context?: SecurityContext
  ): Promise<{
    passed: boolean;
    failedRules: SecurityRule[];
  }>;
}
