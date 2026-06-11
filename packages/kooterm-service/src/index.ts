import type { Express, Request, Response } from "express";
import express from "express";
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { useWebSocket } from "./websocket/index.js";

// 获取当前文件的目录路径（ESM替代__dirname）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

const sslKeyPath = process.env.SSL_KEY_PATH;
const sslCertPath = process.env.SSL_CERT_PATH;
const hasSsl = !!(sslKeyPath && sslCertPath);

let server: http.Server | https.Server;
if (hasSsl) {
  const sslOptions: https.ServerOptions = {
    key: fs.readFileSync(sslKeyPath!),
    cert: fs.readFileSync(sslCertPath!),
  };
  server = https.createServer(sslOptions, app);
} else {
  server = http.createServer(app);
}

app.use(express.static(path.join(__dirname, "../../kooterm-portal/dist")));
app.use('/portal-direct-assets', express.static(path.join(__dirname, "../../kooterm-portal/dist/portal-direct-assets"), {
  maxAge: '1y',
  immutable: true,
}));

// 根路径重定向到终端页面
const index = (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "../../kooterm-portal/dist/index.html"));
}


// 健康检查端点
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("*", index);

const PORT = Number(process.env.PORT) || 3001;
const SSL_PORT = Number(process.env.SSL_PORT) || 3443;

if (hasSsl) {
  const httpServer = http.createServer(app);
  useWebSocket([httpServer, server]);
  httpServer.listen(PORT, () => {
    console.log(`HTTP  服务运行: http://localhost:${PORT}`);
    console.log(`API 健康检查: http://localhost:${PORT}/health`);
  });
  server.listen(SSL_PORT, () => {
    console.log(`HTTPS 服务运行: https://localhost:${SSL_PORT}`);
    console.log(`WS    wss://localhost:${SSL_PORT}/api/ws/terminal`);
  });
} else {
  useWebSocket(server);
  server.listen(PORT, () => {
    console.log(`Web 服务运行: http://localhost:${PORT}`);
    console.log(`API 健康检查: http://localhost:${PORT}/health`);
  });
}

export default app;