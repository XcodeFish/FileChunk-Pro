/**
 * FileChunk Pro - 微信小程序专用包
 * 提供微信小程序环境下的文件分片上传功能
 */

import { WechatUploader } from './components/uploader/index';
import { FileList } from './components/file-list/index';
import { WechatPlatform } from './utils/wx-platform';
import { FileAdapter } from './utils/file-adapter';
import * as ApiService from './services/api';
import CloudService from './services/cloud-service';
import * as ShareService from './services/share';

/**
 * 创建微信小程序上传器实例
 * @param {Object} options 配置选项
 * @returns {WechatUploader} 上传器实例
 */
function createUploader(options: Record<string, any> = {}): WechatUploader {
  const platform = new WechatPlatform();
  return new WechatUploader({
    platform,
    ...options
  });
}

export {
  WechatUploader,
  FileList,
  WechatPlatform,
  FileAdapter,
  ApiService,
  CloudService,
  ShareService,
  createUploader
};

export default {
  createUploader,
  WechatUploader,
  FileList,
  WechatPlatform,
  FileAdapter,
  ApiService,
  CloudService,
  ShareService
};
