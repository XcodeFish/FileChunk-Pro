/**
 * Jest测试全局设置文件
 * 在每个测试文件执行前会先执行此文件
 */

// 扩展断言库
import '@testing-library/jest-dom';

// 模拟Web Worker
const mockWorker = {
  postMessage: jest.fn(),
  terminate: jest.fn()
};

// 简单模拟Blob和File API
const mockBlob = {
  size: 1024,
  type: 'application/octet-stream',
  slice: jest.fn().mockReturnValue({
    size: 512,
    type: 'application/octet-stream'
  }),
  text: jest.fn().mockResolvedValue('mock content'),
  arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024)),
  stream: jest.fn().mockReturnValue({})
};

// 确保在Node环境中有window对象
if (typeof global.window === 'undefined') {
  global.window = {} as any;
}

// 确保window.Worker存在后再模拟它
if (!window.Worker) {
  window.Worker = jest.fn() as unknown as typeof Worker;
}

// 创建全局mocks
jest.spyOn(window, 'Worker').mockImplementation(() => mockWorker as unknown as Worker);

// 模拟IndexedDB
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

const mockIndexedDB = {
  open: jest.fn().mockReturnValue(mockIDBRequest)
};

// 确保indexedDB存在
if (!window.indexedDB) {
  window.indexedDB = mockIndexedDB as unknown as IDBFactory;
}

// 模拟Blob和File
if (!window.Blob) {
  window.Blob = jest.fn().mockImplementation(() => mockBlob as unknown as Blob);
}

if (!window.File) {
  window.File = jest.fn().mockImplementation(
    (_, name) =>
      ({
        ...mockBlob,
        name,
        lastModified: Date.now()
      }) as unknown as File
  );
}

// 模拟失败的网络请求
const shouldFailRequest = { value: false };

if (!window.fetch) {
  window.fetch = jest.fn().mockImplementation(async (_input, _init) => {
    if (shouldFailRequest.value) {
      shouldFailRequest.value = false;
      throw new Error('Network error');
    }

    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
      text: () => Promise.resolve('success'),
      blob: () => Promise.resolve(mockBlob as unknown as Blob)
    } as Response;
  });
}

// 暴露给测试使用的辅助函数
export const testHelpers = {
  mockNetworkFailure: () => {
    shouldFailRequest.value = true;
  },
  resetMocks: () => {
    jest.clearAllMocks();
    shouldFailRequest.value = false;
  }
};
