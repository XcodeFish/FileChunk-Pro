import { useState, useEffect, useCallback, useRef } from 'react';
import React from 'react';
import { ReactiveUploader, ReactiveUploaderOptions, UploadState } from '../reactive-uploader';

/**
 * 上传钩子返回值类型
 */
export interface UseFileUploadResult {
  /** 上传状态 */
  state: UploadState;
  /** 上传文件方法 */
  upload: (file: File) => void;
  /** 暂停上传方法 */
  pause: () => void;
  /** 恢复上传方法 */
  resume: () => void;
  /** 取消上传方法 */
  cancel: () => void;
  /** 上传器实例 */
  uploader: ReactiveUploader;
}

/**
 * React文件上传钩子
 * @param options 上传选项
 * @returns 上传状态和控制方法
 */
export function useFileUpload(options: ReactiveUploaderOptions): UseFileUploadResult {
  // 创建并保存上传器引用，确保只创建一次
  const uploaderRef = useRef<ReactiveUploader | null>(null);
  if (!uploaderRef.current) {
    uploaderRef.current = new ReactiveUploader(options);
  }

  // 获取上传器实例
  const uploader = uploaderRef.current;

  // 状态管理
  const [state, setState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    file: null,
    error: null,
    result: null
  });

  // 订阅状态变化
  useEffect(() => {
    // 订阅上传状态
    const subscription = uploader.state$.subscribe((newState: UploadState) => {
      setState((prevState: UploadState) => ({ ...prevState, ...newState }));
    });

    // 清理函数
    return () => {
      subscription.unsubscribe();
    };
  }, [uploader]);

  // 上传文件方法
  const upload = useCallback(
    (file: File) => {
      uploader.upload(file);
    },
    [uploader]
  );

  // 暂停上传方法
  const pause = useCallback(() => {
    uploader.pause();
  }, [uploader]);

  // 恢复上传方法
  const resume = useCallback(() => {
    uploader.resume();
  }, [uploader]);

  // 取消上传方法
  const cancel = useCallback(() => {
    uploader.cancel();
  }, [uploader]);

  // 返回状态和方法
  return {
    state,
    upload,
    pause,
    resume,
    cancel,
    uploader
  };
}

/**
 * 进度追踪钩子
 * @param uploader 上传器实例
 * @returns 当前进度值
 */
export function useUploadProgress(uploader: ReactiveUploader): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const subscription = uploader.progress$.subscribe(setProgress);
    return () => subscription.unsubscribe();
  }, [uploader]);

  return progress;
}

/**
 * 上传状态钩子
 * @param uploader 上传器实例
 * @returns 当前上传状态
 */
export function useUploadStatus(uploader: ReactiveUploader): string {
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    const subscription = uploader.status$.subscribe(setStatus);
    return () => subscription.unsubscribe();
  }, [uploader]);

  return status;
}

/**
 * 上传完成钩子
 * @param uploader 上传器实例
 * @param onComplete 完成回调
 */
export function useUploadComplete(
  uploader: ReactiveUploader,
  onComplete: (result: any) => void
): void {
  useEffect(() => {
    const subscription = uploader.completed$.subscribe(onComplete);
    return () => subscription.unsubscribe();
  }, [uploader, onComplete]);
}

/**
 * 上传错误钩子
 * @param uploader 上传器实例
 * @param onError 错误回调
 */
export function useUploadError(uploader: ReactiveUploader, onError: (error: Error) => void): void {
  useEffect(() => {
    const subscription = uploader.error$.subscribe(onError);
    return () => subscription.unsubscribe();
  }, [uploader, onError]);
}

/**
 * 上传错误状态接口
 */
export interface UploadErrorState {
  hasError: boolean;
  error: Error | null;
  info: React.ErrorInfo | null;
}

/**
 * 上传错误边界钩子
 * @returns 错误状态和重置方法
 */
export function useUploadErrorBoundary() {
  const [errorState, setErrorState] = useState<UploadErrorState>({
    hasError: false,
    error: null,
    info: null
  });

  const resetError = useCallback(() => {
    setErrorState({
      hasError: false,
      error: null,
      info: null
    });
  }, []);

  const handleError = useCallback((error: Error, info: React.ErrorInfo) => {
    setErrorState({
      hasError: true,
      error,
      info
    });
  }, []);

  return {
    errorState,
    resetError,
    handleError
  };
}

/**
 * 上传错误边界HOC
 * @param Component 需要错误边界的组件
 * @param FallbackComponent 备用UI组件
 */
export function withUploadErrorBoundary<P extends object>(
  _Component: React.ComponentType<P>,
  _FallbackComponent: React.ComponentType<{ error: Error | null; resetError: () => void }>
): React.FC<P> {
  return (_props: P) => {
    const { errorState, handleError } = useUploadErrorBoundary();

    if (errorState.hasError) {
      // 在实际的React环境中返回JSX，此处返回null
      // return <FallbackComponent error={errorState.error} resetError={resetError} />;
      return null as any;
    }

    try {
      // 在实际的React环境中返回JSX，此处返回null
      // return <Component {...props} />;
      return null as any;
    } catch (error) {
      if (error instanceof Error) {
        handleError(error, { componentStack: '' });
      }
      // 在实际的React环境中返回JSX，此处返回null
      // return <FallbackComponent error={error instanceof Error ? error : null} resetError={resetError} />;
      return null as any;
    }
  };
}

/**
 * 创建上传错误边界组件
 * @param FallbackComponent 备用UI组件
 */
export function createUploadErrorBoundary(
  _FallbackComponent: React.ComponentType<{ error: Error | null; resetError: () => void }>
) {
  return class UploadErrorBoundary extends React.Component<
    { children: React.ReactNode },
    UploadErrorState
  > {
    constructor(props: { children: React.ReactNode }) {
      super(props);
      this.state = {
        hasError: false,
        error: null,
        info: null
      };
      this.resetError = this.resetError.bind(this);
    }

    static getDerivedStateFromError(error: Error) {
      return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
      this.setState({ info });
      // 这里可以记录错误到错误报告服务
    }

    resetError() {
      this.setState({
        hasError: false,
        error: null,
        info: null
      });
    }

    render() {
      if (this.state.hasError) {
        // 在实际的React环境中返回JSX，此处返回null
        // return <FallbackComponent error={this.state.error} resetError={this.resetError} />;
        return null;
      }

      return this.props.children;
    }
  };
}

/**
 * 带有重试功能的上传组件错误边界
 * @example
 * ```tsx
 * <RetryableUploadErrorBoundary>
 *   <FileUploader />
 * </RetryableUploadErrorBoundary>
 * ```
 */
export const RetryableUploadErrorBoundary = createUploadErrorBoundary(
  ({ error: _error, resetError: _resetError }: { error: Error | null; resetError: () => void }) => {
    // 在实际的React环境中返回JSX，此处返回注释示例
    /*
    return (
      <div className="upload-error">
        <h3>上传过程中出现错误</h3>
        <p>{error?.message || '未知错误'}</p>
        <button onClick={resetError}>重试上传</button>
      </div>
    );
    */
    return null as any;
  }
);
