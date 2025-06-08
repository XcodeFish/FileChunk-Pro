/**
 * 微信小程序文件上传页面
 * 提供文件选择、上传、进度显示等功能
 */

import { WechatUploader } from '../components/uploader/index';
import WechatPlatform from '../utils/wx-platform';
import FileAdapter from '../utils/file-adapter';
import * as ApiService from '../services/api';

interface PageData {
  files: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    progress: number;
    status: string;
    path: string;
    url?: string;
  }>;
  uploading: boolean;
  showOptions: boolean;
}

// 页面配置
Page<PageData, WechatMiniprogram.Page.CustomOption>({
  /**
   * 页面的初始数据
   */
  data: {
    files: [],
    uploading: false,
    showOptions: false
  },

  /**
   * 上传器实例
   */
  uploader: null as WechatUploader | null,

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    // 初始化上传器
    this.initUploader();
  },

  /**
   * 初始化上传器
   */
  initUploader() {
    // 创建平台适配器
    const platform = new WechatPlatform();

    // 创建文件适配器
    const fileAdapter = new FileAdapter(platform);

    // 创建上传器
    this.uploader = new WechatUploader({
      platform,
      fileAdapter,
      apiService: ApiService,
      uploadURL: 'https://api.example.com/upload',
      chunkSize: 2 * 1024 * 1024, // 2MB分片
      concurrency: 3, // 并发数
      autoUpload: false // 不自动上传
    });

    // 监听上传进度
    this.uploader.on('progress', (fileId, progress) => {
      this.updateFileProgress(fileId, progress);
    });

    // 监听上传完成
    this.uploader.on('success', (fileId, result) => {
      this.updateFileStatus(fileId, 'success', result);
    });

    // 监听上传错误
    this.uploader.on('error', (fileId, error) => {
      this.updateFileStatus(fileId, 'error', error);
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      });
    });
  },

  /**
   * 选择文件
   */
  async chooseFile() {
    if (!this.uploader) {
      wx.showToast({
        title: '上传器未初始化',
        icon: 'none'
      });
      return;
    }

    try {
      // 选择文件
      const files = await this.uploader.selectFiles({
        count: 9,
        mediaType: ['image', 'video', 'file'],
        sourceType: ['album', 'camera'],
        chooseMessageFile: true
      });

      // 如果没有选择文件，直接返回
      if (!files || files.length === 0) return;

      // 添加到文件列表
      for (const file of files) {
        this.data.files.push({
          id: file.id,
          name: file.name,
          size: file.size,
          type: file.type,
          progress: 0,
          status: 'waiting',
          path: (file as any).path || ''
        });
      }

      this.setData({
        files: this.data.files
      });
    } catch (error) {
      console.error('选择文件失败:', error);
      wx.showToast({
        title: '选择文件失败',
        icon: 'none'
      });
    }
  },

  /**
   * 开始上传
   */
  startUpload() {
    if (!this.uploader) return;

    const pendingFiles = this.data.files.filter(
      file => file.status === 'waiting' || file.status === 'error'
    );

    if (pendingFiles.length === 0) {
      wx.showToast({
        title: '没有待上传文件',
        icon: 'none'
      });
      return;
    }

    this.setData({ uploading: true });

    // 开始上传
    this.uploader.startUpload();
  },

  /**
   * 暂停上传
   */
  pauseUpload() {
    if (!this.uploader) return;

    this.uploader.pauseUpload();
    this.setData({ uploading: false });
  },

  /**
   * 取消上传
   */
  cancelUpload() {
    if (!this.uploader) return;

    wx.showModal({
      title: '提示',
      content: '确定取消上传吗？',
      success: res => {
        if (res.confirm) {
          this.uploader!.cancelUpload();

          // 重置文件状态
          const files = this.data.files.map(file => ({
            ...file,
            progress: 0,
            status: 'waiting'
          }));

          this.setData({
            files,
            uploading: false
          });
        }
      }
    });
  },

  /**
   * 删除文件
   */
  deleteFile(e: WechatMiniprogram.CustomEvent) {
    const { fileId } = e.currentTarget.dataset;

    wx.showModal({
      title: '提示',
      content: '确定删除此文件吗？',
      success: res => {
        if (res.confirm && this.uploader) {
          // 从上传器中删除文件
          this.uploader.removeFile(fileId);

          // 从列表中删除文件
          const files = this.data.files.filter(file => file.id !== fileId);
          this.setData({ files });
        }
      }
    });
  },

  /**
   * 更新文件上传进度
   */
  updateFileProgress(fileId: string, progress: number) {
    const fileIndex = this.data.files.findIndex(file => file.id === fileId);

    if (fileIndex === -1) return;

    // 更新进度
    const files = [...this.data.files];
    files[fileIndex].progress = progress;
    files[fileIndex].status = 'uploading';

    this.setData({ files });
  },

  /**
   * 更新文件状态
   */
  updateFileStatus(fileId: string, status: string, result?: any) {
    const fileIndex = this.data.files.findIndex(file => file.id === fileId);

    if (fileIndex === -1) return;

    // 更新状态
    const files = [...this.data.files];
    files[fileIndex].status = status;

    if (status === 'success' && result && result.url) {
      files[fileIndex].url = result.url;
    }

    this.setData({ files });
  },

  /**
   * 切换显示选项
   */
  toggleOptions() {
    this.setData({
      showOptions: !this.data.showOptions
    });
  },

  /**
   * 预览文件
   */
  previewFile(e: WechatMiniprogram.CustomEvent) {
    const { fileId } = e.currentTarget.dataset;
    const file = this.data.files.find(f => f.id === fileId);

    if (!file || !file.url) return;

    if (file.type.startsWith('image/')) {
      // 预览图片
      wx.previewImage({
        urls: [file.url]
      });
    } else if (file.type.startsWith('video/')) {
      // 播放视频
      wx.navigateTo({
        url: `/pages/video-player?url=${encodeURIComponent(file.url)}`
      });
    } else {
      // 下载文件或打开文档
      wx.showLoading({ title: '文件加载中' });
      wx.downloadFile({
        url: file.url,
        success(res) {
          wx.hideLoading();
          wx.openDocument({
            filePath: res.tempFilePath,
            showMenu: true,
            success: () => {},
            fail: () => {
              wx.showToast({
                title: '无法打开此类型文件',
                icon: 'none'
              });
            }
          });
        },
        fail() {
          wx.hideLoading();
          wx.showToast({
            title: '文件下载失败',
            icon: 'none'
          });
        }
      });
    }
  },

  /**
   * 分享文件
   */
  shareFile(e: WechatMiniprogram.CustomEvent) {
    const { fileId } = e.currentTarget.dataset;
    const file = this.data.files.find(f => f.id === fileId);

    if (!file || !file.url) return;

    // 复制链接到剪贴板
    wx.setClipboardData({
      data: file.url,
      success: () => {
        wx.showToast({
          title: '链接已复制',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 清理上传器
    if (this.uploader) {
      this.uploader.destroy();
      this.uploader = null;
    }
  },

  /**
   * 分享页面
   */
  onShareAppMessage() {
    return {
      title: '文件上传工具',
      path: '/pages/file-upload-page'
    };
  }
});
