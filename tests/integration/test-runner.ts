/**
 * FileChunk Pro 集成测试运行器
 *
 * 配置集成测试运行环境和全局设置
 */

import { setupEnvironment, teardownEnvironment } from '../utils/test-environment';
import { configureNetworkMocks } from '../utils/network-mocks';

// 在所有集成测试开始前运行
beforeAll(async () => {
  // 设置测试环境
  await setupEnvironment();

  // 配置网络请求模拟
  configureNetworkMocks();

  // 设置超时时间较长以适应集成测试
  jest.setTimeout(30000);

  // 设置全局变量
  global.__TEST_ENV__ = {
    isIntegrationTest: true,
    mockBaseUrl: 'https://api.example.com'
  };
});

// 在所有集成测试结束后运行
afterAll(async () => {
  // 清理测试环境
  await teardownEnvironment();

  // 重置Jest模拟
  jest.restoreAllMocks();

  // 重置超时
  jest.setTimeout(5000);

  // 清除全局变量
  delete global.__TEST_ENV__;
});
