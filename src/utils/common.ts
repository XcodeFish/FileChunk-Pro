/**
 * 空操作函数
 */
export const noop = (): void => {};

/**
 * 延迟指定时间
 * @param ms 毫秒数
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * 判断是否为对象
 * @param value 待检查的值
 */
export const isObject = (value: any): boolean => {
  return value !== null && typeof value === 'object';
};

/**
 * 移除对象中的undefined字段
 * @param obj 原始对象
 */
export const removeUndefined = <T extends Record<string, any>>(obj: T): T => {
  const result = { ...obj };
  Object.keys(result).forEach(key => {
    if (result[key] === undefined) {
      delete result[key];
    }
  });
  return result;
};
