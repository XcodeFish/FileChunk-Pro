/**
 * 使用指南生成器
 *
 * 生成项目使用指南文档
 */
import * as fs from 'fs';
import * as path from 'path';
import { DocsGenerateOptions } from '../interfaces';
import { GeneratorResult } from './api-docs-generator';

/**
 * 指南部分结构
 */
interface GuideSection {
  title: string;
  fileName: string;
  content: string;
}

/**
 * 使用指南生成器类
 */
export class GuideGenerator {
  /**
   * 生成使用指南
   *
   * @param options 生成选项
   * @returns 生成结果
   */
  async generate(options: DocsGenerateOptions): Promise<GeneratorResult> {
    try {
      const outputDir = options.outputDir || 'docs/guide';

      // 确保输出目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 准备指南部分
      const sections = this.prepareGuideSections();

      // 生成所有部分文件
      const files: string[] = [];
      for (const section of sections) {
        const filePath = path.join(outputDir, section.fileName);
        fs.writeFileSync(filePath, section.content, 'utf8');
        files.push(filePath);
      }

      // 生成索引文件
      const indexPath = path.join(outputDir, 'index.html');
      fs.writeFileSync(indexPath, this.generateIndexPage(sections), 'utf8');
      files.push(indexPath);

      // 生成导航文件
      const navPath = path.join(outputDir, 'nav.json');
      fs.writeFileSync(navPath, JSON.stringify(this.generateNavData(sections), null, 2), 'utf8');
      files.push(navPath);

      // 复制样式文件
      const stylesPath = path.join(outputDir, 'styles.css');
      fs.writeFileSync(stylesPath, this.getStyles(), 'utf8');
      files.push(stylesPath);

      return {
        success: true,
        files
      };
    } catch (error) {
      return {
        success: false,
        files: [],
        error: (error as Error).message
      };
    }
  }

  /**
   * 准备指南部分
   */
  private prepareGuideSections(): GuideSection[] {
    return [
      {
        title: '快速开始',
        fileName: 'getting-started.html',
        content: this.getFormattedContent(
          '快速开始',
          `
          <h1>FileChunk Pro 快速开始</h1>
          
          <p>本指南将帮助你在几分钟内开始使用 FileChunk Pro 进行文件上传。</p>
          
          <h2>安装</h2>
          
          <p>使用你喜欢的包管理器安装 FileChunk Pro:</p>
          
          <pre><code>npm install filechunk-pro</code></pre>
          <pre><code>yarn add filechunk-pro</code></pre>
          <pre><code>pnpm add filechunk-pro</code></pre>
          
          <h2>基本用法</h2>
          
          <p>以下是一个简单的示例，展示如何使用 FileChunk Pro 上传文件:</p>
          
          <pre><code>import { FileChunkPro } from 'filechunk-pro';

// 创建实例
const uploader = new FileChunkPro({
  endpoint: 'https://your-api.com/upload',
  chunkSize: 2 * 1024 * 1024, // 2MB 分片大小
  concurrency: 3 // 同时上传3个分片
});

// 监听事件
uploader.on('progress', (progress) => {
  console.log(\`上传进度: \${progress.percent}%\`);
});

uploader.on('success', (result) => {
  console.log('上传成功!', result);
});

uploader.on('error', (error) => {
  console.error('上传失败:', error);
});

// 开始上传
const file = document.getElementById('fileInput').files[0];
uploader.upload(file);</code></pre>
          
          <h2>下一步</h2>
          
          <p>恭喜！你已经完成了基础配置。接下来你可以：</p>
          
          <ul>
            <li>查看<a href="advanced-options.html">高级选项</a>以了解更多配置</li>
            <li>学习如何处理<a href="error-handling.html">错误处理和重试</a></li>
            <li>了解<a href="events.html">事件系统</a>以监控上传状态</li>
          </ul>
          `
        )
      },
      {
        title: '高级选项',
        fileName: 'advanced-options.html',
        content: this.getFormattedContent(
          '高级选项',
          `
          <h1>FileChunk Pro 高级选项</h1>
          
          <p>FileChunk Pro 提供了丰富的配置选项，可以满足各种复杂场景的需求。</p>
          
          <h2>完整配置选项</h2>
          
          <pre><code>const uploader = new FileChunkPro({
  // 基本设置
  endpoint: 'https://your-api.com/upload',
  method: 'POST', // 默认为 POST
  headers: {
    'Authorization': 'Bearer your-token'
  },
  
  // 分片策略
  chunkSize: 2 * 1024 * 1024, // 2MB
  concurrency: 3,
  autoAdjustConcurrency: true, // 根据网络情况自动调整并发数
  
  // 超时与重试
  timeout: 30000, // 单位毫秒
  retries: 3,
  retryDelay: 1000, // 重试间隔（毫秒）
  useExponentialBackoff: true, // 使用指数退避算法
  
  // 安全与验证
  withCredentials: false, // 是否发送凭证
  validateFile: (file) => {
    // 自定义验证逻辑
    if (file.size > 1024 * 1024 * 100) { // 100MB
      return {
        valid: false,
        error: '文件不能超过100MB'
      };
    }
    return { valid: true };
  },
  
  // 存储相关
  persistStateKey: 'filechunk-uploads', // 持久化存储的键名
  useLocalStorage: true, // 使用 localStorage 存储上传状态
  
  // 高级功能
  hashAlgorithm: 'md5', // 文件哈希算法
  preComputeHash: true, // 预先计算文件哈希
  useWorker: true, // 使用 Web Worker 计算哈希
  preprocessors: [/* 自定义预处理器 */],
  
  // 自定义请求数据
  params: {
    // 合并请求的额外参数
    merge: {
      uploadId: 'unique-id'
    },
    // 分片请求的额外参数
    chunk: (chunkIndex, totalChunks) => {
      return {
        chunkIndex,
        totalChunks
      };
    }
  },
  
  // 调试
  debug: false // 调试模式
});</code></pre>

          <h2>平台适配配置</h2>
          
          <p>在不同平台上使用时的特殊配置：</p>
          
          <h3>小程序环境</h3>
          
          <pre><code>const uploader = new FileChunkPro({
  // 小程序配置
  platform: 'miniapp',
  adapter: 'wechat', // 或 'alipay', 'taro', 'uniapp'
  miniappOptions: {
    uploadFile: wx.uploadFile,
    getFileSystemManager: wx.getFileSystemManager,
    // 其他小程序特定选项
  }
});</code></pre>

          <h3>React 集成</h3>
          
          <pre><code>import { useFileUpload } from 'filechunk-pro/react';

function MyComponent() {
  const { 
    upload, 
    progress, 
    isUploading, 
    error, 
    pause, 
    resume 
  } = useFileUpload({
    endpoint: 'https://your-api.com/upload',
    // 其他配置选项
  });
  
  // 组件实现
}</code></pre>
          
          <h3>Vue 集成</h3>
          
          <pre><code>import { useUploader } from 'filechunk-pro/vue';

export default {
  setup() {
    const { 
      upload, 
      progress, 
      isUploading, 
      error, 
      pause, 
      resume 
    } = useUploader({
      endpoint: 'https://your-api.com/upload',
      // 其他配置选项
    });
    
    // 组件逻辑
    
    return {
      upload,
      progress,
      isUploading,
      error,
      pause,
      resume
    };
  }
}</code></pre>
          `
        )
      },
      {
        title: '错误处理和重试',
        fileName: 'error-handling.html',
        content: this.getFormattedContent(
          '错误处理和重试',
          `
          <h1>错误处理和重试</h1>
          
          <p>FileChunk Pro 提供了强大的错误处理和重试机制，使你的上传更加可靠。</p>
          
          <h2>错误类型</h2>
          
          <p>FileChunk Pro 定义了多种错误类型以便于精确处理不同的错误情况：</p>
          
          <pre><code>import { ErrorType } from 'filechunk-pro';

uploader.on('error', (error) => {
  switch(error.type) {
    case ErrorType.NETWORK:
      console.error('网络错误:', error.message);
      break;
    case ErrorType.TIMEOUT:
      console.error('请求超时:', error.message);
      break;
    case ErrorType.SERVER:
      console.error('服务器错误:', error.message, error.statusCode);
      break;
    case ErrorType.FILE:
      console.error('文件错误:', error.message);
      break;
    case ErrorType.VALIDATION:
      console.error('验证错误:', error.message);
      break;
    default:
      console.error('未知错误:', error.message);
  }
});</code></pre>
          
          <h2>重试策略配置</h2>
          
          <p>可以配置重试的次数和间隔时间：</p>
          
          <pre><code>const uploader = new FileChunkPro({
  // 基本配置
  endpoint: 'https://your-api.com/upload',
  
  // 重试配置
  retries: 3, // 最大重试次数
  retryDelay: 1000, // 初始重试延迟（毫秒）
  maxRetryDelay: 30000, // 最大重试延迟（毫秒）
  useExponentialBackoff: true, // 使用指数退避算法
  jitterFactor: 0.2, // 抖动因子，增加随机性
  
  // 自定义重试条件
  shouldRetry: (error, retryCount) => {
    // 根据错误类型和已重试次数决定是否继续重试
    if (error.statusCode === 429) {
      // 对于频率限制，等待更长时间后重试
      return true;
    }
    
    if (error.type === ErrorType.NETWORK && retryCount < 5) {
      // 网络错误多重试几次
      return true;
    }
    
    if (error.type === ErrorType.SERVER && error.statusCode >= 500) {
      // 服务器错误也重试
      return true;
    }
    
    // 其他情况不重试
    return false;
  }
});</code></pre>
          
          <h2>手动重试</h2>
          
          <p>除了自动重试外，你还可以在需要时手动重试失败的上传：</p>
          
          <pre><code>let upload;

// 开始上传
function startUpload(file) {
  upload = uploader.upload(file);
}

// 手动重试整个上传
function retryEntireUpload() {
  if (upload && upload.status === 'error') {
    upload.retry();
  }
}

// 仅重试失败的分片
function retryFailedChunks() {
  if (upload && upload.status === 'error') {
    upload.retryFailedChunks();
  }
}</code></pre>
          
          <h2>全局错误处理器</h2>
          
          <p>你可以设置一个全局错误处理器来处理所有上传错误：</p>
          
          <pre><code>import { setGlobalErrorHandler } from 'filechunk-pro';

setGlobalErrorHandler((error) => {
  // 记录错误
  logErrorToService(error);
  
  // 对特定错误进行处理
  if (error.type === ErrorType.SERVER && error.statusCode === 401) {
    // 凭证过期，重新获取凭证
    refreshAuthToken().then((token) => {
      // 更新上传器配置
      uploader.updateConfig({
        headers: {
          'Authorization': \`Bearer \${token}\`
        }
      });
    });
  }
});</code></pre>
          `
        )
      },
      {
        title: '事件系统',
        fileName: 'events.html',
        content: this.getFormattedContent(
          '事件系统',
          `
          <h1>FileChunk Pro 事件系统</h1>
          
          <p>FileChunk Pro 提供了完善的事件系统，让你可以监听和响应上传过程中的各种状态变化。</p>
          
          <h2>基本事件</h2>
          
          <pre><code>const uploader = new FileChunkPro({
  endpoint: 'https://your-api.com/upload'
});

// 开始上传
uploader.on('start', (fileInfo) => {
  console.log('开始上传文件:', fileInfo.name, '大小:', fileInfo.size);
});

// 上传进度
uploader.on('progress', (progress) => {
  console.log(
    '上传进度:', 
    progress.percent, '%', 
    '已上传:', 
    progress.loaded, 
    '总大小:', 
    progress.total
  );
  
  // 更新进度条
  updateProgressBar(progress.percent);
});

// 上传成功
uploader.on('success', (result) => {
  console.log('上传成功!', result);
});

// 上传失败
uploader.on('error', (error) => {
  console.error('上传失败:', error.message);
});

// 上传暂停
uploader.on('pause', () => {
  console.log('上传已暂停');
});

// 上传恢复
uploader.on('resume', () => {
  console.log('上传已恢复');
});

// 上传取消
uploader.on('cancel', () => {
  console.log('上传已取消');
});

// 上传完成（无论成功或失败）
uploader.on('complete', (status) => {
  console.log('上传完成，状态:', status);
});</code></pre>
          
          <h2>高级事件</h2>
          
          <p>除了基本事件外，FileChunk Pro 还提供了更细粒度的事件以满足高级需求：</p>
          
          <pre><code>// 分片开始上传
uploader.on('chunk:start', (chunkInfo) => {
  console.log(
    '分片开始上传:', 
    chunkInfo.index, 
    '/', 
    chunkInfo.total
  );
});

// 分片上传进度
uploader.on('chunk:progress', (chunkInfo) => {
  console.log(
    '分片上传进度:', 
    chunkInfo.index, 
    '进度:', 
    chunkInfo.percent, '%'
  );
});

// 分片上传成功
uploader.on('chunk:success', (chunkInfo) => {
  console.log('分片上传成功:', chunkInfo.index);
});

// 分片上传失败
uploader.on('chunk:error', (chunkInfo, error) => {
  console.error(
    '分片上传失败:', 
    chunkInfo.index, 
    '错误:', 
    error.message
  );
});

// 哈希计算开始
uploader.on('hash:start', () => {
  console.log('开始计算文件哈希');
});

// 哈希计算进度
uploader.on('hash:progress', (progress) => {
  console.log('哈希计算进度:', progress.percent, '%');
});

// 哈希计算完成
uploader.on('hash:complete', (hash) => {
  console.log('文件哈希:', hash);
});

// 合并请求开始
uploader.on('merge:start', () => {
  console.log('开始发送合并请求');
});

// 合并请求成功
uploader.on('merge:success', (response) => {
  console.log('合并成功，服务器响应:', response);
});

// 合并请求失败
uploader.on('merge:error', (error) => {
  console.error('合并失败:', error.message);
});</code></pre>
          
          <h2>一次性事件监听</h2>
          
          <p>使用 <code>once</code> 方法仅监听事件一次：</p>
          
          <pre><code>// 仅监听一次上传成功事件
uploader.once('success', (result) => {
  console.log('上传成功并且此监听器不会再次触发', result);
});</code></pre>
          
          <h2>移除事件监听器</h2>
          
          <pre><code>// 保存监听器引用以便稍后移除
const progressHandler = (progress) => {
  console.log('上传进度:', progress.percent, '%');
};

// 添加监听器
uploader.on('progress', progressHandler);

// 移除特定监听器
uploader.off('progress', progressHandler);

// 移除特定事件的所有监听器
uploader.off('progress');

// 移除所有事件的所有监听器
uploader.off();</code></pre>
          
          <h2>事件过滤</h2>
          
          <p>针对特定条件过滤事件：</p>
          
          <pre><code>// 仅当进度超过10%的变化时才触发
let lastReportedProgress = 0;
uploader.on('progress', (progress) => {
  if (progress.percent - lastReportedProgress >= 10) {
    console.log('进度更新:', progress.percent, '%');
    lastReportedProgress = progress.percent;
  }
});</code></pre>
          `
        )
      },
      {
        title: '队列管理',
        fileName: 'queue-management.html',
        content: this.getFormattedContent(
          '队列管理',
          `
          <h1>FileChunk Pro 队列管理</h1>
          
          <p>FileChunk Pro 提供了强大的队列管理功能，允许你同时管理多个文件的上传。</p>
          
          <h2>创建上传队列</h2>
          
          <pre><code>import { UploadQueue } from 'filechunk-pro';

// 创建队列管理器
const queue = new UploadQueue({
  // 队列配置
  maxConcurrentUploads: 2, // 最多同时上传2个文件
  autoStart: true, // 添加到队列后自动开始上传
  retryFailedUploads: true, // 自动重试失败的上传
  
  // 上传选项 (传递给FileChunkPro实例)
  uploadOptions: {
    endpoint: 'https://your-api.com/upload',
    chunkSize: 2 * 1024 * 1024,
    concurrency: 3
  }
});</code></pre>
          
          <h2>添加文件到队列</h2>
          
          <pre><code>// 添加单个文件
const file = document.getElementById('fileInput').files[0];
const uploadId1 = queue.add(file);

// 添加带自定义选项的文件
const anotherFile = document.getElementById('anotherFileInput').files[0];
const uploadId2 = queue.add(anotherFile, {
  // 此文件的自定义选项
  params: { category: 'images' },
  endpoint: 'https://your-api.com/upload-image' // 覆盖默认端点
});

// 一次添加多个文件
const fileList = document.getElementById('multipleFiles').files;
const uploadIds = queue.addAll(fileList);</code></pre>
          
          <h2>队列控制</h2>
          
          <pre><code>// 暂停整个队列
queue.pauseAll();

// 恢复整个队列
queue.resumeAll();

// 取消整个队列
queue.cancelAll();

// 清空队列
queue.clear();

// 控制单个上传
queue.pause(uploadId1);
queue.resume(uploadId1);
queue.cancel(uploadId1);
queue.retry(uploadId1);

// 添加后手动开始队列处理
const queue = new UploadQueue({
  autoStart: false,
  // ...其他选项
});

// 添加文件后
queue.addAll(files);

// 需要时手动启动队列处理
queue.start();</code></pre>
          
          <h2>队列事件</h2>
          
          <pre><code>// 队列事件
queue.on('queue:add', (file, uploadId) => {
  console.log('文件添加到队列:', file.name, 'ID:', uploadId);
});

queue.on('queue:start', () => {
  console.log('队列开始处理');
});

queue.on('queue:progress', (overallProgress) => {
  // 整体进度，包含所有文件
  console.log('队列总体进度:', overallProgress.percent, '%');
});

queue.on('queue:complete', (results) => {
  console.log('队列处理完成', results);
});

// 单个上传事件
queue.on('upload:start', (uploadId, fileInfo) => {
  console.log('开始上传:', fileInfo.name, 'ID:', uploadId);
});

queue.on('upload:progress', (uploadId, progress) => {
  console.log('上传进度:', uploadId, progress.percent, '%');
});

queue.on('upload:success', (uploadId, result) => {
  console.log('上传成功:', uploadId, result);
});

queue.on('upload:error', (uploadId, error) => {
  console.error('上传失败:', uploadId, error.message);
});</code></pre>
          
          <h2>队列状态和信息</h2>
          
          <pre><code>// 获取队列状态
const status = queue.getStatus();
console.log('队列状态:', status);
// 输出: { active: 2, waiting: 3, completed: 5, failed: 1, total: 11 }

// 获取特定上传的状态
const uploadStatus = queue.getUploadStatus(uploadId);
console.log('上传状态:', uploadStatus);
// 输出: { status: 'uploading', progress: 45, file: {...} }

// 获取所有上传
const allUploads = queue.getUploads();

// 获取正在活跃的上传
const activeUploads = queue.getActiveUploads();

// 获取等待中的上传
const waitingUploads = queue.getWaitingUploads();

// 获取已完成的上传
const completedUploads = queue.getCompletedUploads();

// 获取失败的上传
const failedUploads = queue.getFailedUploads();</code></pre>
          
          <h2>队列持久化</h2>
          
          <pre><code>// 创建带持久化的队列
const persistentQueue = new UploadQueue({
  // 基本选项
  maxConcurrentUploads: 2,
  
  // 持久化选项
  persistState: true,
  persistKey: 'my-upload-queue',
  autoResumeUploads: true, // 页面刷新后自动恢复未完成的上传
  
  // 上传选项
  uploadOptions: {
    endpoint: 'https://your-api.com/upload'
  }
});

// 手动保存队列状态
persistentQueue.saveState();

// 手动恢复队列状态
persistentQueue.restoreState();</code></pre>
          `
        )
      }
    ];
  }

  /**
   * 生成导航数据
   */
  private generateNavData(sections: GuideSection[]): any {
    return {
      sections: sections.map(section => ({
        title: section.title,
        path: section.fileName
      }))
    };
  }

  /**
   * 生成索引页
   */
  private generateIndexPage(sections: GuideSection[]): string {
    const sectionLinks = sections
      .map(section => `<li><a href="${section.fileName}">${section.title}</a></li>`)
      .join('\n');

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FileChunk Pro 使用指南</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>FileChunk Pro</h2>
        <p>使用指南</p>
      </div>
      <nav>
        <ul>
          ${sectionLinks}
        </ul>
      </nav>
    </div>
    <div class="content">
      <h1>FileChunk Pro 使用指南</h1>
      
      <p>欢迎使用 FileChunk Pro 使用指南！本指南将帮助你了解如何充分利用 FileChunk Pro 的所有功能。</p>
      
      <h2>指南内容</h2>
      
      <ul class="guide-list">
        ${sectionLinks}
      </ul>
      
      <h2>其他资源</h2>
      
      <ul>
        <li><a href="../api/index.html">API 参考文档</a></li>
        <li><a href="../examples/index.html">代码示例</a></li>
        <li><a href="../architecture/index.html">架构文档</a></li>
        <li><a href="../plugin/index.html">插件开发指南</a></li>
      </ul>
    </div>
  </div>
  
  <script>
    // 简单导航脚本
    document.addEventListener('DOMContentLoaded', () => {
      const links = document.querySelectorAll('nav a');
      const url = window.location.href.split('/').pop();
      
      links.forEach(link => {
        if (link.getAttribute('href') === url) {
          link.classList.add('active');
        }
      });
    });
  </script>
</body>
</html>
    `.trim();
  }

  /**
   * 获取格式化的内容
   */
  private getFormattedContent(title: string, content: string): string {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - FileChunk Pro 使用指南</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>FileChunk Pro</h2>
        <p>使用指南</p>
      </div>
      <nav>
        <ul>
          <li><a href="getting-started.html">快速开始</a></li>
          <li><a href="advanced-options.html">高级选项</a></li>
          <li><a href="error-handling.html">错误处理和重试</a></li>
          <li><a href="events.html">事件系统</a></li>
          <li><a href="queue-management.html">队列管理</a></li>
        </ul>
      </nav>
    </div>
    <div class="content">
      ${content}
    </div>
  </div>
  
  <script>
    // 简单导航脚本
    document.addEventListener('DOMContentLoaded', () => {
      const links = document.querySelectorAll('nav a');
      const url = window.location.href.split('/').pop();
      
      links.forEach(link => {
        if (link.getAttribute('href') === url) {
          link.classList.add('active');
        }
      });
    });
  </script>
</body>
</html>
    `.trim();
  }

  /**
   * 获取样式表
   */
  private getStyles(): string {
    return `
/* FileChunk Pro 使用指南样式 */
:root {
  --primary-color: #3a86ff;
  --secondary-color: #4361ee;
  --accent-color: #4cc9f0;
  --background-color: #ffffff;
  --text-color: #333333;
  --sidebar-color: #f7f7f7;
  --heading-color: #213547;
  --border-color: #e2e8f0;
  --code-background: #f1f5f9;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-color);
  background-color: var(--background-color);
}

.container {
  display: flex;
  max-width: 1200px;
  margin: 0 auto;
  min-height: 100vh;
}

.sidebar {
  width: 260px;
  padding: 20px;
  background-color: var(--sidebar-color);
  border-right: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.sidebar-header {
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-header h2 {
  color: var(--primary-color);
  margin-bottom: 5px;
}

.sidebar nav ul {
  list-style: none;
}

.sidebar nav ul li {
  margin-bottom: 10px;
}

.sidebar nav ul li a {
  color: var(--text-color);
  text-decoration: none;
  display: block;
  padding: 8px 10px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.sidebar nav ul li a:hover,
.sidebar nav ul li a.active {
  color: var(--primary-color);
  background-color: rgba(58, 134, 255, 0.1);
}

.content {
  flex: 1;
  padding: 30px;
}

h1 {
  font-size: 2rem;
  margin-bottom: 20px;
  color: var(--heading-color);
}

h2 {
  font-size: 1.5rem;
  margin: 30px 0 15px;
  color: var(--heading-color);
}

h3 {
  font-size: 1.2rem;
  margin: 20px 0 10px;
  color: var(--heading-color);
}

p {
  margin-bottom: 15px;
}

pre {
  background-color: var(--code-background);
  border-radius: 6px;
  padding: 15px;
  overflow-x: auto;
  margin-bottom: 20px;
}

code {
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.9em;
}

ul, ol {
  margin-bottom: 15px;
  padding-left: 25px;
}

a {
  color: var(--primary-color);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.guide-list {
  list-style: none;
  padding: 0;
}

.guide-list li {
  margin-bottom: 10px;
  padding: 10px;
  background-color: var(--sidebar-color);
  border-radius: 4px;
  transition: all 0.2s ease;
}

.guide-list li:hover {
  background-color: rgba(58, 134, 255, 0.1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background-color: #121212;
    --text-color: #e1e1e1;
    --sidebar-color: #1a1a1a;
    --heading-color: #f0f0f0;
    --border-color: #333;
    --code-background: #2a2a2a;
  }
}

@media (max-width: 768px) {
  .container {
    flex-direction: column;
  }
  
  .sidebar {
    width: 100%;
    height: auto;
    position: static;
  }
}
    `.trim();
  }
}
