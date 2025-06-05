/**
 * FileChunk Pro - 核心模块
 *
 * 导出所有核心功能组件，包括微内核、事件总线和模块基类。
 */

// 导出事件总线
export {
  EventEmitter,
  EventPriority,
  type EventHandler,
  type EventSubscriptionOptions
} from './event-bus';

// TODO: 导出其他核心组件，如微内核、模块基类等
// export { Kernel } from './kernel';
// export { ModuleBase } from './module-base';
