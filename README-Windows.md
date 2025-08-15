# Windows 部署与运行指南

## 先决条件
- 安装 Node.js LTS（推荐 ≥ 18.x）：https://nodejs.org/
- 可选：Git（用于 clone 仓库）

## 开发模式（热重载）
1. 打开 PowerShell 或 CMD，进入项目的 server 目录：
   ```powershell
   cd server
   npm install
   ```
2. 启动开发模式（ts-node-dev 热重载）：
   ```powershell
   npm run dev
   ```
   输出类似：
   ```
   HTTP listening on http://localhost:8080
   ```
3. 在客户端（另一个终端）启动前端：
   ```powershell
   cd ..\client
   npm install
   npm run dev
   ```
   然后在浏览器打开 http://localhost:5173 ，把“服务器WS”地址填成：
   ```
   ws://localhost:8080
   ```

## 生产模式（编译后运行）
1. 在 server 目录：
   ```powershell
   cd server
   npm install
   npm run build
   npm start
   ```
   默认监听 8080 端口。

2. 自定义端口（可选）：
   - 仅本次会话：
     ```powershell
     $env:PORT=9000; npm start
     ```
   - 永久设置（需要重开终端或注销后生效）：
     ```powershell
     setx PORT 9000
     ```

## 局域网访问与防火墙
- 若要让同局域网其他设备连接你的服务器：
  1) 在服务器机器上查询本机 IPv4：
     ```powershell
     ipconfig
     ```
     记下类似 192.168.x.x 的地址。
  2) 客户端“服务器WS”填：
     ```
     ws://<你的IPv4>:8080
     ```
  3) 放行 Windows 防火墙 8080 端口（管理员 PowerShell）：
     ```powershell
     .\open-firewall-8080.ps1
     ```

## 后台常驻（可选）
- 简单方式：用第三方工具将 Node 进程注册为服务，例如：
  - NSSM（Non-Sucking Service Manager）
  - node-windows 包（在项目中将 dist/index.js 注册为服务）
- 或使用 PM2（在 Windows 上部分高级功能有限，但可用于守护进程）：
  ```powershell
  npm i -g pm2
  pm2 start dist/index.js --name cardgame
  pm2 save
  ```