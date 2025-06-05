/**
 * FileChunk Pro - 主入口文件
 *
 * 导出所有公共API，为使用者提供统一的入口点。
 */

// 导出核心模块
export * from './core';

// 导出Workers模块
export * from './workers';

// 导出其他功能模块
// TODO: 随着项目发展，添加更多模块导出

// 导出平台适配
// export * from './platforms';

// 导出工具函数
// export * from './utils';

// 导出类型定义
// export * from './types';

// 版本信息
export const VERSION = '0.1.0';
