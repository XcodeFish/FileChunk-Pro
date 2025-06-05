import { CDNConnector, CDNProvider } from '../../src/modules/network/cdn-connector';
import { FileChunkKernel } from '../../src/core/kernel';

// 创建示例CDN提供商配置
const cdnProviders: CDNProvider[] = [
  {
    id: 'cdn1',
    name: '主要CDN',
    baseUrl: 'https://cdn1.example.com',
    apiEndpoint: 'https://api.cdn1.example.com/v1/purge',
    apiKey: 'api-key-for-cdn1'
  },
  {
    id: 'cdn2',
    name: '备用CDN',
    baseUrl: 'https://cdn2.example.com',
    apiEndpoint: 'https://api.cdn2.example.com/cache/invalidate',
    authToken: 'auth-token-for-cdn2'
  },
  {
    id: 'cdn3',
    name: '低成本CDN',
    baseUrl: 'https://cdn3.example.com'
  }
];

// 创建CDN连接器实例
const cdnConnector = new CDNConnector({
  providers: cdnProviders,
  autoDetectInvalidation: true,
  healthCheckInterval: 60000, // 1分钟
  failoverThreshold: 2,
  healthCheckPath: '/health-check.html',
  enableLogging: true
});

// 创建微内核实例并注册CDN连接器
const kernel = new FileChunkKernel();
kernel.registerModule('cdn', cdnConnector);

// 监听CDN事件
cdnConnector.on('cdn:failover', data => {
  console.log(`CDN故障转移: 从 ${data.from} 切换到 ${data.to}`);
});

cdnConnector.on('cdn:recovered', data => {
  console.log(`CDN已恢复: ${data.providerName}`);
});

cdnConnector.on('cache:invalidated', data => {
  console.log(`CDN缓存已失效: ${data.providerName}, ${data.urlCount}个URL`);
});

cdnConnector.on('file:allCdnsFailed', data => {
  console.log(`所有CDN都无法访问文件: ${data.fileName}`);
});

// 使用CDN连接器获取文件URL
const fileHash = 'a1b2c3d4e5f6g7h8i9j0';
const fileName = '大型文件.mp4';
const fileUrl = cdnConnector.getCdnUrl(fileHash, fileName);

console.log(`文件CDN链接: ${fileUrl}`);

// 演示处理失效的文件
async function handleFailedFile() {
  try {
    const recoverUrl = await cdnConnector.handleInvalidatedFile(fileHash, fileName);
    if (recoverUrl) {
      console.log(`已在其他CDN找到文件: ${recoverUrl}`);
    } else {
      console.log('所有CDN均无法访问此文件');
    }
  } catch (error) {
    console.error('处理失效文件时出错:', error);
  }
}

// 演示主动使CDN缓存失效
async function invalidateCacheExample() {
  const urls = [
    `https://cdn1.example.com/${fileHash}/${encodeURIComponent(fileName)}`,
    `https://cdn1.example.com/${fileHash}/thumbnail.jpg`
  ];

  try {
    const success = await cdnConnector.invalidateCache(urls);
    if (success) {
      console.log('缓存已成功失效');
    } else {
      console.log('缓存失效操作失败');
    }
  } catch (error) {
    console.error('缓存失效操作错误:', error);
  }
}

// 查看CDN状态
function logCdnStatus() {
  const status = cdnConnector.getAllCDNStatus();
  console.log('当前CDN状态:');
  status.forEach(cdn => {
    console.log(`- ${cdn.name}: ${cdn.status}, 失败次数: ${cdn.failureCount}`);
  });

  const activeCdn = cdnConnector.getActiveCDN();
  console.log(`当前活跃CDN: ${activeCdn ? activeCdn.name : '无'}`);
}

// 模拟执行示例
(async () => {
  // 等待健康检查完成
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 查看CDN状态
  logCdnStatus();

  // 处理失效的文件
  await handleFailedFile();

  // 主动使CDN缓存失效
  await invalidateCacheExample();

  // 手动切换CDN
  if (cdnConnector.switchCDN('cdn2')) {
    console.log('已手动切换到备用CDN');
  }

  // 再次查看CDN状态
  logCdnStatus();
})();
