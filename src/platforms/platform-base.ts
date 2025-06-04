/**
 * 平台适配器接口
 * 用于提供不同平台环境下的功能适配
 */
export interface PlatformAdapter {
  /**
   * 创建文件分片
   */
  createChunks(file: File, chunkSize: number): Promise<any[]> | any[];

  /**
   * 计算文件哈希值
   */
  calculateHash?(file: File): Promise<string>;

  /**
   * 发送网络请求
   */
  request(url: string, method: string, data: any, options?: any): Promise<any>;
}
