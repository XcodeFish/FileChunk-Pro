import { ConcurrencyManager } from '../../../../src/modules/transport/concurrency-manager';

describe('ConcurrencyManager', () => {
  let concurrencyManager: ConcurrencyManager;

  beforeEach(() => {
    concurrencyManager = new ConcurrencyManager({
      initialConcurrency: 3,
      minConcurrency: 1,
      maxConcurrency: 6,
      adaptationThreshold: 0.5 // 50%成功/失败率阈值
    });
  });

  test('应正确初始化并发管理器', () => {
    expect(concurrencyManager.getCurrentConcurrency()).toBe(3);
  });

  test('应能添加任务并运行', async () => {
    const mockTask = jest.fn().mockResolvedValue('result');

    const result = await concurrencyManager.addTask(mockTask);

    expect(mockTask).toHaveBeenCalled();
    expect(result).toBe('result');
  });

  test('应能控制并发任务数量', async () => {
    // 创建一个会延迟的任务
    const delayedTask = () => new Promise(resolve => setTimeout(() => resolve(true), 50));

    // 添加超过当前并发数的任务
    const tasks = Array(5)
      .fill(null)
      .map(() => concurrencyManager.addTask(delayedTask));

    // 验证当前运行的任务数符合并发限制
    expect(concurrencyManager.getRunningTaskCount()).toBeLessThanOrEqual(3);

    // 等待所有任务完成
    await Promise.all(tasks);

    // 所有任务应该全部完成
    expect(concurrencyManager.getRunningTaskCount()).toBe(0);
  });

  test('应根据成功率增加并发数', async () => {
    // 连续添加成功任务
    for (let i = 0; i < 10; i++) {
      await concurrencyManager.addTask(() => Promise.resolve(true));
    }

    // 成功率高，并发数应该增加
    expect(concurrencyManager.getCurrentConcurrency()).toBeGreaterThan(3);
  });

  test('应根据失败率减少并发数', async () => {
    // 连续添加失败任务
    for (let i = 0; i < 10; i++) {
      try {
        await concurrencyManager.addTask(() => Promise.reject(new Error('test error')));
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        // 捕获错误继续测试
      }
    }

    // 失败率高，并发数应该减少
    expect(concurrencyManager.getCurrentConcurrency()).toBeLessThan(3);
  });

  test('应不会超过最大并发限制', async () => {
    // 连续添加多个成功任务
    for (let i = 0; i < 20; i++) {
      await concurrencyManager.addTask(() => Promise.resolve(true));
    }

    // 即使成功率很高，也不应超过最大限制
    expect(concurrencyManager.getCurrentConcurrency()).toBeLessThanOrEqual(6);
  });

  test('应不会低于最小并发限制', async () => {
    // 连续添加多个失败任务
    for (let i = 0; i < 20; i++) {
      try {
        await concurrencyManager.addTask(() => Promise.reject(new Error('test error')));
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        // 捕获错误继续测试
      }
    }

    // 即使失败率很高，也不应低于最小限制
    expect(concurrencyManager.getCurrentConcurrency()).toBeGreaterThanOrEqual(1);
  });

  test('应支持任务优先级', async () => {
    const results: number[] = [];

    // 添加低优先级任务
    concurrencyManager.addTask(
      () => {
        results.push(3);
        return Promise.resolve(true);
      },
      { priority: 10 }
    );

    // 添加高优先级任务
    concurrencyManager.addTask(
      () => {
        results.push(1);
        return Promise.resolve(true);
      },
      { priority: 1 }
    );

    // 添加中优先级任务
    concurrencyManager.addTask(
      () => {
        results.push(2);
        return Promise.resolve(true);
      },
      { priority: 5 }
    );

    // 等待所有任务完成
    await new Promise(resolve => setTimeout(resolve, 100));

    // 任务应该按优先级顺序执行
    expect(results[0]).toBe(1);
    expect(results[1]).toBe(2);
    expect(results[2]).toBe(3);
  });

  test('应能取消所有任务', async () => {
    // 添加几个延迟任务
    const tasks = Array(5)
      .fill(null)
      .map(() =>
        concurrencyManager.addTask(() => new Promise(resolve => setTimeout(resolve, 100)))
      );

    // 取消所有任务
    concurrencyManager.cancelAllTasks();

    // 所有任务应该都是rejected
    for (const task of tasks) {
      try {
        await task;
        fail('Task should have been cancelled');
      } catch (error) {
        expect(error.message).toContain('cancelled');
      }
    }
  });
});
