type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const FAILURE_THRESHOLD = 3;
const COOL_DOWN_MS      = 60_000; // 60 秒

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private openedAt: number | null = null;

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = this.openedAt !== null ? Date.now() - this.openedAt : Infinity;
      if (elapsed >= COOL_DOWN_MS) {
        this.state = 'HALF_OPEN';
        console.log('[CircuitBreaker] HALF_OPEN — 探測 Shioaji 是否恢復');
      } else {
        throw new Error(`Circuit breaker OPEN，剩餘冷卻 ${Math.ceil((COOL_DOWN_MS - elapsed) / 1000)}s`);
      }
    }

    try {
      const result = await fn();
      this.reset();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  private reset(): void {
    if (this.state === 'HALF_OPEN') {
      console.log('[CircuitBreaker] CLOSED — Shioaji 恢復正常');
    }
    this.failureCount = 0;
    this.openedAt     = null;
    this.state        = 'CLOSED';
  }

  private recordFailure(): void {
    this.failureCount++;
    if (this.failureCount >= FAILURE_THRESHOLD) {
      this.state    = 'OPEN';
      this.openedAt = Date.now();
      console.warn(
        `[CircuitBreaker] OPEN — 連續失敗 ${this.failureCount} 次，冷卻 ${COOL_DOWN_MS / 1000}s`
      );
    }
  }

  getStatus(): { state: CircuitState; failureCount: number; openedAt: number | null } {
    return { state: this.state, failureCount: this.failureCount, openedAt: this.openedAt };
  }
}

export const circuitBreaker = new CircuitBreaker();
