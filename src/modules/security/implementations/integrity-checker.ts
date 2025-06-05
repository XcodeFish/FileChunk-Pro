import { HashAlgorithm, IntegrityCheckerInterface } from '../interfaces';

/**
 * 完整性检查器配置选项
 */
interface IntegrityCheckerOptions {
  /**
   * 哈希算法
   */
  algorithm?: HashAlgorithm;

  /**
   * 是否并行计算hash
   */
  useWorker?: boolean;

  /**
   * 分块大小，用于计算大文件哈希
   */
  chunkSize?: number;
}

/**
 * 完整性检查器实现类
 *
 * 提供文件完整性验证、哈希计算和文件指纹生成功能
 */
export class IntegrityChecker implements IntegrityCheckerInterface {
  /**
   * 哈希算法
   */
  private algorithm: HashAlgorithm;

  /**
   * 是否使用Web Worker
   */
  private useWorker: boolean;

  /**
   * 分块大小
   */
  private chunkSize: number;

  /**
   * 构造函数
   * @param options - 完整性检查器配置选项
   */
  constructor(options: IntegrityCheckerOptions = {}) {
    this.algorithm = options.algorithm || 'SHA256';
    this.useWorker = options.useWorker !== undefined ? options.useWorker : true;
    this.chunkSize = options.chunkSize || 2 * 1024 * 1024; // 默认2MB分块
  }

  /**
   * 初始化
   */
  async init(): Promise<void> {
    // 检查算法支持
    if (!this.isCryptoSupported() && !this.isSparkMD5Available()) {
      throw new Error('当前环境不支持哈希计算');
    }
  }

  /**
   * 计算文件哈希
   * @param file - 文件对象
   * @param algorithm - 覆盖默认哈希算法
   * @returns 哈希值
   */
  async calculateHash(file: File, algorithm?: HashAlgorithm): Promise<string> {
    const hashAlgorithm = algorithm || this.algorithm;

    // 使用Web Worker计算
    if (this.useWorker && typeof Worker !== 'undefined') {
      try {
        return await this.calculateHashWithWorker(file, hashAlgorithm);
      } catch (error) {
        console.warn('Worker哈希计算失败，回退到主线程:', error);
      }
    }

    // 回退到主线程计算
    if (this.isCryptoSupported()) {
      return this.calculateHashWithCrypto(file, hashAlgorithm);
    } else if (this.isSparkMD5Available()) {
      return this.calculateHashWithSparkMD5(file);
    }

    throw new Error('没有可用的哈希计算方法');
  }

  /**
   * 验证文件哈希
   * @param file - 文件对象
   * @param expectedHash - 期望的哈希值
   * @param algorithm - 哈希算法
   * @returns 哈希是否匹配
   */
  async verifyHash(file: File, expectedHash: string, algorithm?: HashAlgorithm): Promise<boolean> {
    try {
      const actualHash = await this.calculateHash(file, algorithm);
      return actualHash.toLowerCase() === expectedHash.toLowerCase();
    } catch (error) {
      console.error('验证哈希失败:', error);
      return false;
    }
  }

  /**
   * 生成文件指纹
   * @param file - 文件对象
   * @returns 文件指纹对象
   */
  async generateFingerprint(file: File): Promise<{
    hash: string;
    size: number;
    name: string;
    type: string;
    lastModified: number;
  }> {
    const hash = await this.calculateHash(file);

    return {
      hash,
      size: file.size,
      name: file.name,
      type: file.type,
      lastModified: file.lastModified
    };
  }

  /**
   * 使用Web Crypto API计算哈希
   * @param file - 文件对象
   * @param algorithm - 哈希算法
   * @returns 哈希值
   */
  private async calculateHashWithCrypto(file: File, algorithm: HashAlgorithm): Promise<string> {
    const buffer = await this.readFileAsArrayBuffer(file);
    const hashBuffer = await crypto.subtle.digest(this.getAlgorithmName(algorithm), buffer);

    // 转换为十六进制字符串
    return this.arrayBufferToHex(hashBuffer);
  }

  /**
   * 使用Web Worker计算哈希
   * @param file - 文件对象
   * @param algorithm - 哈希算法
   * @returns 哈希值
   */
  private calculateHashWithWorker(file: File, algorithm: HashAlgorithm): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // 创建Worker
        const worker = new Worker('/workers/hash-worker.js');

        // 监听消息
        worker.onmessage = e => {
          const { type, hash, error } = e.data;

          if (type === 'complete' && hash) {
            worker.terminate();
            resolve(hash);
          } else if (type === 'error') {
            worker.terminate();
            reject(new Error(error || '哈希计算失败'));
          }
        };

        // 错误处理
        worker.onerror = error => {
          worker.terminate();
          reject(error);
        };

        // 发送计算任务
        worker.postMessage({
          file,
          algorithm: this.getAlgorithmName(algorithm),
          chunkSize: this.chunkSize
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 使用SparkMD5计算哈希
   * @param file - 文件对象
   * @returns 哈希值
   */
  private calculateHashWithSparkMD5(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // 检查是否有SparkMD5
        if (!this.isSparkMD5Available()) {
          throw new Error('SparkMD5 未加载');
        }

        // 使用类型断言处理全局对象
        const sparkMD5 = (window as any).SparkMD5;
        const spark = new sparkMD5.ArrayBuffer();
        const fileReader = new FileReader();
        let currentChunk = 0;
        const chunks = Math.ceil(file.size / this.chunkSize);

        fileReader.onload = e => {
          if (e.target && e.target.result) {
            const result = e.target.result as ArrayBuffer;
            spark.append(result as unknown as any);
            currentChunk++;

            if (currentChunk < chunks) {
              loadNext();
            } else {
              const hash = spark.end();
              resolve(hash);
            }
          }
        };

        fileReader.onerror = () => {
          reject(fileReader.error || new Error('读取文件失败'));
        };

        const loadNext = () => {
          const start = currentChunk * this.chunkSize;
          const end = Math.min(start + this.chunkSize, file.size);
          fileReader.readAsArrayBuffer(file.slice(start, end));
        };

        loadNext();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 获取算法名称
   * @param algorithm - 哈希算法
   * @returns 算法名称
   */
  private getAlgorithmName(algorithm: HashAlgorithm): string {
    switch (algorithm) {
      case 'SHA1':
        return 'SHA-1';
      case 'SHA256':
        return 'SHA-256';
      case 'SHA512':
        // SHA512 可以根据需要返回 SHA-384 或 SHA-512
        return 'SHA-512';
      case 'MD5':
        return 'MD5';
      default:
        return 'SHA-256';
    }
  }

  /**
   * 将ArrayBuffer转换为十六进制字符串
   * @param buffer - ArrayBuffer
   * @returns 十六进制字符串
   */
  private arrayBufferToHex(buffer: ArrayBuffer): string {
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * 将文件读取为ArrayBuffer
   * @param file - 文件对象
   * @returns ArrayBuffer
   */
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('文件读取结果不是ArrayBuffer'));
        }
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 检查是否支持Web Crypto API
   * @returns 是否支持
   */
  private isCryptoSupported(): boolean {
    return (
      typeof crypto !== 'undefined' &&
      typeof crypto.subtle !== 'undefined' &&
      typeof crypto.subtle.digest === 'function'
    );
  }

  /**
   * 检查是否有SparkMD5库
   * @returns 是否存在
   */
  private isSparkMD5Available(): boolean {
    // 使用类型断言处理全局对象
    return typeof (window as any).SparkMD5 !== 'undefined';
  }
}
