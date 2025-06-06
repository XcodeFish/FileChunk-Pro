/**
 * 响应式操作符
 */
import { Observable, OperatorFunction } from './observable';

/**
 * map操作符 - 转换值
 * @param project 映射函数
 * @returns 操作符函数
 */
export function map<T, R>(project: (value: T) => R): OperatorFunction<T, R> {
  return (source: Observable<T>): Observable<R> => {
    return source.map(project);
  };
}

/**
 * filter操作符 - 过滤值
 * @param predicate 过滤条件函数
 * @returns 操作符函数
 */
export function filter<T>(predicate: (value: T) => boolean): OperatorFunction<T, T> {
  return (source: Observable<T>): Observable<T> => {
    return source.filter(predicate);
  };
}

/**
 * distinctUntilChanged操作符 - 仅在值变化时发出
 * @param compare 比较函数
 * @returns 操作符函数
 */
export function distinctUntilChanged<T>(compare?: (a: T, b: T) => boolean): OperatorFunction<T, T> {
  return (source: Observable<T>): Observable<T> => {
    return source.distinctUntilChanged(compare);
  };
}

/**
 * tap操作符 - 执行副作用但不修改值
 * @param observer 副作用函数
 * @returns 操作符函数
 */
export function tap<T>(observer: (value: T) => void): OperatorFunction<T, T> {
  return (source: Observable<T>): Observable<T> => {
    return new Observable<T>(obs => {
      const subscription = source.subscribe({
        next: value => {
          try {
            observer(value);
            obs.next(value);
          } catch (err) {
            obs.error(err);
          }
        },
        error: err => obs.error(err),
        complete: () => obs.complete()
      });
      return subscription;
    });
  };
}

/**
 * debounceTime操作符 - 在指定时间内无活动才发出最新值
 * @param time 等待时间(ms)
 * @returns 操作符函数
 */
export function debounceTime<T>(time: number): OperatorFunction<T, T> {
  return (source: Observable<T>): Observable<T> => {
    return new Observable<T>(observer => {
      let timeout: any;
      let lastValue: T | undefined = undefined;
      let hasValue = false;

      const subscription = source.subscribe({
        next: value => {
          hasValue = true;
          lastValue = value;

          if (timeout) {
            clearTimeout(timeout);
          }

          timeout = setTimeout(() => {
            if (hasValue) {
              observer.next(lastValue as T);
              hasValue = false;
            }
          }, time);
        },
        error: err => {
          if (timeout) {
            clearTimeout(timeout);
          }
          observer.error(err);
        },
        complete: () => {
          if (timeout) {
            clearTimeout(timeout);
          }
          if (hasValue) {
            observer.next(lastValue as T);
          }
          observer.complete();
        }
      });

      return {
        unsubscribe: () => {
          if (timeout) {
            clearTimeout(timeout);
          }
          subscription.unsubscribe();
        },
        closed: false
      };
    });
  };
}

/**
 * throttleTime操作符 - 以固定速率限制发射值
 * @param time 节流时间(ms)
 * @returns 操作符函数
 */
export function throttleTime<T>(time: number): OperatorFunction<T, T> {
  return (source: Observable<T>): Observable<T> => {
    return new Observable<T>(observer => {
      let lastTime = 0;

      const subscription = source.subscribe({
        next: value => {
          const now = Date.now();
          if (now - lastTime >= time) {
            lastTime = now;
            observer.next(value);
          }
        },
        error: err => observer.error(err),
        complete: () => observer.complete()
      });

      return subscription;
    });
  };
}

/**
 * take操作符 - 仅取前n个值
 * @param count 要取的值的数量
 * @returns 操作符函数
 */
export function take<T>(count: number): OperatorFunction<T, T> {
  return (source: Observable<T>): Observable<T> => {
    return new Observable<T>(observer => {
      let taken = 0;

      const subscription = source.subscribe({
        next: value => {
          if (taken < count) {
            taken++;
            observer.next(value);

            if (taken === count) {
              observer.complete();
              subscription.unsubscribe();
            }
          }
        },
        error: err => observer.error(err),
        complete: () => observer.complete()
      });

      return subscription;
    });
  };
}

/**
 * takeUntil操作符 - 直到另一个Observable发出值才停止
 * @param notifier 通知Observable
 * @returns 操作符函数
 */
export function takeUntil<T>(notifier: Observable<any>): OperatorFunction<T, T> {
  return (source: Observable<T>): Observable<T> => {
    return new Observable<T>(observer => {
      const sourceSubscription = source.subscribe({
        next: value => observer.next(value),
        error: err => observer.error(err),
        complete: () => observer.complete()
      });

      const notifierSubscription = notifier.subscribe({
        next: () => {
          observer.complete();
          sourceSubscription.unsubscribe();
          notifierSubscription.unsubscribe();
        },
        error: err => observer.error(err)
      });

      return {
        unsubscribe: () => {
          sourceSubscription.unsubscribe();
          notifierSubscription.unsubscribe();
        },
        closed: false
      };
    });
  };
}

/**
 * catchError操作符 - 捕获错误并返回新的Observable
 * @param fn 错误处理函数
 * @returns 操作符函数
 */
export function catchError<T, R>(
  fn: (err: any, caught: Observable<T>) => Observable<R>
): OperatorFunction<T, T | R> {
  return (source: Observable<T>): Observable<T | R> => {
    return new Observable<T | R>(observer => {
      const subscription = source.subscribe({
        next: value => observer.next(value),
        error: err => {
          try {
            const result = fn(err, source);
            result.subscribe(observer);
          } catch (error) {
            observer.error(error);
          }
        },
        complete: () => observer.complete()
      });

      return subscription;
    });
  };
}

/**
 * retry操作符 - 出错时自动重试
 * @param count 重试次数
 * @returns 操作符函数
 */
export function retry<T>(count: number = 1): OperatorFunction<T, T> {
  return (source: Observable<T>): Observable<T> => {
    return new Observable<T>(observer => {
      let subscription: any;
      let retries = 0;

      function subscribe() {
        subscription = source.subscribe({
          next: value => observer.next(value),
          error: err => {
            if (retries < count) {
              retries++;
              if (subscription) {
                subscription.unsubscribe();
              }
              subscribe();
            } else {
              observer.error(err);
            }
          },
          complete: () => observer.complete()
        });
      }

      subscribe();

      return {
        unsubscribe: () => {
          if (subscription) {
            subscription.unsubscribe();
          }
        },
        closed: false
      };
    });
  };
}

/**
 * switchMap操作符 - 将每个源值映射到Observable，并仅输出最新Observable的值
 * @param project 映射函数
 * @returns 操作符函数
 */
export function switchMap<T, R>(project: (value: T) => Observable<R>): OperatorFunction<T, R> {
  return (source: Observable<T>): Observable<R> => {
    return new Observable<R>(observer => {
      let innerSubscription: any = null;
      let hasCompleted = false;

      const outerSubscription = source.subscribe({
        next: value => {
          try {
            // 取消上一个内部订阅
            if (innerSubscription) {
              innerSubscription.unsubscribe();
              innerSubscription = null;
            }

            // 创建新的内部Observable
            const innerObservable = project(value);

            // 订阅新的内部Observable
            innerSubscription = innerObservable.subscribe({
              next: innerValue => observer.next(innerValue),
              error: err => observer.error(err),
              complete: () => {
                innerSubscription = null;
                // 如果外部已完成，并且当前没有活动的内部订阅，通知完成
                if (hasCompleted) {
                  observer.complete();
                }
              }
            });
          } catch (err) {
            observer.error(err);
          }
        },
        error: err => observer.error(err),
        complete: () => {
          hasCompleted = true;
          // 只有在没有活动的内部订阅时才完成
          if (!innerSubscription) {
            observer.complete();
          }
        }
      });

      return {
        unsubscribe: () => {
          if (innerSubscription) {
            innerSubscription.unsubscribe();
          }
          outerSubscription.unsubscribe();
        },
        closed: false
      };
    });
  };
}

/**
 * startWith操作符 - 在源Observable前先发出指定的值
 * @param value 初始值
 * @returns 操作符函数
 */
export function startWith<T>(value: T): OperatorFunction<T, T> {
  return (source: Observable<T>): Observable<T> => {
    return new Observable<T>(observer => {
      // 首先发出初始值
      observer.next(value);

      // 然后订阅源Observable
      const subscription = source.subscribe(observer);

      return subscription;
    });
  };
}
