# 使用官方輕量版 Python 映像檔
FROM python:3.11-slim

# 設定貨櫃內的工作目錄
WORKDIR /app

# 複製依賴清單並安裝
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製專案所有原始碼到貨櫃內
COPY . .

# 設定環境變數（讓 Python 輸出直接印在 Cloud Build 記錄中）
ENV PYTHONUNBUFFERED=1

# 暴露你的後端 Port（這裡以 8080 為例，Cloud Run 預設為 8080）
EXPOSE 8000

# 啟動指令（請根據你的啟動檔修改，例如 main.py）
CMD ["python", "main.py"]