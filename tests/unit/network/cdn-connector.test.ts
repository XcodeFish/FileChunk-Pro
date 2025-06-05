import { CDNConnector, CDNProvider } from '../../../src/modules/network/cdn-connector';

// 模拟全局fetch方法
global.fetch = jest.fn();

describe('CDNConnector 测试', () => {
  // 每个测试后重置模拟
  afterEach(() => {
    jest.clearAllMocks();
  });

  // 测试数据
  const mockProviders: CDNProvider[] = [
    {
      id: 'cdn1',
      name: '主要CDN',
      baseUrl: 'https://cdn1.example.com'
    },
    {
      id: 'cdn2',
      name: '备用CDN',
      baseUrl: 'https://cdn2.example.com'
    }
  ];

  // 测试初始化
  test('应正确初始化CDN提供商', () => {
    const connector = new CDNConnector({ providers: mockProviders });

    // 验证活跃CDN是第一个提供商
    const activeCDN = connector.getActiveCDN();
    expect(activeCDN).toBeTruthy();
    expect(activeCDN?.id).toBe('cdn1');

    // 验证状态正确
    const status = connector.getAllCDNStatus();
    expect(status).toHaveLength(2);
    expect(status[0].status).toBe('active');
    expect(status[1].status).toBe('active');
  });

  // 测试获取CDN URL
  test('应正确获取CDN URL', () => {
    const connector = new CDNConnector({ providers: mockProviders });

    const fileHash = 'abc123';
    const fileName = 'test file.mp4';

    const url = connector.getCdnUrl(fileHash, fileName);
    expect(url).toBe('https://cdn1.example.com/abc123/test%20file.mp4');

    // 测试指定CDN
    const url2 = connector.getCdnUrl(fileHash, fileName, 'cdn2');
    expect(url2).toBe('https://cdn2.example.com/abc123/test%20file.mp4');
  });

  // 测试手动切换CDN
  test('应能手动切换CDN', () => {
    const connector = new CDNConnector({ providers: mockProviders });

    // 默认应该是cdn1
    expect(connector.getActiveCDN()?.id).toBe('cdn1');

    // 切换到cdn2
    const result = connector.switchCDN('cdn2');
    expect(result).toBe(true);
    expect(connector.getActiveCDN()?.id).toBe('cdn2');

    // 尝试切换到不存在的CDN
    const invalidResult = connector.switchCDN('cdn3');
    expect(invalidResult).toBe(false);
    // 活跃CDN应该不变
    expect(connector.getActiveCDN()?.id).toBe('cdn2');
  });

  // 测试CDN健康检查
  test('应能检测CDN健康状态并处理故障转移', async () => {
    // 模拟fetch响应
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      // cdn1健康
      if (url.includes('cdn1')) {
        return Promise.resolve({
          ok: true,
          status: 200
        });
      }
      // cdn2不健康
      else if (url.includes('cdn2')) {
        return Promise.reject(new Error('连接失败'));
      }
      return Promise.reject(new Error('未知URL'));
    });

    // 创建带有短检查间隔的连接器
    const connector = new CDNConnector({
      providers: mockProviders,
      healthCheckInterval: 100,
      failoverThreshold: 1,
      enableLogging: false
    });

    // 模拟发射事件的监听器
    const failoverHandler = jest.fn();
    connector.on('cdn:failover', failoverHandler);

    // 开始监控
    connector.startMonitoring();

    // 等待健康检查完成
    await new Promise(resolve => setTimeout(resolve, 200));

    // 停止监控
    connector.stopMonitoring();

    // 验证结果
    const status = connector.getAllCDNStatus();
    expect(status.find(s => s.id === 'cdn1')?.status).toBe('active');
    expect(status.find(s => s.id === 'cdn2')?.status).toBe('offline');
  });

  // 测试处理失效的文件
  test('应能处理CDN失效的文件访问', async () => {
    // 模拟fetch响应
    let requestCount = 0;

    (global.fetch as jest.Mock).mockImplementation((_url: string) => {
      requestCount++;

      // 第一个请求失败，后续成功
      if (requestCount === 1) {
        return Promise.reject(new Error('文件不可用'));
      } else {
        return Promise.resolve({
          ok: true,
          status: 200
        });
      }
    });

    const connector = new CDNConnector({
      providers: mockProviders,
      enableLogging: false
    });

    const fileHash = 'def456';
    const fileName = 'unavailable.txt';

    // 调用处理方法
    const result = await connector.handleInvalidatedFile(fileHash, fileName);

    // 验证尝试了多个CDN
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).not.toBeNull();
  });

  // 测试缓存失效
  test('应能发送缓存失效请求', async () => {
    // 模拟fetch响应
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true })
    });

    const connector = new CDNConnector({
      providers: [
        {
          id: 'cdn-with-api',
          name: 'API CDN',
          baseUrl: 'https://cdn.example.com',
          apiEndpoint: 'https://api.cdn.example.com/purge'
        }
      ],
      enableLogging: false
    });

    const urls = ['https://cdn.example.com/file1.jpg', 'https://cdn.example.com/file2.jpg'];

    // 执行缓存失效
    const result = await connector.invalidateCache(urls);

    // 验证结果
    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.cdn.example.com/purge',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        })
      })
    );
  });
});
