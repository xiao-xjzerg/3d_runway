# 3d_runway

3d_runway 是使用 HTML、CSS、JavaScript 与 Three.js 编写的网页游戏，可独立运行，也可通过 GameHub 门户游玩。

## 本地启动

在本目录打开终端：

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

浏览器访问 **http://127.0.0.1:4173/**。按 Ctrl+C 停止。需要 Python 3 和支持 WebGL 的现代浏览器；源码独立运行需要访问原有 CDN，不建议双击 HTML。Node 工具统一版本为 **26.10.0**，游戏本身不需要 Node 后端或 npm 安装。

## 操作与成绩

A/D 或左右方向键切换跑道，Space 跳跃，S 或向下方向键下蹲；手机可使用页面触控按钮。

排行榜主要指标：金币优先，其次分数与用时。独立运行时，记录保存在当前浏览器的 localStorage，清除站点数据会清除本机记录。
