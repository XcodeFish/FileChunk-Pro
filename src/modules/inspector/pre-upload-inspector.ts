import { FileChunkKernel } from '../../core/kernel';
import { ModuleBase } from '../../core/module-base';
import { MimeDetector } from './mime-detector';
import { ContentScanner } from './content-scanner';
import {
  InspectionResult,
  FileInspectorOptions,
  InspectionRule,
  RiskLevel,
  ScanResult
} from '../../types/inspector';

/**
 * 预上传检测器 - 负责文件上传前的各项检测工作
 *
 * 功能:
 * 1. 文件整体检查流程设计 - 多级检测流水线架构
 * 2. 检查结果聚合与分析 - 收集所有检查结果并综合分析
 * 3. 风险评分系统 - 对文件进行安全风险量化评分
 * 4. 检查规则配置 - 支持自定义检查规则和策略
 * 5. 检查结果缓存 - 缓存检查结果提升性能
 */
export class PreUploadInspector extends ModuleBase {
  private options: FileInspectorOptions;
  private mimeDetector: MimeDetector;
  private contentScanner: ContentScanner;
  private resultCache: Map<string, InspectionResult>; // 缓存检查结果
  private rules: InspectionRule[]; // 检查规则列表

  /**
   * 创建预上传检测器实例
   * @param options 检测器配置选项
   */
  constructor(options: Partial<FileInspectorOptions> = {}) {
    super();

    // 默认配置与用户配置合并
    this.options = {
      enableMimeDetection: true, // 启用MIME类型检测
      enableContentScanning: true, // 启用内容扫描
      enableVirusScan: false, // 启用病毒扫描
      scanSizeLimit: 50 * 1024 * 1024, // 内容扫描大小限制(50MB)
      cacheResults: true, // 缓存检查结果
      cacheMaxAge: 30 * 60 * 1000, // 缓存有效期(30分钟)
      riskThreshold: 60, // 风险阈值(0-100)
      maxAllowedRisk: 80, // 最大允许风险值
      maxFileSize: 10 * 1024 * 1024 * 1024, // 最大文件大小(10GB)
      scanApiEndpoint: '', // 外部病毒扫描API端点
      scanApiKey: '', // 扫描API密钥
      ...options
    };

    // 初始化内部组件
    this.mimeDetector = new MimeDetector();
    this.contentScanner = new ContentScanner();
    this.resultCache = new Map();

    // 初始化默认规则
    this.rules = [
      // 基本规则
      {
        id: 'file-size',
        name: '文件大小检查',
        description: '检查文件大小是否在允许范围内',
        enabled: true,
        weight: 10,
        check: this.checkFileSize.bind(this)
      },
      {
        id: 'file-name',
        name: '文件名检查',
        description: '检查文件名是否符合规范且不包含危险字符',
        enabled: true,
        weight: 5,
        check: this.checkFileName.bind(this)
      },
      {
        id: 'file-extension',
        name: '文件扩展名检查',
        description: '检查文件扩展名是否在允许列表中',
        enabled: true,
        weight: 15,
        check: this.checkFileExtension.bind(this)
      },
      {
        id: 'mime-type',
        name: 'MIME类型检查',
        description: '检查文件MIME类型是否与扩展名匹配',
        enabled: this.options.enableMimeDetection,
        weight: 20,
        check: this.checkMimeType.bind(this)
      },
      {
        id: 'content-scan',
        name: '内容扫描',
        description: '扫描文件内容中是否存在恶意代码或敏感信息',
        enabled: this.options.enableContentScanning,
        weight: 25,
        check: this.scanContent.bind(this)
      },
      {
        id: 'virus-scan',
        name: '病毒扫描',
        description: '检查文件是否包含病毒或恶意软件',
        enabled: this.options.enableVirusScan,
        weight: 30,
        check: this.scanVirus.bind(this)
      }
    ];
  }

  /**
   * 初始化模块
   * @param kernel 微内核引用
   */
  async init(kernel: FileChunkKernel): Promise<void> {
    this.kernel = kernel;

    // 初始化子组件
    await this.mimeDetector.init(kernel);
    await this.contentScanner.init(kernel);

    this.logger.info('预上传检测器初始化完成');
  }

  /**
   * 添加自定义检查规则
   * @param rule 检查规则
   */
  addRule(rule: InspectionRule): void {
    // 检查规则ID是否已存在
    const existingRule = this.rules.find(r => r.id === rule.id);
    if (existingRule) {
      this.rules = this.rules.map(r => (r.id === rule.id ? rule : r));
    } else {
      this.rules.push(rule);
    }
  }

  /**
   * 启用/禁用规则
   * @param ruleId 规则ID
   * @param enabled 是否启用
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    this.rules = this.rules.map(rule => {
      if (rule.id === ruleId) {
        return { ...rule, enabled };
      }
      return rule;
    });
  }

  /**
   * 执行完整的文件检查流程
   * @param file 待检查的文件
   * @param options 检查选项
   * @returns 检查结果
   */
  async inspectFile(
    file: File,
    options: Partial<FileInspectorOptions> = {}
  ): Promise<InspectionResult> {
    try {
      // 合并检查选项
      const inspectOptions = { ...this.options, ...options };

      // 生成文件指纹(用于缓存)
      const fileFingerprint = await this.generateFileFingerprint(file);

      // 检查缓存
      if (inspectOptions.cacheResults) {
        const cachedResult = this.getFromCache(fileFingerprint);
        if (cachedResult) {
          this.logger.debug('从缓存中获取检查结果', { fileFingerprint });
          return cachedResult;
        }
      }

      // 准备检查结果对象
      const result: InspectionResult = {
        fileInfo: {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
          fingerprint: fileFingerprint
        },
        isValid: true,
        riskScore: 0,
        riskLevel: 'safe',
        reasons: [],
        warnings: [],
        details: {
          rules: {},
          mimeInfo: null,
          contentScanInfo: null,
          virusScanInfo: null
        },
        timestamp: Date.now(),
        cached: false
      };

      // 执行所有启用的规则
      let totalRisk = 0;
      let totalWeight = 0;

      for (const rule of this.rules.filter(r => r.enabled)) {
        try {
          // 执行规则检查
          this.logger.debug(`执行规则检查: ${rule.name}`);
          const ruleResult = await rule.check(file, inspectOptions);

          // 记录规则结果
          result.details.rules[rule.id] = ruleResult;

          // 累计风险分数
          if (ruleResult.riskScore > 0) {
            totalRisk += ruleResult.riskScore * rule.weight;
            totalWeight += rule.weight;

            // 收集问题原因
            if (ruleResult.issues) {
              result.reasons.push(...ruleResult.issues);
            }

            // 收集警告
            if (ruleResult.warnings) {
              result.warnings.push(...ruleResult.warnings);
            }
          }

          // 发现严重问题，直接标记为无效
          if (ruleResult.critical) {
            result.isValid = false;
          }
        } catch (error: any) {
          this.logger.error(`规则检查失败: ${rule.name}`, error);
          result.warnings.push(`规则"${rule.name}"执行失败: ${error.message}`);
        }
      }

      // 计算最终风险分数
      if (totalWeight > 0) {
        result.riskScore = Math.round(totalRisk / totalWeight);
      }

      // 确定风险等级
      result.riskLevel = this.determineRiskLevel(result.riskScore);

      // 根据风险阈值确定文件是否有效
      if (result.riskScore > inspectOptions.maxAllowedRisk) {
        result.isValid = false;
        result.reasons.push(
          `文件风险分数(${result.riskScore})超过允许阈值(${inspectOptions.maxAllowedRisk})`
        );
      }

      // 触发检查完成事件
      this.kernel.emit('inspectionComplete', result);

      // 缓存结果
      if (inspectOptions.cacheResults) {
        this.addToCache(fileFingerprint, result);
      }

      return result;
    } catch (error: any) {
      // 检查过程发生异常
      this.logger.error('文件检查失败', error);

      return {
        fileInfo: {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
          fingerprint: ''
        },
        isValid: false,
        riskScore: 100, // 错误情况下，假定最高风险
        riskLevel: 'critical',
        reasons: [`检查过程出错: ${error.message}`],
        warnings: [],
        details: {
          rules: {},
          error: error.message
        },
        timestamp: Date.now(),
        cached: false
      };
    }
  }

  /**
   * 根据风险分数确定风险等级
   * @param score 风险分数(0-100)
   * @returns 风险等级
   */
  private determineRiskLevel(score: number): RiskLevel {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'safe';
  }

  /**
   * 生成文件指纹
   * @param file 文件对象
   * @returns 文件指纹
   */
  private async generateFileFingerprint(file: File): Promise<string> {
    // 简单指纹: 文件名+大小+最后修改时间
    // 注意: 生产环境可能需要更复杂的指纹算法
    const fingerprint = `${file.name}-${file.size}-${file.lastModified}`;
    return fingerprint;
  }

  /**
   * 从缓存获取检查结果
   * @param fingerprint 文件指纹
   * @returns 缓存的检查结果或null
   */
  private getFromCache(fingerprint: string): InspectionResult | null {
    if (!this.resultCache.has(fingerprint)) {
      return null;
    }

    const cachedResult = this.resultCache.get(fingerprint)!;

    // 检查缓存是否过期
    if (Date.now() - cachedResult.timestamp > this.options.cacheMaxAge) {
      this.resultCache.delete(fingerprint);
      return null;
    }

    // 返回缓存结果的副本并标记为缓存
    return {
      ...cachedResult,
      cached: true
    };
  }

  /**
   * 添加检查结果到缓存
   * @param fingerprint 文件指纹
   * @param result 检查结果
   */
  private addToCache(fingerprint: string, result: InspectionResult): void {
    this.resultCache.set(fingerprint, { ...result });

    // 缓存清理 - 简单实现, 生产环境可能需要更复杂的缓存管理策略
    if (this.resultCache.size > 1000) {
      // 删除最旧的项目
      const oldestKey = [...this.resultCache.entries()].sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )[0][0];
      this.resultCache.delete(oldestKey);
    }
  }

  /**
   * 清除缓存
   * @param fingerprint 可选的指定文件指纹，不提供则清除所有缓存
   */
  clearCache(fingerprint?: string): void {
    if (fingerprint) {
      this.resultCache.delete(fingerprint);
    } else {
      this.resultCache.clear();
    }
  }

  /**
   * 检查文件大小规则
   * @param file 文件对象
   * @param options 检查选项
   */
  private async checkFileSize(file: File, options: FileInspectorOptions): Promise<ScanResult> {
    const result: ScanResult = {
      riskScore: 0,
      critical: false,
      issues: [],
      warnings: []
    };

    // 文件大小为0
    if (file.size === 0) {
      result.riskScore = 50;
      result.issues = ['文件大小为0'];
      return result;
    }

    // 超过最大尺寸
    if (file.size > options.maxFileSize) {
      result.riskScore = 100;
      result.critical = true;
      result.issues = [
        `文件大小(${this.formatSize(file.size)})超过最大限制(${this.formatSize(options.maxFileSize)})`
      ];
      return result;
    }

    // 对非常大的文件给予较高风险分数
    if (file.size > options.maxFileSize * 0.8) {
      result.riskScore = 40;
      result.warnings = [`文件较大(${this.formatSize(file.size)})，接近最大限制`];
    }

    return result;
  }

  /**
   * 检查文件名规则
   * @param file 文件对象
   */
  private async checkFileName(file: File): Promise<ScanResult> {
    const result: ScanResult = {
      riskScore: 0,
      critical: false,
      issues: [],
      warnings: []
    };

    // 空文件名
    if (!file.name || file.name.trim() === '') {
      result.riskScore = 60;
      result.issues = ['文件名为空'];
      return result;
    }

    // 文件名长度
    if (file.name.length > 255) {
      result.riskScore = 30;
      result.warnings = ['文件名过长，可能导致存储问题'];
    }

    // 检查特殊字符
    const specialCharsPattern = /[<>:"/\\|?*]/;
    const hasSpecialChars =
      specialCharsPattern.test(file.name) || [...file.name].some(char => char.charCodeAt(0) <= 31);
    if (hasSpecialChars) {
      result.riskScore = 40;
      result.warnings.push('文件名包含特殊字符，可能导致存储问题');
    }

    // 检查隐藏可执行文件模式(.exe.jpg等)
    const hiddenExePattern = /\.(exe|dll|bat|cmd|vbs|js|ps1|sh)\..+$/i;
    if (hiddenExePattern.test(file.name.toLowerCase())) {
      result.riskScore = 90;
      result.critical = true;
      result.issues.push('检测到隐藏的可执行文件扩展名');
    }

    return result;
  }

  /**
   * 检查文件扩展名规则
   * @param file 文件对象
   */
  private async checkFileExtension(file: File): Promise<ScanResult> {
    const result: ScanResult = {
      riskScore: 0,
      critical: false,
      issues: [],
      warnings: []
    };

    // 获取文件扩展名
    const extension = this.getFileExtension(file.name);

    // 没有扩展名
    if (!extension) {
      result.riskScore = 30;
      result.warnings = ['文件没有扩展名'];
      return result;
    }

    // 高风险扩展名列表
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

    // 中风险扩展名列表
    const mediumRiskExtensions = ['.ps1', '.sh', '.jar', '.py', '.pl', '.rb'];

    // 检查高风险扩展名
    if (highRiskExtensions.includes(extension.toLowerCase())) {
      result.riskScore = 90;
      result.critical = true;
      result.issues = [`检测到高风险文件类型: ${extension}`];
      return result;
    }

    // 检查中风险扩展名
    if (mediumRiskExtensions.includes(extension.toLowerCase())) {
      result.riskScore = 60;
      result.warnings = [`检测到中风险文件类型: ${extension}`];
    }

    return result;
  }

  /**
   * 检查MIME类型规则
   * @param file 文件对象
   */
  private async checkMimeType(file: File): Promise<ScanResult> {
    const result: ScanResult = {
      riskScore: 0,
      critical: false,
      issues: [],
      warnings: []
    };

    if (!this.options.enableMimeDetection) {
      return result;
    }

    try {
      // 检测实际MIME类型
      const mimeResult = await this.mimeDetector.detectMimeType(file);

      // 存储MIME信息
      result.details = { mimeInfo: mimeResult };

      // 检查是否为高危MIME类型
      if (mimeResult.isMalicious) {
        result.riskScore = 90;
        result.critical = true;
        result.issues = [`检测到高危MIME类型: ${mimeResult.mimeType}`];
      }

      // 检查MIME类型与文件扩展名是否匹配
      if (!mimeResult.extensionMatch) {
        result.riskScore = Math.max(result.riskScore, 70);
        result.warnings.push(
          `文件扩展名与实际类型不匹配，可能被篡改。声明: ${file.type}, 检测: ${mimeResult.mimeType}`
        );
      }

      // 检查类型为空的情况
      if (!file.type && !mimeResult.mimeType) {
        result.riskScore = 40;
        result.warnings.push('无法确定文件类型');
      }
    } catch (error: any) {
      // MIME检测失败
      result.riskScore = 30;
      result.warnings = [`MIME类型检测失败: ${error.message}`];
    }

    return result;
  }

  /**
   * 扫描文件内容规则
   * @param file 文件对象
   * @param options 检查选项
   */
  private async scanContent(file: File, options: FileInspectorOptions): Promise<ScanResult> {
    const result: ScanResult = {
      riskScore: 0,
      critical: false,
      issues: [],
      warnings: []
    };

    // 是否启用内容扫描
    if (!options.enableContentScanning) {
      return result;
    }

    // 文件太大跳过检查
    if (file.size > options.scanSizeLimit) {
      result.warnings = [
        `文件大小超过扫描限制(${this.formatSize(options.scanSizeLimit)})，跳过内容扫描`
      ];
      return result;
    }

    try {
      // 扫描文件内容
      const contentResult = await this.contentScanner.scanContent(file);

      // 存储扫描信息
      result.details = { contentScanInfo: contentResult };

      // 检查是否包含恶意内容
      if (contentResult.isMalicious) {
        result.riskScore = 80;
        result.critical = true;
        result.issues = [`检测到可疑内容模式: ${contentResult.pattern}`];
      }

      // 检查是否包含敏感内容
      if (contentResult.containsSensitiveData) {
        result.riskScore = Math.max(result.riskScore, 60);
        result.warnings.push(
          `文件可能包含敏感信息: ${contentResult.sensitiveDataTypes?.join(', ')}`
        );
      }
    } catch (error: any) {
      // 内容扫描失败
      result.warnings = [`内容扫描失败: ${error.message}`];
    }

    return result;
  }

  /**
   * 执行病毒扫描规则
   * @param file 文件对象
   * @param options 检查选项
   */
  private async scanVirus(file: File, options: FileInspectorOptions): Promise<ScanResult> {
    const result: ScanResult = {
      riskScore: 0,
      critical: false,
      issues: [],
      warnings: []
    };

    // 是否启用病毒扫描
    if (!options.enableVirusScan || !options.scanApiEndpoint) {
      return result;
    }

    try {
      // 准备表单数据
      const formData = new FormData();
      formData.append('file', file);

      if (options.scanApiKey) {
        formData.append('apiKey', options.scanApiKey);
      }

      // 发送请求到外部扫描API
      const response = await fetch(options.scanApiEndpoint, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`扫描服务返回错误: ${response.status}`);
      }

      const scanResult = await response.json();

      // 存储扫描结果
      result.details = { virusScanInfo: scanResult };

      // 检查是否检测到病毒
      if (scanResult.infected) {
        result.riskScore = 100;
        result.critical = true;
        result.issues = [`检测到恶意代码: ${scanResult.threatName || '未知威胁'}`];
      }

      // 检查可疑但不确定的结果
      if (scanResult.suspicious) {
        result.riskScore = 70;
        result.warnings.push(`文件可疑: ${scanResult.suspicionReason || '未知原因'}`);
      }
    } catch (error: any) {
      // 病毒扫描失败
      result.warnings = [`病毒扫描失败: ${error.message}`];
    }

    return result;
  }

  /**
   * 获取文件扩展名
   * @param fileName 文件名
   * @returns 扩展名(带点)或空字符串
   */
  private getFileExtension(fileName: string): string {
    const match = fileName.match(/\.([^.]+)$/);
    return match ? `.${match[1].toLowerCase()}` : '';
  }

  /**
   * 格式化文件大小
   * @param bytes 字节数
   * @returns 格式化后的大小
   */
  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
