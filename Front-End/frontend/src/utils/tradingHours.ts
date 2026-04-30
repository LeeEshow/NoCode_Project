/* 台灣時間週一至週五 09:00–13:30 為盤中交易時間 */
export function isTradingHours(): boolean {
  const now = new Date();
  const tw  = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));

  const day     = tw.getDay(); // 0=Sun, 6=Sat
  const minutes = tw.getHours() * 60 + tw.getMinutes();

  if (day === 0 || day === 6) return false;
  return minutes >= 9 * 60 && minutes < 13 * 60 + 30;
}
