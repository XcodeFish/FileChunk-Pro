import { FileChunkKernel } from '../../core/kernel';
import { ModuleBase } from '../../core/module-base';
import { ContentScanResult } from '../../types/inspector';

/**
 * 内容扫描器 - 负责检测文件内容中的潜在风险
 */
export class ContentScanner extends ModuleBase {
  // 恶意模式检测规则
  private maliciousPatterns: Array<{
    pattern: RegExp;
    risk: 'low' | 'medium' | 'high';
    type: string;
  }>;

  // 敏感数据模式检测规则
  private sensitiveDataPatterns: Array<{
    pattern: RegExp;
    type: string;
  }>;

  // 外部API配置
  private externalApiConfig: {
    enabled: boolean;
    endpoint: string;
    apiKey: string | null;
    timeout: number;
    maxFileSize: number;
    scanTypes: string[];
    headers: Record<string, string>;
  };

  constructor() {
    super();

    // 初始化恶意模式检测规则
    this.maliciousPatterns = [
      // 脚本注入模式
      {
        pattern: /<script>|<\/script>|javascript:|eval\(|document\.cookie/i,
        risk: 'high',
        type: 'xss'
      },
      // SQL注入模式
      {
        pattern: /%27|'|--|%23|#/i,
        risk: 'high',
        type: 'sql-injection'
      },
      // 命令注入模式
      {
        pattern: /&\s*\w+\s*;|\|\s*\w+\s*\|/i,
        risk: 'high',
        type: 'command-injection'
      },
      // 可疑函数调用
      {
        pattern: /exec\s*\(|system\s*\(|shell_exec\s*\(|passthru\s*\(|proc_open\s*\(/i,
        risk: 'high',
        type: 'dangerous-function'
      }
    ];

    // 初始化敏感数据模式检测规则
    this.sensitiveDataPatterns = [
      // 密码相关
      {
        pattern: /password\s*=|password:|pwd=|passwd:|api[-_]key|secret[-_]key/i,
        type: 'password'
      },
      // 信用卡
      {
        pattern: /\b(?:\d[ -]*?){13,16}\b/,
        type: 'credit-card'
      },
      // 社会安全号(美国)
      {
        pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/,
        type: 'ssn'
      },
      // 电子邮件
      {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
        type: 'email'
      },
      // IP地址
      {
        pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
        type: 'ip-address'
      },
      // 私钥标记
      {
        pattern: /-----BEGIN (?:RSA|DSA|EC|PGP|) PRIVATE KEY-----|privateKey|private_key/i,
        type: 'private-key'
      }
    ];

    // 初始化外部API配置
    this.externalApiConfig = {
      enabled: false,
      endpoint: '',
      apiKey: null,
      timeout: 10000, // 10秒超时
      maxFileSize: 5 * 1024 * 1024, // 5MB
      scanTypes: ['malware', 'phishing', 'content'],
      headers: {}
    };
  }

  /**
   * 初始化模块
   * @param kernel 微内核引用
   */
  async init(kernel: FileChunkKernel): Promise<void> {
    this.kernel = kernel;

    // 从配置中加载外部API设置
    await this.loadExternalApiConfig();

    this.logger.info('内容扫描器初始化完成');
  }

  /**
   * 配置外部扫描API
   * @param config 外部API配置
   */
  configureExternalApi(config: Partial<typeof this.externalApiConfig>): void {
    this.externalApiConfig = { ...this.externalApiConfig, ...config };

    // 保存配置
    this.saveExternalApiConfig();
  }

  /**
   * 从内核配置加载外部API设置
   */
  private async loadExternalApiConfig(): Promise<void> {
    try {
      if (this.kernel) {
        // 尝试从内核配置获取设置
        const config = this.kernel.getConfig('modules.inspector.contentScanner.externalApi');
        if (config) {
          this.externalApiConfig = { ...this.externalApiConfig, ...config };
        }
      }
    } catch (error) {
      this.logger.warn('加载外部API配置失败:', error);
    }
  }

  /**
   * 保存外部API配置到内核
   */
  private saveExternalApiConfig(): void {
    try {
      if (this.kernel) {
        this.kernel.setConfig(
          'modules.inspector.contentScanner.externalApi',
          this.externalApiConfig
        );
      }
    } catch (error) {
      this.logger.warn('保存外部API配置失败:', error);
    }
  }

  /**
   * 扫描文件内容
   * @param file 待扫描的文件
   * @returns 扫描结果
   */
  async scanContent(file: File): Promise<ContentScanResult> {
    // 初始化结果
    const result: ContentScanResult = {
      isMalicious: false,
      containsSensitiveData: false,
      sensitiveDataTypes: []
    };

    // 只扫描文本类文件
    const textTypes = [
      'text/',
      'application/json',
      'application/javascript',
      'application/xml',
      'application/x-httpd-php',
      'application/xhtml+xml'
    ];

    // 检查文件类型是否应该扫描
    const shouldScan = textTypes.some(type => file.type.startsWith(type));

    // 对非文本类型文件，不进行内容检查
    if (!shouldScan && file.type !== '') {
      // 但如果启用了外部扫描API，则仍可能进行扫描
      if (this.externalApiConfig.enabled && file.size <= this.externalApiConfig.maxFileSize) {
        return this.scanWithExternalApi(file);
      }
      return result;
    }

    try {
      // 读取文件内容样本（最多前10KB）
      const contentSample = await this.readFileContent(file, 10240);
      result.contentSample = contentSample;

      // 扫描恶意模式
      for (const pattern of this.maliciousPatterns) {
        if (pattern.pattern.test(contentSample)) {
          result.isMalicious = true;
          result.pattern = pattern.type;
          break;
        }
      }

      // 扫描敏感数据
      const foundSensitiveTypes = new Set<string>();

      for (const pattern of this.sensitiveDataPatterns) {
        if (pattern.pattern.test(contentSample)) {
          foundSensitiveTypes.add(pattern.type);
        }
      }

      // 如果发现敏感数据，更新结果
      if (foundSensitiveTypes.size > 0) {
        result.containsSensitiveData = true;
        result.sensitiveDataTypes = Array.from(foundSensitiveTypes);
      }

      // 如果启用了外部API扫描且文件大小适合，也进行外部扫描
      if (this.externalApiConfig.enabled && file.size <= this.externalApiConfig.maxFileSize) {
        try {
          const externalResult = await this.scanWithExternalApi(file);

          // 合并结果
          if (externalResult.isMalicious) {
            result.isMalicious = true;
            result.pattern = result.pattern || externalResult.pattern;
          }

          if (externalResult.containsSensitiveData && externalResult.sensitiveDataTypes) {
            result.containsSensitiveData = true;

            // 合并敏感数据类型
            const allTypes = new Set([
              ...(result.sensitiveDataTypes || []),
              ...externalResult.sensitiveDataTypes
            ]);

            result.sensitiveDataTypes = Array.from(allTypes);
          }

          // 添加外部扫描结果详情
          result.externalScanResults = externalResult.externalScanResults;
        } catch (error) {
          this.logger.warn('外部API扫描失败:', error);
          result.externalScanError = error instanceof Error ? error.message : String(error);
        }
      }

      return result;
    } catch (error) {
      this.logger.error('内容扫描失败:', error);
      return result;
    }
  }

  /**
   * 使用外部API扫描文件
   * @param file 待扫描的文件
   * @returns 扫描结果
   */
  private async scanWithExternalApi(file: File): Promise<ContentScanResult> {
    if (!this.externalApiConfig.enabled || !this.externalApiConfig.endpoint) {
      throw new Error('外部扫描API未配置或未启用');
    }

    // 检查文件大小
    if (file.size > this.externalApiConfig.maxFileSize) {
      throw new Error(
        `文件大小超过外部扫描限制: ${this.formatSize(file.size)} > ${this.formatSize(this.externalApiConfig.maxFileSize)}`
      );
    }

    const result: ContentScanResult = {
      isMalicious: false,
      containsSensitiveData: false,
      sensitiveDataTypes: []
    };

    try {
      // 准备FormData
      const formData = new FormData();
      formData.append('file', file);
      formData.append('filename', file.name);
      formData.append('contentType', file.type || 'application/octet-stream');
      formData.append('scanTypes', JSON.stringify(this.externalApiConfig.scanTypes));

      if (this.externalApiConfig.apiKey) {
        formData.append('apiKey', this.externalApiConfig.apiKey);
      }

      // 准备请求头
      const headers: Record<string, string> = {
        ...this.externalApiConfig.headers
      };

      // 发送请求
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.externalApiConfig.timeout);

      const response = await fetch(this.externalApiConfig.endpoint, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`外部扫描服务返回错误: ${response.status} ${response.statusText}`);
      }

      const scanResult = await response.json();

      // 解析扫描结果
      result.isMalicious = scanResult.malicious === true;
      result.pattern = scanResult.threatType || scanResult.malwareType || scanResult.detectionType;
      result.containsSensitiveData = scanResult.sensitiveData === true;
      result.sensitiveDataTypes = scanResult.sensitiveDataTypes || [];

      // 保存原始扫描结果
      result.externalScanResults = scanResult;

      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('外部扫描API请求超时');
      }

      throw error;
    }
  }

  /**
   * 测试外部API连接
   * @returns 测试结果
   */
  async testExternalApiConnection(): Promise<{
    success: boolean;
    latency?: number;
    message: string;
    details?: any;
  }> {
    if (!this.externalApiConfig.enabled || !this.externalApiConfig.endpoint) {
      return {
        success: false,
        message: '外部扫描API未配置或未启用'
      };
    }

    try {
      const startTime = Date.now();

      // 创建一个小的测试文件
      const testContent = '这是一个API连接测试文件';
      const testFile = new File([testContent], 'test.txt', { type: 'text/plain' });

      // 准备FormData
      const formData = new FormData();
      formData.append('file', testFile);
      formData.append('filename', 'test.txt');
      formData.append('contentType', 'text/plain');
      formData.append('test', 'true'); // 标记为测试请求

      if (this.externalApiConfig.apiKey) {
        formData.append('apiKey', this.externalApiConfig.apiKey);
      }

      // 发送请求
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.externalApiConfig.timeout);

      const response = await fetch(this.externalApiConfig.endpoint, {
        method: 'POST',
        headers: this.externalApiConfig.headers,
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const endTime = Date.now();
      const latency = endTime - startTime;

      if (!response.ok) {
        return {
          success: false,
          latency,
          message: `API返回错误: ${response.status} ${response.statusText}`
        };
      }

      const result = await response.json();

      return {
        success: true,
        latency,
        message: '连接成功',
        details: result
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          message: '请求超时'
        };
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 添加自定义恶意模式检测规则
   * @param pattern 正则表达式
   * @param risk 风险级别
   * @param type 类型标识
   */
  addMaliciousPattern(pattern: RegExp, risk: 'low' | 'medium' | 'high', type: string): void {
    this.maliciousPatterns.push({ pattern, risk, type });
  }

  /**
   * 添加自定义敏感数据模式检测规则
   * @param pattern 正则表达式
   * @param type 类型标识
   */
  addSensitiveDataPattern(pattern: RegExp, type: string): void {
    this.sensitiveDataPatterns.push({ pattern, type });
  }

  /**
   * 读取文件内容
   * @param file 文件对象
   * @param maxBytes 最大读取字节数
   * @returns 文件内容文本
   */
  private readFileContent(file: File, maxBytes: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = e => {
        const content = e.target?.result as string;
        resolve(content);
      };

      reader.onerror = () => reject(reader.error || new Error('读取文件失败'));

      // 只读取指定大小
      const blob = file.slice(0, Math.min(maxBytes, file.size));
      reader.readAsText(blob);
    });
  }

  /**
   * 格式化文件大小
   * @param bytes 字节数
   * @returns 格式化的大小字符串
   */
  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
