/**
 * FileChunk Pro 网络请求模拟工具
 *
 * 用于模拟网络请求的工具函数
 */

/**
 * 配置全局网络请求模拟
 */
export function configureNetworkMocks(): void {
  // 模拟fetch API
  if (!global.fetch) {
    global.fetch = jest.fn().mockImplementation(async (url: string, _options: RequestInit = {}) => {
      // 默认响应为成功
      const defaultResponse = {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
        text: async () => 'success',
        blob: async () => new Blob(['mock data'], { type: 'application/octet-stream' }),
        headers: new Headers()
      };

      return defaultResponse as Response;
    });
  }

  // 模拟XMLHttpRequest
  if (typeof XMLHttpRequest !== 'undefined') {
    const OriginalXHR = global.XMLHttpRequest;

    global.XMLHttpRequest = class MockXHR {
      url: string = '';
      method: string = '';
      headers: Record<string, string> = {};
      responseType: string = '';
      readyState: number = 0;
      status: number = 0;
      statusText: string = '';
      response: any = null;
      responseText: string = '';
      onreadystatechange: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: ((err: any) => void) | null = null;
      upload = {
        onprogress: null
      };

      open(method: string, url: string): void {
        this.method = method;
        this.url = url;
        this.readyState = 1;
      }

      setRequestHeader(name: string, value: string): void {
        this.headers[name] = value;
      }

      send(_data?: Document | XMLHttpRequestBodyInit): void {
        this.readyState = 2;

        setTimeout(() => {
          this.readyState = 3;
          if (this.onreadystatechange) {
            this.onreadystatechange();
          }

          setTimeout(() => {
            this.status = 200;
            this.statusText = 'OK';
            this.readyState = 4;

            // 根据responseType设置响应
            if (this.responseType === 'json') {
              this.response = { success: true, data: 'mock data' };
            } else if (this.responseType === 'blob') {
              this.response = new Blob(['mock data'], { type: 'application/octet-stream' });
            } else if (this.responseType === 'arraybuffer') {
              const buffer = new ArrayBuffer(8);
              const view = new Uint8Array(buffer);
              for (let i = 0; i < 8; i++) {
                view[i] = i;
              }
              this.response = buffer;
            } else {
              this.response = 'mock response';
              this.responseText = 'mock response';
            }

            // 触发状态变化和加载完成事件
            if (this.onreadystatechange) {
              this.onreadystatechange();
            }

            if (this.onload) {
              this.onload();
            }
          }, 50);
        }, 50);
      }

      abort(): void {
        this.readyState = 0;
      }

      getAllResponseHeaders(): string {
        return 'content-type: application/json\ncontent-length: 1024';
      }

      getResponseHeader(name: string): string | null {
        if (name.toLowerCase() === 'content-type') {
          return 'application/json';
        }
        return null;
      }
    } as any;

    // 保存原始XHR以便需要时还原
    (global.XMLHttpRequest as any)._originalXHR = OriginalXHR;
  }

  console.log('网络请求模拟配置完成');
}
