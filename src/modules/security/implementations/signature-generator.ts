import { SignatureAlgorithm, SignatureInterface } from '../interfaces';

/**
 * 签名生成器配置选项
 */
interface SignatureGeneratorOptions {
  /**
   * 签名密钥
   */
  key?: string;

  /**
   * 签名算法
   */
  algorithm?: SignatureAlgorithm;
}

/**
 * 签名生成器实现类
 *
 * 提供请求签名生成和验证功能
 */
export class SignatureGenerator implements SignatureInterface {
  /**
   * 签名算法
   */
  private algorithm: SignatureAlgorithm;

  /**
   * 签名密钥
   */
  private key: string | undefined;

  /**
   * 导入的密钥对象
   */
  private cryptoKey: CryptoKey | null = null;

  /**
   * 构造函数
   * @param options - 签名生成器配置选项
   */
  constructor(options: SignatureGeneratorOptions = {}) {
    this.algorithm = options.algorithm || 'HMAC-SHA256';
    this.key = options.key;
  }

  /**
   * 初始化签名生成器
   */
  async init(): Promise<void> {
    if (!this.isCryptoSupported()) {
      throw new Error('Web Crypto API 不受支持');
    }

    if (this.key) {
      // 导入签名密钥
      this.cryptoKey = await this.importKey(this.key, this.algorithm);
    } else {
      // 生成随机密钥
      this.cryptoKey = await this.generateKey();
    }
  }

  /**
   * 生成签名
   * @param method - 请求方法
   * @param url - 请求URL
   * @param timestamp - 时间戳
   * @param body - 请求体
   * @returns 签名值
   */
  async generateSignature(
    method: string,
    url: string,
    timestamp: string,
    body?: any
  ): Promise<string> {
    if (!this.cryptoKey) {
      await this.init();
    }

    // 创建签名字符串
    const signatureStr = await this.createSignatureString(method, url, timestamp, body);

    // 计算签名
    const signature = await this.sign(signatureStr);

    return signature;
  }

  /**
   * 验证签名
   * @param signature - 签名值
   * @param method - 请求方法
   * @param url - 请求URL
   * @param timestamp - 时间戳
   * @param body - 请求体
   * @returns 签名是否有效
   */
  async verifySignature(
    signature: string,
    method: string,
    url: string,
    timestamp: string,
    body?: any
  ): Promise<boolean> {
    if (!this.cryptoKey) {
      await this.init();
    }

    // 创建签名字符串
    const signatureStr = await this.createSignatureString(method, url, timestamp, body);

    // 验证签名
    return this.verify(signature, signatureStr);
  }

  /**
   * 创建签名字符串
   * @param method - 请求方法
   * @param url - 请求URL
   * @param timestamp - 时间戳
   * @param body - 请求体
   * @returns 签名字符串
   */
  private async createSignatureString(
    method: string,
    url: string,
    timestamp: string,
    body?: any
  ): Promise<string> {
    // 提取URL路径
    let path;
    try {
      const parsedUrl = new URL(url);
      path = parsedUrl.pathname + parsedUrl.search;
    } catch {
      // 如果URL解析失败，可能是相对路径
      path = url;
    }

    // 序列化body (如果存在)
    let bodyStr = '';
    if (body !== undefined && body !== null) {
      if (typeof body === 'string') {
        bodyStr = body;
      } else if (body instanceof FormData) {
        // FormData需要特殊处理，这里简化为使用时间戳作为替代
        bodyStr = `FormData:${timestamp}`;
      } else if (typeof body === 'object') {
        try {
          bodyStr = JSON.stringify(body);
        } catch {
          bodyStr = `${timestamp}`;
        }
      }
    }

    // 创建签名字符串 (格式: METHOD\nPATH\nTIMESTAMP\nBODY_HASH)
    // 对请求体计算哈希以减小签名字符串大小
    const bodyHash = bodyStr ? await this.hashString(bodyStr) : '';
    return `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`;
  }

  /**
   * 对数据进行签名
   * @param data - 要签名的数据
   * @returns 签名值
   */
  private async sign(data: string): Promise<string> {
    if (!this.cryptoKey) {
      throw new Error('签名密钥未初始化');
    }

    // 将字符串转换为二进制数据
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    try {
      // 使用私钥签名
      const signatureBuffer = await this.signData(dataBuffer, this.cryptoKey);

      // 转换为Base64
      return this.arrayBufferToBase64(signatureBuffer);
    } catch (error) {
      console.error('签名失败:', error);
      throw new Error('无法生成签名');
    }
  }

  /**
   * 验证签名
   * @param signature - 签名值
   * @param data - 原始数据
   * @returns 签名是否有效
   */
  private async verify(signature: string, data: string): Promise<boolean> {
    if (!this.cryptoKey) {
      throw new Error('签名密钥未初始化');
    }

    try {
      // 解码签名
      const signatureBuffer = this.base64ToArrayBuffer(signature);

      // 将字符串转换为二进制
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);

      // 验证签名
      return this.verifyData(signatureBuffer, dataBuffer, this.cryptoKey);
    } catch (error) {
      console.error('验证签名失败:', error);
      return false;
    }
  }

  /**
   * 签名数据
   * @param data - 数据
   * @param key - 密钥
   * @returns 签名结果
   */
  private async signData(data: Uint8Array, key: CryptoKey): Promise<ArrayBuffer> {
    const algorithmConfig = this.getSignAlgorithmConfig();

    // 执行签名
    return crypto.subtle.sign(algorithmConfig, key, data);
  }

  /**
   * 验证签名
   * @param signature - 签名
   * @param data - 原始数据
   * @param key - 密钥
   * @returns 签名是否有效
   */
  private async verifyData(
    signature: ArrayBuffer,
    data: Uint8Array,
    key: CryptoKey
  ): Promise<boolean> {
    const algorithmConfig = this.getSignAlgorithmConfig();

    // 验证签名
    return crypto.subtle.verify(algorithmConfig, key, signature, data);
  }

  /**
   * 对字符串进行哈希
   * @param str - 输入字符串
   * @returns 哈希值
   */
  private async hashString(str: string): Promise<string> {
    // 将字符串转换为二进制
    const encoder = new TextEncoder();
    const data = encoder.encode(str);

    // 根据算法选择哈希函数
    const hashAlgo = this.getHashAlgorithm();

    // 计算哈希
    const hashBuffer = await crypto.subtle.digest(hashAlgo, data);

    // 转换为十六进制
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * 导入签名密钥
   * @param key - 密钥
   * @param algorithm - 算法
   * @returns 导入的密钥
   */
  private async importKey(key: string, _algorithm: SignatureAlgorithm): Promise<CryptoKey> {
    try {
      // 将Base64密钥转换为二进制
      const keyData = this.base64ToArrayBuffer(key);

      // 导入算法
      const importAlgo = this.getImportAlgorithmConfig();

      // 导入密钥
      const keyResult = await crypto.subtle.importKey('raw', keyData, importAlgo, false, [
        'sign',
        'verify'
      ]);
      return keyResult as unknown as CryptoKey;
    } catch (error) {
      console.error('导入签名密钥失败:', error);
      throw new Error('无法导入签名密钥');
    }
  }

  /**
   * 生成签名密钥
   * @returns 生成的密钥
   */
  private async generateKey(): Promise<CryptoKey> {
    try {
      // 算法配置
      const algorithmConfig = this.getKeyGenAlgorithmConfig();

      // 生成密钥
      const keyResult = await crypto.subtle.generateKey(algorithmConfig, true, ['sign', 'verify']);
      return keyResult as unknown as CryptoKey;
    } catch (error) {
      console.error('生成签名密钥失败:', error);
      throw new Error('无法生成签名密钥');
    }
  }

  /**
   * 获取签名算法配置
   * @returns 算法配置
   */
  private getSignAlgorithmConfig(): AlgorithmIdentifier {
    switch (this.algorithm) {
      case 'HMAC-SHA256':
        return {
          name: 'HMAC',
          hash: 'SHA-256'
        } as any;
      case 'HMAC-SHA512':
        return {
          name: 'HMAC',
          hash: 'SHA-512'
        } as any;
      case 'RSA-SHA256':
        return {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256'
        } as any;
      default:
        return {
          name: 'HMAC',
          hash: 'SHA-256'
        } as any;
    }
  }

  /**
   * 获取导入密钥算法配置
   * @returns 算法配置
   */
  private getImportAlgorithmConfig(): any {
    switch (this.algorithm) {
      case 'HMAC-SHA256':
      case 'HMAC-SHA512':
        return {
          name: 'HMAC',
          hash: this.algorithm.split('-')[1]
        } as any;
      case 'RSA-SHA256':
        return {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256'
        } as any;
      default:
        return {
          name: 'HMAC',
          hash: 'SHA-256'
        } as any;
    }
  }

  /**
   * 获取密钥生成算法配置
   * @returns 算法配置
   */
  private getKeyGenAlgorithmConfig(): any {
    switch (this.algorithm) {
      case 'HMAC-SHA256':
        return {
          name: 'HMAC',
          hash: 'SHA-256',
          length: 256
        } as any;
      case 'HMAC-SHA512':
        return {
          name: 'HMAC',
          hash: 'SHA-512',
          length: 512
        } as any;
      case 'RSA-SHA256':
        return {
          name: 'RSASSA-PKCS1-v1_5',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]), // 65537
          hash: 'SHA-256'
        } as any;
      default:
        return {
          name: 'HMAC',
          hash: 'SHA-256',
          length: 256
        } as any;
    }
  }

  /**
   * 获取哈希算法名称
   * @returns 哈希算法名称
   */
  private getHashAlgorithm(): AlgorithmIdentifier {
    switch (this.algorithm) {
      case 'HMAC-SHA256':
        return 'SHA-256';
      case 'HMAC-SHA512':
        return 'SHA-512';
      default:
        return 'SHA-256';
    }
  }

  /**
   * 检查是否支持Web Crypto API
   * @returns 是否支持
   */
  private isCryptoSupported(): boolean {
    return (
      typeof crypto !== 'undefined' &&
      typeof crypto.subtle !== 'undefined' &&
      typeof crypto.subtle.sign === 'function' &&
      typeof crypto.subtle.importKey === 'function'
    );
  }

  /**
   * ArrayBuffer转Base64
   * @param buffer - ArrayBuffer
   * @returns Base64编码的字符串
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64转ArrayBuffer
   * @param base64 - Base64编码的字符串
   * @returns ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
