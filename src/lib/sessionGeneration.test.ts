import { expect, it } from 'vitest';
import { sessionGeneration } from './sessionGeneration';

it('rejects an old role lookup after a new identity or sign-out', () => {
  const guard = sessionGeneration();
  const first = guard.next();
  const second = guard.next();
  expect(guard.isCurrent(first)).toBe(false);
  expect(guard.isCurrent(second)).toBe(true);
  guard.next();
  expect(guard.isCurrent(second)).toBe(false);
});