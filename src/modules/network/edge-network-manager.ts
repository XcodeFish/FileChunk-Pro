import { EventEmitter } from 'events';

/**
 * 边缘节点接口
 */
export interface EdgeNode {
  /** 节点ID */
  id: string;
  /** 节点名称 */
  name: string;
  /** 节点URL */
  url: string;
  /** 节点区域 */
  region: string;
  /** 节点国家/地区 */
  country?: string;
  /** 节点城市 */
  city?: string;
  /** 节点权重 */
  weight?: number;
  /** 节点状态 */
  status?: 'online' | 'offline' | 'degraded';
  /** 额外配置 */
  options?: Record<string, any>;
}

/**
 * 节点健康检查结果
 */
export interface NodeHealthCheckResult {
  /** 节点ID */
  nodeId: string;
  /** 是否可用 */
  isAvailable: boolean;
  /** 延迟时间(ms) */
  latency?: number;
  /** 上传速度(bytes/s) */
  uploadSpeed?: number;
  /** 下载速度(bytes/s) */
  downloadSpeed?: number;
  /** 状态码 */
  statusCode?: number;
  /** 错误信息 */
  error?: string;
  /** 检查时间 */
  timestamp: number;
}

/**
 * 地理位置信息
 */
export interface GeoLocation {
  /** 纬度 */
  latitude: number;
  /** 经度 */
  longitude: number;
  /** 国家/地区 */
  country?: string;
  /** 城市 */
  city?: string;
  /** IP地址 */
  ip?: string;
  /** 时区 */
  timezone?: string;
  /** ISP供应商 */
  isp?: string;
}

/**
 * 边缘网络管理器选项
 */
export interface EdgeNetworkManagerOptions {
  /** 边缘节点列表 */
  nodes: EdgeNode[];
  /** 自动检测最佳节点 */
  autoDetectBestNode?: boolean;
  /** 健康检查间隔(毫秒) */
  healthCheckInterval?: number;
  /** 故障转移阈值(失败次数) */
  failoverThreshold?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟(毫秒) */
  retryDelay?: number;
  /** 最大重试延迟(毫秒) */
  maxRetryDelay?: number;
  /** 退避因子 */
  backoffFactor?: number;
  /** 测速文件路径 */
  speedTestPath?: string;
  /** 测速文件大小(字节) */
  speedTestFileSize?: number;
  /** 测速超时时间(毫秒) */
  speedTestTimeout?: number;
  /** 启用地理位置感知路由 */
  enableGeoRouting?: boolean;
  /** 地理位置API端点 */
  geoApiEndpoint?: string;
  /** 地理位置API密钥 */
  geoApiKey?: string;
  /** 启用日志 */
  enableLogging?: boolean;
}

/**
 * 边缘网络管理器类
 * 负责检测和选择最佳上传节点，监控节点健康状态，执行故障转移
 */
export class EdgeNetworkManager {
  private options: EdgeNetworkManagerOptions;
  private nodes: Map<string, EdgeNode> = new Map();
  private bestNodeId: string | null = null;
  private backupNodeId: string | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private speedTestResults: Map<
    string,
    { latency: number; uploadSpeed: number; timestamp: number }
  > = new Map();
  private nodeFailureCounters: Map<string, number> = new Map();
  private userGeoLocation: GeoLocation | null = null;
  private isMonitoring: boolean = false;
  private eventEmitter: EventEmitter = new EventEmitter();
  private kernel: any;

  /**
   * 创建边缘网络管理器实例
   * @param options 配置选项
   */
  constructor(options: EdgeNetworkManagerOptions) {
    this.options = {
      autoDetectBestNode: true,
      healthCheckInterval: 30000, // 30秒
      failoverThreshold: 3, // 3次失败触发故障转移
      maxRetries: 3,
      retryDelay: 1000, // 1秒
      maxRetryDelay: 10000, // 10秒
      backoffFactor: 2,
      speedTestPath: '/speedtest',
      speedTestFileSize: 512 * 1024, // 512KB
      speedTestTimeout: 10000, // 10秒
      enableGeoRouting: true,
      enableLogging: false,
      ...options
    };

    // 初始化节点
    this.initNodes();
  }

  /**
   * 初始化模块
   * @param kernel 微内核实例
   */
  public async init(kernel: any): Promise<void> {
    this.kernel = kernel;
    this.log('边缘网络管理器初始化');

    // 如果配置了自动检测最佳节点，获取地理位置并启动监控
    if (this.options.autoDetectBestNode) {
      if (this.options.enableGeoRouting) {
        await this.detectUserGeoLocation();
      }
      this.startMonitoring();
    }

    // 返回Promise以支持异步初始化
    return Promise.resolve();
  }

  /**
   * 初始化边缘节点
   */
  private initNodes(): void {
    // 清空现有节点
    this.nodes.clear();
    this.nodeFailureCounters.clear();

    // 添加所有节点
    for (const node of this.options.nodes) {
      this.nodes.set(node.id, {
        ...node,
        status: 'online'
      });
      this.nodeFailureCounters.set(node.id, 0);
    }

    // 如果有节点，默认选择第一个作为最佳节点
    if (this.options.nodes.length > 0) {
      this.bestNodeId = this.options.nodes[0].id;
    }

    // 如果有第二个节点，选作备用节点
    if (this.options.nodes.length > 1) {
      this.backupNodeId = this.options.nodes[1].id;
    }
  }

  /**
   * 开始监控边缘节点状态
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.log('开始监控边缘节点状态');

    // 立即执行一次健康检查
    this.checkAllNodesHealth();

    // 设置定时健康检查
    this.healthCheckTimer = setInterval(() => {
      this.checkAllNodesHealth();
    }, this.options.healthCheckInterval);

    // 发射监控开始事件
    this.eventEmitter.emit('monitoring:started');
  }

  /**
   * 停止监控边缘节点状态
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    this.log('停止监控边缘节点状态');

    // 清除定时器
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // 发射监控停止事件
    this.eventEmitter.emit('monitoring:stopped');
  }

  /**
   * 检查所有边缘节点的健康状态
   */
  private async checkAllNodesHealth(): Promise<void> {
    this.log('检查所有边缘节点健康状态');
    const results: NodeHealthCheckResult[] = [];

    // 检查每个节点
    const nodeIds = Array.from(this.nodes.keys());

    const checkPromises = nodeIds.map(nodeId => this.checkNodeHealth(nodeId));

    try {
      const checkResults = await Promise.allSettled(checkPromises);

      checkResults.forEach((result, index) => {
        const nodeId = nodeIds[index];

        if (result.status === 'fulfilled') {
          const nodeResult = result.value;
          results.push(nodeResult);

          // 更新节点状态
          const node = this.nodes.get(nodeId);
          if (node) {
            node.status = nodeResult.isAvailable ? 'online' : 'degraded';

            // 保存测速结果
            if (nodeResult.isAvailable && nodeResult.latency !== undefined) {
              this.speedTestResults.set(nodeId, {
                latency: nodeResult.latency,
                uploadSpeed: nodeResult.uploadSpeed || 0,
                timestamp: Date.now()
              });
            }

            // 重置或增加失败计数
            if (nodeResult.isAvailable) {
              this.nodeFailureCounters.set(nodeId, 0);
            } else {
              const currentFailures = this.nodeFailureCounters.get(nodeId) || 0;
              this.nodeFailureCounters.set(nodeId, currentFailures + 1);

              // 如果达到故障转移阈值，更新状态为离线
              if (currentFailures + 1 >= this.options.failoverThreshold!) {
                node.status = 'offline';

                // 如果是当前最佳节点，触发故障转移
                if (nodeId === this.bestNodeId) {
                  this.handleNodeFailover(nodeId);
                }
              }
            }
          }
        } else {
          // 检查失败的情况
          const error = result.reason;
          this.log(`检查节点健康状态失败: ${nodeId}`, 'error');

          results.push({
            nodeId,
            isAvailable: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now()
          });

          // 更新失败计数
          const currentFailures = this.nodeFailureCounters.get(nodeId) || 0;
          this.nodeFailureCounters.set(nodeId, currentFailures + 1);

          const node = this.nodes.get(nodeId);
          if (node) {
            node.status =
              currentFailures + 1 >= this.options.failoverThreshold! ? 'offline' : 'degraded';

            // 如果是当前最佳节点且达到阈值，触发故障转移
            if (
              nodeId === this.bestNodeId &&
              currentFailures + 1 >= this.options.failoverThreshold!
            ) {
              this.handleNodeFailover(nodeId);
            }
          }
        }
      });

      // 在所有检查完成后更新最佳节点
      this.updateBestNode();
    } catch (error) {
      this.log(
        `节点健康检查出现错误: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
    }

    // 发射健康检查完成事件
    this.eventEmitter.emit('healthCheck:complete', results);
  }

  /**
   * 检查单个边缘节点的健康状态
   * @param nodeId 节点ID
   */
  private async checkNodeHealth(nodeId: string): Promise<NodeHealthCheckResult> {
    const node = this.nodes.get(nodeId);

    if (!node) {
      throw new Error(`未找到边缘节点: ${nodeId}`);
    }

    this.log(`检查节点健康状态: ${node.name} (${nodeId})`);

    const pingUrl = `${node.url}/ping`;
    const startTime = Date.now();
    let latency = 0;
    let uploadSpeed = 0;

    try {
      // 第一步: 发送ping请求测量延迟
      const pingResponse = await fetch(pingUrl, {
        method: 'HEAD',
        cache: 'no-store'
      });

      latency = Date.now() - startTime;

      if (!pingResponse.ok) {
        return {
          nodeId,
          isAvailable: false,
          latency,
          statusCode: pingResponse.status,
          timestamp: Date.now()
        };
      }

      // 第二步: 进行上传速度测试
      if (this.options.speedTestPath) {
        uploadSpeed = await this.testUploadSpeed(node);
      }

      return {
        nodeId,
        isAvailable: true,
        latency,
        uploadSpeed,
        statusCode: pingResponse.status,
        timestamp: Date.now()
      };
    } catch (error) {
      // 网络错误或其他异常
      return {
        nodeId,
        isAvailable: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
    }
  }

  /**
   * 测试上传速度
   * @param node 边缘节点
   */
  private async testUploadSpeed(node: EdgeNode): Promise<number> {
    try {
      const speedTestUrl = `${node.url}${this.options.speedTestPath}`;

      // 创建测试数据 (随机数据)
      const testData = new Uint8Array(this.options.speedTestFileSize!);
      crypto.getRandomValues(testData);
      const blob = new Blob([testData]);

      // 测量上传时间
      const startTime = Date.now();

      const uploadResponse = await fetch(speedTestUrl, {
        method: 'POST',
        body: blob,
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        signal: AbortSignal.timeout(this.options.speedTestTimeout!)
      });

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // 秒

      if (!uploadResponse.ok) {
        throw new Error(`测速请求失败: ${uploadResponse.status}`);
      }

      // 计算上传速度 (bytes/s)
      return Math.floor(this.options.speedTestFileSize! / duration);
    } catch (error) {
      this.log(
        `测速失败: ${node.name} - ${error instanceof Error ? error.message : String(error)}`,
        'warn'
      );
      return 0; // 返回0表示测速失败
    }
  }

  /**
   * 处理节点故障转移
   * @param failedNodeId 失败的节点ID
   */
  private handleNodeFailover(failedNodeId: string): void {
    if (failedNodeId !== this.bestNodeId || !this.backupNodeId) {
      return;
    }

    const failedNode = this.nodes.get(failedNodeId);
    if (!failedNode) return;

    this.log(`主要节点失效: ${failedNode.name} (${failedNodeId})`);

    // 更新失败的节点状态
    failedNode.status = 'offline';

    // 查找可用的备用节点
    const availableNodes = Array.from(this.nodes.entries())
      .filter(
        ([id, node]) =>
          id !== failedNodeId &&
          node.status === 'online' &&
          (this.nodeFailureCounters.get(id) || 0) < this.options.failoverThreshold!
      )
      .map(([id]) => id);

    if (availableNodes.length > 0) {
      // 切换到第一个可用的备用节点
      const newBestNodeId = availableNodes[0];
      const oldBestNodeId = this.bestNodeId;
      this.bestNodeId = newBestNodeId;

      // 如果有多个备用，更新备用节点
      if (availableNodes.length > 1) {
        this.backupNodeId = availableNodes[1];
      } else {
        this.backupNodeId = null;
      }

      const newNode = this.nodes.get(newBestNodeId);

      // 发射故障转移事件
      this.eventEmitter.emit('node:failover', {
        from: oldBestNodeId,
        to: newBestNodeId,
        failedNode: failedNode.name,
        newNode: newNode ? newNode.name : 'unknown',
        timestamp: Date.now()
      });

      this.log(`故障转移: 从 ${failedNode.name} 切换到 ${newNode ? newNode.name : newBestNodeId}`);
    } else {
      // 没有可用的备用节点
      this.bestNodeId = null;
      this.backupNodeId = null;

      this.eventEmitter.emit('node:allFailed', {
        message: '所有边缘节点都不可用',
        timestamp: Date.now()
      });

      this.log('所有边缘节点都不可用', 'error');
    }
  }

  /**
   * 更新最佳节点
   */
  private updateBestNode(): void {
    // 如果当前已经没有最佳节点，尝试恢复
    if (!this.bestNodeId) {
      this.findBestNode();
      return;
    }

    // 当前最佳节点仍然可用，检查是否有更好的节点
    const currentBestNode = this.nodes.get(this.bestNodeId);
    if (currentBestNode && currentBestNode.status === 'online') {
      // 每次检查是否有更好的节点的机会是20%，减少频繁切换
      if (Math.random() < 0.2) {
        this.findBestNode();
      }
    }
  }

  /**
   * 查找最佳节点
   */
  private findBestNode(): void {
    let bestNodeId: string | null = null;
    let bestScore = -Infinity;
    let backupNodeId: string | null = null;
    let backupScore = -Infinity;

    // 根据延迟、上传速度和地理位置计算每个节点的分数
    for (const [nodeId, node] of this.nodes.entries()) {
      // 跳过离线节点
      if (node.status !== 'online') continue;

      // 获取测速结果
      const speedResult = this.speedTestResults.get(nodeId);

      // 如果没有测速数据，给一个默认值
      const latency = speedResult?.latency || 1000; // 默认1000ms
      const uploadSpeed = speedResult?.uploadSpeed || 0; // 默认0 bytes/s

      // 计算基础分数 (延迟越低越好，上传速度越高越好)
      // 标准化为0-100分范围
      const latencyScore = Math.max(0, 100 - latency / 10);
      const uploadScore = uploadSpeed > 0 ? Math.min(100, uploadSpeed / 10000) : 0;

      // 地理位置加权
      let geoScore = 0;
      if (this.options.enableGeoRouting && this.userGeoLocation && node.country) {
        // 如果用户和节点在同一国家，给予加分
        if (this.userGeoLocation.country === node.country) {
          geoScore = 30;
        }

        // 如果有城市信息且在同一城市，额外加分
        if (this.userGeoLocation.city && node.city && this.userGeoLocation.city === node.city) {
          geoScore += 20;
        }
      }

      // 根据配置的节点权重调整分数
      const weightFactor = node.weight !== undefined ? node.weight : 1;

      // 总分计算（延迟占40%，上传速度占40%，地理位置占20%）
      const totalScore = (latencyScore * 0.4 + uploadScore * 0.4 + geoScore * 0.2) * weightFactor;

      // 更新最佳和次佳节点
      if (totalScore > bestScore) {
        backupNodeId = bestNodeId;
        backupScore = bestScore;
        bestNodeId = nodeId;
        bestScore = totalScore;
      } else if (totalScore > backupScore) {
        backupNodeId = nodeId;
        backupScore = totalScore;
      }
    }

    // 如果找到了新的最佳节点且与当前不同，执行切换
    if (bestNodeId && bestNodeId !== this.bestNodeId) {
      const oldBestNodeId = this.bestNodeId;
      this.bestNodeId = bestNodeId;
      this.backupNodeId = backupNodeId;

      const bestNode = this.nodes.get(bestNodeId);

      this.log(`最佳节点更新: ${bestNode?.name || bestNodeId}`);

      // 触发节点切换事件
      this.eventEmitter.emit('node:changed', {
        from: oldBestNodeId,
        to: bestNodeId,
        reason: 'optimization',
        timestamp: Date.now()
      });
    }
  }

  /**
   * 检测用户地理位置
   */
  private async detectUserGeoLocation(): Promise<void> {
    if (!this.options.enableGeoRouting) {
      return;
    }

    try {
      this.log('检测用户地理位置');

      // 优先使用提供的地理位置API
      if (this.options.geoApiEndpoint) {
        const url = this.options.geoApiKey
          ? `${this.options.geoApiEndpoint}?apiKey=${this.options.geoApiKey}`
          : this.options.geoApiEndpoint;

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`地理位置API请求失败: ${response.status}`);
        }

        const data = await response.json();

        this.userGeoLocation = {
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
          country: data.country,
          city: data.city,
          ip: data.ip,
          timezone: data.timezone,
          isp: data.isp
        };
      }
      // 备选方案：使用免费的IP地理位置API
      else {
        const response = await fetch('https://ipapi.co/json/');

        if (!response.ok) {
          throw new Error(`免费地理位置API请求失败: ${response.status}`);
        }

        const data = await response.json();

        this.userGeoLocation = {
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
          country: data.country_name,
          city: data.city,
          ip: data.ip,
          timezone: data.timezone,
          isp: data.org
        };
      }

      this.log(`地理位置检测完成: ${this.userGeoLocation.country}, ${this.userGeoLocation.city}`);

      // 发射地理位置检测完成事件
      this.eventEmitter.emit('geo:detected', {
        location: this.userGeoLocation,
        timestamp: Date.now()
      });
    } catch (error) {
      this.log(
        `地理位置检测失败: ${error instanceof Error ? error.message : String(error)}`,
        'warn'
      );

      // 设置一个空的地理位置对象
      this.userGeoLocation = {
        latitude: 0,
        longitude: 0
      };
    }
  }

  /**
   * 获取最佳上传端点
   */
  public getBestUploadEndpoint(): string | null {
    if (!this.bestNodeId) {
      return null;
    }

    const bestNode = this.nodes.get(this.bestNodeId);
    if (!bestNode) {
      return null;
    }

    return `${bestNode.url}/upload`;
  }

  /**
   * 获取特定区域的最佳节点
   * @param region 目标区域
   */
  public getBestNodeForRegion(region: string): EdgeNode | null {
    // 找出指定区域内的所有在线节点
    const regionNodes = Array.from(this.nodes.values()).filter(
      node => node.region === region && node.status === 'online'
    );

    if (regionNodes.length === 0) {
      return null;
    }

    // 如果只有一个节点，直接返回
    if (regionNodes.length === 1) {
      return regionNodes[0];
    }

    // 否则，找出延迟最低的节点
    let bestNode = regionNodes[0];
    let bestLatency = this.speedTestResults.get(bestNode.id)?.latency || Infinity;

    for (let i = 1; i < regionNodes.length; i++) {
      const node = regionNodes[i];
      const latency = this.speedTestResults.get(node.id)?.latency || Infinity;

      if (latency < bestLatency) {
        bestNode = node;
        bestLatency = latency;
      }
    }

    return bestNode;
  }

  /**
   * 获取最近的N个节点
   * @param count 需要返回的节点数量
   */
  public getNearestNodes(count: number = 3): EdgeNode[] {
    // 只考虑在线节点
    const onlineNodes = Array.from(this.nodes.values()).filter(node => node.status === 'online');

    if (onlineNodes.length <= count) {
      return onlineNodes;
    }

    // 根据延迟排序
    return onlineNodes
      .sort((a, b) => {
        const latencyA = this.speedTestResults.get(a.id)?.latency || Infinity;
        const latencyB = this.speedTestResults.get(b.id)?.latency || Infinity;
        return latencyA - latencyB;
      })
      .slice(0, count);
  }

  /**
   * 手动切换最佳节点
   * @param nodeId 目标节点ID
   */
  public switchNode(nodeId: string): boolean {
    if (!this.nodes.has(nodeId)) {
      return false;
    }

    const node = this.nodes.get(nodeId)!;
    const oldBestNodeId = this.bestNodeId;

    // 只有在线状态的节点可以切换
    if (node.status !== 'online') {
      this.log(`无法切换到不在线的节点: ${node.name}`, 'warn');
      return false;
    }

    this.bestNodeId = nodeId;

    // 如果原最佳节点状态良好，将其设为备用
    if (oldBestNodeId && oldBestNodeId !== nodeId) {
      const oldBestNode = this.nodes.get(oldBestNodeId);
      if (oldBestNode && oldBestNode.status === 'online') {
        this.backupNodeId = oldBestNodeId;
      }
    }

    this.log(`手动切换节点: ${node.name}`);

    // 触发节点切换事件
    this.eventEmitter.emit('node:switched', {
      from: oldBestNodeId,
      to: nodeId,
      manual: true,
      timestamp: Date.now()
    });

    return true;
  }

  /**
   * 获取当前最佳节点
   */
  public getBestNode(): EdgeNode | null {
    if (!this.bestNodeId) return null;
    return this.nodes.get(this.bestNodeId) || null;
  }

  /**
   * 获取所有节点状态
   */
  public getAllNodeStatus(): Array<{
    id: string;
    name: string;
    status: string;
    region: string;
    latency?: number;
    uploadSpeed?: number;
  }> {
    return Array.from(this.nodes.values()).map(node => {
      const speedData = this.speedTestResults.get(node.id);

      return {
        id: node.id,
        name: node.name,
        status: node.status || 'unknown',
        region: node.region,
        latency: speedData?.latency,
        uploadSpeed: speedData?.uploadSpeed
      };
    });
  }

  /**
   * 重启节点监控
   */
  public restartMonitoring(): void {
    this.stopMonitoring();
    this.startMonitoring();
  }

  /**
   * 检测并更新用户地理位置
   */
  public async refreshGeoLocation(): Promise<void> {
    await this.detectUserGeoLocation();
    if (this.userGeoLocation) {
      // 重新评估最佳节点
      this.findBestNode();
    }
  }

  /**
   * 注册事件处理器
   * @param event 事件名称
   * @param handler 事件处理函数
   */
  public on(event: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.on(event, handler);
  }

  /**
   * 取消注册事件处理器
   * @param event 事件名称
   * @param handler 事件处理函数
   */
  public off(event: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.off(event, handler);
  }

  /**
   * 日志记录
   * @param message 日志消息
   * @param level 日志级别
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.options.enableLogging) return;

    const prefix = '[边缘网络管理器]';

    switch (level) {
      case 'warn':
        console.warn(`${prefix} ${message}`);
        break;
      case 'error':
        console.error(`${prefix} ${message}`);
        break;
      default:
        console.log(`${prefix} ${message}`);
    }

    // 如果有内核，也发送日志事件
    if (this.kernel) {
      this.kernel.emit('log', {
        module: 'edge-network-manager',
        level,
        message,
        timestamp: Date.now()
      });
    }
  }
}
