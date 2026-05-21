import { useRef } from 'react';

/**
 * 將任意值同步到 ref，讓 callback（事件、setInterval、useEffect）永遠
 * 能讀到最新版本，而不需要把值加入 effect deps（避免重建 interval/listener）。
 *
 * 使用條件（違反則可能造成問題）：
 *   ref.current 只能在 callback 內讀取，不能在 render 路徑讀取。
 *
 * @example
 *   const vmRef = useLatest(vm);
 *   useEffect(() => {
 *     const id = setInterval(() => vmRef.current.refresh(), 5000);
 *     return () => clearInterval(id);
 *   }, []);
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
