/**
 * FileChunk Pro - 哈希Worker使用示例
 *
 * 本示例演示如何使用哈希计算Worker计算文件的MD5值，
 * 以及如何处理进度回调和错误情况。
 */

import { getWorkerManager, WorkerEventType } from '../src/workers';

/**
 * 示例：计算文件哈希值
 */
async function calculateFileHash(file: File): Promise<string> {
  console.log(`开始计算文件哈希: ${file.name}, 大小: ${formatFileSize(file.size)}`);

  // 获取Worker管理器实例
  const workerManager = getWorkerManager({
    maxConcurrency: 1, // 对于单个文件，1个并发就足够了
    enableWorkerPool: true
  });

  // 检查环境是否支持Worker
  if (!workerManager.isSupported()) {
    throw new Error('当前环境不支持Web Worker');
  }

  // 设置进度监听器
  const progressListener = (event: any) => {
    if (event.fileId === file.name) {
      console.log(`哈希计算进度: ${event.progress}%`);

      // 在真实应用中，这里可以更新UI进度条
      updateProgressUI(event.progress);
    }
  };

  // 注册进度事件
  workerManager.on(WorkerEventType.PROGRESS, progressListener);

  try {
    // 开始计算哈希
    const hash = await workerManager.calculateHash({
      fileId: file.name,
      data: file,
      chunkSize: 2 * 1024 * 1024, // 2MB分块
      onProgress: progress => {
        // 这个回调与事件监听是等效的，选择一种方式使用即可
        console.log(`直接回调进度: ${progress}%`);
      },
      onComplete: hash => {
        console.log(`哈希计算完成: ${hash}`);
      },
      onError: error => {
        console.error(`哈希计算错误: ${error.message}`);
      }
    });

    console.log(`文件 ${file.name} 的MD5哈希值: ${hash}`);
    return hash;
  } catch (error) {
    console.error(`哈希计算失败: ${(error as Error).message}`);
    throw error;
  } finally {
    // 移除事件监听器，避免内存泄漏
    workerManager.off(WorkerEventType.PROGRESS, progressListener);
  }
}

/**
 * 示例：计算多个文件的哈希值
 */
async function calculateMultipleFileHashes(files: File[]): Promise<Map<string, string>> {
  console.log(`开始计算${files.length}个文件的哈希值`);

  // 获取Worker管理器实例，设置并发数
  const workerManager = getWorkerManager({
    maxConcurrency: 3, // 最多同时处理3个文件
    enableWorkerPool: true
  });

  const results = new Map<string, string>();

  // 并行计算所有文件的哈希值
  await Promise.all(
    files.map(async file => {
      try {
        const hash = await workerManager.calculateHash({
          fileId: file.name,
          data: file,
          onProgress: progress => {
            console.log(`文件 ${file.name} 哈希计算进度: ${progress}%`);
          }
        });

        results.set(file.name, hash);
        console.log(`文件 ${file.name} 哈希计算完成: ${hash}`);
      } catch (error) {
        console.error(`文件 ${file.name} 哈希计算失败: ${(error as Error).message}`);
      }
    })
  );

  return results;
}

/**
 * 示例：使用分块数据计算哈希值
 */
export async function calculateChunksHash(chunks: ArrayBuffer[], fileId: string): Promise<string> {
  const workerManager = getWorkerManager();

  // 计算总大小
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);

  console.log(`开始计算分块数据哈希，总大小: ${formatFileSize(totalSize)}`);

  // 使用分块模式计算哈希
  const hash = await workerManager.calculateHash({
    fileId,
    data: chunks,
    totalSize,
    onProgress: progress => {
      console.log(`分块计算进度: ${progress}%`);
    }
  });

  return hash;
}

/**
 * 在浏览器环境中运行示例
 */
function runBrowserExample() {
  // 创建文件选择元素
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.style.margin = '20px';
  document.body.appendChild(fileInput);

  // 创建计算按钮
  const calculateButton = document.createElement('button');
  calculateButton.textContent = '计算哈希';
  calculateButton.style.margin = '20px';
  document.body.appendChild(calculateButton);

  // 创建进度显示区域
  const progressDiv = document.createElement('div');
  progressDiv.id = 'progress';
  progressDiv.style.margin = '20px';
  progressDiv.style.height = '20px';
  progressDiv.style.width = '300px';
  progressDiv.style.border = '1px solid #ccc';
  document.body.appendChild(progressDiv);

  // 创建结果显示区域
  const resultDiv = document.createElement('div');
  resultDiv.id = 'result';
  resultDiv.style.margin = '20px';
  resultDiv.style.whiteSpace = 'pre';
  resultDiv.style.fontFamily = 'monospace';
  document.body.appendChild(resultDiv);

  // 绑定点击事件
  calculateButton.addEventListener('click', async () => {
    const files = fileInput.files;
    if (!files || files.length === 0) {
      alert('请先选择文件');
      return;
    }

    resultDiv.textContent = '计算中...';

    if (files.length === 1) {
      try {
        const hash = await calculateFileHash(files[0]);
        resultDiv.textContent = `文件: ${files[0].name}\nMD5: ${hash}`;
      } catch (error) {
        resultDiv.textContent = `计算失败: ${(error as Error).message}`;
      }
    } else {
      try {
        const results = await calculateMultipleFileHashes(Array.from(files));
        let resultText = '计算结果：\n\n';

        results.forEach((hash, fileName) => {
          resultText += `${fileName}: ${hash}\n`;
        });

        resultDiv.textContent = resultText;
      } catch (error) {
        resultDiv.textContent = `计算失败: ${(error as Error).message}`;
      }
    }
  });
}

/**
 * 格式化文件大小显示
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * 更新进度条UI
 */
function updateProgressUI(progress: number): void {
  const progressDiv = document.getElementById('progress');
  if (!progressDiv) return;

  // 创建或更新进度条
  let progressBar = document.getElementById('progressBar');
  if (!progressBar) {
    progressBar = document.createElement('div');
    progressBar.id = 'progressBar';
    progressBar.style.height = '100%';
    progressBar.style.backgroundColor = '#4CAF50';
    progressBar.style.width = '0%';
    progressBar.style.transition = 'width 0.3s';
    progressDiv.appendChild(progressBar);
  }

  progressBar.style.width = `${progress}%`;
}

// 检测运行环境
if (typeof window !== 'undefined') {
  // 浏览器环境
  document.addEventListener('DOMContentLoaded', runBrowserExample);
} else {
  // Node.js环境 (不支持，仅作为提示)
  console.log('本示例需要在浏览器环境中运行');
}
