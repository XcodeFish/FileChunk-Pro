import { Observable } from './observable';
import { UploadState } from './reactive-uploader';

/**
 * 响应式上传器接口
 */
export interface ReactiveUploaderInterface {
  /** 状态流 */
  state$: Observable<UploadState>;
  /** 进度流 */
  progress$: Observable<number>;
  /** 状态流 */
  status$: Observable<string>;
  /** 错误流 */
  error$: Observable<Error>;
  /** 完成流 */
  completed$: Observable<any>;
}
