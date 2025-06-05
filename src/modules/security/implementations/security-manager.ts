import { BaseModule } from '../../../core/module-base';
import {
  AuthenticationInterface,
  EncryptionInterface,
  IntegrityCheckerInterface,
  SecurityContext,
  SecurityDefenseInterface,
  SecurityInterface,
  SecurityOptions,
  SecurityRule,
  SignatureInterface
} from '../interfaces';
import { CryptoHelper } from './crypto-helper';
import { SignatureGenerator } from './signature-generator';
import { IntegrityChecker } from './integrity-checker';
import { SecurityDefense } from './security-defense';
import { Kernel } from '../../../core/kernel';

/**
 * 安全管理器实现类
 *
 * 提供请求认证、令牌管理、加密、签名和安全钩子等功能
 */
export class SecurityManager extends BaseModule implements SecurityInterface {
  /**
   * 安全模块配置选项
   */
  private options: SecurityOptions;

  /**
   * 微内核实例
   */
  private kernel!: Kernel;

  /**
   * 加密助手实例
   */
  private cryptoHelper: CryptoHelper | null = null;

  /**
   * 签名生成器实例
   */
  private signatureGenerator: SignatureGenerator | null = null;

  /**
   * 完整性检查器实例
   */
  private integrityChecker: IntegrityChecker | null = null;

  /**
   * 安全防御实例
   */
  private securityDefense: SecurityDefense | null = null;

  /**
   * 会话ID
   */
  private sessionId: string;

  /**
   * 构造函数
   * @param options - 安全模块配置选项
   * @param kernel - 微内核实例
   */
  constructor(options: SecurityOptions = {}, kernel?: Kernel) {
    super({
      id: 'security',
      name: 'security',
      version: '1.0.0',
      description: '安全模块，提供认证、加密和签名功能',
      author: 'FileChunk Pro'
    });

    this.options = {
      encryptionEnabled: false,
      signatureEnabled: false,
      integrityCheck: false,
      ...options
    };

    // 如果提供了 kernel，直接保存
    if (kernel) {
      this.kernel = kernel;
    }

    // 创建会话ID
    this.sessionId = this.generateSessionId();
  }

  /**
   * 初始化安全模块
   */
  async init(): Promise<void> {
    // 基础初始化工作，具体初始化逻辑移至 onInit 方法
    await this.onInit();
  }

  /**
   * 请求拦截器
   * @param config - 请求配置
   * @returns 修改后的请求配置
   */
  async beforeRequest(config: any): Promise<any> {
    const updatedConfig = { ...config };

    // 添加认证令牌
    if (this.options.tokenProvider) {
      const token = await this.getAuthToken();
      updatedConfig.headers = {
        ...updatedConfig.headers,
        Authorization: `Bearer ${token}`
      };
    }

    // 添加请求签名
    if (this.options.signatureEnabled && this.signatureGenerator) {
      const timestamp = Date.now().toString();
      const method = config.method || 'GET';
      const url = config.url;
      const body = config.data;

      const signature = await this.signatureGenerator.generateSignature(
        method,
        url,
        timestamp,
        body
      );
      updatedConfig.headers = {
        ...updatedConfig.headers,
        'X-Signature': signature,
        'X-Timestamp': timestamp
      };
    }

    // 数据加密
    if (this.options.encryptionEnabled && this.cryptoHelper && updatedConfig.data) {
      const dataToEncrypt =
        typeof updatedConfig.data === 'string'
          ? updatedConfig.data
          : JSON.stringify(updatedConfig.data);

      const encrypted = await this.cryptoHelper.encrypt(dataToEncrypt);
      updatedConfig.data = encrypted.data;

      // 添加加密相关头
      updatedConfig.headers = {
        ...updatedConfig.headers,
        'X-Encryption-IV': encrypted.iv,
        'X-Encryption-Method': this.options.encryptionAlgorithm
      };
    }

    // 应用速率限制
    if (this.options.rateLimit && this.securityDefense) {
      const cleanupFunction = this.securityDefense.checkRateLimit();

      // 确保请求完成后调用清理函数
      const originalResolve = config.adapter?.resolve;
      const originalReject = config.adapter?.reject;

      if (originalResolve && originalReject) {
        updatedConfig.adapter = {
          ...config.adapter,
          resolve: (response: any) => {
            cleanupFunction();
            return originalResolve(response);
          },
          reject: (error: any) => {
            cleanupFunction();
            return originalReject(error);
          }
        };
      }
    }

    return updatedConfig;
  }

  /**
   * 响应拦截器
   * @param response - 响应对象
   * @returns 处理后的响应
   */
  async afterResponse(response: any): Promise<any> {
    // 如果响应是加密的，解密数据
    if (
      this.options.encryptionEnabled &&
      this.cryptoHelper &&
      response.headers?.['X-Encryption-Method'] &&
      response.headers?.['X-Encryption-IV']
    ) {
      const encryptedData = response.data;
      const iv = response.headers['X-Encryption-IV'];

      try {
        const decryptedData = await this.cryptoHelper.decrypt(encryptedData, iv);

        // 尝试解析JSON
        try {
          response.data = JSON.parse(decryptedData as string);
        } catch {
          response.data = decryptedData;
        }
      } catch (error) {
        this.kernel.emit('security:decryption-error', error);
        throw new Error('解密响应数据失败');
      }
    }

    return response;
  }

  /**
   * 获取认证接口实现
   * @returns 认证接口实现
   */
  getAuthenticationInterface(): AuthenticationInterface {
    return {
      getAuthToken: this.getAuthToken.bind(this),
      createAuthHeaders: this.createAuthHeaders.bind(this),
      verifyToken: this.verifyToken.bind(this)
    };
  }

  /**
   * 获取加密接口实现
   * @returns 加密接口实现
   */
  getEncryptionInterface(): EncryptionInterface {
    if (!this.cryptoHelper) {
      throw new Error('加密功能未启用或未初始化');
    }
    return this.cryptoHelper;
  }

  /**
   * 获取签名接口实现
   * @returns 签名接口实现
   */
  getSignatureInterface(): SignatureInterface {
    if (!this.signatureGenerator) {
      throw new Error('签名功能未启用或未初始化');
    }
    return this.signatureGenerator;
  }

  /**
   * 获取完整性检查接口实现
   * @returns 完整性检查接口实现
   */
  getIntegrityCheckerInterface(): IntegrityCheckerInterface {
    if (!this.integrityChecker) {
      throw new Error('完整性检查功能未启用或未初始化');
    }
    return this.integrityChecker;
  }

  /**
   * 获取安全防御接口实现
   * @returns 安全防御接口实现
   */
  getSecurityDefenseInterface(): SecurityDefenseInterface {
    if (!this.securityDefense) {
      throw new Error('安全防御功能未启用或未初始化');
    }
    return this.securityDefense;
  }

  /**
   * 获取认证令牌
   * @returns 认证令牌
   */
  async getAuthToken(): Promise<string> {
    if (!this.options.tokenProvider) {
      throw new Error('未配置令牌提供者');
    }

    try {
      const token = await this.options.tokenProvider();
      return token;
    } catch (error) {
      this.kernel.emit('security:token-error', error);
      throw new Error('获取认证令牌失败');
    }
  }

  /**
   * 创建认证头
   * @returns HTTP认证头
   */
  async createAuthHeaders(): Promise<Record<string, string>> {
    try {
      const token = await this.getAuthToken();
      return {
        Authorization: `Bearer ${token}`
      };
    } catch {
      // 忽略错误
      return {};
    }
  }

  /**
   * 验证令牌有效性
   * @param _token - 认证令牌
   * @returns 令牌是否有效
   */
  async verifyToken(_token: string): Promise<boolean> {
    // 默认实现不验证令牌
    // 具体实现可能需要调用外部服务或检查令牌结构
    return true;
  }

  /**
   * 创建安全上下文
   * @param contextData - 上下文数据
   * @returns 安全上下文对象
   */
  createSecurityContext(contextData?: Partial<SecurityContext>): SecurityContext {
    // 获取浏览器环境信息
    let deviceInfo: { userAgent: string; platform: string; screenSize?: string } = {
      userAgent: '',
      platform: ''
    };

    if (typeof window !== 'undefined') {
      deviceInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        screenSize: `${window.screen.width}x${window.screen.height}`
      };
    }

    // 创建上下文对象
    const context: SecurityContext = {
      sessionId: this.generateSessionId(),
      deviceInfo,
      ...contextData
    };

    return context;
  }

  /**
   * 验证文件上传安全性
   * @param file - 文件对象
   * @param context - 安全上下文
   * @returns 验证结果
   */
  async validateFileUpload(
    file: File,
    context?: SecurityContext
  ): Promise<{ isValid: boolean; reasons?: string[]; warnings?: string[] }> {
    try {
      // 如果安全防御未启用，返回有效
      if (!this.securityDefense) {
        return { isValid: true };
      }

      // 验证文件
      const isValid = await this.securityDefense.validateFile(file);
      if (!isValid) {
        return {
          isValid: false,
          reasons: ['文件安全验证失败']
        };
      }

      // 应用安全规则
      const rulesResult = await this.applySecurityRules(file, undefined, context);
      if (!rulesResult.passed) {
        return {
          isValid: false,
          reasons: rulesResult.failedRules.map(rule => rule.failureMessage)
        };
      }

      // 扫描文件内容
      const scanResult = await this.securityDefense.scanFile(file);
      if (scanResult.infected) {
        return {
          isValid: false,
          reasons: [`文件可能包含恶意内容: ${scanResult.threatName || '未知威胁'}`]
        };
      }

      return { isValid: true };
    } catch (error) {
      this.kernel.emit('security:validation-error', error);
      return {
        isValid: false,
        reasons: ['文件验证过程发生错误']
      };
    }
  }

  /**
   * 应用安全规则
   * @param file - 文件对象
   * @param rules - 规则集合
   * @param context - 安全上下文
   * @returns 规则验证结果
   */
  async applySecurityRules(
    file: File,
    rules?: SecurityRule[],
    context?: SecurityContext
  ): Promise<{ passed: boolean; failedRules: SecurityRule[] }> {
    const rulesToApply = rules || this.options.customRules || [];
    const failedRules: SecurityRule[] = [];

    // 按优先级排序规则
    const sortedRules = [...rulesToApply].sort((a, b) => a.priority - b.priority);

    // 逐一应用规则
    for (const rule of sortedRules) {
      try {
        const passed = await rule.validate(file, context);
        if (!passed) {
          failedRules.push(rule);
        }
      } catch (error) {
        this.kernel.emit('security:rule-error', { rule, error });
        failedRules.push(rule);
      }
    }

    return {
      passed: failedRules.length === 0,
      failedRules
    };
  }

  /**
   * 生成会话ID
   * @returns 会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 注册安全钩子
   */
  private registerHooks(): void {
    // 文件上传前验证
    this.kernel.on('beforeUpload', async (file: File) => {
      const result = await this.validateFileUpload(file);
      if (!result.isValid) {
        throw new Error(result.reasons?.join(', ') || '文件验证失败');
      }
    });

    // 添加请求拦截
    this.kernel.on('request', async (config: any) => {
      return this.beforeRequest(config);
    });

    // 添加响应拦截
    this.kernel.on('response', async (response: any) => {
      return this.afterResponse(response);
    });
  }

  /**
   * 初始化事件处理
   */
  protected async onInit(): Promise<void> {
    // 初始化加密助手
    if (this.options.encryptionEnabled) {
      this.cryptoHelper = new CryptoHelper({
        key: this.options.encryptionKey,
        algorithm: this.options.encryptionAlgorithm
      });
      await this.cryptoHelper.init();
    }

    // 初始化签名生成器
    if (this.options.signatureEnabled) {
      this.signatureGenerator = new SignatureGenerator({
        key: this.options.signatureKey,
        algorithm: this.options.signatureAlgorithm
      });
      await this.signatureGenerator.init();
    }

    // 初始化完整性检查器
    if (this.options.integrityCheck) {
      this.integrityChecker = new IntegrityChecker({
        algorithm: this.options.integrityAlgorithm
      });
      await this.integrityChecker.init();
    }

    // 初始化安全防御
    this.securityDefense = new SecurityDefense({
      rateLimit: this.options.rateLimit,
      rateLimitOptions: this.options.rateLimitOptions,
      securityLevel: this.options.securityLevel,
      customRules: this.options.customRules
    });
    await this.securityDefense.init();

    // 注册安全钩子
    this.registerHooks();

    this.kernel.emit('security:initialized', {
      encryptionEnabled: this.options.encryptionEnabled,
      signatureEnabled: this.options.signatureEnabled,
      integrityCheck: this.options.integrityCheck
    });
  }

  /**
   * 启动钩子
   */
  protected async onStart(): Promise<void> {
    this.kernel.emit('security:started', {});
  }

  /**
   * 停止钩子
   */
  protected async onStop(): Promise<void> {
    this.kernel.emit('security:stopped', {});
  }

  /**
   * 销毁钩子
   */
  protected async onDestroy(): Promise<void> {
    // 清理资源
    this.cryptoHelper = null;
    this.signatureGenerator = null;
    this.integrityChecker = null;
    this.securityDefense = null;

    this.kernel.emit('security:destroyed', {});
  }
}
