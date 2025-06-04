/**
 * 微信小程序最小化类型声明
 * 仅包含FileChunk Pro项目需要的API定义
 */
declare namespace WechatMiniprogram {
  interface Wx {
    uploadFile(options: UploadFileOptions): UploadTask;
    request(options: RequestOptions): RequestTask;
    getFileSystemManager(): FileSystemManager;
    chooseMedia(options: ChooseMediaOptions): void;
    getAccountInfoSync(): AccountInfo;
    env: {
      USER_DATA_PATH: string;
    };
  }

  interface UploadFileOptions {
    url: string;
    filePath: string;
    name: string;
    header?: Record<string, string>;
    formData?: Record<string, any>;
    success?: (res: { data: string; statusCode: number; errMsg: string }) => void;
    fail?: (res: { errMsg: string }) => void;
    complete?: () => void;
  }

  interface UploadTask {
    abort(): void;
    onProgressUpdate(callback: (res: { progress: number }) => void): void;
  }

  interface RequestOptions {
    url: string;
    method: string;
    data?: any;
    header?: Record<string, string>;
    timeout?: number;
    success?: (res: { data: any; statusCode: number; errMsg: string }) => void;
    fail?: (res: { errMsg: string }) => void;
    complete?: () => void;
  }

  interface RequestTask {
    abort(): void;
  }

  interface FileSystemManager {
    readFile(options: {
      filePath: string;
      position?: number;
      length?: number;
      success?: (res: { data: ArrayBuffer }) => void;
      fail?: (res: { errMsg: string }) => void;
    }): void;

    writeFile(options: {
      filePath: string;
      data: ArrayBuffer;
      success?: () => void;
      fail?: (res: { errMsg: string }) => void;
    }): void;

    stat(options: {
      path: string;
      success?: (res: { stats: FileStats } | { stat: FileStats }) => void;
      fail?: (res: { errMsg: string }) => void;
    }): void;
  }

  interface FileStats {
    size: number;
    createTime: number;
    lastAccessedTime?: number;
    lastModifiedTime?: number;
  }

  interface ChooseMediaOptions {
    count: number;
    mediaType: string[];
    success?: (res: { tempFiles: Array<{ tempFilePath: string }> }) => void;
    fail?: (res: { errMsg: string }) => void;
  }

  interface AccountInfo {
    miniProgram: {
      version: string;
    };
  }
}

declare const wx: WechatMiniprogram.Wx;
