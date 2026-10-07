import 'ws';

declare module 'ws' {
  interface WebSocket {
    userId?: number;
    token: string;
  }
}

type TCommandMap = {
  [pluginId: string]: {
    [commandName: string]: TCommand;
  };
};

type TCommand = (...args: unknown[]) => Promise<unknown> | unknown;

declare global {
  interface Window {
    __plugins?: {
      commands: TCommandMap;
    };
  }
  // eslint-disable-next-line no-var
  var disableRateLimiting: boolean | undefined;
}

declare module 'bun' {
  interface Env {
    // DRAEVIX_ prefixed environment variables
    DRAEVIX_PORT?: string;
    DRAEVIX_DEBUG?: string;
    DRAEVIX_AUTOUPDATE?: string;
    DRAEVIX_WEBRTC_PORT?: string;
    DRAEVIX_WEBRTC_ANNOUNCED_ADDRESS?: string;
    DRAEVIX_DATA_PATH?: string;
    DRAEVIX_KODIK_TOKEN?: string;
  }
}

declare module 'node:fs/promises' {
  export function exists(path: import('node:fs').PathLike): Promise<boolean>;
}

declare module 'fs/promises' {
  export function exists(path: import('node:fs').PathLike): Promise<boolean>;
}
