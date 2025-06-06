import { noop } from '../utils';

/**
 * 观察者接口定义
 */
export interface Observer<T> {
  next: (value: T) => void;
  error: (err: any) => void;
  complete: () => void;
}

/**
 * 订阅接口定义
 */
export interface Subscription {
  unsubscribe: () => void;
  closed: boolean;
}

/**
 * 操作符函数类型
 */
export type OperatorFunction<T, R> = (source: Observable<T>) => Observable<R>;

/**
 * 可观察对象基础实现
 */
export class Observable<T> {
  /**
   * 构造函数
   * @param _subscribe 订阅函数
   */
  constructor(private _subscribe: (observer: Observer<T>) => (() => void) | Subscription | void) {}

  /**
   * 订阅当前Observable
   * @param observerOrNext 观察者或next函数
   * @param error 错误处理函数
   * @param complete 完成处理函数
   */
  public subscribe(
    observerOrNext?: Partial<Observer<T>> | ((value: T) => void),
    error?: (error: any) => void,
    complete?: () => void
  ): Subscription {
    const observer: Observer<T> =
      typeof observerOrNext === 'function'
        ? { next: observerOrNext, error: error || noop, complete: complete || noop }
        : {
            next: observerOrNext?.next || noop,
            error: observerOrNext?.error || error || noop,
            complete: observerOrNext?.complete || complete || noop
          };

    let closed = false;
    let cleanup: (() => void) | void;

    try {
      // 调用订阅函数并保存清理函数
      const teardown = this._subscribe(observer);

      if (teardown && typeof teardown === 'object' && 'unsubscribe' in teardown) {
        cleanup = teardown.unsubscribe.bind(teardown);
      } else if (typeof teardown === 'function') {
        cleanup = teardown;
      }
    } catch (err) {
      observer.error(err);
      closed = true;
    }

    // 返回订阅对象
    return {
      unsubscribe: () => {
        if (closed) return;
        closed = true;
        if (cleanup) cleanup();
      },
      get closed() {
        return closed;
      }
    };
  }

  /**
   * 映射操作符 - 转换值
   * @param project 映射函数
   */
  public map<R>(project: (value: T) => R): Observable<R> {
    return new Observable<R>(observer => {
      const subscription = this.subscribe({
        next: value => {
          try {
            const result = project(value);
            observer.next(result);
          } catch (err) {
            observer.error(err);
          }
        },
        error: err => observer.error(err),
        complete: () => observer.complete()
      });
      return subscription;
    });
  }

  /**
   * 过滤操作符
   * @param predicate 过滤函数
   */
  public filter(predicate: (value: T) => boolean): Observable<T> {
    return new Observable<T>(observer => {
      const subscription = this.subscribe({
        next: value => {
          try {
            if (predicate(value)) {
              observer.next(value);
            }
          } catch (err) {
            observer.error(err);
          }
        },
        error: err => observer.error(err),
        complete: () => observer.complete()
      });
      return subscription;
    });
  }

  /**
   * 转换为只发出不同值的Observable
   */
  public distinctUntilChanged(compare?: (a: T, b: T) => boolean): Observable<T> {
    const defaultCompare = (a: T, b: T) => a === b;
    const comparator = compare || defaultCompare;

    return new Observable<T>(observer => {
      let previousValue: T | undefined;
      let firstValue = true;

      const subscription = this.subscribe({
        next: value => {
          try {
            if (firstValue || !comparator(previousValue as T, value)) {
              firstValue = false;
              previousValue = value;
              observer.next(value);
            }
          } catch (err) {
            observer.error(err);
          }
        },
        error: err => observer.error(err),
        complete: () => observer.complete()
      });

      return subscription;
    });
  }

  /**
   * 合并多个Observable
   * @param observables 要合并的Observables
   */
  public static merge<T>(...observables: Observable<T>[]): Observable<T> {
    return new Observable<T>(observer => {
      const subscriptions: Subscription[] = [];
      let completed = 0;

      function checkComplete() {
        if (completed === observables.length) {
          observer.complete();
        }
      }

      observables.forEach(obs => {
        const subscription = obs.subscribe({
          next: value => observer.next(value),
          error: err => observer.error(err),
          complete: () => {
            completed++;
            checkComplete();
          }
        });
        subscriptions.push(subscription);
      });

      return {
        unsubscribe: () => {
          subscriptions.forEach(sub => sub.unsubscribe());
        },
        closed: false
      };
    });
  }

  /**
   * 将Observable应用一系列操作符
   * @param operators 操作符数组
   */
  public pipe<R>(...operators: OperatorFunction<any, any>[]): Observable<R> {
    if (operators.length === 0) {
      return this as unknown as Observable<R>;
    }

    return operators.reduce((prev, fn) => fn(prev), this as Observable<any>) as Observable<R>;
  }
}

/**
 * 行为主题 - 保持最新值并在订阅时立即发出
 */
export class BehaviorSubject<T> extends Observable<T> {
  private _value: T;
  private observers: Set<Observer<T>> = new Set();

  constructor(initialValue: T) {
    super(observer => {
      this.observers.add(observer);

      // 立即发出当前值
      observer.next(this._value);

      return {
        unsubscribe: () => {
          this.observers.delete(observer);
        },
        closed: false
      };
    });

    this._value = initialValue;
  }

  /**
   * 获取当前值
   */
  public get value(): T {
    return this._value;
  }

  /**
   * 发出新值
   * @param value 发出的值
   */
  public next(value: T): void {
    this._value = value;
    this.observers.forEach(observer => {
      try {
        observer.next(value);
      } catch (err) {
        console.error('BehaviorSubject observer error:', err);
      }
    });
  }

  /**
   * 发出错误
   * @param err 错误对象
   */
  public error(err: any): void {
    this.observers.forEach(observer => {
      try {
        observer.error(err);
      } catch (error) {
        console.error('BehaviorSubject observer error:', error);
      }
    });
    this.observers.clear();
  }

  /**
   * 完成主题
   */
  public complete(): void {
    this.observers.forEach(observer => {
      try {
        observer.complete();
      } catch (err) {
        console.error('BehaviorSubject observer error:', err);
      }
    });
    this.observers.clear();
  }

  /**
   * 获取可观察对象视图
   */
  public asObservable(): Observable<T> {
    return new Observable<T>(observer => {
      const subscription = this.subscribe(observer);
      return subscription;
    });
  }
}

/**
 * 创建一个fromEvent Observable
 * @param target 目标对象
 * @param eventName 事件名称
 */
export function fromEvent<T = any>(target: any, eventName: string): Observable<T> {
  return new Observable<T>(observer => {
    const handler = (event: T) => {
      observer.next(event);
    };

    // 添加事件监听
    target.addEventListener(eventName, handler);

    // 返回清理函数
    return {
      unsubscribe: () => {
        target.removeEventListener(eventName, handler);
      },
      closed: false
    };
  });
}

/**
 * 创建一个fromPromise Observable
 * @param promise Promise对象
 */
export function fromPromise<T>(promise: Promise<T>): Observable<T> {
  return new Observable<T>(observer => {
    promise
      .then(value => {
        observer.next(value);
        observer.complete();
      })
      .catch(err => {
        observer.error(err);
      });

    // 返回一个空的清理函数
    return {
      unsubscribe: () => {},
      closed: false
    };
  });
}

/**
 * 创建一个of Observable
 * @param values 要发出的值
 */
export function of<T>(...values: T[]): Observable<T> {
  return new Observable<T>(observer => {
    values.forEach(value => observer.next(value));
    observer.complete();
    return {
      unsubscribe: () => {},
      closed: false
    };
  });
}
