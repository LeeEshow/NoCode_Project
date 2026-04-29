"""執行：python diagnose.py"""
import os
from dotenv import load_dotenv
import shioaji as sj

load_dotenv()

print("Step 1: 建立 Shioaji 實例...")
api = sj.Shioaji()

print("Step 2: 登入（不下載合約）...")
try:
    accounts = api.login(
        api_key=os.environ["SJ_API_KEY"],
        secret_key=os.environ["SJ_SECRET_KEY"],
        fetch_contract=False,
    )
    print("✅ 登入成功，帳號:", accounts)
except Exception as e:
    print("❌ 登入失敗:", e)
    raise SystemExit(1)

print("Step 3: 下載合約...")
try:
    api.fetch_contracts(contract_download=True)
    stocks = list(api.Contracts.Stocks)
    print(f"✅ 合約下載成功，股票數量: {len(stocks)}")
except Exception as e:
    print("❌ 合約下載失敗:", e)

print("Step 4: 登出")
api.logout()
print("完成")
