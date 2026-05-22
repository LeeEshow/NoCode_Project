from datetime import datetime, timezone, timedelta

_TW_TZ = timezone(timedelta(hours=8))


def is_market_open(now: datetime | None = None) -> bool:
    """台股盤中判斷：週一至五 09:00–13:30 台灣時間（UTC+8）"""
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    tw = now.astimezone(_TW_TZ)
    if tw.weekday() >= 5:   # 週六=5, 週日=6
        return False

    total_minutes = tw.hour * 60 + tw.minute
    return 9 * 60 <= total_minutes < 13 * 60 + 30
