import { EventEmitter, EventPriority } from '../../../src/core/event-bus';

describe('EventBus', () => {
  let eventBus: EventEmitter;

  beforeEach(() => {
    eventBus = new EventEmitter();
    // 为了测试简单，禁用异步
    eventBus.disableAsync();
  });

  test('应能注册事件监听器', () => {
    const listener = jest.fn();
    eventBus.on('test-event', listener);

    expect(eventBus.hasListeners('test-event')).toBe(true);
  });

  test('应能触发事件并执行监听器', () => {
    const listener = jest.fn();
    const eventData = { test: 'data' };

    eventBus.on('test-event', listener);
    eventBus.emit('test-event', eventData);

    expect(listener).toHaveBeenCalledWith(eventData);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('应能一次性注册事件监听器', () => {
    const listener = jest.fn();

    eventBus.once('test-event', listener);
    eventBus.emit('test-event');
    eventBus.emit('test-event');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('应能移除特定事件监听器', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();

    eventBus.on('test-event', listener1);
    eventBus.on('test-event', listener2);

    eventBus.off('test-event', listener1);
    eventBus.emit('test-event');

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  test('应能移除所有事件监听器', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();

    eventBus.on('test-event-1', listener1);
    eventBus.on('test-event-2', listener2);

    eventBus.off('test-event-1');
    eventBus.off('test-event-2');

    eventBus.emit('test-event-1');
    eventBus.emit('test-event-2');

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  test('应能移除特定事件的所有监听器', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    const listener3 = jest.fn();

    eventBus.on('test-event', listener1);
    eventBus.on('test-event', listener2);
    eventBus.on('other-event', listener3);

    eventBus.off('test-event');

    eventBus.emit('test-event');
    eventBus.emit('other-event');

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
    expect(listener3).toHaveBeenCalledTimes(1);
  });

  test('应支持异步事件处理', async () => {
    // 重新启用异步处理
    eventBus.enableAsync();

    const result = { processed: false };

    const asyncListener = jest.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      result.processed = true;
    });

    eventBus.on('async-event', asyncListener);
    await eventBus.emit('async-event');

    expect(asyncListener).toHaveBeenCalled();
    expect(result.processed).toBe(true);
  });

  test('应支持事件优先级', async () => {
    const result: number[] = [];

    const listener1 = jest.fn().mockImplementation(() => result.push(1));
    const listener2 = jest.fn().mockImplementation(() => result.push(2));
    const listener3 = jest.fn().mockImplementation(() => result.push(3));

    eventBus.on('priority-event', listener1, { priority: EventPriority.LOW }); // 低优先级
    eventBus.on('priority-event', listener2, { priority: EventPriority.HIGH }); // 高优先级
    eventBus.on('priority-event', listener3, { priority: EventPriority.NORMAL }); // 中优先级

    await eventBus.emit('priority-event');

    expect(result).toEqual([2, 3, 1]); // 按优先级顺序执行
  });

  test('应支持带通配符的事件订阅', async () => {
    const wildcardListener = jest.fn();

    eventBus.on('test.*', wildcardListener);

    await eventBus.emit('test.a');
    await eventBus.emit('test.b');
    await eventBus.emit('other');

    expect(wildcardListener).toHaveBeenCalledTimes(2);
  });

  test('错误处理 - 监听器抛出错误不应中断事件流', async () => {
    const errorListener = jest.fn().mockImplementation(() => {
      throw new Error('Test error');
    });

    const normalListener = jest.fn();

    eventBus.on('error-event', errorListener);
    eventBus.on('error-event', normalListener);

    // 不应抛出异常
    expect(() => {
      eventBus.emit('error-event');
    }).not.toThrow();

    expect(errorListener).toHaveBeenCalled();
    expect(normalListener).toHaveBeenCalled();
  });
});
