import type { OidcError } from '@draevix/shared';

class OidcCallbackError extends Error {
  constructor(
    readonly code: OidcError,
    message: string
  ) {
    super(message);
  }
}

export { OidcCallbackError };
