/**
 * 微信小程序API服务
 * 封装对服务端的API调用
 */

interface RequestOptions {
  method?: string;
  data?: any;
  header?: Record<string, string>;
  timeout?: number;
  onProgress?: (progress: {
    progress: number;
    totalBytesSent: number;
    totalBytesExpectedToSend: number;
  }) => void;
  getTask?: (task: any) => void;
  baseUrl?: string;
}

interface ErrorResponse {
  code: number;
  message: string;
  data?: any;
  error?: any;
}

interface UploadParams {
  hash: string;
  index?: number;
  total?: number;
  filename?: string;
  token?: string;
  filePath?: string;
}

/**
 * 基础请求方法
 * @param {String} url 请求地址
 * @param {Object} options 请求选项
 * @returns {Promise} 请求响应
 */
export async function request(url: string, options: RequestOptions = {}): Promise<any> {
  const defaultOptions: RequestOptions = {
    method: 'GET',
    data: {},
    header: {
      'content-type': 'application/json'
    },
    timeout: 60000
  };

  const mergedOptions = { ...defaultOptions, ...options };

  return new Promise<any>((resolve, reject) => {
    wx.request({
      url,
      method: mergedOptions.method as any,
      data: mergedOptions.data,
      header: mergedOptions.header,
      timeout: mergedOptions.timeout,
      success(res: any) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject({
            code: res.statusCode,
            message: `请求失败: ${res.statusCode}`,
            data: res.data
          } as ErrorResponse);
        }
      },
      fail(err: any) {
        reject({
          code: -1,
          message: err.errMsg || '网络请求失败',
          error: err
        } as ErrorResponse);
      }
    });
  });
}

/**
 * 检查上传状态，用于秒传检测
 * @param {Object} params 请求参数
 * @param {Object} options 请求选项
 * @returns {Promise<Object>} 上传状态
 */
export async function checkUploadStatus(
  params: Record<string, any>,
  options: RequestOptions = {}
): Promise<any> {
  const url = options.baseUrl ? `${options.baseUrl}/check` : '/api/upload/check';

  return request(url, {
    method: 'POST',
    data: params,
    ...options
  });
}

/**
 * 获取上传Token
 * @param {Object} params 请求参数
 * @param {Object} options 请求选项
 * @returns {Promise<Object>} 上传Token信息
 */
export async function getUploadToken(
  params: Record<string, any>,
  options: RequestOptions = {}
): Promise<any> {
  const url = options.baseUrl ? `${options.baseUrl}/token` : '/api/upload/token';

  return request(url, {
    method: 'POST',
    data: params,
    ...options
  });
}

/**
 * 上传文件分片
 * @param {Object} params 上传参数
 * @param {Object} options 上传选项
 * @returns {Promise<Object>} 上传结果
 */
export async function uploadChunk(
  params: UploadParams,
  options: RequestOptions = {}
): Promise<any> {
  const url = options.baseUrl ? `${options.baseUrl}/chunk` : '/api/upload/chunk';

  const formData: Record<string, any> = {
    hash: params.hash,
    index: params.index,
    total: params.total,
    filename: params.filename
  };

  // 额外的参数
  if (params.token) {
    formData.token = params.token;
  }

  return new Promise<any>((resolve, reject) => {
    const uploadTask = wx.uploadFile({
      url,
      filePath: params.filePath || '',
      name: 'chunk',
      formData,
      header: options.header || {},
      timeout: options.timeout || 60000,
      success(res: any) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(res.data);
            resolve(data);
          } catch (_e) {
            // 如果不是JSON，直接返回数据
            resolve(res.data);
          }
        } else {
          reject({
            code: res.statusCode,
            message: `上传分片失败: ${res.statusCode}`,
            data: res.data
          } as ErrorResponse);
        }
      },
      fail(err: any) {
        reject({
          code: -1,
          message: err.errMsg || '分片上传失败',
          error: err
        } as ErrorResponse);
      }
    });

    // 注册进度回调
    if (typeof options.onProgress === 'function') {
      uploadTask.onProgressUpdate((res: any) => {
        options.onProgress!({
          progress: res.progress / 100,
          totalBytesSent: res.totalBytesSent,
          totalBytesExpectedToSend: res.totalBytesExpectedToSend
        });
      });
    }

    // 返回上传任务以便外部可以中断
    if (options.getTask) {
      options.getTask(uploadTask);
    }
  });
}

/**
 * 合并文件分片
 * @param {Object} params 合并参数
 * @param {Object} options 请求选项
 * @returns {Promise<Object>} 合并结果
 */
export async function mergeChunks(
  params: Record<string, any>,
  options: RequestOptions = {}
): Promise<any> {
  const url = options.baseUrl ? `${options.baseUrl}/merge` : '/api/upload/merge';

  return request(url, {
    method: 'POST',
    data: params,
    ...options
  });
}

/**
 * 查询上传进度
 * @param {Object} params 进度查询参数
 * @param {Object} options 请求选项
 * @returns {Promise<Object>} 上传进度信息
 */
export async function getUploadProgress(
  params: Record<string, any>,
  options: RequestOptions = {}
): Promise<any> {
  const url = options.baseUrl ? `${options.baseUrl}/progress` : '/api/upload/progress';

  return request(url, {
    method: 'GET',
    data: params,
    ...options
  });
}

/**
 * 创建公共链接
 * @param {Object} params 链接参数
 * @param {Object} options 请求选项
 * @returns {Promise<Object>} 链接信息
 */
export async function createPublicLink(
  params: Record<string, any>,
  options: RequestOptions = {}
): Promise<any> {
  const url = options.baseUrl ? `${options.baseUrl}/public-link` : '/api/upload/public-link';

  return request(url, {
    method: 'POST',
    data: params,
    ...options
  });
}

/**
 * 上传状态报告
 * @param {Object} params 状态参数
 * @param {Object} options 请求选项
 * @returns {Promise<Object>} 处理结果
 */
export async function reportUploadStatus(
  params: Record<string, any>,
  options: RequestOptions = {}
): Promise<any> {
  const url = options.baseUrl ? `${options.baseUrl}/report` : '/api/upload/report';

  return request(url, {
    method: 'POST',
    data: params,
    ...options
  });
}

/**
 * 删除上传的文件或取消上传
 * @param {Object} params 删除参数
 * @param {Object} options 请求选项
 * @returns {Promise<Object>} 处理结果
 */
export async function deleteUpload(
  params: Record<string, any>,
  options: RequestOptions = {}
): Promise<any> {
  const url = options.baseUrl ? `${options.baseUrl}/delete` : '/api/upload/delete';

  return request(url, {
    method: 'POST',
    data: params,
    ...options
  });
}
