/**
 * 微信小程序分享服务
 * 封装微信小程序的分享相关功能
 */

// 分享配置接口
interface ShareConfig {
  title: string | (() => string);
  path: string | (() => string);
  imageUrl: string | (() => string);
  promise?: boolean;
  withShareTicket?: boolean;
  [key: string]: any;
}

// 文件对象接口
interface ShareFile {
  fileID?: string;
  id?: string;
  name?: string;
  type?: string;
  url?: string;
  [key: string]: any;
}

// 分享参数接口
interface ShareParams {
  title: string;
  path: string;
  imageUrl: string;
  withShareTicket?: boolean;
  [key: string]: any;
}

// 页面对象接口
interface PageInstance {
  onShareAppMessage?: (res: any) => ShareParams;
  onShareTimeline?: () => ShareTimelineParams;
  [key: string]: any;
}

// 朋友圈分享参数接口
interface ShareTimelineParams {
  title: string;
  query: string;
  imageUrl: string;
}

/**
 * 默认分享配置
 */
const DEFAULT_SHARE_CONFIG: ShareConfig = {
  title: '分享文件给你',
  path: '/pages/index/index',
  imageUrl: '',
  promise: false,
  withShareTicket: false
};

/**
 * 分享服务类
 */
class ShareService {
  private defaultConfig: ShareConfig;
  private customShareHandler: ((params: ShareParams, res: any) => void) | null;
  private shareIntercept: ((res: any) => boolean) | null;

  constructor() {
    this.defaultConfig = { ...DEFAULT_SHARE_CONFIG };
    this.customShareHandler = null;
    this.shareIntercept = null;
  }

  /**
   * 设置默认分享配置
   * @param {Object} config 分享配置
   */
  setDefaultConfig(config: Partial<ShareConfig> = {}): ShareService {
    this.defaultConfig = { ...DEFAULT_SHARE_CONFIG, ...config };
    return this;
  }

  /**
   * 创建分享参数
   * @param {Object} options 分享参数
   * @returns {Object} 处理后的分享参数
   */
  createShareParams(options: Partial<ShareConfig> = {}): ShareParams {
    // 合并默认配置与自定义配置
    const shareParams: ShareConfig = { ...this.defaultConfig, ...options };

    // 如果传入的是函数，则调用函数获取配置
    const title = typeof shareParams.title === 'function' ? shareParams.title() : shareParams.title;
    const path = typeof shareParams.path === 'function' ? shareParams.path() : shareParams.path;
    const imageUrl =
      typeof shareParams.imageUrl === 'function' ? shareParams.imageUrl() : shareParams.imageUrl;

    return {
      title,
      path,
      imageUrl,
      withShareTicket: shareParams.withShareTicket
    };
  }

  /**
   * 注册页面的分享处理函数
   * @param {Object} page 页面实例
   * @param {Object|Function} options 分享配置或函数
   */
  registerShareHandler(
    page: PageInstance,
    options: Partial<ShareConfig> | ((res?: any) => Partial<ShareParams>)
  ): void {
    if (!page) {
      console.error('注册分享处理器失败：页面实例不存在');
      return;
    }

    // 支持直接传入配置对象或配置生成函数
    const getShareParams =
      typeof options === 'function' ? options : (res?: any) => this.createShareParams(options);

    // 注册转发分享
    page.onShareAppMessage = (res: any) => {
      // 执行拦截器
      if (this.shareIntercept && !this.shareIntercept(res)) {
        // 拦截器返回false时，使用空配置阻止分享
        return { title: '', path: '', imageUrl: '' };
      }

      // 获取分享参数
      const shareParams = getShareParams(res);

      // 执行自定义分享处理函数
      if (this.customShareHandler) {
        this.customShareHandler(shareParams, res);
      }

      return shareParams;
    };

    // 如果支持分享到朋友圈，也注册相应处理函数
    if (typeof page.onShareTimeline === 'function' || !page.onShareTimeline) {
      page.onShareTimeline = () => {
        // 获取分享参数
        const shareParams = getShareParams();

        return {
          title: shareParams.title,
          query: this.paramsToQuery(shareParams.path),
          imageUrl: shareParams.imageUrl
        };
      };
    }
  }

  /**
   * 从path中提取查询参数
   * @param {String} path 路径
   * @returns {String} 查询参数
   */
  paramsToQuery(path: string): string {
    if (!path || path.indexOf('?') === -1) return '';

    const queryStr = path.split('?')[1];
    return queryStr || '';
  }

  /**
   * 设置全局分享拦截器
   * @param {Function} interceptor 拦截器函数
   */
  setShareIntercept(interceptor: ((res: any) => boolean) | null): ShareService {
    this.shareIntercept = typeof interceptor === 'function' ? interceptor : null;
    return this;
  }

  /**
   * 设置自定义分享处理函数
   * @param {Function} handler 处理函数
   */
  setCustomShareHandler(handler: ((params: ShareParams, res: any) => void) | null): ShareService {
    this.customShareHandler = typeof handler === 'function' ? handler : null;
    return this;
  }

  /**
   * 创建文件分享参数
   * @param {Object} file 文件对象
   * @param {Object} options 分享选项
   * @returns {Object} 分享参数
   */
  createFileShareParams(file: ShareFile, options: Partial<ShareConfig> = {}): ShareParams {
    if (!file) {
      console.error('创建文件分享参数失败：文件对象不存在');
      return this.createShareParams(options);
    }

    // 获取文件名和ID
    const fileID = file.fileID || file.id;
    const fileName = file.name || '文件';

    // 构建文件分享路径
    let sharePath = (options.path as string) || '/pages/file-detail/index';

    // 添加文件参数
    if (fileID) {
      sharePath += `${sharePath.includes('?') ? '&' : '?'}fileID=${encodeURIComponent(fileID)}`;
    }

    // 构建分享标题
    const shareTitle = (options.title as string) || `给你分享「${fileName}」`;

    // 构建分享图片
    let shareImageUrl = options.imageUrl as string;
    if (!shareImageUrl) {
      // 如果是图片文件，可以使用文件本身作为分享图片
      const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (file.type && imageTypes.includes(file.type) && file.url) {
        shareImageUrl = file.url;
      }
    }

    return this.createShareParams({
      title: shareTitle,
      path: sharePath,
      imageUrl: shareImageUrl,
      ...options
    });
  }

  /**
   * 分享单个文件
   * @param {Object} file 文件对象
   * @param {Object} options 分享选项
   * @returns {Promise|undefined} 分享结果
   */
  shareFile(file: ShareFile, options: Partial<ShareConfig> = {}): Promise<any> | undefined {
    if (!file) {
      console.error('文件分享失败：文件对象不存在');
      return Promise.reject(new Error('文件对象不存在'));
    }

    // 构建分享参数
    const shareParams = this.createFileShareParams(file, options);

    // 调用微信分享API
    return this._triggerShare(shareParams, options);
  }

  /**
   * 分享多个文件
   * @param {Array} files 文件数组
   * @param {Object} options 分享选项
   * @returns {Promise|undefined} 分享结果
   */
  shareFiles(files: ShareFile[], options: Partial<ShareConfig> = {}): Promise<any> | undefined {
    if (!Array.isArray(files) || files.length === 0) {
      console.error('文件分享失败：文件数组为空');
      return Promise.reject(new Error('文件数组为空'));
    }

    // 构建分享路径
    let sharePath = (options.path as string) || '/pages/file-list/index';

    // 添加文件ID参数
    const fileIDs = files.map(file => file.fileID || file.id).filter(Boolean);
    if (fileIDs.length > 0) {
      sharePath += `${sharePath.includes('?') ? '&' : '?'}fileIDs=${encodeURIComponent(JSON.stringify(fileIDs))}`;
    }

    // 构建分享标题
    const shareTitle = (options.title as string) || `给你分享${files.length}个文件`;

    // 构建分享参数
    const shareParams = this.createShareParams({
      title: shareTitle,
      path: sharePath,
      imageUrl: options.imageUrl,
      ...options
    });

    // 调用微信分享API
    return this._triggerShare(shareParams, options);
  }

  /**
   * 触发微信分享
   * @param {Object} shareParams 分享参数
   * @param {Object} options 选项
   * @returns {Promise|undefined} 分享结果
   */
  _triggerShare(
    shareParams: ShareParams,
    options: Partial<ShareConfig> = {}
  ): Promise<any> | undefined {
    // 如果启用promise模式，返回Promise
    if (options.promise) {
      return new Promise((resolve, reject) => {
        wx.showShareMenu({
          withShareTicket: shareParams.withShareTicket,
          menus: (options as any).menus || ['shareAppMessage', 'shareTimeline'],
          success: () => {
            // 显示分享操作菜单成功
            setTimeout(() => {
              // 主动唤起分享面板
              if (wx.showSharePanel) {
                wx.showSharePanel({
                  success: resolve,
                  fail: reject
                });
              } else {
                // 不支持直接唤起分享，提示用户点击右上角
                wx.showToast({
                  title: '请点击右上角分享',
                  icon: 'none',
                  duration: 2000,
                  success: resolve,
                  fail: reject
                });
              }
            }, 200);
          },
          fail: reject
        });
      });
    } else {
      // 仅显示分享菜单
      wx.showShareMenu({
        withShareTicket: shareParams.withShareTicket,
        menus: (options as any).menus || ['shareAppMessage', 'shareTimeline']
      });
      return undefined;
    }
  }

  /**
   * 创建分享卡片
   * @param {Object} options 卡片选项
   * @returns {Promise} 分享卡片数据
   */
  createShareCard(options: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      // 获取分享素材
      this.getShareMaterial(options)
        .then(material => {
          // 材料获取成功，创建卡片
          wx.showLoading({ title: '创建分享卡片...' });

          // 这里可以调用自定义的生成分享卡片逻辑
          // 例如: 使用canvas绘制分享卡片
          setTimeout(() => {
            wx.hideLoading();
            resolve({
              path: material.imagePath || '',
              materialType: material.type
            });
          }, 1000);
        })
        .catch(error => {
          wx.hideLoading();
          reject(error);
        });
    });
  }

  /**
   * 获取分享素材
   * @param {Object} options 素材选项
   * @returns {Promise} 分享素材
   */
  getShareMaterial(options: Record<string, any> = {}): Promise<any> {
    // 根据不同的分享类型获取素材
    if (options.file) {
      return this._getFileShareMaterial(options.file, options);
    } else if (options.image) {
      return this._getImageShareMaterial(options.image, options);
    } else {
      // 默认使用小程序码作为分享图片
      return this._getAppCodeShareMaterial(options);
    }
  }

  /**
   * 获取文件分享素材
   * @param {Object} file 文件对象
   * @param {Object} options 素材选项
   * @returns {Promise} 分享素材
   */
  _getFileShareMaterial(file: ShareFile, options: Record<string, any> = {}): Promise<any> {
    // 根据文件类型获取对应的分享素材
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (file.type && imageTypes.includes(file.type) && file.url) {
      // 图片文件直接使用文件URL
      return Promise.resolve({ type: 'image', imagePath: file.url });
    } else {
      // 非图片文件使用默认图标
      return this._getAppCodeShareMaterial(options);
    }
  }

  /**
   * 获取图片分享素材
   * @param {String} image 图片路径
   * @param {Object} options 素材选项
   * @returns {Promise} 分享素材
   */
  _getImageShareMaterial(image: string, options: Record<string, any> = {}): Promise<any> {
    return Promise.resolve({ type: 'image', imagePath: image });
  }

  /**
   * 获取小程序码分享素材
   * @param {Object} options 素材选项
   * @returns {Promise} 分享素材
   */
  _getAppCodeShareMaterial(options: Record<string, any> = {}): Promise<any> {
    // 这里可以调用云函数获取小程序码
    // 简化实现，返回默认图片
    return Promise.resolve({
      type: 'appCode',
      imagePath: options.defaultImage || '/assets/images/default_share.png'
    });
  }
}

export const ShareServiceInstance = new ShareService();
export default ShareService;
