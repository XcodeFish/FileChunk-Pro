/**
 * FileChunk Pro 测试环境工具
 *
 * 用于设置和清理测试环境的工具函数
 */

// 定义简单的MockFileReader类型
interface MockFileReader {
  onload: ((this: any, ev: any) => any) | null;
  onerror: ((this: any, ev: any) => any) | null;
  result: string | ArrayBuffer | null;
  readAsArrayBuffer(blob: Blob): void;
  readAsText(blob: Blob): void;
  readAsDataURL(blob: Blob): void;
  abort(): void;
}

/**
 * 设置测试环境
 * 初始化测试所需的全局对象和模拟数据
 */
export async function setupEnvironment(): Promise<void> {
  // 确保全局对象存在
  if (typeof global.window === 'undefined') {
    global.window = {} as any;
  }

  if (typeof global.document === 'undefined') {
    global.document = {
      createElement: jest.fn().mockImplementation(tagName => {
        if (tagName === 'input') {
          return {
            click: jest.fn(),
            setAttribute: jest.fn(),
            style: {}
          };
        }
        return {};
      })
    } as any;
  }

  // 模拟IndexedDB (如果尚未模拟)
  if (!window.indexedDB) {
    const mockIDBRequest = {
      result: {
        createObjectStore: jest.fn(),
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            put: jest.fn(),
            get: jest.fn(),
            delete: jest.fn(),
            getAllKeys: jest.fn().mockResolvedValue([]),
            getAll: jest.fn().mockResolvedValue([])
          }),
          commit: jest.fn()
        })
      },
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null
    };

    window.indexedDB = {
      open: jest.fn().mockReturnValue(mockIDBRequest)
    } as any;
  }

  // 模拟FileReader
  if (!window.FileReader) {
    const MockFileReaderClass = class implements MockFileReader {
      onload: ((this: any, ev: any) => any) | null = null;
      onerror: ((this: any, ev: any) => any) | null = null;
      result: string | ArrayBuffer | null = null;

      readAsArrayBuffer(blob: Blob): void {
        setTimeout(() => {
          this.result = new ArrayBuffer(blob.size);
          if (this.onload) {
            this.onload({ target: this } as any);
          }
        }, 50);
      }

      readAsText(_blob: Blob): void {
        setTimeout(() => {
          this.result = 'mock text content';
          if (this.onload) {
            this.onload({ target: this } as any);
          }
        }, 50);
      }

      readAsDataURL(blob: Blob): void {
        setTimeout(() => {
          this.result = `data:${blob.type || 'application/octet-stream'};base64,mockbase64data`;
          if (this.onload) {
            this.onload({ target: this } as any);
          }
        }, 50);
      }

      abort(): void {
        this.result = null;
      }
    };

    window.FileReader = MockFileReaderClass as any;
  }

  // 确保Web Worker模拟存在
  if (!window.Worker) {
    const mockWorker = {
      postMessage: jest.fn(),
      terminate: jest.fn(),
      onmessage: null,
      onerror: null
    };

    window.Worker = jest.fn().mockImplementation(() => mockWorker) as any;
  }

  console.log('测试环境设置完成');
}

/**
 * 清理测试环境
 * 重置模拟对象并清理测试数据
 */
export async function teardownEnvironment(): Promise<void> {
  // 清除本地存储和IndexedDB (如果需要)
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // localStorage或sessionStorage可能不存在
  }

  // 重置所有模拟
  jest.restoreAllMocks();

  console.log('测试环境清理完成');
}
