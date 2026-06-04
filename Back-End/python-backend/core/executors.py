"""共用 I/O executor 與外部 API 限流 Semaphore。

使用方式：
    from core.executors import get_executor, yahoo_sem, twse_sem

    executor = get_executor()
    fut = executor.submit(some_sync_fn, arg1, arg2)

    # 在同步 HTTP 呼叫前取得 semaphore（限制並行 outbound requests）
    with yahoo_sem:
        res = requests.get(...)
"""
import threading
from concurrent.futures import ThreadPoolExecutor

# 單一共用 executor，max_workers=16 防止無限建立執行緒
_io_executor = ThreadPoolExecutor(max_workers=16, thread_name_prefix="io-worker")

# 外部 API 並行上限（避免瞬間打爆第三方服務）
yahoo_sem = threading.Semaphore(8)   # Yahoo Finance / TWSE（via Yahoo）
twse_sem  = threading.Semaphore(5)   # TWSE T86 三大法人端點


def get_executor() -> ThreadPoolExecutor:
    """回傳共用 I/O executor（禁止 shutdown）。"""
    return _io_executor
