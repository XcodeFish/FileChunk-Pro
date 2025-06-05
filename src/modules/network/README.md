# 网络模块 - FileChunk Pro

网络模块负责处理与网络通信相关的功能，包括边缘网络管理和CDN集成。本模块提供了可靠的网络通信策略，确保在各种网络环境下文件上传的稳定性。

## 主要组件

### 1. 边缘网络管理器 (EdgeNetworkManager)

边缘网络管理器负责检测和选择最佳的上传节点，通过延迟检测、节点健康监控、故障节点自动切换等功能，确保上传到最快、最稳定的节点。

### 2. CDN连接器 (CDNConnector)

CDN连接器用于与多个CDN提供商集成，提供文件CDN URL生成、CDN预热、缓存失效、自动故障转移等功能。

## CDN连接器详细介绍

CDN连接器是一个强大的组件，它可以管理多个CDN提供商，并在CDN失效时自动进行故障转移。

### 功能特点

- **多CDN提供商支持**: 可同时集成多个CDN服务，如阿里云、腾讯云、AWS CloudFront等
- **自动健康检测**: 定期检查各CDN的可用性和性能
- **故障自动转移**: 当主要CDN不可用时，自动切换到备用CDN
- **CDN预签名URL生成**: 创建带有认证的CDN访问链接
- **缓存失效处理**: 主动刷新CDN缓存或处理CDN缓存失效
- **动态CDN选择**: 基于地理位置、性能和可用性智能选择CDN
- **CDN状态监控**: 持续监控CDN健康状态并报告

### CDN失效处理

CDN失效处理是CDN连接器的核心功能之一。它通过以下机制确保用户即使在CDN失效的情况下也能访问文件：

1. **自动检测失效**：定期发送探测请求到各CDN节点，检测节点健康状态
2. **自动故障转移**：当检测到CDN失效时，自动切换到备用CDN
3. **失效文件处理**：当用户请求的文件在主CDN不可用时，自动尝试其他CDN或回源
4. **主动缓存刷新**：提供API调用，主动清除CDN上的缓存
5. **状态恢复监控**：持续监控已失效的CDN，一旦恢复则更新其状态
6. **降级策略**：当所有CDN都不可用时，提供降级访问策略

## 使用示例

### 1. 基础使用

```typescript
import { CDNConnector } from 'filechunk-pro/modules/network';
import { FileChunkKernel } from 'filechunk-pro/core';

// 创建微内核实例
const kernel = new FileChunkKernel();

// 创建CDN连接器实例
const cdnConnector = new CDNConnector({
  providers: [
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
  ],
  autoDetectInvalidation: true, // 自动检测CDN失效
  healthCheckInterval: 30000, // 健康检查间隔（毫秒）
  enableLogging: true // 启用日志
});

// 注册到微内核
kernel.registerModule('cdn', cdnConnector);

// 获取文件的CDN URL
const fileUrl = cdnConnector.getCdnUrl('file-hash-123', 'example.mp4');
```

### 2. 处理失效CDN

```typescript
// 监听CDN故障转移事件
cdnConnector.on('cdn:failover', data => {
  console.log(`CDN故障转移: 从 ${data.from} 切换到 ${data.to}`);
  notifyUser('CDN服务暂时不可用，已自动切换到备用服务');
});

// 处理特定文件的CDN失效
async function handleFileAccess(fileHash, fileName) {
  try {
    // 尝试获取文件URL（会自动处理CDN失效）
    const fileUrl = await cdnConnector.handleInvalidatedFile(fileHash, fileName);

    if (fileUrl) {
      return fileUrl;
    } else {
      // 所有CDN均不可用，回源或其他处理
      return getFallbackUrl(fileHash, fileName);
    }
  } catch (error) {
    console.error('访问文件失败:', error);
    return getEmergencyUrl(fileHash, fileName);
  }
}
```

### 3. 主动使缓存失效

```typescript
// 当文件更新后，使相关CDN缓存失效
async function updateFileAndInvalidateCache(fileId, newContent) {
  // 更新文件
  const updatedFile = await updateFile(fileId, newContent);

  // 准备需要失效的URL列表
  const urlsToInvalidate = [
    `https://cdn.example.com/${updatedFile.hash}/${updatedFile.name}`,
    `https://cdn.example.com/${updatedFile.hash}/thumb.jpg`
  ];

  // 执行缓存失效
  const success = await cdnConnector.invalidateCache(urlsToInvalidate);

  if (success) {
    console.log('CDN缓存已成功失效');
  } else {
    console.warn('CDN缓存失效请求失败');
  }

  return updatedFile;
}
```

## 配置选项

CDN连接器支持以下配置选项：

| 选项                      | 类型          | 默认值           | 描述                   |
| ------------------------- | ------------- | ---------------- | ---------------------- |
| providers                 | CDNProvider[] | []               | CDN提供商列表          |
| autoDetectInvalidation    | boolean       | true             | 自动检测CDN失效        |
| healthCheckInterval       | number        | 30000            | 健康检查间隔(毫秒)     |
| failoverThreshold         | number        | 3                | 故障转移阈值(失败次数) |
| maxRetries                | number        | 5                | 最大重试次数           |
| retryDelay                | number        | 1000             | 重试延迟(毫秒)         |
| maxRetryDelay             | number        | 30000            | 最大重试延迟(毫秒)     |
| backoffFactor             | number        | 2                | 退避因子               |
| statusRefreshInterval     | number        | 300000           | 状态刷新时间(毫秒)     |
| cacheInvalidationEndpoint | string        | null             | 缓存刷新URL            |
| healthCheckPath           | string        | '/health'        | 健康检查路径           |
| testFilePath              | string        | '/test-file.txt' | 测试文件路径           |
| enableLogging             | boolean       | false            | 启用日志               |

## 事件

CDN连接器会发射以下事件：

| 事件名称                 | 触发条件              | 数据                                                 |
| ------------------------ | --------------------- | ---------------------------------------------------- |
| monitoring:started       | 开始监控CDN状态       | 无                                                   |
| monitoring:stopped       | 停止监控CDN状态       | 无                                                   |
| healthCheck:complete     | 健康检查完成          | 健康检查结果数组                                     |
| cdn:failover             | CDN故障转移           | { from, to, failedProvider, newProvider, timestamp } |
| cdn:allFailed            | 所有CDN都失效         | { message, timestamp }                               |
| cdn:recovered            | CDN恢复在线           | { providerId, providerName, timestamp }              |
| cdn:backupAdded          | 新增备用CDN           | { providerId, providerName, timestamp }              |
| cdn:switched             | 手动切换CDN           | { from, to, manual, timestamp }                      |
| cache:invalidated        | 缓存失效成功          | { providerId, providerName, urlCount, timestamp }    |
| cache:invalidationFailed | 缓存失效失败          | { providerId, providerName, error, timestamp }       |
| file:allCdnsFailed       | 所有CDN都无法访问文件 | { fileHash, fileName, timestamp }                    |

## 最佳实践

1. **配置多个CDN提供商**：始终设置至少一个备用CDN，确保高可用性
2. **启用自动检测**：在生产环境中启用自动检测功能
3. **合理设置健康检查间隔**：根据业务需求和预算设置合理的检查频率
4. **处理全部失效情况**：监听`cdn:allFailed`事件，提供降级方案
5. **缓存刷新优化**：批量进行缓存失效操作，减少API调用次数
6. **监控与报警**：接入监控系统，对CDN转移事件进行报警
7. **用户体验优化**：在CDN故障转移时，提供适当的用户反馈
