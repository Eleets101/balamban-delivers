/** Prevent asynchronous identity work from being committed after an account change. */
export function sessionGeneration() {
  let generation = 0;
  return {
    next: () => ++generation,
    isCurrent: (request: number) => request === generation,
  };
}
