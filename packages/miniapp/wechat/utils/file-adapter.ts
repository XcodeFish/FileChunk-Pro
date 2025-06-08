/**
 * 微信小程序文件适配器
 * 用于处理小程序环境中的文件操作和转换
 */

import WechatPlatform from './wx-platform';

interface AdaptedFile {
  path: string;
  size: number;
  name: string;
  type: string;
  lastModified: number;
  slice: (start: number, end: number) => Promise<ArrayBuffer>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
  base64: () => Promise<string>;
}

interface WechatFile {
  path: string;
  size?: number;
  name?: string;
  type?: string;
  lastModified?: number;
  [key: string]: any;
}

interface FileChunk {
  index: number;
  start: number;
  end: number;
  size: number;
  file: WechatFile | AdaptedFile;
  path: string;
  getData: () => Promise<ArrayBuffer>;
}

export class FileAdapter {
  private platform: WechatPlatform;
  private fs: WechatMiniprogram.FileSystemManager;
  onMD5Progress?: (progress: number) => void;

  constructor(platform: WechatPlatform) {
    this.platform = platform;
    this.fs = wx.getFileSystemManager();
  }

  /**
   * 将微信小程序文件对象适配为标准文件对象
   * @param {Object} wxFile 微信文件对象
   * @returns {Object} 标准文件对象
   */
  adaptFile(wxFile: WechatFile): AdaptedFile | null {
    if (!wxFile || !wxFile.path) return null;

    const self = this;
    return {
      path: wxFile.path,
      size: wxFile.size || 0,
      name: wxFile.name || this.platform.getFileName(wxFile.path),
      type: wxFile.type || this.platform.getFileType(wxFile.path),
      lastModified: wxFile.lastModified || Date.now(),
      slice: (start: number, end: number) => self.sliceFile(wxFile.path, start, end),
      arrayBuffer: () => self.fileToArrayBuffer(wxFile.path),
      text: () => self.fileToText(wxFile.path),
      base64: () => self.fileToBase64(wxFile.path)
    };
  }

  /**
   * 获取文件分片
   * @param {String} filePath 文件路径
   * @param {Number} start 起始位置
   * @param {Number} end 结束位置
   * @returns {Promise<ArrayBuffer>} 文件分片数据
   */
  async sliceFile(filePath: string, start: number, end: number): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      this.fs.readFile({
        filePath,
        position: start,
        length: end - start,
        success: res => resolve(res.data as ArrayBuffer),
        fail: reject
      });
    });
  }

  /**
   * 文件转ArrayBuffer
   * @param {String} filePath 文件路径
   * @returns {Promise<ArrayBuffer>} 文件数据
   */
  async fileToArrayBuffer(filePath: string): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      this.fs.readFile({
        filePath,
        success: res => resolve(res.data as ArrayBuffer),
        fail: reject
      });
    });
  }

  /**
   * 文件转文本
   * @param {String} filePath 文件路径
   * @returns {Promise<String>} 文件文本内容
   */
  async fileToText(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      (this.fs.readFile as any)({
        filePath,
        encoding: 'utf-8',
        success: (res: { data: string }) => resolve(res.data),
        fail: reject
      });
    });
  }

  /**
   * 文件转Base64
   * @param {String} filePath 文件路径
   * @returns {Promise<String>} Base64编码的文件内容
   */
  async fileToBase64(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      (this.fs.readFile as any)({
        filePath,
        encoding: 'base64',
        success: (res: { data: string }) => resolve(res.data),
        fail: reject
      });
    });
  }

  /**
   * 计算文件MD5
   * @param {String} filePath 文件路径
   * @param {Boolean} isLargeFile 是否为大文件(分片计算)
   * @returns {Promise<String>} MD5哈希值
   */
  async calculateFileMD5(filePath: string, isLargeFile: boolean = false): Promise<string> {
    // 小程序环境不支持Web Worker，使用直接计算
    try {
      if (!isLargeFile) {
        // 小文件直接计算
        const fileContent = await this.platform.readFile(filePath);
        return this.arrayBufferToMD5(fileContent);
      } else {
        // 大文件分片计算
        return await this.calculateLargeFileMD5(filePath);
      }
    } catch (error) {
      console.error('MD5计算失败:', error);
      throw error;
    }
  }

  /**
   * 大文件MD5计算
   * @param {String} filePath 文件路径
   * @returns {Promise<String>} MD5哈希值
   */
  async calculateLargeFileMD5(filePath: string): Promise<string> {
    // 注：此处需要引入SparkMD5库
    // 在小程序环境中，可以通过NPM引入或直接复制SparkMD5源码
    // @ts-expect-error - SparkMD5 is imported globally
    if (typeof SparkMD5 === 'undefined') {
      throw new Error('SparkMD5未定义，请先引入SparkMD5库');
    }

    try {
      const fileInfo = await this.platform.getFileInfo(filePath);
      const fileSize = fileInfo.size;
      const chunkSize = 2 * 1024 * 1024; // 2MB分片
      const chunks = Math.ceil(fileSize / chunkSize);
      // @ts-expect-error - SparkMD5 is imported globally
      const spark = new SparkMD5.ArrayBuffer();

      for (let i = 0; i < chunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunk = await this.platform.readFileChunk(filePath, start, end);
        spark.append(chunk);

        // 进度回调可以在这里添加
        if (this.onMD5Progress) {
          this.onMD5Progress((i + 1) / chunks);
        }
      }

      return spark.end();
    } catch (error) {
      console.error('大文件MD5计算失败:', error);
      throw error;
    }
  }

  /**
   * ArrayBuffer转MD5
   * @param {ArrayBuffer} buffer ArrayBuffer数据
   * @returns {String} MD5哈希值
   */
  arrayBufferToMD5(buffer: ArrayBuffer): string {
    // 注：此处需要引入SparkMD5库
    // @ts-expect-error - SparkMD5 is imported globally
    if (typeof SparkMD5 === 'undefined') {
      throw new Error('SparkMD5未定义，请先引入SparkMD5库');
    }

    // @ts-expect-error - SparkMD5 is imported globally
    return SparkMD5.ArrayBuffer.hash(buffer);
  }

  /**
   * 创建文件分片
   * @param {Object} file 文件对象
   * @param {Number} chunkSize 分片大小
   * @returns {Promise<Array>} 文件分片列表
   */
  async createFileChunks(file: WechatFile | AdaptedFile, chunkSize: number): Promise<FileChunk[]> {
    try {
      const fileInfo = await this.platform.getFileInfo(file.path);
      const fileSize = fileInfo.size;
      const chunks: FileChunk[] = [];

      // 计算分片数量
      const totalChunks = Math.ceil(fileSize / chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);

        chunks.push({
          index: i,
          start,
          end,
          size: end - start,
          file,
          path: file.path,
          // 延迟加载数据，避免内存占用过多
          getData: async () => await this.platform.readFileChunk(file.path, start, end)
        });
      }

      return chunks;
    } catch (error) {
      console.error('创建文件分片失败:', error);
      throw error;
    }
  }

  /**
   * 获取文件扩展名
   * @param {String} filename 文件名
   * @returns {String} 文件扩展名
   */
  getFileExtension(filename: string): string {
    if (!filename) return '';
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex === -1 ? '' : filename.substring(lastDotIndex + 1).toLowerCase();
  }

  /**
   * 检查文件类型是否合法
   * @param {String} filename 文件名
   * @param {Array} allowedExtensions 允许的扩展名列表
   * @returns {Boolean} 是否合法
   */
  isValidFileType(filename: string, allowedExtensions: string[]): boolean {
    if (!filename || !allowedExtensions || !allowedExtensions.length) return true;

    const extension = this.getFileExtension(filename);
    return allowedExtensions.includes(extension);
  }

  /**
   * 获取文件图标
   * @param {String} filename 文件名
   * @returns {String} 图标路径
   */
  getFileIcon(filename: string): string {
    const extension = this.getFileExtension(filename);

    // 根据文件类型返回对应的图标路径
    const iconMap: Record<string, string> = {
      jpg: '/assets/icons/image.png',
      jpeg: '/assets/icons/image.png',
      png: '/assets/icons/image.png',
      gif: '/assets/icons/image.png',
      mp4: '/assets/icons/video.png',
      mov: '/assets/icons/video.png',
      mp3: '/assets/icons/audio.png',
      wav: '/assets/icons/audio.png',
      pdf: '/assets/icons/pdf.png',
      doc: '/assets/icons/word.png',
      docx: '/assets/icons/word.png',
      xls: '/assets/icons/excel.png',
      xlsx: '/assets/icons/excel.png',
      ppt: '/assets/icons/ppt.png',
      pptx: '/assets/icons/ppt.png',
      txt: '/assets/icons/text.png'
    };

    return iconMap[extension] || '/assets/icons/file.png';
  }

  /**
   * 格式化文件大小
   * @param {Number} size 文件大小(字节)
   * @returns {String} 格式化后的大小
   */
  formatFileSize(size: number): string {
    if (!size) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let index = 0;
    let formattedSize = size;

    while (formattedSize >= 1024 && index < units.length - 1) {
      formattedSize /= 1024;
      index++;
    }

    return `${formattedSize.toFixed(2)} ${units[index]}`;
  }
}

export default FileAdapter;
