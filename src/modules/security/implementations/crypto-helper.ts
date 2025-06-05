import { EncryptionAlgorithm, EncryptionInterface } from '../interfaces';

/**
 * 加密助手配置选项
 */
interface CryptoHelperOptions {
  /**
   * 加密密钥
   */
  key?: string;

  /**
   * 加密算法
   */
  algorithm?: EncryptionAlgorithm;
}

/**
 * 加密助手实现类
 *
 * 提供加密、解密和密钥管理功能
 */
export class CryptoHelper implements EncryptionInterface {
  /**
   * 加密算法
   */
  private algorithm: EncryptionAlgorithm;

  /**
   * 加密密钥
   */
  private key: string | undefined;

  /**
   * 导入的加密密钥对象
   */
  private cryptoKey: CryptoKey | null = null;

  /**
   * 构造函数
   * @param options - 加密助手配置选项
   */
  constructor(options: CryptoHelperOptions = {}) {
    this.algorithm = options.algorithm || 'AES-GCM';
    this.key = options.key;
  }

  /**
   * 初始化加密模块
   */
  async init(): Promise<void> {
    if (!this.isCryptoSupported()) {
      throw new Error('Web Crypto API 不受支持');
    }

    if (this.key) {
      // 将密钥导入为AES-GCM密钥
      this.cryptoKey = await this.importKey(this.key, this.algorithm);
    } else {
      // 生成随机密钥
      this.cryptoKey = await this.generateKey();
    }
  }

  /**
   * 加密数据
   * @param data - 要加密的数据
   * @returns 加密结果，包含加密后的数据和IV
   */
  async encrypt(data: string | ArrayBuffer): Promise<{ data: string | ArrayBuffer; iv: string }> {
    if (!this.cryptoKey) {
      await this.init();
    }

    // 生成随机IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 准备数据
    const dataBuffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;

    // 使用AES-GCM加密
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: this.getAlgorithmName(),
        iv
      },
      this.cryptoKey as CryptoKey,
      dataBuffer
    );

    // 转换为Base64
    const encryptedBase64 = this.arrayBufferToBase64(encryptedBuffer);
    const ivBase64 = this.arrayBufferToBase64(iv);

    return {
      data: encryptedBase64,
      iv: ivBase64
    };
  }

  /**
   * 解密数据
   * @param encryptedData - 加密的数据
   * @param iv - 初始化向量
   * @returns 解密后的数据
   */
  async decrypt(encryptedData: string | ArrayBuffer, iv: string): Promise<string | ArrayBuffer> {
    if (!this.cryptoKey) {
      throw new Error('加密模块未初始化');
    }

    // 将Base64转换为ArrayBuffer
    const encryptedBuffer =
      typeof encryptedData === 'string' ? this.base64ToArrayBuffer(encryptedData) : encryptedData;

    const ivBuffer = this.base64ToArrayBuffer(iv);

    // 解密
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: this.getAlgorithmName(),
        iv: ivBuffer
      },
      this.cryptoKey,
      encryptedBuffer
    );

    // 尝试将结果转换为字符串
    try {
      return new TextDecoder().decode(decryptedBuffer);
    } catch {
      // 如果无法转换为字符串，则返回原始缓冲区
      return decryptedBuffer;
    }
  }

  /**
   * 导入密钥
   * @param key - 密钥数据（Base64字符串或ArrayBuffer）
   * @param algorithm - 算法名称
   * @returns 导入的密钥对象
   */
  async importKey(key: string | ArrayBuffer, algorithm: string): Promise<CryptoKey> {
    // 准备密钥数据
    const keyData = typeof key === 'string' ? this.base64ToArrayBuffer(key) : key;

    // 确定导入算法
    const importAlgorithm = this.getImportAlgorithm(algorithm);
    const keyUsages = this.getKeyUsages(algorithm);

    // 导入密钥
    return crypto.subtle.importKey('raw', keyData, importAlgorithm, false, keyUsages);
  }

  /**
   * 生成新的加密密钥
   * @returns 生成的密钥对象
   */
  async generateKey(): Promise<CryptoKey> {
    const algorithm = this.getGenerateKeyAlgorithm();
    const keyUsages = this.getKeyUsages(this.algorithm);

    const keyResult = await crypto.subtle.generateKey(
      algorithm,
      true, // 可导出的
      keyUsages
    );

    // 处理不同类型的返回值
    if ((keyResult as CryptoKeyPair).privateKey) {
      // RSA 返回密钥对，取私钥
      return (keyResult as CryptoKeyPair).privateKey;
    } else {
      // 对称密钥算法如AES直接返回单个密钥
      return keyResult as unknown as CryptoKey;
    }
  }

  /**
   * 将密钥导出为Base64字符串
   * @param key - 密钥对象
   * @returns Base64编码的密钥
   */
  async exportKey(key: CryptoKey = this.cryptoKey as CryptoKey): Promise<string> {
    const keyBuffer = await crypto.subtle.exportKey('raw', key);
    return this.arrayBufferToBase64(keyBuffer);
  }

  /**
   * 确定是否支持Web Crypto API
   * @returns 是否支持
   */
  private isCryptoSupported(): boolean {
    return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
  }

  /**
   * 获取算法名称
   * @returns 算法名称
   */
  private getAlgorithmName(): string {
    switch (this.algorithm) {
      case 'AES-GCM':
        return 'AES-GCM';
      case 'AES-CBC':
        return 'AES-CBC';
      case 'RSA':
        return 'RSA-OAEP';
      case 'NONE':
        return 'NONE';
      default:
        return 'AES-GCM';
    }
  }

  /**
   * 获取导入算法配置
   * @param algorithm - 算法名称
   * @returns 导入算法配置
   */
  private getImportAlgorithm(algorithm: string): any {
    switch (algorithm) {
      case 'AES-GCM':
        return { name: 'AES-GCM' };
      case 'AES-CBC':
        return { name: 'AES-CBC' };
      case 'RSA':
        return { name: 'RSA-OAEP', hash: { name: 'SHA-256' } };
      case 'HMAC-SHA256':
      case 'HMAC-SHA512':
        return { name: 'HMAC', hash: { name: algorithm.split('-')[1] } };
      default:
        throw new Error(`不支持的算法: ${algorithm}`);
    }
  }

  /**
   * 获取生成密钥的算法配置
   * @returns 生成密钥的算法配置
   */
  private getGenerateKeyAlgorithm(): any {
    switch (this.algorithm) {
      case 'AES-GCM':
      case 'AES-CBC':
        return { name: this.getAlgorithmName(), length: 256 };
      case 'RSA':
        return {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
          hash: { name: 'SHA-256' }
        };
      case 'NONE':
      default:
        return { name: 'AES-GCM', length: 256 };
    }
  }

  /**
   * 获取密钥用途
   * @param algorithm - 算法名称
   * @returns 密钥用途数组
   */
  private getKeyUsages(algorithm: string): KeyUsage[] {
    switch (algorithm) {
      case 'AES-GCM':
      case 'AES-CBC':
        return ['encrypt', 'decrypt'];
      case 'RSA':
        return ['encrypt', 'decrypt'];
      case 'HMAC-SHA256':
      case 'HMAC-SHA512':
        return ['sign', 'verify'];
      default:
        return ['encrypt', 'decrypt'];
    }
  }

  /**
   * ArrayBuffer转Base64
   * @param buffer - ArrayBuffer或Uint8Array
   * @returns Base64编码的字符串
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
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
