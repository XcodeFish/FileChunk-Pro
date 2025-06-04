import { EventBusImpl } from '../core/event-bus';

/**
 * 事件总线示例
 *
 * 本示例展示了事件总线的基本用法和高级特性，包括：
 * 1. 基本的事件订阅和发布
 * 2. 一次性事件(once)
 * 3. 事件优先级
 * 4. 通配符订阅
 * 5. 异步事件处理
 */
async function runEventBusExample(): Promise<void> {
  // 创建事件总线实例
  const eventBus = new EventBusImpl();

  console.log('=== 事件总线示例 ===');

  // 1. 基本的事件订阅和发布
  console.log('\n1. 基本的事件订阅和发布:');

  // 订阅事件
  eventBus.on('message', data => {
    console.log(`收到消息: ${data.text}`);
  });

  // 发布事件
  eventBus.emit('message', { text: 'Hello, World!' });

  // 2. 一次性事件
  console.log('\n2. 一次性事件:');

  // 订阅一次性事件
  eventBus.once('one-time-event', data => {
    console.log(`收到一次性事件: ${data.text}`);
  });

  // 发布两次，但只会触发一次
  eventBus.emit('one-time-event', { text: '第一次触发' });
  eventBus.emit('one-time-event', { text: '第二次触发 (不会输出)' });

  // 3. 事件优先级
  console.log('\n3. 事件优先级:');

  // 低优先级订阅
  eventBus.on(
    'prioritized-event',
    data => {
      console.log(`低优先级处理器: ${data.text}`);
    },
    { priority: 1 }
  );

  // 高优先级订阅
  eventBus.on(
    'prioritized-event',
    data => {
      console.log(`高优先级处理器: ${data.text}`);
    },
    { priority: 10 }
  );

  // 中等优先级订阅
  eventBus.on(
    'prioritized-event',
    data => {
      console.log(`中等优先级处理器: ${data.text}`);
    },
    { priority: 5 }
  );

  // 发布事件，将按优先级顺序调用处理器
  eventBus.emit('prioritized-event', { text: '按优先级排序的消息' });

  // 4. 通配符订阅
  console.log('\n4. 通配符订阅:');

  // 使用通配符订阅多个事件
  eventBus.on('user.*', data => {
    console.log(`用户事件: ${data.type}, 用户: ${data.username}`);
  });

  // 发布匹配的事件
  eventBus.emit('user.login', { type: '登录', username: 'alice' });
  eventBus.emit('user.logout', { type: '登出', username: 'bob' });

  // 不匹配的事件不会触发
  eventBus.emit('system.startup', { type: '系统启动' });

  // 5. 异步事件处理
  console.log('\n5. 异步事件处理:');

  // 添加异步处理器
  eventBus.on('async-event', async data => {
    console.log(`开始处理异步事件: ${data.text}`);
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log(`异步处理完成: ${data.text}`);
  });

  // 同步发布 - 不等待结果
  console.log('同步发布:');
  eventBus.emit('async-event', { text: '同步模式' });
  console.log('同步发布后立即执行');

  // 异步发布 - 等待所有处理器完成
  console.log('\n异步发布:');
  await eventBus.emitAsync('async-event', { text: '异步模式' });
  console.log('所有异步处理器已完成');

  // 取消订阅示例
  console.log('\n6. 取消订阅:');

  // 保存订阅ID
  const subId = eventBus.on('cancelable', data => {
    console.log(`这条消息不应该显示: ${data.text}`);
  });

  // 取消订阅
  eventBus.off(subId);

  // 发布事件，但已没有处理器
  eventBus.emit('cancelable', { text: '已取消的事件' });
  console.log('事件已发布，但没有处理器接收');

  // 清理所有订阅
  console.log('\n7. 清理所有订阅:');
  eventBus.clear();
  console.log('所有订阅已清理');

  // 统计和检查
  console.log('\n8. 订阅统计:');

  // 添加一些新的订阅
  eventBus.on('stats.event1', () => {});
  eventBus.on('stats.event2', () => {});
  eventBus.on('stats.event2', () => {});

  // 检查是否有订阅者
  console.log(`有stats.event1订阅者: ${eventBus.hasSubscribers('stats.event1')}`);
  console.log(`有stats.event2订阅者: ${eventBus.hasSubscribers('stats.event2')}`);
  console.log(`有stats.event3订阅者: ${eventBus.hasSubscribers('stats.event3')}`);

  // 获取订阅者数量
  console.log(`stats.event1订阅者数量: ${eventBus.countSubscribers('stats.event1')}`);
  console.log(`stats.event2订阅者数量: ${eventBus.countSubscribers('stats.event2')}`);

  // 获取所有事件名称
  console.log(`所有事件名称: ${eventBus.getEventNames().join(', ')}`);
}

export { runEventBusExample };
