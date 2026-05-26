# 階段一：建立建置環境
FROM node:18-alpine as build

WORKDIR /app

# 複製 package.json 與 package-lock.json (若有)
COPY package*.json ./

# 加上 --legacy-peer-deps 解決 React 19 與 dnd-kit 的版本衝突
RUN npm install --legacy-peer-deps

# 複製所有原始碼並執行打包
COPY . .
RUN npm run build

# 階段二：設定生產環境（以 Nginx 為例，請根據你專案實際的生產伺服器調整）
FROM nginx:stable-alpine

# 將階段一打包好的靜態檔案複製到 Nginx 預設目錄
# 備註：請確認你的打包產物目錄是 dist 還是 build（Vite 預設為 dist，CRA 預設為 build）
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]