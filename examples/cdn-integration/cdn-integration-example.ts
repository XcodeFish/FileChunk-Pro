import {
  CDNIntegrationPlugin,
  CDNConfig,
  CDNProviderType,
  CDNUploadOptimizerOptions,
  CDNStatsOptions
} from '../../src/plugins/cdn-integration';

/**
 * CDN集成插件使用示例
 */
async function runCDNIntegrationExample() {
  console.log('初始化CDN集成插件...');

  // 创建CDN配置
  const cdnConfigs: CDNConfig[] = [
    // Cloudflare配置
    {
      provider: CDNProviderType.CLOUDFLARE,
      domain: 'cdn.example.com',
      useHttps: true,
      pathPrefix: '/assets',
      auth: {
        accessKey: 'your-cloudflare-access-key',
        secretKey: 'your-cloudflare-secret-key'
      },
      enableStats: true,
      geoRouting: true,
      failover: {
        enabled: true,
        maxRetries: 3,
        timeout: 10000,
        fallbackDomains: ['backup-cdn.example.com']
      }
    },
    // 阿里云配置
    {
      provider: CDNProviderType.ALIYUN,
      domain: 'cdn-aliyun.example.com',
      useHttps: true,
      region: 'cn-hangzhou',
      auth: {
        accessKey: 'your-aliyun-access-key',
        secretKey: 'your-aliyun-secret-key'
      },
      pathPrefix: '/files'
    }
  ];

  // 创建CDN集成插件实例（开发环境使用模拟数据）
  const cdnPlugin = new CDNIntegrationPlugin(cdnConfigs, true);

  try {
    // 获取默认CDN提供商
    const defaultProvider = cdnPlugin.getDefaultProvider();
    console.log(`默认CDN提供商: ${defaultProvider?.name || '无'}`);

    // 切换默认提供商
    const switchResult = cdnPlugin.setDefaultProvider(CDNProviderType.ALIYUN);
    console.log(`切换到阿里云CDN: ${switchResult ? '成功' : '失败'}`);

    // 创建上传优化器
    const uploaderOptions: CDNUploadOptimizerOptions = {
      concurrency: 5,
      maxRetries: 3,
      enableEdgeDetection: true,
      enableSmartRouting: true,
      enableCompression: true,
      chunkSize: 8 * 1024 * 1024, // 8MB
      callbacks: {
        onUploadStart: fileKey => console.log(`开始上传: ${fileKey}`),
        onUploadComplete: (fileKey, url) => console.log(`上传完成: ${fileKey} => ${url}`),
        onUploadError: (fileKey, error) => console.error(`上传失败: ${fileKey}`, error),
        onUploadProgress: (fileKey, progress) => {
          // 仅在整数百分比变化时输出
          const percent = Math.floor(progress * 100);
          if (percent % 10 === 0) {
            console.log(`上传进度: ${fileKey} ${percent}%`);
          }
        }
      }
    };

    const uploadOptimizer = cdnPlugin.createUploadOptimizer(uploaderOptions);

    // 模拟上传文件（实际应用中这里使用真实文件）
    const mockFile = new Blob(['Mock file content for upload'], { type: 'text/plain' });
    const taskId = await uploadOptimizer.addUploadTask(
      mockFile,
      'example/test-file.txt',
      {
        key: 'example/test-file.txt',
        contentType: 'text/plain',
        metadata: {
          author: 'FileChunkPro',
          category: 'example'
        }
      },
      10 // 高优先级
    );

    console.log(`创建上传任务: ${taskId}`);

    // 等待上传完成（实际应用中可以使用回调函数处理）
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 检查任务状态
    const taskStatus = uploadOptimizer.getTaskStatus(taskId);
    console.log('任务状态:', taskStatus);

    // CDN统计与分析示例
    try {
      const statsAnalyzer = cdnPlugin.getStatsAnalyzer();

      // 查询统计数据
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const statsOptions: CDNStatsOptions = {
        startTime: weekAgo,
        endTime: now,
        interval: 'day',
        metrics: ['traffic', 'bandwidth', 'requests']
      };

      console.log('获取CDN使用统计数据...');
      const usageStats = await statsAnalyzer.getUsageStats(statsOptions);

      // 输出摘要信息
      console.log('CDN统计摘要:');
      console.log(`- 总流量: ${formatBytes(usageStats.totalTraffic)}`);
      console.log(`- 峰值带宽: ${formatBytes(usageStats.peakBandwidth)}/s`);
      console.log(`- 总请求数: ${usageStats.totalRequests.toLocaleString()}`);
      console.log(`- 缓存命中率: ${(usageStats.cacheHitRate || 0) * 100}%`);

      // 获取性能分析
      console.log('获取性能分析...');
      const performanceAnalysis = await statsAnalyzer.getPerformanceAnalysis(statsOptions);

      console.log('性能分析摘要:');
      console.log(`- 平均响应时间: ${performanceAnalysis.avgResponseTime}ms`);
      console.log(`- P95响应时间: ${performanceAnalysis.responseTimePercentiles.p95}ms`);
      console.log(`- 缓存命中率: ${performanceAnalysis.cacheHitRate * 100}%`);

      // 获取成本分析
      console.log('获取成本分析...');
      const costAnalysis = await statsAnalyzer.getCostAnalysis(statsOptions);

      console.log('成本分析摘要:');
      console.log(`- 总成本: $${costAnalysis.totalCost.toFixed(2)}`);

      if (costAnalysis.savingSuggestions && costAnalysis.savingSuggestions.length > 0) {
        console.log('优化建议:');
        costAnalysis.savingSuggestions.forEach((suggestion, index) => {
          console.log(
            `${index + 1}. ${suggestion.suggestion} (节省约: $${suggestion.potentialSaving.toFixed(2)})`
          );
        });
      }

      // 获取优化建议
      console.log('获取整体优化建议...');
      const suggestions = await statsAnalyzer.getOptimizationSuggestions();

      if (suggestions.length > 0) {
        console.log('优化建议汇总:');
        suggestions.forEach((suggestion, index) => {
          console.log(
            `${index + 1}. [${suggestion.type}] ${suggestion.title} (影响: ${suggestion.impact})`
          );
        });
      }

      // 导出报告
      console.log('导出统计报告...');
      await statsAnalyzer.exportReport({
        format: 'json',
        startTime: weekAgo,
        endTime: now,
        title: 'CDN使用情况周报',
        metrics: ['traffic', 'bandwidth', 'requests', 'cache_hit_rate']
      });

      console.log('报告导出完成');
    } catch (error) {
      console.error('统计分析出错:', error);
    }
  } catch (error) {
    console.error('CDN集成插件使用出错:', error);
  } finally {
    // 清理资源
    cdnPlugin.destroy();
    console.log('CDN集成插件资源已释放');
  }
}

/**
 * 格式化字节大小为可读字符串
 * @param bytes 字节数
 * @returns 格式化后的字符串
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 运行示例
runCDNIntegrationExample().catch(console.error);
