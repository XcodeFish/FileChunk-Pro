/**
 * 微信小程序类型声明
 */

// 全局 wx 对象声明
declare namespace wx {
  // 系统信息
  function getSystemInfoSync(): WechatMiniprogram.SystemInfo;
  function getSystemInfo(options: { success?: (res: WechatMiniprogram.SystemInfo) => void, fail?: (err: any) => void, complete?: () => void }): void;
  
  // 网络相关
  function getNetworkType(options: { success?: (res: { networkType: string }) => void, fail?: (err: any) => void, complete?: () => void }): void;
  function onNetworkStatusChange(callback: (res: { isConnected: boolean, networkType: string }) => void): void;
  
  // 文件操作
  const getFileSystemManager: () => WechatMiniprogram.FileSystemManager;
  
  // 云开发
  const cloud: {
    init: (options?: { env?: string, traceUser?: boolean }) => void;
    uploadFile: (options: WechatMiniprogram.UploadFileOptions) => WechatMiniprogram.UploadTask;
    downloadFile: (options: WechatMiniprogram.DownloadFileOptions) => WechatMiniprogram.DownloadTask;
    deleteFile: (options: { fileList: string[], success?: (res: any) => void, fail?: (err: any) => void }) => void;
    getTempFileURL: (options: { fileList: Array<{ fileID: string, maxAge?: number }>, success?: (res: any) => void, fail?: (err: any) => void }) => void;
    callFunction: (options: { name: string, data?: any, success?: (res: any) => void, fail?: (err: any) => void }) => void;
    database: () => any;
  };
  
  // 媒体操作
  function chooseMedia(options: WechatMiniprogram.ChooseMediaOptions): Promise<WechatMiniprogram.ChooseMediaSuccessCallbackResult>;
  function chooseImage(options: WechatMiniprogram.ChooseImageOptions): Promise<WechatMiniprogram.ChooseImageSuccessCallbackResult>;
  function chooseMessageFile(options: WechatMiniprogram.ChooseMessageFileOptions): Promise<WechatMiniprogram.ChooseMessageFileSuccessCallbackResult>;

  // 上传下载
  function uploadFile(options: WechatMiniprogram.UploadFileOption): WechatMiniprogram.UploadTask;
  function downloadFile(options: WechatMiniprogram.DownloadFileOption): WechatMiniprogram.DownloadTask;
  
  // 请求
  function request(options: WechatMiniprogram.RequestOption): WechatMiniprogram.RequestTask;
  
  // UI交互
  function showToast(options: WechatMiniprogram.ShowToastOption): void;
  function showModal(options: WechatMiniprogram.ShowModalOption): void;
  function showActionSheet(options: WechatMiniprogram.ShowActionSheetOption): void;
  
  // 剪贴板
  function setClipboardData(options: { data: string, success?: () => void, fail?: (err: any) => void }): void;

  // 分享
  function shareToTimelineAppMessage?(options: { title: string, query: string }): void;
  
  // 环境变量
  const env: {
    USER_DATA_PATH: string;
  };
}

// 微信小程序命名空间
declare namespace WechatMiniprogram {
  // 系统信息
  interface SystemInfo {
    brand: string;
    model: string;
    pixelRatio: number;
    screenWidth: number;
    screenHeight: number;
    windowWidth: number;
    windowHeight: number;
    language: string;
    version: string;
    system: string;
    platform: string;
    SDKVersion: string;
    [key: string]: any;
  }
  
  // 文件系统
  interface Stats {
    size: number;
    lastModifiedTime: number;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  
  interface FileSystemManager {
    access(options: { path: string, success?: () => void, fail?: (err: any) => void }): void;
    readFile(options: { filePath: string, encoding?: string, position?: number, length?: number, success?: (res: { data: string | ArrayBuffer }) => void, fail?: (err: any) => void }): void;
    writeFile(options: { filePath: string, data: string | ArrayBuffer, encoding?: string, success?: () => void, fail?: (err: any) => void }): void;
    stat(options: { path: string, success?: (res: { stats: Stats }) => void, fail?: (err: any) => void }): void;
    unlink(options: { filePath: string, success?: () => void, fail?: (err: any) => void }): void;
    readdir(options: { dirPath: string, success?: (res: { files: string[] }) => void, fail?: (err: any) => void }): void;
  }
  
  // 自定义事件
  interface CustomEvent<T = any> {
    detail: T;
    currentTarget: {
      id: string;
      dataset: Record<string, any>;
    };
  }
  
  // 上传任务
  interface UploadTask {
    onProgressUpdate(callback: (res: { progress: number, totalBytesSent: number, totalBytesExpectedToSend: number }) => void): void;
    abort(): void;
  }
  
  // 下载任务
  interface DownloadTask {
    onProgressUpdate(callback: (res: { progress: number, totalBytesWritten: number, totalBytesExpectedToWrite: number }) => void): void;
    abort(): void;
  }
  
  // 请求任务
  interface RequestTask {
    abort(): void;
  }
  
  // 媒体选择选项
  interface ChooseMediaOptions {
    count?: number;
    mediaType?: Array<'image' | 'video'>;
    sourceType?: Array<'album' | 'camera'>;
    maxDuration?: number;
    sizeType?: Array<'original' | 'compressed'>;
    success?: (res: ChooseMediaSuccessCallbackResult) => void;
    fail?: (err: any) => void;
    complete?: () => void;
  }
  
  interface ChooseImageOptions {
    count?: number;
    sizeType?: Array<'original' | 'compressed'>;
    sourceType?: Array<'album' | 'camera'>;
    success?: (res: ChooseImageSuccessCallbackResult) => void;
    fail?: (err: any) => void;
    complete?: () => void;
  }
  
  interface ChooseMessageFileOptions {
    count?: number;
    type?: 'all' | 'video' | 'image' | 'file';
    extension?: string[];
    success?: (res: ChooseMessageFileSuccessCallbackResult) => void;
    fail?: (err: any) => void;
    complete?: () => void;
  }
  
  interface MediaFile {
    tempFilePath: string;
    size: number;
    duration?: number;
    height?: number;
    width?: number;
    thumbTempFilePath?: string;
    fileType?: string;
  }
  
  interface ChooseMediaSuccessCallbackResult {
    tempFiles: MediaFile[];
    type: string;
  }
  
  interface ChooseImageSuccessCallbackResult {
    tempFilePaths: string[];
    tempFiles: Array<{
      path: string;
      size: number;
    }>;
  }
  
  interface ChooseMessageFileSuccessCallbackResult {
    tempFiles: Array<{
      path: string;
      size: number;
      name: string;
      type: string;
    }>;
  }
  
  // 上传下载选项
  interface UploadFileOption {
    url: string;
    filePath: string;
    name: string;
    header?: Record<string, string>;
    formData?: Record<string, any>;
    timeout?: number;
    success?: (res: { data: string, statusCode: number }) => void;
    fail?: (err: any) => void;
    complete?: () => void;
  }
  
  interface DownloadFileOption {
    url: string;
    header?: Record<string, string>;
    timeout?: number;
    filePath?: string;
    success?: (res: { tempFilePath: string, statusCode: number }) => void;
    fail?: (err: any) => void;
    complete?: () => void;
  }
  
  interface UploadFileOptions extends Omit<UploadFileOption, 'success' | 'fail'> {
    cloudPath: string;
    success?: (res: { fileID: string }) => void;
    fail?: (err: any) => void;
  }
  
  interface DownloadFileOptions {
    fileID: string;
    success?: (res: { tempFilePath: string }) => void;
    fail?: (err: any) => void;
  }
  
  // 请求选项
  interface RequestOption {
    url: string;
    data?: string | object | ArrayBuffer;
    header?: Record<string, string>;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'TRACE' | 'CONNECT';
    timeout?: number;
    dataType?: string;
    responseType?: string;
    success?: (res: { data: any, statusCode: number, header: Record<string, string> }) => void;
    fail?: (err: any) => void;
    complete?: () => void;
  }
  
  // UI交互选项
  interface ShowToastOption {
    title: string;
    icon?: 'success' | 'error' | 'loading' | 'none';
    image?: string;
    duration?: number;
    mask?: boolean;
    success?: () => void;
    fail?: (err: any) => void;
    complete?: () => void;
  }
  
  interface ShowModalOption {
    title?: string;
    content?: string;
    showCancel?: boolean;
    cancelText?: string;
    cancelColor?: string;
    confirmText?: string;
    confirmColor?: string;
    editable?: boolean;
    placeholderText?: string;
    success?: (res: { confirm: boolean, cancel: boolean, content?: string }) => void;
    fail?: (err: any) => void;
    complete?: () => void;
  }
  
  interface ShowActionSheetOption {
    itemList: string[];
    itemColor?: string;
    success?: (res: { tapIndex: number }) => void;
    fail?: (err: any) => void;
    complete?: () => void;
  }
}

// 组件声明
declare function Component(options: any): void;
declare function getCurrentPages(): any[]; 