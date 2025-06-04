declare module 'react-native' {
  export interface NativeModulesStatic {
    [moduleName: string]: any;
  }

  export class NativeEventEmitter {
    constructor(nativeModule?: any);
    addListener(eventType: string, listener: (event: any) => void): { remove: () => void };
    removeAllListeners(eventType: string): void;
  }

  export const NativeModules: NativeModulesStatic;
  export const Platform: { OS: string; Version: number };
}
