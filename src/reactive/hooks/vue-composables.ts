import { ref, reactive, onMounted, onUnmounted, watch } from 'vue';
import { ReactiveUploader, ReactiveUploaderOptions, UploadState } from '../reactive-uploader';
import { Subscription } from '../observable';
import type { ReactiveUploaderInterface } from '../types';

/**
 * 上传器接口，用于解决类型不兼容问题
 */
export interface UploaderWrapper extends ReactiveUploaderInterface {
  upload: (file: File) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

/**
 * 上传器返回值接口
 */
export interface UseUploaderResult {
  /** 上传状态 */
  state: UploadState;
  /** 上传进度 */
  progress: number;
  /** 上传状态 */
  status: string;
  /** 错误信息 */
  error: Error | null;
  /** 结果数据 */
  result: any;
  /** 是否正在上传 */
  isUploading: boolean;
  /** 是否已完成 */
  isCompleted: boolean;
  /** 是否已暂停 */
  isPaused: boolean;
  /** 是否出错 */
  isError: boolean;
  /** 上传文件方法 */
  upload: (file: File) => void;
  /** 暂停上传方法 */
  pause: () => void;
  /** 恢复上传方法 */
  resume: () => void;
  /** 取消上传方法 */
  cancel: () => void;
  /** 上传器实例 */
  uploader: UploaderWrapper;
}

/**
 * Vue文件上传组合函数
 * @param options 上传选项
 * @returns 上传状态和控制方法
 */
export function useUploader(options: ReactiveUploaderOptions): UseUploaderResult {
  const uploader = ref<UploaderWrapper>(
    new ReactiveUploader(options) as unknown as UploaderWrapper
  );
  const state = reactive<UploadState>({
    status: 'idle',
    progress: 0,
    file: null,
    error: null,
    result: null
  });
  const progress = ref(0);
  const status = ref('idle');
  const error = ref<Error | null>(null);
  const result = ref<any>(null);

  // 计算属性
  const isUploading = ref(false);
  const isCompleted = ref(false);
  const isPaused = ref(false);
  const isError = ref(false);

  // 订阅
  let subscriptions: Subscription[] = [];

  onMounted(() => {
    // 状态订阅
    subscriptions.push(
      uploader.value.state$.subscribe(newState => {
        Object.assign(state, newState);

        // 更新引用类型
        progress.value = newState.progress;
        status.value = newState.status;
        error.value = newState.error;
        result.value = newState.result;

        // 更新计算状态
        isUploading.value = newState.status === 'uploading';
        isCompleted.value = newState.status === 'completed';
        isPaused.value = newState.status === 'paused';
        isError.value = newState.status === 'error';
      })
    );
  });

  onUnmounted(() => {
    // 清理订阅
    subscriptions.forEach(sub => sub.unsubscribe());
    subscriptions = [];
  });

  // 上传方法
  const upload = (file: File) => {
    uploader.value.upload(file);
  };

  // 暂停方法
  const pause = () => {
    uploader.value.pause();
  };

  // 恢复方法
  const resume = () => {
    uploader.value.resume();
  };

  // 取消方法
  const cancel = () => {
    uploader.value.cancel();
  };

  return {
    state,
    progress: progress.value,
    status: status.value,
    error: error.value,
    result: result.value,
    isUploading: isUploading.value,
    isCompleted: isCompleted.value,
    isPaused: isPaused.value,
    isError: isError.value,
    upload,
    pause,
    resume,
    cancel,
    uploader: uploader.value as UploaderWrapper
  };
}

/**
 * 拖放上传钩子
 * @param uploader 上传器实例
 * @param elementRef 拖放区域元素引用
 * @returns 拖放状态和处理器
 */
export function useDragUpload(uploader: UploaderWrapper, elementRef: any) {
  const isDragging = ref(false);
  const dragCounter = ref(0);

  // 处理拖拽经过事件
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // 处理拖拽离开事件
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.value--;
    if (dragCounter.value === 0) {
      isDragging.value = false;
    }
  };

  // 处理拖拽进入事件
  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.value++;
    isDragging.value = true;
  };

  // 处理拖放事件
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.value = false;
    dragCounter.value = 0;

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    uploader.upload(file);
  };

  // 监听元素引用的变化
  watch(
    () => elementRef.value,
    (el: any) => {
      if (el) {
        el.addEventListener('dragover', handleDragOver);
        el.addEventListener('dragleave', handleDragLeave);
        el.addEventListener('dragenter', handleDragEnter);
        el.addEventListener('drop', handleDrop);
      }
    }
  );

  // 清理事件监听
  onUnmounted(() => {
    if (elementRef.value) {
      elementRef.value.removeEventListener('dragover', handleDragOver);
      elementRef.value.removeEventListener('dragleave', handleDragLeave);
      elementRef.value.removeEventListener('dragenter', handleDragEnter);
      elementRef.value.removeEventListener('drop', handleDrop);
    }
  });

  return {
    isDragging
  };
}

/**
 * Vue文件选择组合函数
 */
export function useFileSelect() {
  const fileInput = ref<HTMLInputElement | null>(null);
  const selectedFile = ref<File | null>(null);
  const selectedFiles = ref<File[]>([]);

  // 创建文件输入元素
  const createFileInput = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';

    input.onchange = () => {
      if (input.files && input.files.length > 0) {
        selectedFile.value = input.files[0];
        selectedFiles.value = Array.from(input.files);
      }
    };

    fileInput.value = input;
    document.body.appendChild(input);
  };

  // 打开文件选择器
  const openFileSelector = () => {
    if (!fileInput.value) {
      createFileInput();
    }
    fileInput.value?.click();
  };

  // 清理
  onUnmounted(() => {
    if (fileInput.value) {
      document.body.removeChild(fileInput.value);
    }
  });

  return {
    selectedFile,
    selectedFiles,
    openFileSelector
  };
}

/**
 * 自定义Vue上传指令类型
 */
export type UploadDirective = {
  mounted(el: HTMLElement, binding: { value: ReactiveUploader }): void;
  unmounted(el: HTMLElement): void;
};

/**
 * 拖放上传指令 - v-drag-upload
 * @example
 * ```html
 * <div v-drag-upload="uploader" class="drop-zone">拖放文件到此处上传</div>
 * ```
 */
export const vDragUpload: UploadDirective = {
  mounted(el: HTMLElement, binding: { value: ReactiveUploader }) {
    const uploader = binding.value;
    if (!uploader) return;

    const dragCounter = { value: 0 };

    function handleDragOver(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('drag-over');
    }

    function handleDragEnter(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.value++;
      el.classList.add('drag-over');
    }

    function handleDragLeave(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.value--;
      if (dragCounter.value === 0) {
        el.classList.remove('drag-over');
      }
    }

    function handleDrop(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('drag-over');
      dragCounter.value = 0;

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      uploader.upload(file);
    }

    // 存储事件处理器以便移除
    (el as any).__drag_handlers__ = {
      dragover: handleDragOver,
      dragenter: handleDragEnter,
      dragleave: handleDragLeave,
      drop: handleDrop
    };

    // 添加事件监听
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('dragenter', handleDragEnter);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('drop', handleDrop);
  },
  unmounted(el: HTMLElement) {
    // 移除事件监听
    const handlers = (el as any).__drag_handlers__;
    if (handlers) {
      el.removeEventListener('dragover', handlers.dragover);
      el.removeEventListener('dragenter', handlers.dragenter);
      el.removeEventListener('dragleave', handlers.dragleave);
      el.removeEventListener('drop', handlers.drop);
      delete (el as any).__drag_handlers__;
    }
  }
};

/**
 * 上传按钮指令 - v-upload-click
 * @example
 * ```html
 * <button v-upload-click="uploader">选择文件并上传</button>
 * ```
 */
export const vUploadClick: UploadDirective = {
  mounted(el: HTMLElement, binding: { value: ReactiveUploader }) {
    const uploader = binding.value;
    if (!uploader) return;

    let fileInput: HTMLInputElement | null = null;

    function createInput() {
      // 创建隐藏的文件输入框
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.style.display = 'none';

      fileInput.addEventListener('change', () => {
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
          const file = fileInput.files[0];
          uploader.upload(file);
        }
      });

      document.body.appendChild(fileInput);
    }

    function handleClick() {
      if (!fileInput) {
        createInput();
      }
      fileInput?.click();
    }

    // 存储处理器
    (el as any).__upload_click_handler__ = handleClick;

    // 添加点击事件
    el.addEventListener('click', handleClick);
  },
  unmounted(el: HTMLElement) {
    // 移除事件监听
    const handler = (el as any).__upload_click_handler__;
    if (handler) {
      el.removeEventListener('click', handler);
      delete (el as any).__upload_click_handler__;
    }

    // 移除可能创建的文件输入框
    const fileInputs = document.querySelectorAll('input[type="file"][style*="display: none"]');
    fileInputs.forEach(input => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
    });
  }
};

/**
 * 上传进度指令 - v-upload-progress
 * @example
 * ```html
 * <div v-upload-progress="uploader"></div>
 * ```
 */
export const vUploadProgress: UploadDirective = {
  mounted(el: HTMLElement, binding: { value: ReactiveUploader }) {
    const uploader = binding.value;
    if (!uploader) return;

    // 创建进度条元素
    const progressBar = document.createElement('div');
    progressBar.className = 'upload-progress-bar';
    progressBar.style.width = '0%';
    progressBar.style.backgroundColor = '#4caf50';
    progressBar.style.height = '100%';
    progressBar.style.transition = 'width 0.3s ease';

    // 设置容器样式
    el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.style.height = '6px';
    el.style.backgroundColor = '#e0e0e0';
    el.style.borderRadius = '3px';

    // 添加进度条到容器
    el.appendChild(progressBar);

    // 订阅进度更新
    const subscription = uploader.progress$.subscribe(progress => {
      progressBar.style.width = `${progress}%`;
    });

    // 存储订阅以便清理
    (el as any).__progress_subscription__ = subscription;
  },
  unmounted(el: HTMLElement) {
    // 清理订阅
    const subscription = (el as any).__progress_subscription__;
    if (subscription && typeof subscription.unsubscribe === 'function') {
      subscription.unsubscribe();
      delete (el as any).__progress_subscription__;
    }
  }
};

/**
 * 上传插件对象，用于全局注册所有上传相关指令
 */
export const UploadPlugin = {
  install(app: any) {
    app.directive('drag-upload', vDragUpload);
    app.directive('upload-click', vUploadClick);
    app.directive('upload-progress', vUploadProgress);
  }
};
