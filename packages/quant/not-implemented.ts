/** Placeholder body for a function whose signature is published before its implementation (interfaces PR). */
export function notImplemented<F extends (...args: never[]) => unknown>(name: string): F {
  return (() => {
    throw new Error(`not implemented: ${name}`);
  }) as unknown as F;
}
