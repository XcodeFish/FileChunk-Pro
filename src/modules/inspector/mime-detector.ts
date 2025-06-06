import { FileChunkKernel } from '../../core/kernel';
import { ModuleBase } from '../../core/module-base';
import { MimeDetectionResult } from '../../types/inspector';

/**
 * MIME类型检测器 - 负责准确识别文件的真实MIME类型
 */
export class MimeDetector extends ModuleBase {
  // 文件签名数据库 (文件头部特征)
  private fileSignatures: Array<{
    type: string;
    signature: number[];
    offset?: number;
    extension: string;
  }>;

  // 危险的MIME类型列表
  private dangerousMimeTypes: string[];

  // 学习到的新文件类型特征
  private learnedSignatures: Array<{
    type: string;
    signature: number[];
    offset?: number;
    extension: string;
    confidence: number; // 置信度(0-100)
    occurrences: number; // 出现次数
    firstSeen: number; // 首次发现时间戳
    lastSeen: number; // 最近发现时间戳
  }>;

  // 学习机制配置
  private learningConfig = {
    enabled: true, // 是否启用学习机制
    minOccurrences: 3, // 最小出现次数才被认为是有效的新类型
    signatureSampleSize: 16, // 采样字节数
    confidenceThreshold: 70, // 最小置信度阈值
    maxLearnedSignatures: 100 // 最大学习签名数量
  };

  constructor() {
    super();

    // 初始化文件签名数据库
    this.fileSignatures = [
      { type: 'image/jpeg', signature: [0xff, 0xd8, 0xff], extension: '.jpg' },
      {
        type: 'image/png',
        signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        extension: '.png'
      },
      { type: 'image/gif', signature: [0x47, 0x49, 0x46, 0x38], extension: '.gif' },
      { type: 'image/webp', signature: [0x52, 0x49, 0x46, 0x46], extension: '.webp' },
      { type: 'application/pdf', signature: [0x25, 0x50, 0x44, 0x46], extension: '.pdf' },
      { type: 'application/zip', signature: [0x50, 0x4b, 0x03, 0x04], extension: '.zip' },
      { type: 'audio/mpeg', signature: [0x49, 0x44, 0x33], extension: '.mp3' },
      {
        type: 'video/mp4',
        signature: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70],
        offset: 4,
        extension: '.mp4'
      },
      { type: 'application/x-msdownload', signature: [0x4d, 0x5a], extension: '.exe' },
      { type: 'application/x-msdos-program', signature: [0x4d, 0x5a], extension: '.exe' },
      {
        type: 'application/vnd.microsoft.portable-executable',
        signature: [0x4d, 0x5a],
        extension: '.exe'
      }
    ];

    // 初始化危险MIME类型列表
    this.dangerousMimeTypes = [
      'application/x-msdownload',
      'application/x-executable',
      'application/x-dosexec',
      'application/x-msdos-program',
      'application/bat',
      'application/cmd',
      'application/x-msdownload',
      'application/x-javascript',
      'text/javascript'
    ];

    // 初始化学习到的签名
    this.learnedSignatures = [];
  }

  /**
   * 初始化模块
   * @param kernel 微内核引用
   */
  async init(kernel: FileChunkKernel): Promise<void> {
    this.kernel = kernel;

    // 尝试从存储中加载已学习的签名
    await this.loadLearnedSignatures();

    this.logger.info('MIME类型检测器初始化完成');
  }

  /**
   * 检测文件的实际MIME类型
   * @param file 待检测的文件
   * @returns MIME检测结果
   */
  async detectMimeType(file: File): Promise<MimeDetectionResult> {
    const result: MimeDetectionResult = {
      mimeType: file.type || '',
      declaredMimeType: file.type || '',
      extensionMatch: true,
      isMalicious: false
    };

    try {
      // 读取文件头部
      const headerBytes = await this.readFileHeader(
        file,
        Math.max(16, this.learningConfig.signatureSampleSize)
      );

      // 首先在内置签名库中查找
      let matchFound = this.matchSignature(headerBytes, this.fileSignatures);

      // 如果内置签名库中没有匹配，尝试在学习到的签名中查找
      if (!matchFound && this.learningConfig.enabled) {
        matchFound = this.matchLearnedSignature(headerBytes);
      }

      if (matchFound) {
        result.mimeType = matchFound.type;
        result.expectedExtension = matchFound.extension;

        // 检查检测到的类型是否与声明类型一致
        if (result.mimeType !== file.type && file.type !== '') {
          result.extensionMatch = false;
        }

        // 检查是否为危险类型
        if (this.dangerousMimeTypes.includes(result.mimeType)) {
          result.isMalicious = true;
        }
      }

      // 检查扩展名与MIME类型是否匹配
      const fileExt = this.getFileExtension(file.name).toLowerCase();
      const expectedExt = result.expectedExtension || this.getExpectedExtension(result.mimeType);

      if (expectedExt && fileExt !== expectedExt) {
        result.extensionMatch = false;
      }

      // 如果启用了学习机制，且文件类型有效，尝试学习新类型
      if (this.learningConfig.enabled && file.type && file.type !== 'application/octet-stream') {
        await this.learnNewFileType(headerBytes, file);
      }

      return result;
    } catch (error) {
      this.logger.error('MIME类型检测失败:', error);
      return result; // 发生错误时返回声明的类型
    }
  }

  /**
   * 在签名库中查找匹配
   * @param headerBytes 文件头部字节
   * @param signatures 签名库
   * @returns 匹配的签名或null
   */
  private matchSignature(headerBytes: Uint8Array, signatures: Array<any>): any | null {
    for (const sig of signatures) {
      const offset = sig.offset || 0;
      let match = true;

      // 检查每个字节是否匹配
      for (let i = 0; i < sig.signature.length; i++) {
        if (i + offset >= headerBytes.length || headerBytes[i + offset] !== sig.signature[i]) {
          match = false;
          break;
        }
      }

      if (match) {
        return sig;
      }
    }

    return null;
  }

  /**
   * 在学习到的签名中查找匹配
   * @param headerBytes 文件头部字节
   * @returns 匹配的签名或null
   */
  private matchLearnedSignature(headerBytes: Uint8Array): any | null {
    // 只考虑达到最小出现次数且置信度高于阈值的签名
    const validSignatures = this.learnedSignatures.filter(
      sig =>
        sig.occurrences >= this.learningConfig.minOccurrences &&
        sig.confidence >= this.learningConfig.confidenceThreshold
    );

    return this.matchSignature(headerBytes, validSignatures);
  }

  /**
   * 学习新文件类型
   * @param headerBytes 文件头部字节
   * @param file 文件对象
   */
  private async learnNewFileType(headerBytes: Uint8Array, file: File): Promise<void> {
    // 如果没有声明类型或是通用二进制类型，不进行学习
    if (!file.type || file.type === 'application/octet-stream') {
      return;
    }

    const fileExt = this.getFileExtension(file.name);
    if (!fileExt) return; // 没有扩展名不进行学习

    // 检查是否已经存在此类型的内置签名
    const existingSignature = this.fileSignatures.find(sig => sig.type === file.type);
    if (existingSignature) return;

    // 提取头部签名，最多使用设定的采样大小
    const signatureLength = Math.min(8, headerBytes.length); // 使用前8个字节作为签名
    const signature = Array.from(headerBytes.slice(0, signatureLength));

    // 检查是否已经在学习库中
    const existingLearned = this.learnedSignatures.find(
      sig => sig.type === file.type && sig.extension === fileExt
    );

    const now = Date.now();

    if (existingLearned) {
      // 更新已有记录
      existingLearned.occurrences++;
      existingLearned.lastSeen = now;

      // 检查签名是否匹配，如果匹配则提高置信度
      const signaturesMatch = this.compareSignatures(signature, existingLearned.signature);

      if (signaturesMatch) {
        // 提高置信度，但不超过100
        existingLearned.confidence = Math.min(100, existingLearned.confidence + 5);
      } else {
        // 不匹配则降低置信度
        existingLearned.confidence = Math.max(0, existingLearned.confidence - 10);
      }
    } else {
      // 添加新记录，但要检查是否已达到最大学习数量
      if (this.learnedSignatures.length >= this.learningConfig.maxLearnedSignatures) {
        // 移除最不常用的记录
        this.learnedSignatures.sort((a, b) => a.occurrences - b.occurrences);
        this.learnedSignatures.shift();
      }

      // 添加新记录
      this.learnedSignatures.push({
        type: file.type,
        signature,
        extension: fileExt,
        confidence: 50, // 初始置信度中等
        occurrences: 1,
        firstSeen: now,
        lastSeen: now
      });
    }

    // 保存学习到的签名
    await this.saveLearnedSignatures();
  }

  /**
   * 比较两个签名是否匹配
   * @param sig1 签名1
   * @param sig2 签名2
   * @returns 是否匹配
   */
  private compareSignatures(sig1: number[], sig2: number[]): boolean {
    if (sig1.length !== sig2.length) return false;

    for (let i = 0; i < sig1.length; i++) {
      if (sig1[i] !== sig2[i]) return false;
    }

    return true;
  }

  /**
   * 加载已学习的签名
   */
  private async loadLearnedSignatures(): Promise<void> {
    try {
      // 尝试从存储模块加载
      if (this.kernel) {
        const storage = this.kernel.getModule('storage');
        if (storage) {
          const savedSignatures = await storage.get('mime_learned_signatures');
          if (savedSignatures) {
            this.learnedSignatures = savedSignatures;
            this.logger.debug(`已加载 ${this.learnedSignatures.length} 个已学习的文件类型特征`);
          }
        }
      }
    } catch (error) {
      this.logger.warn('加载学习的签名失败:', error);
    }
  }

  /**
   * 保存学习到的签名
   */
  private async saveLearnedSignatures(): Promise<void> {
    try {
      // 尝试保存到存储模块
      if (this.kernel) {
        const storage = this.kernel.getModule('storage');
        if (storage) {
          await storage.save('mime_learned_signatures', this.learnedSignatures);
        }
      }
    } catch (error) {
      this.logger.warn('保存学习的签名失败:', error);
    }
  }

  /**
   * 配置学习机制
   * @param config 学习机制配置
   */
  configureLearning(config: Partial<typeof this.learningConfig>): void {
    this.learningConfig = { ...this.learningConfig, ...config };
  }

  /**
   * 获取已学习的签名统计
   */
  getLearnedSignaturesStats(): {
    total: number;
    valid: number;
    typeDistribution: Record<string, number>;
  } {
    const valid = this.learnedSignatures.filter(
      sig =>
        sig.occurrences >= this.learningConfig.minOccurrences &&
        sig.confidence >= this.learningConfig.confidenceThreshold
    ).length;

    // 计算类型分布
    const typeDistribution: Record<string, number> = {};
    this.learnedSignatures.forEach(sig => {
      if (!typeDistribution[sig.type]) {
        typeDistribution[sig.type] = 1;
      } else {
        typeDistribution[sig.type]++;
      }
    });

    return {
      total: this.learnedSignatures.length,
      valid,
      typeDistribution
    };
  }

  /**
   * 清除学习到的签名
   */
  clearLearnedSignatures(): void {
    this.learnedSignatures = [];
    this.saveLearnedSignatures();
  }

  /**
   * 读取文件头部字节
   * @param file 文件对象
   * @param bytesToRead 要读取的字节数
   * @returns 头部字节数组
   */
  private readFileHeader(file: File, bytesToRead: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = e => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        resolve(bytes);
      };

      reader.onerror = () => reject(reader.error || new Error('读取文件失败'));

      // 只读取前面的字节
      const blob = file.slice(0, Math.min(bytesToRead, file.size));
      reader.readAsArrayBuffer(blob);
    });
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
   * 根据MIME类型获取预期的扩展名
   * @param mimeType MIME类型
   * @returns 预期的扩展名或null
   */
  private getExpectedExtension(mimeType: string): string | null {
    // 先在签名库中查找
    for (const sig of this.fileSignatures) {
      if (sig.type === mimeType) {
        return sig.extension;
      }
    }

    // 再在学习的签名中查找
    for (const sig of this.learnedSignatures) {
      if (sig.type === mimeType && sig.confidence >= this.learningConfig.confidenceThreshold) {
        return sig.extension;
      }
    }

    // 常见MIME类型与扩展名映射
    const mimeToExt: Record<string, string> = {
      'text/plain': '.txt',
      'text/html': '.html',
      'text/css': '.css',
      'text/javascript': '.js',
      'application/json': '.json',
      'application/xml': '.xml',
      'application/javascript': '.js',
      'application/octet-stream': '', // 通用二进制，无法确定扩展名
      'image/svg+xml': '.svg',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg',
      'video/webm': '.webm',
      'video/ogg': '.ogv',
      'video/x-msvideo': '.avi'
    };

    return mimeToExt[mimeType] || null;
  }
}
