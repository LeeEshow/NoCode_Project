/**
 * 判斷台股是否在盤中（週一至週五 09:00–13:30 台灣時間 UTC+8）
 * 純函式，接受可選的 now 參數方便測試
 */
export function isMarketOpen(now = new Date()): boolean {
  const TW_OFFSET_MS = 8 * 60 * 60 * 1000;
  const tw = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + TW_OFFSET_MS);

  const day = tw.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const totalMinutes = tw.getHours() * 60 + tw.getMinutes();
  return totalMinutes >= 9 * 60 && totalMinutes < 13 * 60 + 30;
}
