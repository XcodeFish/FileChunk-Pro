import { EventBusImpl } from '../core/event-bus';

/**
 * 事件总线使用示例
 */
// 创建事件总线实例
const eventBus = new EventBusImpl();

// 配置事件历史记录
eventBus.configureHistory({
  enabled: true,
  maxEvents: 50,
  includeData: true
});

console.log('===== 基础订阅和发布 =====');

// 基础订阅和发布
const subId = eventBus.on('user.login', data => {
  console.log('用户登录事件:', data);
});

eventBus.emit('user.login', { userId: 123, username: '张三' });

// 一次性订阅
console.log('\n===== 一次性订阅 =====');
eventBus.once('user.logout', data => {
  console.log('用户登出事件(一次性):', data);
});

// 发布两次，第二次不应触发
eventBus.emit('user.logout', { userId: 123, username: '张三' });
eventBus.emit('user.logout', { userId: 123, username: '张三' });

// 通配符订阅
console.log('\n===== 通配符订阅 =====');
eventBus.on('user.*', data => {
  console.log('用户相关事件(通配符):', data);
});

eventBus.emit('user.register', { userId: 456, username: '李四' });

// 优先级测试
console.log('\n===== 优先级测试 =====');
eventBus.on('priority.test', () => console.log('低优先级处理器'), { priority: 1 });
eventBus.on('priority.test', () => console.log('高优先级处理器'), { priority: 10 });
eventBus.on('priority.test', () => console.log('中优先级处理器'), { priority: 5 });

eventBus.emit('priority.test', null);

// 异步事件测试
console.log('\n===== 异步事件测试 =====');
eventBus.on('async.test', async data => {
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log('异步事件处理完成:', data);
});

// 使用异步模式发布
(async () => {
  console.log('开始异步事件发布');
  await eventBus.emitAsync('async.test', { value: '异步数据' });
  console.log('异步事件发布完成');

  // 事件历史与回放测试
  console.log('\n===== 事件历史与回放测试 =====');

  // 查看历史记录
  const history = eventBus.getHistory();
  console.log('事件历史记录数:', history.length);

  // 过滤历史记录
  const userEvents = eventBus.getHistory('user.*');
  console.log(
    '用户事件历史记录:',
    userEvents.map(h => h.eventName)
  );

  // 重放历史事件
  console.log('重放用户事件:');
  const replayListener = eventBus.on('user.*', data => {
    console.log('重放的用户事件:', data);
  });

  const replayCount = await eventBus.replayHistory('user.*');
  console.log(`重放了 ${replayCount} 个事件`);

  // 移除重放监听器
  eventBus.off(replayListener);

  // 按订阅者分组管理测试
  console.log('\n===== 订阅者分组管理测试 =====');
  const subscriberId = 'test-subscriber';
  eventBus.on('group.event1', data => console.log('组事件1:', data), { subscriberId });
  eventBus.on('group.event2', data => console.log('组事件2:', data), { subscriberId });

  console.log(
    '取消订阅前订阅者数:',
    eventBus.countSubscribers('group.event1') + eventBus.countSubscribers('group.event2')
  );

  // 通过订阅者ID取消所有订阅
  const cancelledCount = eventBus.offBySubscriber(subscriberId);
  console.log(`取消了 ${cancelledCount} 个订阅`);
  console.log(
    '取消订阅后订阅者数:',
    eventBus.countSubscribers('group.event1') + eventBus.countSubscribers('group.event2')
  );

  // 取消最开始的订阅
  console.log('\n===== 取消订阅测试 =====');
  console.log('取消前user.login订阅者数:', eventBus.countSubscribers('user.login'));
  eventBus.off(subId);
  console.log('取消后user.login订阅者数:', eventBus.countSubscribers('user.login'));

  // 最后清理
  console.log('\n===== 清理测试 =====');
  console.log('清空前事件名称:', eventBus.getEventNames());
  eventBus.clear();
  console.log('清空后事件名称:', eventBus.getEventNames());

  // 链式调用示例
  console.log('\n===== 链式调用示例 =====');
  // 配置历史记录并注册事件监听器
  eventBus
    .configureHistory({ enabled: true })
    .on('chain.test', data => console.log('链式调用事件:', data));

  // 发布事件
  eventBus.emit('chain.test', { message: '链式API工作正常' });
})();
