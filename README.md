# FileChunk Pro - 通用大文件上传工具

FileChunk Pro 是一个功能强大的跨平台大文件上传解决方案，采用微内核架构实现最大的灵活性和可扩展性。支持浏览器、React、Vue、原生JS和各类小程序环境，可处理从几MB到几十GB的大文件上传需求。

## 目录

- [功能特性](#功能特性)
- [安装方式](#安装方式)
- [基础使用](#基础使用)
- [高级配置](#高级配置)
- [断点续传](#断点续传)
- [框架集成](#框架集成)
- [小程序支持](#小程序支持)
- [性能优化](#性能优化)
- [安全增强](#安全增强)
- [API文档](#api文档)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

## 功能特性

- ✅ **智能分片上传** - 动态调整分片大小，适应不同网络环境
- ✅ **高性能计算** - Web Worker哈希计算，不阻塞UI线程
- ✅ **多平台支持** - 浏览器、React、Vue、小程序全覆盖
- ✅ **断点续传** - 支持页面刷新和网络中断后续传
- ✅ **低内存优化** - 处理10GB+大文件时内存占用<50MB
- ✅ **秒传功能** - 基于文件指纹快速判断是否已上传
- ✅ **智能并发控制** - 动态调整并发数量，优化上传速度
- ✅ **安全增强** - 内置加密传输和文件完整性校验
- ✅ **可扩展插件系统** - 轻松集成自定义功能

## 安装方式

### NPM / Yarn

```bash
# 使用npm安装
npm install filechunk-pro --save

# 使用yarn安装
yarn add filechunk-pro
```

### CDN引入

```html
<!-- 开发环境 -->
<script src="https://unpkg.com/filechunk-pro/dist/filechunk-pro.js"></script>

<!-- 生产环境 -->
<script src="https://unpkg.com/filechunk-pro/dist/filechunk-pro.min.js"></script>
```

## 基础使用

### 简单上传示例

```typescript
import { FileChunkPro } from 'filechunk-pro';

// 创建上传实例
const uploader = new FileChunkPro({
  target: '/api/upload', // 上传接口地址
  chunkSize: 5 * 1024 * 1024, // 分片大小，默认5MB
  concurrency: 3, // 并发数，默认3
  autoRetry: true, // 自动重试，默认true
  maxRetries: 3 // 最大重试次数，默认3
});

// 注册事件监听
uploader.on('progress', (percentage: number) => {
  console.log(`上传进度: ${percentage}%`);
  // 更新进度条
  document.querySelector('.progress-bar').style.width = `${percentage}%`;
});

uploader.on('success', (fileUrl: string) => {
  console.log('上传成功，文件地址:', fileUrl);
  // 显示上传成功消息
  showMessage('上传成功!');
});

uploader.on('error', (error: Error) => {
  console.error('上传失败:', error);
  // 显示错误消息
  showError(error.message);
});

// HTML文件输入元素
const fileInput = document.getElementById('fileInput') as HTMLInputElement;

// 监听文件选择
fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) {
    // 开始上传选中的文件
    uploader.upload(fileInput.files[0]);
  }
});

// 暂停按钮
document.getElementById('pauseBtn').addEventListener('click', () => {
  uploader.pause();
});

// 恢复按钮
document.getElementById('resumeBtn').addEventListener('click', () => {
  uploader.resume();
});

// 取消按钮
document.getElementById('cancelBtn').addEventListener('click', () => {
  uploader.cancel();
});
```

### 微内核架构高级使用

```typescript
import {
  FileChunkKernel,
  HttpTransport,
  BrowserAdapter,
  IndexedDBStorage
} from 'filechunk-pro/core';

// 创建微内核实例
const uploader = new FileChunkKernel()
  // 注册传输模块
  .registerModule('transport', new HttpTransport({
    target: '/api/upload',
    chunkSize: 5 * 1024 * 1024
  }))
  // 注册平台适配器
  .registerModule('platform', new BrowserAdapter())
  // 注册存储模块
  .registerModule('storage', new IndexedDBStorage())
  // 注册安全模块
  .registerModule('security', new SecurityManager({
    tokenProvider: () => localStorage.getItem('token'),
    encryptionEnabled: true
  }));

// 监听事件
uploader.on('stateChange', (state) => {
  console.log('状态变化:', state);
});

// 添加自定义钩子
uploader.on('beforeUpload', async (file) => {
  // 自定义文件验证
  if (file.size > 50 * 1024 * 1024 * 1024) {
    throw new Error('文件不能超过50GB');
  }

  // 可以在这里进行其他预处理
  await processFile(file);
});

// 触发上传
document.getElementById('uploadBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;
  if (fileInput.files && fileInput.files[0]) {
    try {
      const fileUrl = await uploader.upload(fileInput.files[0]);
      console.log('上传成功，文件地址:', fileUrl);
    } catch (error) {
      console.error('上传失败:', error);
    }
  }
});
```

## 高级配置

### 完整配置选项

```typescript
interface FileChunkProConfig {
  // 基础配置
  target: string;                // 上传目标URL
  chunkSize?: number;            // 分片大小(字节)，默认5MB
  concurrency?: number;          // 并发数量，默认3
  autoRetry?: boolean;           // 自动重试，默认true
  maxRetries?: number;           // 最大重试次数，默认3
  retryDelay?: number;           // 重试延迟(毫秒)，默认1000
  headers?: Record<string, string>; // 自定义请求头
  withCredentials?: boolean;     // 是否携带凭证，默认false
  timeout?: number;              // 请求超时时间(毫秒)，默认30000

  // 高级选项
  autoStart?: boolean;           // 自动开始上传，默认false
  multiple?: boolean;            // 支持多文件，默认false
  acceptTypes?: string[];        // 允许的文件类型
  maxFileSize?: number;          // 最大文件大小(字节)
  hashEnabled?: boolean;         // 启用文件哈希计算，默认true
  hashAlgorithm?: 'md5' | 'sha1' | 'sha256'; // 哈希算法，默认md5
  storageKey?: string;           // 存储键前缀

  // 钩子函数
  onBeforeUpload?: (file: File) => boolean | Promise<boolean>;
  onProgress?: (percentage: number, file: File) => void;
  onChunkProgress?: (chunkIndex: number, percentage: number) => void;
  onSuccess?: (fileUrl: string, file: File) => void;
  onError?: (error: Error, file: File) => void;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;

  // 安全选项
  token?: string | (() => string | Promise<string>);
  encryptionEnabled?: boolean;   // 启用传输加密，默认false
  signatureEnabled?: boolean;    // 启用请求签名，默认false
  encryptionKey?: string;        // 加密密钥
  signatureKey?: string;         // 签名密钥

  // 调试选项
  debug?: boolean;               // 启用调试日志，默认false
  logger?: (level: string, message: string, data?: any) => void;
}
```

### 自定义参数

FileChunk Pro支持自定义上传参数，您可以添加需要传递给服务器的额外数据：

```typescript
// 初始化时配置
const uploader = new FileChunkPro({
  target: '/api/upload',
  // 自定义参数
  params: {
    userId: '123456',
    projectId: 'project-001',
    category: 'documents'
  }
});

// 或者动态设置
uploader.setParams({
  userId: getUserId(),
  timestamp: Date.now()
});
```

### 自定义请求头

您可以添加自定义HTTP请求头，用于认证或其他目的：

```typescript
const uploader = new FileChunkPro({
  target: '/api/upload',
  // 自定义请求头
  headers: {
    'Authorization': 'Bearer your-token-here',
    'X-Custom-Header': 'CustomValue'
  }
});

// 动态更新请求头
uploader.setHeaders({
  'Authorization': `Bearer ${getLatestToken()}`
});
```

## 断点续传

FileChunk Pro 内置了完善的断点续传功能，无需额外配置即可使用。当上传过程中断（网络问题或页面刷新）后，再次上传同一文件时会自动从断点处继续：

```typescript
// 正常使用上传功能，断点续传会自动启用
const uploader = new FileChunkPro({
  target: '/api/upload',
  // 持久化选项，默认启用
  persistenceEnabled: true,
  // 持久化存储键前缀，默认为'filechunk-pro:'
  storageKeyPrefix: 'my-app-uploads:'
});

// 上传文件
uploader.upload(file);

// 手动暂停
document.getElementById('pauseBtn').addEventListener('click', () => {
  uploader.pause();
  // 此时上传状态会被自动保存
});

// 即使页面刷新后，再次上传相同文件时也会从断点继续
// 如果需要强制重新上传，可以使用:
uploader.upload(file, { forceRestart: true });

// 检查是否有未完成的上传任务
uploader.getIncompleteUploads().then(uploads => {
  if (uploads.length > 0) {
    // 显示恢复上传选项
    showResumeOptions(uploads);
  }
});

// 恢复特定上传任务
uploader.resumeUpload(uploadId);
```

### 服务端要求

要支持断点续传，服务端API需要：

1. 提供检查已上传分片的接口 (`/api/upload/check`)
2. 接收分片上传请求，并维护上传状态 (`/api/upload`)
3. 提供合并分片的接口 (`/api/upload/merge`)

FileChunk Pro会自动处理与这些接口的交互。

## 框架集成

### React 集成

```tsx
// 使用React Hooks
import { useFileUpload } from 'filechunk-pro/react';

function FileUploader() {
  const {
    upload, pause, resume, cancel, state, progress, uploadedFiles
  } = useFileUpload({
    target: '/api/upload',
    chunkSize: 5 * 1024 * 1024
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      upload(e.target.files[0]);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      <div className="progress-bar" style={{ width: `${progress}%` }} />
      <div className="status">{state}</div>

      <button onClick={pause} disabled={state !== 'uploading'}>暂停</button>
      <button onClick={resume} disabled={state !== 'paused'}>继续</button>
      <button onClick={cancel} disabled={state === 'idle'}>取消</button>

      {uploadedFiles.map(file => (
        <div key={file.id}>
          {file.name} - <a href={file.url}>下载</a>
        </div>
      ))}
    </div>
  );
}
```

### Vue 集成

```vue
<template>
  <div>
    <input type="file" @change="handleFileChange" />
    <div class="progress-bar" :style="{ width: `${progress}%` }"></div>
    <div class="status">{{ state }}</div>

    <button @click="pause" :disabled="state !== 'uploading'">暂停</button>
    <button @click="resume" :disabled="state !== 'paused'">继续</button>
    <button @click="cancel" :disabled="state === 'idle'">取消</button>

    <div v-for="file in uploadedFiles" :key="file.id">
      {{ file.name }} - <a :href="file.url">下载</a>
    </div>
  </div>
</template>

<script>
import { useFileUpload } from 'filechunk-pro/vue';

export default {
  setup() {
    const {
      upload, pause, resume, cancel, state, progress, uploadedFiles
    } = useFileUpload({
      target: '/api/upload',
      chunkSize: 5 * 1024 * 1024
    });

    const handleFileChange = (e) => {
      if (e.target.files && e.target.files[0]) {
        upload(e.target.files[0]);
      }
    };

    return {
      upload, pause, resume, cancel,
      state, progress, uploadedFiles, handleFileChange
    };
  }
}
</script>
```

## 小程序支持

### 微信小程序

```javascript
import { FileChunkPro } from 'filechunk-pro/miniapp';

// 微信小程序上传示例
Page({
  data: {
    progress: 0,
    status: '等待上传'
  },

  onLoad() {
    this.uploader = new FileChunkPro({
      target: 'https://your-api.com/upload',
      platform: 'wechat', // 指定平台
      onProgress: (percentage) => {
        this.setData({ progress: percentage });
      },
      onSuccess: (fileUrl) => {
        this.setData({ status: '上传成功' });
        wx.showToast({ title: '上传成功' });
      },
      onError: (error) => {
        this.setData({ status: '上传失败' });
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
    });
  },

  chooseAndUploadFile() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image', 'video'],
      success: (res) => {
        const tempFile = res.tempFiles[0];
        this.setData({ status: '上传中...' });

        // 开始上传
        this.uploader.upload({
          path: tempFile.tempFilePath,
          size: tempFile.size,
          name: tempFile.originalFileObj?.name || 'file'
        });
      }
    });
  },

  pauseUpload() {
    this.uploader.pause();
    this.setData({ status: '已暂停' });
  },

  resumeUpload() {
    this.uploader.resume();
    this.setData({ status: '上传中...' });
  }
});
```

### Taro 跨端框架

```jsx
import React, { useState, useEffect } from 'react';
import { View, Button, Progress } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { FileChunkPro } from 'filechunk-pro/taro';

function FileUploader() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('等待上传');
  const [uploader, setUploader] = useState(null);

  useEffect(() => {
    const uploaderInstance = new FileChunkPro({
      target: 'https://your-api.com/upload',
      onProgress: (percentage) => {
        setProgress(percentage);
      },
      onSuccess: (fileUrl) => {
        setStatus('上传成功');
        Taro.showToast({ title: '上传成功' });
      },
      onError: (error) => {
        setStatus('上传失败');
        Taro.showToast({ title: '上传失败', icon: 'none' });
      }
    });

    setUploader(uploaderInstance);
  }, []);

  const handleChooseFile = () => {
    Taro.chooseImage({
      count: 1,
      success: (res) => {
        setStatus('上传中...');

        const tempFile = res.tempFiles[0];
        uploader.upload({
          path: tempFile.path,
          size: tempFile.size,
          name: 'image.jpg' // 临时文件名
        });
      }
    });
  };

  return (
    <View>
      <Button onClick={handleChooseFile}>选择文件</Button>
      <Progress percent={progress} />
      <View>{status}</View>

      <Button onClick={() => uploader.pause()}>暂停</Button>
      <Button onClick={() => uploader.resume()}>继续</Button>
    </View>
  );
}

export default FileUploader;
```

## 性能优化

FileChunk Pro 内置了多种性能优化策略，可以根据实际需求进行配置：

### 动态分片大小

```typescript
const uploader = new FileChunkPro({
  target: '/api/upload',
  // 启用动态分片调整
  adaptiveChunkSize: true,
  // 初始分片大小
  chunkSize: 5 * 1024 * 1024,
  // 最小分片大小
  minChunkSize: 1 * 1024 * 1024,
  // 最大分片大小
  maxChunkSize: 10 * 1024 * 1024,
  // 目标分片上传时间(秒)
  targetChunkTime: 3
});
```

### 内存优化

对于超大文件，可以启用流式处理模式，显著降低内存占用：

```typescript
const uploader = new FileChunkPro({
  target: '/api/upload',
  // 启用流式处理
  streamMode: true,
  // 读取缓冲区大小
  readBufferSize: 10 * 1024 * 1024
});
```

### 网络优化

```typescript
const uploader = new FileChunkPro({
  target: '/api/upload',
  // 动态并发控制
  adaptiveConcurrency: true,
  // 初始并发数
  concurrency: 3,
  // 最小并发数
  minConcurrency: 1,
  // 最大并发数
  maxConcurrency: 6,
  // 网络状态检测间隔(毫秒)
  networkCheckInterval: 5000,
  // 优先使用较新的Fetch API
  preferFetch: true
});
```

## 安全增强

FileChunk Pro 提供了多种安全功能，保障文件上传过程的安全性：

### 传输加密

```typescript
const uploader = new FileChunkPro({
  target: '/api/upload',
  // 启用传输加密
  encryptionEnabled: true,
  // 加密密钥（建议通过安全渠道获取）
  encryptionKey: await getEncryptionKey(),
  // 加密算法
  encryptionAlgorithm: 'AES-GCM'
});
```

### 请求签名

```typescript
const uploader = new FileChunkPro({
  target: '/api/upload',
  // 启用请求签名
  signatureEnabled: true,
  // 签名密钥
  signatureKey: 'your-signature-key',
  // 签名算法
  signatureAlgorithm: 'HMAC-SHA256',
  // 签名有效期(秒)
  signatureExpiration: 300
});
```

### 文件校验

```typescript
const uploader = new FileChunkPro({
  target: '/api/upload',
  // 文件完整性校验
  fileIntegrityCheck: true,
  // 文件哈希算法
  hashAlgorithm: 'SHA-256',
  // 上传前检查文件类型
  validateMimeType: true,
  // 允许的文件类型
  allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf']
});
```

## API文档

### 核心方法

```typescript
// 创建实例
const uploader = new FileChunkPro(config);

// 上传文件
uploader.upload(file, options?): Promise<string>;

// 暂停上传
uploader.pause(): void;

// 恢复上传
uploader.resume(): void;

// 取消上传
uploader.cancel(): void;

// 添加事件监听
uploader.on(event, handler): void;

// 移除事件监听
uploader.off(event, handler): void;

// 设置参数
uploader.setParams(params): void;

// 设置请求头
uploader.setHeaders(headers): void;

// 获取当前状态
uploader.getState(): UploadState;

// 获取未完成的上传
uploader.getIncompleteUploads(): Promise<IncompleteUpload[]>;

// 恢复特定上传
uploader.resumeUpload(uploadId): Promise<void>;

// 清除所有上传记录
uploader.clearUploads(): Promise<void>;
```

### 事件类型

```typescript
// 可用的事件
type FileChunkEvent =
  | 'beforeUpload'     // 上传前触发
  | 'progress'         // 上传进度更新时触发
  | 'chunkProgress'    // 单个分片进度更新时触发
  | 'success'          // 上传成功时触发
  | 'error'            // 上传失败时触发
  | 'pause'            // 上传暂停时触发
  | 'resume'           // 上传恢复时触发
  | 'cancel'           // 上传取消时触发
  | 'stateChange'      // 状态变化时触发
  | 'hashProgress'     // 哈希计算进度更新时触发
  | 'chunkSuccess'     // 单个分片上传成功时触发
  | 'chunkError';      // 单个分片上传失败时触发
```

## 贡献指南

我们欢迎社区贡献，无论是提交bug、提出功能建议还是直接提交代码。请参阅项目仓库中的`CONTRIBUTING.md`文件获取详细指南。

## 许可证

FileChunk Pro 遵循 MIT 许可证发布，详情请参阅项目中的`LICENSE`文件。
