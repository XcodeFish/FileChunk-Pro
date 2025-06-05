import { EdgeNetworkManager, EdgeNode } from '../../../src/modules/network/edge-network-manager';

// 模拟全局fetch方法
global.fetch = jest.fn();

describe('EdgeNetworkManager', () => {
  // 测试用的边缘节点
  const testNodes: EdgeNode[] = [
    {
      id: 'node1',
      name: '测试节点1',
      url: 'https://node1.example.com',
      region: 'asia',
      country: 'China',
      city: 'Shanghai'
    },
    {
      id: 'node2',
      name: '测试节点2',
      url: 'https://node2.example.com',
      region: 'asia',
      country: 'China',
      city: 'Beijing'
    },
    {
      id: 'node3',
      name: '测试节点3',
      url: 'https://node3.example.com',
      region: 'america',
      country: 'USA',
      city: 'New York'
    }
  ];

  // 模拟内核
  const mockKernel = {
    emit: jest.fn(),
    on: jest.fn()
  };

  let edgeManager: EdgeNetworkManager;

  // 清除模拟以及定时器
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();

    // 创建边缘网络管理器实例
    edgeManager = new EdgeNetworkManager({
      nodes: testNodes,
      autoDetectBestNode: false, // 初始化时不自动检测
      healthCheckInterval: 5000,
      enableLogging: false
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  // 测试初始化
  test('should initialize with provided nodes', () => {
    expect(edgeManager['nodes'].size).toBe(3);
    expect(edgeManager['bestNodeId']).toBe('node1');
    expect(edgeManager['backupNodeId']).toBe('node2');
  });

  // 测试初始化方法
  test('should initialize the module with kernel', async () => {
    await edgeManager.init(mockKernel);
    expect(edgeManager['kernel']).toBe(mockKernel);
  });

  // 测试启动监控
  test('should start monitoring nodes', async () => {
    const checkSpy = jest
      .spyOn(edgeManager as any, 'checkAllNodesHealth')
      .mockResolvedValue(undefined);

    edgeManager.startMonitoring();

    expect(edgeManager['isMonitoring']).toBe(true);
    expect(checkSpy).toHaveBeenCalled();
    expect(edgeManager['healthCheckTimer']).not.toBeNull();
  });

  // 测试停止监控
  test('should stop monitoring nodes', () => {
    // 先启动监控
    edgeManager.startMonitoring();
    expect(edgeManager['isMonitoring']).toBe(true);

    // 停止监控
    edgeManager.stopMonitoring();
    expect(edgeManager['isMonitoring']).toBe(false);
    expect(edgeManager['healthCheckTimer']).toBeNull();
  });

  // 测试获取最佳上传端点
  test('should get best upload endpoint', () => {
    const endpoint = edgeManager.getBestUploadEndpoint();
    expect(endpoint).toBe('https://node1.example.com/upload');
  });

  // 测试获取特定区域的最佳节点
  test('should get best node for a region', () => {
    const node = edgeManager.getBestNodeForRegion('asia');
    expect(node).not.toBeNull();
    expect(node?.region).toBe('asia');
  });

  // 测试获取最近的N个节点
  test('should get nearest nodes', () => {
    const nodes = edgeManager.getNearestNodes(2);
    expect(nodes.length).toBe(2);
    expect(nodes[0].id).toBe('node1');
    expect(nodes[1].id).toBe('node2');
  });

  // 测试手动切换节点
  test('should manually switch to another node', () => {
    const result = edgeManager.switchNode('node3');
    expect(result).toBe(true);
    expect(edgeManager['bestNodeId']).toBe('node3');
    expect(edgeManager['backupNodeId']).toBe('node1');
  });

  // 测试节点健康检查
  test('should check node health', async () => {
    // 模拟成功的响应
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200
    });

    const result = await (edgeManager as any).checkNodeHealth('node1');

    expect(result.nodeId).toBe('node1');
    expect(result.isAvailable).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('node1.example.com'),
      expect.any(Object)
    );
  });

  // 测试节点故障转移
  test('should handle node failover', () => {
    // 准备测试
    const node1 = edgeManager['nodes'].get('node1')!;
    node1.status = 'online';
    const node2 = edgeManager['nodes'].get('node2')!;
    node2.status = 'online';
    edgeManager['bestNodeId'] = 'node1';
    edgeManager['backupNodeId'] = 'node2';

    // 模拟事件监听器
    const eventSpy = jest.spyOn(edgeManager['eventEmitter'], 'emit');

    // 执行故障转移
    (edgeManager as any).handleNodeFailover('node1');

    // 验证结果
    expect(node1.status).toBe('offline');
    expect(edgeManager['bestNodeId']).toBe('node2');
    expect(eventSpy).toHaveBeenCalledWith('node:failover', expect.any(Object));
  });

  // 测试获取所有节点状态
  test('should get all node status', () => {
    const status = edgeManager.getAllNodeStatus();
    expect(status.length).toBe(3);
    expect(status[0]).toHaveProperty('id');
    expect(status[0]).toHaveProperty('name');
    expect(status[0]).toHaveProperty('status');
    expect(status[0]).toHaveProperty('region');
  });

  // 测试事件监听
  test('should register and trigger events', () => {
    const handler = jest.fn();

    // 注册事件
    edgeManager.on('test:event', handler);

    // 触发事件
    edgeManager['eventEmitter'].emit('test:event', { test: true });

    expect(handler).toHaveBeenCalledWith({ test: true });

    // 取消注册
    edgeManager.off('test:event', handler);
    edgeManager['eventEmitter'].emit('test:event', { test: false });

    // 不应该触发第二次
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
