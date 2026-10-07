# 项目架构

页面、样式、配置、音频、排行榜与游戏主循环分文件组织。

```text
3d_runway/
├─ index.html              页面结构和脚本加载顺序
├─ styles/
│  └─ game.css             HUD、弹窗、操作提示和移动端样式
├─ js/
│  ├─ config.js            资源路径和默认游戏平衡参数
│  ├─ audio.js             背景音乐与音效控制
│  ├─ utils.js             随机数、洗牌和 AABB 碰撞等通用算法
│  ├─ leaderboard.js       localStorage 排行榜读写与排序
│  ├─ gamehub.js           门户对局、公开榜单与返回首页接入
│  ├─ gamehub.js           门户对局、公开榜单与返回首页接入
│  └─ game.js              Three.js 场景、输入、生成和游戏循环
└─ assets/                 模型、贴图、图片和音频资源
```

## 加载顺序

`index.html` 按以下顺序加载脚本：

1. `config.js`
2. `audio.js`
3. `utils.js`
4. `leaderboard.js`
5. `gamehub.js`
6. `game.js`

这些文件使用浏览器全局命名空间通信。启动方式见 README，独立运行通过本地 HTTP 服务访问。

## 后续扩展建议

- 新增难度：先在 `config.js` 增加难度参数，再让 `game.js` 根据模式选择配置。
- 新增游戏分支：为不同模式建立独立配置或生成器文件，不要复制整份 `game.js`。
- 新增音效：在 `config.js` 增加音频路径，由 `audio.js` 统一播放。
- 新增排行榜规则：在 `leaderboard.js` 增加模式字段或独立存储键。
- 新增 3D 素材：遵循 `ASSET_MANIFEST.md` 中的键名和原点约定。
