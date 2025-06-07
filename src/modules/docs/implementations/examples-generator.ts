/**
 * 示例代码生成器
 *
 * 为文档生成可运行的示例代码
 */
import * as fs from 'fs';
import * as path from 'path';
import { DocsGenerateOptions } from '../interfaces';
import { GeneratorResult } from './api-docs-generator';

/**
 * 示例信息
 */
interface ExampleInfo {
  title: string;
  fileName: string;
  description: string;
  category: string;
  framework?: string;
  code: {
    html?: string;
    js?: string;
    css?: string;
    ts?: string;
    vue?: string;
    jsx?: string;
    tsx?: string;
  };
}

/**
 * 示例代码生成器类
 */
export class ExamplesGenerator {
  /**
   * 生成示例代码
   *
   * @param options 生成选项
   * @returns 生成结果
   */
  async generate(options: DocsGenerateOptions): Promise<GeneratorResult> {
    try {
      const outputDir = options.outputDir || 'docs/examples';

      // 确保输出目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 准备示例
      const examples = this.prepareExamples();

      // 创建目录结构
      this.createDirectoryStructure(outputDir, examples);

      // 生成示例文件
      const files = this.generateExampleFiles(outputDir, examples);

      // 生成索引页
      const indexPath = path.join(outputDir, 'index.html');
      fs.writeFileSync(indexPath, this.generateIndexPage(examples), 'utf8');
      files.push(indexPath);

      // 生成样式文件
      const cssPath = path.join(outputDir, 'styles.css');
      fs.writeFileSync(cssPath, this.getStyles(), 'utf8');
      files.push(cssPath);

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
   * 创建目录结构
   */
  private createDirectoryStructure(outputDir: string, examples: ExampleInfo[]): void {
    // 按框架分类创建目录
    const frameworks = [...new Set(examples.map(e => e.framework || 'vanilla'))];

    for (const framework of frameworks) {
      const frameworkDir = path.join(outputDir, framework);
      if (!fs.existsSync(frameworkDir)) {
        fs.mkdirSync(frameworkDir, { recursive: true });
      }
    }

    // 每个示例创建一个目录
    for (const example of examples) {
      const framework = example.framework || 'vanilla';
      const exampleDir = path.join(outputDir, framework, this.slugify(example.title));

      if (!fs.existsSync(exampleDir)) {
        fs.mkdirSync(exampleDir, { recursive: true });
      }
    }
  }

  /**
   * 生成示例文件
   */
  private generateExampleFiles(outputDir: string, examples: ExampleInfo[]): string[] {
    const files: string[] = [];

    for (const example of examples) {
      const framework = example.framework || 'vanilla';
      const exampleDir = path.join(outputDir, framework, this.slugify(example.title));

      // 创建HTML文件
      if (example.code.html) {
        const htmlPath = path.join(exampleDir, 'index.html');
        fs.writeFileSync(htmlPath, example.code.html, 'utf8');
        files.push(htmlPath);
      }

      // 创建JS文件
      if (example.code.js) {
        const jsPath = path.join(exampleDir, 'script.js');
        fs.writeFileSync(jsPath, example.code.js, 'utf8');
        files.push(jsPath);
      }

      // 创建TS文件
      if (example.code.ts) {
        const tsPath = path.join(exampleDir, 'script.ts');
        fs.writeFileSync(tsPath, example.code.ts, 'utf8');
        files.push(tsPath);
      }

      // 创建CSS文件
      if (example.code.css) {
        const cssPath = path.join(exampleDir, 'styles.css');
        fs.writeFileSync(cssPath, example.code.css, 'utf8');
        files.push(cssPath);
      }

      // 创建Vue文件
      if (example.code.vue) {
        const vuePath = path.join(exampleDir, 'App.vue');
        fs.writeFileSync(vuePath, example.code.vue, 'utf8');
        files.push(vuePath);
      }

      // 创建JSX文件
      if (example.code.jsx) {
        const jsxPath = path.join(exampleDir, 'App.jsx');
        fs.writeFileSync(jsxPath, example.code.jsx, 'utf8');
        files.push(jsxPath);
      }

      // 创建TSX文件
      if (example.code.tsx) {
        const tsxPath = path.join(exampleDir, 'App.tsx');
        fs.writeFileSync(tsxPath, example.code.tsx, 'utf8');
        files.push(tsxPath);
      }

      // 创建示例页面
      const examplePage = path.join(exampleDir, 'index.html');
      if (!fs.existsSync(examplePage)) {
        fs.writeFileSync(examplePage, this.generateExamplePage(example), 'utf8');
        files.push(examplePage);
      }
    }

    return files;
  }

  /**
   * 准备示例代码
   */
  private prepareExamples(): ExampleInfo[] {
    return [
      // 浏览器原生示例
      {
        title: '基本上传示例',
        fileName: 'basic-upload',
        description: '最简单的文件上传示例，展示如何使用FileChunk Pro上传文件并显示进度。',
        category: 'basic',
        code: {
          html: `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FileChunk Pro - 基本上传示例</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <h1>FileChunk Pro - 基本上传示例</h1>
    
    <div class="upload-container">
      <input type="file" id="fileInput" />
      <button id="uploadBtn">上传文件</button>
      
      <div class="progress-container">
        <div id="progressBar" class="progress-bar">
          <div id="progressFill" class="progress-fill"></div>
        </div>
        <div id="progressText" class="progress-text">0%</div>
      </div>
      
      <div id="status" class="status"></div>
    </div>
  </div>
  
  <script src="https://cdn.jsdelivr.net/npm/filechunk-pro/dist/filechunk-pro.min.js"></script>
  <script src="script.js"></script>
</body>
</html>
          `,
          js: `
// 初始化上传器
const uploader = new FileChunkPro.FileChunkPro({
  endpoint: 'https://your-api.com/upload',
  chunkSize: 2 * 1024 * 1024, // 2MB 分片
  concurrency: 3,
  retries: 3
});

// DOM元素
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const statusElement = document.getElementById('status');

// 事件监听
uploadBtn.addEventListener('click', () => {
  const file = fileInput.files[0];
  if (!file) {
    statusElement.textContent = '请先选择文件';
    statusElement.className = 'status error';
    return;
  }
  
  // 开始上传
  statusElement.textContent = '准备上传...';
  statusElement.className = 'status info';
  
  uploader.upload(file);
});

// 上传事件监听
uploader.on('start', (fileInfo) => {
  statusElement.textContent = \`开始上传: \${fileInfo.name}\`;
  statusElement.className = 'status info';
});

uploader.on('progress', (progress) => {
  const percent = Math.round(progress.percent);
  progressFill.style.width = \`\${percent}%\`;
  progressText.textContent = \`\${percent}%\`;
});

uploader.on('success', (result) => {
  statusElement.textContent = '上传成功!';
  statusElement.className = 'status success';
  console.log('上传结果:', result);
});

uploader.on('error', (error) => {
  statusElement.textContent = \`上传失败: \${error.message}\`;
  statusElement.className = 'status error';
  console.error('上传错误:', error);
});
          `,
          css: `
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  line-height: 1.6;
  color: #333;
  background-color: #f5f7fa;
  margin: 0;
  padding: 0;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

h1 {
  margin-bottom: 20px;
  color: #2c3e50;
}

.upload-container {
  background-color: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

#fileInput {
  margin-bottom: 15px;
  width: 100%;
}

button {
  background-color: #3a86ff;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  margin-bottom: 20px;
}

button:hover {
  background-color: #2667ff;
}

.progress-container {
  margin-bottom: 15px;
}

.progress-bar {
  background-color: #e2e8f0;
  border-radius: 4px;
  height: 20px;
  overflow: hidden;
  position: relative;
  margin-bottom: 5px;
}

.progress-fill {
  background-color: #3a86ff;
  height: 100%;
  width: 0;
  transition: width 0.3s ease;
}

.progress-text {
  text-align: center;
  font-size: 14px;
}

.status {
  padding: 10px;
  border-radius: 4px;
  font-weight: 500;
}

.status.info {
  background-color: #e3f2fd;
  color: #0d47a1;
}

.status.success {
  background-color: #e8f5e9;
  color: #1b5e20;
}

.status.error {
  background-color: #ffebee;
  color: #b71c1c;
}
          `
        }
      },

      // React 示例
      {
        title: 'React文件上传组件',
        fileName: 'react-file-upload',
        description: '一个React组件，使用FileChunk Pro Hooks实现文件上传功能。',
        category: 'frontend-framework',
        framework: 'react',
        code: {
          tsx: `
import React, { useState, useRef } from 'react';
import { useFileUpload } from 'filechunk-pro/react';
import './styles.css';

const FileUploader: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const { 
    upload, 
    progress, 
    status, 
    error, 
    pause, 
    resume,
    cancel
  } = useFileUpload({
    endpoint: 'https://your-api.com/upload',
    chunkSize: 2 * 1024 * 1024, // 2MB
    concurrency: 3,
    retries: 3
  });
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  };
  
  const handleUpload = () => {
    if (selectedFile) {
      upload(selectedFile);
    }
  };
  
  return (
    <div className="uploader-container">
      <h2>React文件上传组件</h2>
      
      <div className="file-selection">
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange} 
          className="file-input"
        />
        <div className="file-info">
          {selectedFile ? (
            <span>{selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)</span>
          ) : (
            <span>未选择文件</span>
          )}
        </div>
      </div>
      
      <div className="controls">
        <button 
          onClick={handleUpload} 
          disabled={!selectedFile || status === 'uploading'}
          className="upload-button"
        >
          上传文件
        </button>
        
        {status === 'uploading' && (
          <>
            <button onClick={pause} className="control-button">暂停</button>
            <button onClick={cancel} className="control-button danger">取消</button>
          </>
        )}
        
        {status === 'paused' && (
          <>
            <button onClick={resume} className="control-button">继续</button>
            <button onClick={cancel} className="control-button danger">取消</button>
          </>
        )}
      </div>
      
      {status !== 'idle' && (
        <div className="progress-section">
          <div className="progress-container">
            <div 
              className="progress-bar" 
              style={{ width: \`\${Math.round(progress.percent)}%\` }}
            />
          </div>
          <div className="progress-text">
            {Math.round(progress.percent)}% - {status}
          </div>
        </div>
      )}
      
      {error && (
        <div className="error-message">
          上传错误: {error.message}
        </div>
      )}
      
      {status === 'success' && (
        <div className="success-message">
          文件上传成功!
        </div>
      )}
    </div>
  );
};

export default FileUploader;
          `,
          css: `
.uploader-container {
  background-color: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  max-width: 500px;
  margin: 0 auto;
}

h2 {
  margin-top: 0;
  color: #333;
  margin-bottom: 20px;
}

.file-selection {
  margin-bottom: 20px;
}

.file-input {
  margin-bottom: 10px;
  width: 100%;
}

.file-info {
  font-size: 14px;
  color: #666;
}

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.upload-button {
  background-color: #3a86ff;
  color: white;
}

.upload-button:hover:not(:disabled) {
  background-color: #2667ff;
}

.control-button {
  background-color: #f0f0f0;
  color: #333;
}

.control-button:hover {
  background-color: #e0e0e0;
}

.control-button.danger {
  background-color: #ff4d4f;
  color: white;
}

.control-button.danger:hover {
  background-color: #ff7875;
}

.progress-section {
  margin-bottom: 15px;
}

.progress-container {
  height: 10px;
  background-color: #f0f0f0;
  border-radius: 5px;
  overflow: hidden;
  margin-bottom: 5px;
}

.progress-bar {
  height: 100%;
  background-color: #3a86ff;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 14px;
  color: #666;
}

.error-message {
  background-color: #ffebee;
  border-left: 4px solid #f44336;
  padding: 10px;
  color: #b71c1c;
  margin-top: 15px;
}

.success-message {
  background-color: #e8f5e9;
  border-left: 4px solid #4caf50;
  padding: 10px;
  color: #1b5e20;
  margin-top: 15px;
}
          `
        }
      },

      // Vue 示例
      {
        title: 'Vue文件上传组件',
        fileName: 'vue-file-upload',
        description: '一个基于Vue 3的文件上传组件，展示如何集成FileChunk Pro。',
        category: 'frontend-framework',
        framework: 'vue',
        code: {
          vue: `
<template>
  <div class="uploader-container">
    <h2>Vue文件上传组件</h2>
    
    <div class="file-selection">
      <input type="file" @change="handleFileChange" class="file-input" />
      <div class="file-info">
        <span v-if="selectedFile">
          {{ selectedFile.name }} ({{ Math.round(selectedFile.size / 1024) }} KB)
        </span>
        <span v-else>未选择文件</span>
      </div>
    </div>
    
    <div class="controls">
      <button 
        @click="handleUpload" 
        :disabled="!selectedFile || status === 'uploading'"
        class="upload-button"
      >
        上传文件
      </button>
      
      <template v-if="status === 'uploading'">
        <button @click="pause" class="control-button">暂停</button>
        <button @click="cancel" class="control-button danger">取消</button>
      </template>
      
      <template v-if="status === 'paused'">
        <button @click="resume" class="control-button">继续</button>
        <button @click="cancel" class="control-button danger">取消</button>
      </template>
    </div>
    
    <div v-if="status !== 'idle'" class="progress-section">
      <div class="progress-container">
        <div 
          class="progress-bar" 
          :style="{ width: \`\${Math.round(progress.percent)}%\` }"
        ></div>
      </div>
      <div class="progress-text">
        {{ Math.round(progress.percent) }}% - {{ status }}
      </div>
    </div>
    
    <div v-if="uploadError" class="error-message">
      上传错误: {{ uploadError.message }}
    </div>
    
    <div v-if="status === 'success'" class="success-message">
      文件上传成功!
    </div>
  </div>
</template>

<script>
import { ref } from 'vue';
import { useUploader } from 'filechunk-pro/vue';

export default {
  name: 'FileUploader',
  setup() {
    const selectedFile = ref(null);
    
    const { 
      upload, 
      progress, 
      status, 
      error: uploadError, 
      pause, 
      resume,
      cancel
    } = useUploader({
      endpoint: 'https://your-api.com/upload',
      chunkSize: 2 * 1024 * 1024, // 2MB
      concurrency: 3,
      retries: 3
    });
    
    const handleFileChange = (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        selectedFile.value = files[0];
      }
    };
    
    const handleUpload = () => {
      if (selectedFile.value) {
        upload(selectedFile.value);
      }
    };
    
    return {
      selectedFile,
      progress,
      status,
      uploadError,
      handleFileChange,
      handleUpload,
      pause,
      resume,
      cancel
    };
  }
}
</script>

<style>
.uploader-container {
  background-color: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  max-width: 500px;
  margin: 0 auto;
}

h2 {
  margin-top: 0;
  color: #333;
  margin-bottom: 20px;
}

.file-selection {
  margin-bottom: 20px;
}

.file-input {
  margin-bottom: 10px;
  width: 100%;
}

.file-info {
  font-size: 14px;
  color: #666;
}

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.upload-button {
  background-color: #3a86ff;
  color: white;
}

.upload-button:hover:not(:disabled) {
  background-color: #2667ff;
}

.control-button {
  background-color: #f0f0f0;
  color: #333;
}

.control-button:hover {
  background-color: #e0e0e0;
}

.control-button.danger {
  background-color: #ff4d4f;
  color: white;
}

.control-button.danger:hover {
  background-color: #ff7875;
}

.progress-section {
  margin-bottom: 15px;
}

.progress-container {
  height: 10px;
  background-color: #f0f0f0;
  border-radius: 5px;
  overflow: hidden;
  margin-bottom: 5px;
}

.progress-bar {
  height: 100%;
  background-color: #3a86ff;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 14px;
  color: #666;
}

.error-message {
  background-color: #ffebee;
  border-left: 4px solid #f44336;
  padding: 10px;
  color: #b71c1c;
  margin-top: 15px;
}

.success-message {
  background-color: #e8f5e9;
  border-left: 4px solid #4caf50;
  padding: 10px;
  color: #1b5e20;
  margin-top: 15px;
}
</style>
          `
        }
      }
    ];
  }

  /**
   * 生成索引页面
   */
  private generateIndexPage(examples: ExampleInfo[]): string {
    // 按框架分组
    const examplesByFramework: Record<string, ExampleInfo[]> = {};

    for (const example of examples) {
      const framework = example.framework || 'vanilla';
      if (!examplesByFramework[framework]) {
        examplesByFramework[framework] = [];
      }
      examplesByFramework[framework].push(example);
    }

    // 生成框架标签
    const frameworkTabs = Object.keys(examplesByFramework)
      .map(framework => {
        const displayName =
          framework === 'vanilla'
            ? '原生JS'
            : framework.charAt(0).toUpperCase() + framework.slice(1);
        return `<button class="tab-button" data-framework="${framework}">${displayName}</button>`;
      })
      .join('');

    // 生成示例卡片
    const exampleCards = Object.entries(examplesByFramework)
      .map(([framework, frameworkExamples]) => {
        const cards = frameworkExamples
          .map(
            example => `
        <div class="example-card">
          <h3>${example.title}</h3>
          <p>${example.description}</p>
          <div class="example-links">
            <a href="./${framework}/${this.slugify(example.title)}/index.html" class="example-link">查看示例</a>
            <a href="https://github.com/XcodeFish/FileChunk-Pro/tree/main/examples/${framework}/${this.slugify(example.title)}" class="example-link">查看源码</a>
          </div>
        </div>
      `
          )
          .join('');

        return `<div class="examples-grid" data-framework="${framework}">${cards}</div>`;
      })
      .join('');

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FileChunk Pro - 示例代码</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>FileChunk Pro 示例代码</h1>
      <p>浏览各种使用场景下的FileChunk Pro示例代码，帮助你快速上手。</p>
    </header>
    
    <div class="tabs">
      ${frameworkTabs}
    </div>
    
    <div class="examples-container">
      ${exampleCards}
    </div>
  </div>
  
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const tabButtons = document.querySelectorAll('.tab-button');
      const examplesGrids = document.querySelectorAll('.examples-grid');
      
      // 默认显示第一个框架的示例
      if (tabButtons.length > 0) {
        const defaultFramework = tabButtons[0].dataset.framework;
        tabButtons[0].classList.add('active');
        
        examplesGrids.forEach(grid => {
          if (grid.dataset.framework === defaultFramework) {
            grid.style.display = 'grid';
          } else {
            grid.style.display = 'none';
          }
        });
      }
      
      // 标签点击处理
      tabButtons.forEach(button => {
        button.addEventListener('click', function() {
          const framework = this.dataset.framework;
          
          // 激活当前标签
          tabButtons.forEach(btn => btn.classList.remove('active'));
          this.classList.add('active');
          
          // 显示对应的示例网格
          examplesGrids.forEach(grid => {
            if (grid.dataset.framework === framework) {
              grid.style.display = 'grid';
            } else {
              grid.style.display = 'none';
            }
          });
        });
      });
    });
  </script>
</body>
</html>
    `.trim();
  }

  /**
   * 生成示例页面
   */
  private generateExamplePage(example: ExampleInfo): string {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${example.title} - FileChunk Pro 示例</title>
  <link rel="stylesheet" href="${example.code.css ? 'styles.css' : '../../../styles.css'}">
  <style>
    .example-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .demo-area {
      margin-bottom: 30px;
    }
    
    .code-tabs {
      display: flex;
      border-bottom: 1px solid #ddd;
      margin-bottom: 15px;
    }
    
    .code-tab {
      padding: 8px 15px;
      cursor: pointer;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      font-size: 14px;
    }
    
    .code-tab.active {
      border-bottom-color: #3a86ff;
      color: #3a86ff;
    }
    
    .code-panels > div {
      display: none;
      background-color: #f8f9fa;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
    }
    
    .code-panels > div.active {
      display: block;
    }
    
    pre {
      margin: 0;
      white-space: pre-wrap;
    }
    
    .back-link {
      display: inline-block;
      margin-bottom: 20px;
      color: #3a86ff;
      text-decoration: none;
    }
    
    .back-link:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="example-container">
    <a href="../../index.html" class="back-link">← 返回示例列表</a>
    
    <h1>${example.title}</h1>
    <p class="example-description">${example.description}</p>
    
    <div class="demo-area">
      ${example.code.html ? '' : '<div id="app"></div>'}
    </div>
    
    <h2>源代码</h2>
    
    <div class="code-tabs">
      ${example.code.html ? '<button class="code-tab active" data-target="html">HTML</button>' : ''}
      ${example.code.js ? '<button class="code-tab' + (!example.code.html ? ' active' : '') + '" data-target="js">JavaScript</button>' : ''}
      ${example.code.ts ? '<button class="code-tab" data-target="ts">TypeScript</button>' : ''}
      ${example.code.css ? '<button class="code-tab" data-target="css">CSS</button>' : ''}
      ${example.code.vue ? '<button class="code-tab' + (!example.code.html && !example.code.js ? ' active' : '') + '" data-target="vue">Vue</button>' : ''}
      ${example.code.jsx ? '<button class="code-tab" data-target="jsx">JSX</button>' : ''}
      ${example.code.tsx ? '<button class="code-tab" data-target="tsx">TSX</button>' : ''}
    </div>
    
    <div class="code-panels">
      ${example.code.html ? '<div class="active" data-panel="html"><pre><code>' + this.escapeHtml(example.code.html) + '</code></pre></div>' : ''}
      ${example.code.js ? '<div' + (!example.code.html ? ' class="active"' : '') + ' data-panel="js"><pre><code>' + this.escapeHtml(example.code.js) + '</code></pre></div>' : ''}
      ${example.code.ts ? '<div data-panel="ts"><pre><code>' + this.escapeHtml(example.code.ts) + '</code></pre></div>' : ''}
      ${example.code.css ? '<div data-panel="css"><pre><code>' + this.escapeHtml(example.code.css) + '</code></pre></div>' : ''}
      ${example.code.vue ? '<div' + (!example.code.html && !example.code.js ? ' class="active"' : '') + ' data-panel="vue"><pre><code>' + this.escapeHtml(example.code.vue) + '</code></pre></div>' : ''}
      ${example.code.jsx ? '<div data-panel="jsx"><pre><code>' + this.escapeHtml(example.code.jsx) + '</code></pre></div>' : ''}
      ${example.code.tsx ? '<div data-panel="tsx"><pre><code>' + this.escapeHtml(example.code.tsx) + '</code></pre></div>' : ''}
    </div>
  </div>
  
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const codeTabs = document.querySelectorAll('.code-tab');
      const codePanels = document.querySelectorAll('.code-panels > div');
      
      codeTabs.forEach(tab => {
        tab.addEventListener('click', function() {
          const target = this.dataset.target;
          
          // 激活当前标签
          codeTabs.forEach(t => t.classList.remove('active'));
          this.classList.add('active');
          
          // 显示对应的代码面板
          codePanels.forEach(panel => {
            if (panel.dataset.panel === target) {
              panel.classList.add('active');
            } else {
              panel.classList.remove('active');
            }
          });
        });
      });
    });
  </script>
</body>
</html>
    `.trim();
  }

  /**
   * 获取样式
   */
  private getStyles(): string {
    return `
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  line-height: 1.6;
  color: #333;
  background-color: #f5f7fa;
  margin: 0;
  padding: 0;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

header {
  margin-bottom: 30px;
  text-align: center;
}

header h1 {
  margin-bottom: 10px;
  color: #2c3e50;
}

header p {
  color: #6c757d;
  font-size: 18px;
  max-width: 700px;
  margin: 0 auto;
}

.tabs {
  display: flex;
  justify-content: center;
  margin-bottom: 30px;
}

.tab-button {
  background-color: transparent;
  border: none;
  padding: 10px 20px;
  margin: 0 5px;
  cursor: pointer;
  font-size: 16px;
  border-bottom: 2px solid transparent;
  transition: all 0.3s ease;
}

.tab-button:hover {
  color: #3a86ff;
}

.tab-button.active {
  color: #3a86ff;
  border-bottom-color: #3a86ff;
}

.examples-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.example-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.example-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
}

.example-card h3 {
  margin-top: 0;
  margin-bottom: 10px;
  color: #2c3e50;
}

.example-card p {
  color: #6c757d;
  margin-bottom: 15px;
  font-size: 14px;
}

.example-links {
  display: flex;
  gap: 10px;
}

.example-link {
  display: inline-block;
  padding: 8px 15px;
  background-color: #f0f0f0;
  color: #333;
  text-decoration: none;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s ease;
}

.example-link:hover {
  background-color: #3a86ff;
  color: #fff;
}

@media (max-width: 768px) {
  .examples-grid {
    grid-template-columns: 1fr;
  }
  
  .tabs {
    flex-wrap: wrap;
  }
  
  .tab-button {
    margin-bottom: 10px;
  }
}
`.trim();
  }

  /**
   * 转换为URL友好的字符串
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * HTML转义
   */
  private escapeHtml(html: string): string {
    return html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
