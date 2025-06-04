import { Kernel, KernelEventType, KernelOptions } from '../core/kernel';

/**
 * 配置管理示例
 *
 * 本示例展示了微内核配置管理系统的特性和使用方法，包括：
 * 1. 初始配置设置
 * 2. 配置的读取和修改
 * 3. 点表示法访问深层配置
 * 4. 配置事件监听
 * 5. 批量配置更新
 * 6. 配置重置
 */
async function runConfigManagementExample(): Promise<void> {
  console.log('=== 配置管理系统示例 ===');

  // 1. 初始配置设置
  console.log('\n1. 初始配置设置:');

  // 定义默认配置
  const defaultConfig = {
    app: {
      name: 'FileChunk Pro',
      version: '1.0.0'
    },
    upload: {
      transport: {
        timeout: 30000, // 30秒
        retries: 3,
        chunkSize: 2 * 1024 * 1024 // 2MB
      },
      concurrency: 3,
      allowedTypes: ['image/*', 'application/pdf']
    },
    storage: {
      type: 'indexeddb',
      prefix: 'filechunk_'
    }
  };

  // 使用默认配置创建内核
  const kernel = new Kernel({
    globalConfig: defaultConfig
  } as KernelOptions);

  // 初始化内核
  await kernel.init();

  // 查看初始配置
  const initialConfig = kernel.getConfig();
  console.log('初始配置:', JSON.stringify(initialConfig, null, 2));

  // 2. 读取和修改配置
  console.log('\n2. 读取和修改配置:');

  // 读取简单配置值
  const appName = kernel.getConfig('app.name');
  console.log(`应用名称: ${appName}`);

  // 修改配置值
  kernel.setConfig('app.name', 'FileChunk Pro Enhanced');
  console.log(`修改后的应用名称: ${kernel.getConfig('app.name')}`);

  // 读取嵌套配置
  const transportConfig = kernel.getConfig('upload.transport');
  console.log('传输配置:', transportConfig);

  // 修改嵌套配置中的值
  kernel.setConfig('upload.transport.timeout', 60000); // 60秒
  console.log(`修改后的超时时间: ${kernel.getConfig('upload.transport.timeout')}毫秒`);

  // 3. 点表示法访问深层配置
  console.log('\n3. 点表示法访问深层配置:');

  // 使用点表示法读取深层配置
  const chunkSize = kernel.getConfig('upload.transport.chunkSize');
  console.log(`分片大小: ${chunkSize / (1024 * 1024)}MB`);

  // 设置不存在的深层路径（自动创建中间对象）
  kernel.setConfig('features.encryption.enabled', true);
  kernel.setConfig('features.encryption.algorithm', 'AES-256');

  // 读取新创建的路径
  const encryptionConfig = kernel.getConfig('features.encryption');
  console.log('加密配置:', encryptionConfig);

  // 4. 配置事件监听
  console.log('\n4. 配置事件监听:');

  // 监听配置变更事件
  kernel.on(KernelEventType.CONFIG_CHANGED, data => {
    console.log(
      `配置变更: 路径=${data.path}, 旧值=${JSON.stringify(data.oldValue)}, 新值=${JSON.stringify(data.newValue)}`
    );
  });

  // 进行配置修改，将触发事件
  console.log('修改配置，观察事件触发:');
  kernel.setConfig('upload.concurrency', 5);

  // 5. 批量配置更新
  console.log('\n5. 批量配置更新:');

  // 准备批量更新数据，混合点表示法和嵌套对象
  const batchUpdates = {
    'app.version': '1.1.0',
    upload: {
      transport: {
        retries: 5,
        chunkSize: 4 * 1024 * 1024 // 4MB
      }
    },
    'storage.prefix': 'filechunk_pro_'
  };

  // 执行批量更新
  console.log('执行批量更新，观察事件触发:');
  kernel.updateConfigs(batchUpdates);

  // 检查更新后的配置
  console.log('更新后的配置:');
  console.log(`- 应用版本: ${kernel.getConfig('app.version')}`);
  console.log(`- 重试次数: ${kernel.getConfig('upload.transport.retries')}`);
  console.log(`- 分片大小: ${kernel.getConfig('upload.transport.chunkSize') / (1024 * 1024)}MB`);
  console.log(`- 存储前缀: ${kernel.getConfig('storage.prefix')}`);

  // 6. 配置重置
  console.log('\n6. 配置重置:');

  // 订阅配置重置事件
  kernel.on(KernelEventType.CONFIG_RESET, data => {
    if (data.path) {
      console.log(`配置路径重置: ${data.path}, 新值: ${JSON.stringify(data.newValue)}`);
    } else {
      console.log('所有配置已重置');
    }
  });

  // 重置特定路径
  console.log('重置upload.concurrency配置:');
  kernel.resetConfig('upload.concurrency');

  // 检查重置后的值
  console.log(`重置后的并发数: ${kernel.getConfig('upload.concurrency')}`);

  // 重置所有配置
  console.log('\n重置所有配置:');
  kernel.resetConfig();

  // 检查完全重置后的配置
  console.log('重置后的应用名称:', kernel.getConfig('app.name'));
  console.log(
    '重置后的分片大小:',
    kernel.getConfig('upload.transport.chunkSize') / (1024 * 1024) + 'MB'
  );

  // 清理资源
  await kernel.destroy();

  console.log('\n配置管理示例完成');
}

export { runConfigManagementExample };
