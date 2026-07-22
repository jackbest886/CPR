FROM node:20-alpine

WORKDIR /app

# 先安装依赖以利用缓存层
COPY package.json ./
RUN npm install

# 复制源码并构建前端
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
EXPOSE 3000

# SQLite 数据挂载卷：/data
CMD ["npm", "start"]
