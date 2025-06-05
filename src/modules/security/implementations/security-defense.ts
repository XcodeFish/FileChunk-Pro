import {
  SecurityDefenseInterface,
  SecurityLevel,
  SecurityRule,
  RateLimitOptions
} from '../interfaces';

/**
 * 安全防御配置选项
 */
interface SecurityDefenseOptions {
  /**
   * 是否启用速率限制
   */
  rateLimit?: boolean;

  /**
   * 速率限制配置
   */
  rateLimitOptions?: RateLimitOptions;

  /**
   * 安全规则级别
   */
  securityLevel?: SecurityLevel;

  /**
   * 自定义安全规则
   */
  customRules?: SecurityRule[];

  /**
   * 外部扫描API端点
   */
  scanApiEndpoint?: string;
}

/**
 * 安全防御实现类
 *
 * 提供速率限制和文件安全验证功能
 */
export class SecurityDefense implements SecurityDefenseInterface {
  /**
   * 安全防御配置选项
   */
  private options: SecurityDefenseOptions;

  /**
   * 上传时间记录
   */
  private uploadTimes: number[] = [];

  /**
   * 当前活跃上传数量
   */
  private currentUploads = 0;

  /**
   * 默认规则集
   */
  private defaultRules: Record<SecurityLevel, SecurityRule[]> = {
    low: [],
    medium: [],
    high: [],
    custom: []
  };

  /**
   * 构造函数
   * @param options - 安全防御配置选项
   */
  constructor(options: SecurityDefenseOptions = {}) {
    // 设置默认选项
    this.options = {
      rateLimit: false,
      rateLimitOptions: {
        maxUploadsPerMinute: 10,
        maxConcurrentUploads: 5
      },
      securityLevel: 'medium',
      customRules: [],
      ...options
    };
  }

  /**
   * 初始化安全防御模块
   */
  async init(): Promise<void> {
    // 初始化默认安全规则
    this.initDefaultRules();
  }

  /**
   * 检查速率限制
   * @returns 清理函数
   */
  checkRateLimit(): () => void {
    // 如果未启用速率限制，直接返回空函数
    if (!this.options.rateLimit) {
      return () => {};
    }

    const now = Date.now();
    const { maxUploadsPerMinute = 10, maxConcurrentUploads = 5 } =
      this.options.rateLimitOptions || {};

    // 清理一分钟前的记录
    this.uploadTimes = this.uploadTimes.filter(time => time > now - 60000);

    // 检查上传频率
    if (this.uploadTimes.length >= maxUploadsPerMinute) {
      throw new Error(`上传频率超过限制(每分钟${maxUploadsPerMinute}次)`);
    }

    // 检查并发上传数
    if (this.currentUploads >= maxConcurrentUploads) {
      throw new Error(`并发上传数超过限制(${maxConcurrentUploads})`);
    }

    // 记录本次上传
    this.uploadTimes.push(now);
    this.currentUploads++;

    // 返回一个函数用于上传完成时减少计数
    return () => {
      this.currentUploads--;
    };
  }

  /**
   * 验证文件安全性
   * @param file - 文件对象
   * @returns 文件是否安全
   */
  async validateFile(file: File): Promise<boolean> {
    try {
      // 文件基本检查
      const basicChecks = await this.performBasicChecks(file);
      if (!basicChecks.isValid) {
        return false;
      }

      // 应用当前安全级别的规则
      const levelRules = this.getSecurityLevelRules();
      for (const rule of levelRules) {
        try {
          const passed = await rule.validate(file);
          if (!passed) {
            console.warn(`文件安全规则验证失败: ${rule.name}`);
            return false;
          }
        } catch (error) {
          console.error(`规则验证错误 (${rule.name}):`, error);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('文件验证过程发生错误:', error);
      return false;
    }
  }

  /**
   * 扫描文件内容
   * @param file - 文件对象
   * @returns 扫描结果
   */
  async scanFile(file: File): Promise<{
    scanned: boolean;
    infected: boolean;
    threatName?: string;
    scanScore?: number;
  }> {
    // 如果未配置外部扫描API，返回未扫描状态
    if (!this.options.scanApiEndpoint) {
      return { scanned: false, infected: false };
    }

    try {
      // 执行本地简单扫描
      const localScan = await this.performLocalScan(file);
      if (localScan.infected) {
        return {
          scanned: true,
          infected: true,
          threatName: localScan.threatName,
          scanScore: 100 // 本地检测到威胁，高风险
        };
      }

      // 尝试调用外部扫描API（如果配置了）
      if (this.options.scanApiEndpoint) {
        return await this.callExternalScanApi(file);
      }

      return { scanned: true, infected: false };
    } catch (error) {
      console.error('文件扫描过程发生错误:', error);
      return {
        scanned: true,
        infected: false,
        scanScore: 0,
        threatName: `扫描错误: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 执行文件基本安全检查
   * @param file - 文件对象
   * @returns 检查结果
   */
  private async performBasicChecks(file: File): Promise<{ isValid: boolean; reasons: string[] }> {
    const result = {
      isValid: true,
      reasons: [] as string[]
    };

    // 检查文件是否为空
    if (!file || file.size === 0) {
      result.isValid = false;
      result.reasons.push('文件为空');
      return result;
    }

    // 检查高风险扩展名
    const highRiskExtensions = [
      '.exe',
      '.dll',
      '.bat',
      '.cmd',
      '.vbs',
      '.js',
      '.ws',
      '.wsf',
      '.msi',
      '.jsp',
      '.php',
      '.pif'
    ];
    const fileName = file.name.toLowerCase();

    for (const ext of highRiskExtensions) {
      if (fileName.endsWith(ext)) {
        result.isValid = false;
        result.reasons.push(`不允许上传${ext}类型文件，存在安全风险`);
        break;
      }
    }

    // 检查隐藏的可执行文件（例如：.exe.jpg）
    if (/\.(exe|dll|bat|cmd|msi)\..+$/i.test(fileName)) {
      result.isValid = false;
      result.reasons.push('检测到隐藏的可执行文件扩展名');
    }

    // 检查最大文件大小（默认10GB）
    const maxFileSize = 10 * 1024 * 1024 * 1024;
    if (file.size > maxFileSize) {
      result.isValid = false;
      result.reasons.push(`文件大小超过限制(${this.formatSize(maxFileSize)})`);
    }

    return result;
  }

  /**
   * 执行本地简单文件扫描
   * @param file - 文件对象
   * @returns 扫描结果
   */
  private async performLocalScan(file: File): Promise<{
    infected: boolean;
    threatName?: string;
  }> {
    // 检查已知危险文件类型
    const dangerousMimeTypes = [
      'application/x-msdownload',
      'application/x-executable',
      'application/x-dosexec',
      'application/x-msdos-program',
      'application/bat',
      'application/cmd'
    ];

    if (dangerousMimeTypes.includes(file.type)) {
      return {
        infected: true,
        threatName: '危险的可执行文件'
      };
    }

    // 如果文件类型为文本，检查简单的恶意模式
    if (
      file.type.startsWith('text/') ||
      file.type === 'application/javascript' ||
      file.type === 'application/json' ||
      file.type === 'application/xml'
    ) {
      // 仅检查较小的文本文件
      if (file.size <= 1024 * 1024) {
        // 1MB以下
        return await this.scanTextContent(file);
      }
    }

    return { infected: false };
  }

  /**
   * 扫描文本内容
   * @param file - 文件对象
   * @returns 扫描结果
   */
  private async scanTextContent(file: File): Promise<{
    infected: boolean;
    threatName?: string;
  }> {
    // 只读取前10KB以提高性能
    const content = await this.readFileContent(file, 10240);

    // 常见恶意代码模式
    const maliciousPatterns = [
      // 脚本注入模式
      { pattern: /<script>|<\/script>|javascript:|eval\(|document\.cookie/i, name: 'XSS注入' },
      // SQL注入模式
      { pattern: /(%27)|(')|(--)|(#)/i, name: 'SQL注入' },
      // 命令注入模式
      { pattern: /&\s*\w+\s*;|\|\s*\w+\s*\|/i, name: '命令注入' },
      // 恶意重定向
      {
        pattern: /window\.location\s*=|location\.href\s*=|location\.replace\(/i,
        name: '恶意重定向'
      }
    ];

    for (const pattern of maliciousPatterns) {
      if (pattern.pattern.test(content)) {
        return {
          infected: true,
          threatName: `检测到${pattern.name}模式`
        };
      }
    }

    return { infected: false };
  }

  /**
   * 调用外部文件扫描API
   * @param file - 文件对象
   * @returns 扫描结果
   */
  private async callExternalScanApi(file: File): Promise<{
    scanned: boolean;
    infected: boolean;
    threatName?: string;
    scanScore?: number;
  }> {
    if (!this.options.scanApiEndpoint) {
      return { scanned: false, infected: false };
    }

    try {
      // 准备表单数据
      const formData = new FormData();
      formData.append('file', file);

      // 发送请求
      const response = await fetch(this.options.scanApiEndpoint, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`扫描服务返回错误: ${response.status}`);
      }

      const result = await response.json();

      return {
        scanned: true,
        infected: result.infected || false,
        threatName: result.threatName || null,
        scanScore: result.scanScore || 0
      };
    } catch (error) {
      console.error('外部扫描API调用失败:', error);
      return {
        scanned: false,
        infected: false,
        threatName: '扫描服务不可用'
      };
    }
  }

  /**
   * 读取文件内容（用于扫描）
   * @param file - 文件对象
   * @param maxBytes - 最大读取字节数
   * @returns 文件内容
   */
  private readFileContent(file: File, maxBytes: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result as string);
      };

      reader.onerror = () => {
        reject(reader.error);
      };

      // 只读取指定大小
      const blob = file.slice(0, Math.min(maxBytes, file.size));
      reader.readAsText(blob);
    });
  }

  /**
   * 初始化默认安全规则
   */
  private initDefaultRules(): void {
    // 低安全级别规则
    this.defaultRules.low = [
      {
        id: 'low_rule_executable',
        name: '可执行文件检查',
        validate: (file: File) => {
          const disallowedExtensions = ['.exe', '.dll', '.bat'];
          return !disallowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
        },
        priority: 10,
        failureMessage: '不允许上传可执行文件'
      }
    ];

    // 中安全级别规则（包含所有低级规则）
    this.defaultRules.medium = [
      ...this.defaultRules.low,
      {
        id: 'medium_rule_mime',
        name: 'MIME类型检查',
        validate: (file: File) => {
          const disallowedMimeTypes = [
            'application/x-msdownload',
            'application/x-executable',
            'application/x-dosexec'
          ];
          return !disallowedMimeTypes.includes(file.type);
        },
        priority: 20,
        failureMessage: '不允许上传可执行程序文件类型'
      },
      {
        id: 'medium_rule_size',
        name: '文件大小检查',
        validate: (file: File) => {
          const maxSize = 1024 * 1024 * 1024; // 1GB
          return file.size <= maxSize;
        },
        priority: 30,
        failureMessage: '文件大小超出限制(最大1GB)'
      }
    ];

    // 高安全级别规则（包含所有中级规则）
    this.defaultRules.high = [
      ...this.defaultRules.medium,
      {
        id: 'high_rule_extensions',
        name: '严格扩展名检查',
        validate: (file: File) => {
          // 只允许特定类型的文件
          const allowedExtensions = [
            '.jpg',
            '.jpeg',
            '.png',
            '.gif',
            '.pdf',
            '.doc',
            '.docx',
            '.xls',
            '.xlsx',
            '.txt'
          ];
          const fileName = file.name.toLowerCase();
          return allowedExtensions.some(ext => fileName.endsWith(ext));
        },
        priority: 40,
        failureMessage: '仅允许上传图片、PDF和办公文档'
      },
      {
        id: 'high_rule_hidden_ext',
        name: '隐藏扩展名检查',
        validate: (file: File) => {
          // 检查文件名是否包含多个扩展名
          const fileName = file.name.toLowerCase();
          return !/\.(exe|dll|bat|cmd|js|php|py)\..+$/i.test(fileName);
        },
        priority: 50,
        failureMessage: '检测到可能的隐藏扩展名'
      }
    ];
  }

  /**
   * 获取当前安全级别的规则
   * @returns 安全规则数组
   */
  private getSecurityLevelRules(): SecurityRule[] {
    // 如果是自定义安全级别，使用自定义规则
    if (this.options.securityLevel === 'custom') {
      return this.options.customRules || [];
    }

    // 否则返回对应级别的预设规则
    return this.defaultRules[this.options.securityLevel || 'medium'];
  }

  /**
   * 格式化文件大小
   * @param bytes - 字节数
   * @returns 格式化后的大小字符串
   */
  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
