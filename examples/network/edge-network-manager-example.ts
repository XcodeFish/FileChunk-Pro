import { EdgeNetworkManager, EdgeNode } from '../../src/modules/network/edge-network-manager';
import { FileChunkKernel } from '../../src/core/kernel';

/**
 * 边缘网络管理器示例
 */
async function main() {
  console.log('边缘网络管理器示例');

  // 创建测试边缘节点
  const nodes: EdgeNode[] = [
    {
      id: 'node1',
      name: '中国节点-上海',
      url: 'https://cn-east.example.com',
      region: 'asia',
      country: 'China',
      city: 'Shanghai',
      weight: 1
    },
    {
      id: 'node2',
      name: '中国节点-北京',
      url: 'https://cn-north.example.com',
      region: 'asia',
      country: 'China',
      city: 'Beijing',
      weight: 0.9
    },
    {
      id: 'node3',
      name: '美国节点-纽约',
      url: 'https://us-east.example.com',
      region: 'america',
      country: 'USA',
      city: 'New York',
      weight: 1
    },
    {
      id: 'node4',
      name: '欧洲节点-伦敦',
      url: 'https://eu-west.example.com',
      region: 'europe',
      country: 'UK',
      city: 'London',
      weight: 0.8
    },
    {
      id: 'node5',
      name: '亚太节点-新加坡',
      url: 'https://ap-south.example.com',
      region: 'asia',
      country: 'Singapore',
      city: 'Singapore',
      weight: 0.9
    }
  ];

  // 创建微内核实例
  const kernel = new FileChunkKernel();

  // 创建边缘网络管理器
  const edgeManager = new EdgeNetworkManager({
    nodes,
    autoDetectBestNode: true,
    enableGeoRouting: true,
    healthCheckInterval: 5000, // 为了示例，设置为5秒
    enableLogging: true,
    speedTestPath: '/speedtest'
  });

  // 注册到微内核
  kernel.registerModule('edgeNetwork', edgeManager);

  // 初始化模块
  await edgeManager.init(kernel);

  // 监听事件
  setupEventListeners(edgeManager);

  // 等待10秒，让健康检查执行几次
  await waitSeconds(10);

  // 获取最佳上传端点
  const bestEndpoint = edgeManager.getBestUploadEndpoint();
  console.log(`最佳上传端点: ${bestEndpoint}`);

  // 获取所有节点状态
  const allStatus = edgeManager.getAllNodeStatus();
  console.log('\n所有节点状态:');
  allStatus.forEach(node => {
    console.log(
      `- ${node.name} (${node.region}): ${node.status}, 延迟: ${node.latency || 'N/A'}ms, 上传速度: ${node.uploadSpeed ? Math.floor(node.uploadSpeed / 1024) + 'KB/s' : 'N/A'}`
    );
  });

  // 获取亚洲区域的最佳节点
  const asiaNode = edgeManager.getBestNodeForRegion('asia');
  if (asiaNode) {
    console.log(`\n亚洲区域最佳节点: ${asiaNode.name} (${asiaNode.country})`);
  } else {
    console.log('\n亚洲区域没有可用节点');
  }

  // 获取距离最近的3个节点
  const nearestNodes = edgeManager.getNearestNodes(3);
  console.log('\n最近的3个节点:');
  nearestNodes.forEach(node => {
    console.log(`- ${node.name} (${node.region})`);
  });

  // 手动切换节点示例
  console.log('\n手动切换到美国节点');
  const switchResult = edgeManager.switchNode('node3');
  console.log(`切换结果: ${switchResult ? '成功' : '失败'}`);

  // 再等待5秒，观察节点切换后的效果
  await waitSeconds(5);

  // 停止监控
  console.log('\n停止节点监控');
  edgeManager.stopMonitoring();

  console.log('\n示例完成');
}

/**
 * 设置事件监听
 * @param edgeManager 边缘网络管理器实例
 */
function setupEventListeners(edgeManager: EdgeNetworkManager): void {
  // 监控状态变化
  edgeManager.on('monitoring:started', () => {
    console.log('事件: 节点监控已启动');
  });

  edgeManager.on('monitoring:stopped', () => {
    console.log('事件: 节点监控已停止');
  });

  // 健康检查完成
  edgeManager.on('healthCheck:complete', results => {
    console.log(`事件: 完成健康检查，检查了 ${results.length} 个节点`);
  });

  // 节点故障转移
  edgeManager.on('node:failover', data => {
    console.log(`事件: 节点故障转移，从 ${data.failedNode} 转移到 ${data.newNode}`);
  });

  // 最佳节点变化
  edgeManager.on('node:changed', data => {
    console.log(`事件: 最佳节点已更新，从 ${data.from} 改为 ${data.to}`);
  });

  // 手动切换节点
  edgeManager.on('node:switched', data => {
    console.log(`事件: 节点已手动切换，从 ${data.from} 改为 ${data.to}`);
  });

  // 地理位置检测
  edgeManager.on('geo:detected', data => {
    const loc = data.location;
    console.log(`事件: 已检测到地理位置，${loc.country} ${loc.city}`);
  });

  // 所有节点故障
  edgeManager.on('node:allFailed', () => {
    console.log('事件: 警告 - 所有边缘节点都不可用');
  });
}

/**
 * 等待指定秒数
 * @param seconds 秒数
 */
function waitSeconds(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

// 运行示例
main().catch(console.error);
