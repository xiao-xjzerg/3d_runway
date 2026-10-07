# 游戏资产替换清单

代码入口：`js/config.js` 中的 `assets` 配置。后续替换素材时，请尽量保持下表文件名不变，并把文件放到 `assets/` 目录下。

当前版本会先使用 Three.js 几何体占位。素材准备好后，可按 `assets` 的键名逐项替换对应创建函数。

| 代码键名 | 目标文件名 | 游戏元素 | 建议格式 | 当前占位 | 替换建议 |
| --- | --- | --- | --- | --- | --- |
| `player` | `assets/player-runner.glb` | 主角角色 | `GLB/GLTF` | 方块、圆柱组合机器人 | 原点放在脚底中心，朝向赛道前方，建议高度约 1.6 个 Three.js 单位。 |
| `coin` | `assets/coin-ring.glb` | 金币 | `GLB/GLTF`，也可继续代码生成 | 黄色旋转圆环 | 原点放在金币中心，外径约 0.7 个单位。若做 2D 图，建议透明 `PNG/WebP` 后续改为 billboard。 |
| `diamond` | `assets/diamond-action.glb` | 动作钻石 | `GLB/GLTF` | 蓝色八面体宝石 | 原点放在钻石中心，外径约 0.9 个单位。高位钻石需要跳跃收集；低位钻石正常行走或滑行都可收集；吃到后按 10 个金币计。 |
| `obstacleTrain` | `assets/obstacle-train.glb` | 火车/高墙障碍 | `GLB/GLTF` | 车厢式长方体 | 原点放在底部中心，宽度覆盖单条赛道，高度明显高于角色；游戏 60 秒后出现的双路封锁会同时复用两个该模型实例。 |
| `obstacleLowBarrier` | `assets/obstacle-low-barrier.glb` | 低矮栏杆 | `GLB/GLTF` | 立柱和横杆 | 原点放在底部中心，碰撞高度低于角色跳跃高度；游戏 120 秒后可能出现在双路火车的唯一出口，要求跳跃。 |
| `obstacleOverhead` | `assets/obstacle-overhead-sign.glb` | 高空悬挂物 | `GLB/GLTF` | 悬挂横牌 | 原点放在底部中心，底部需留出滑行通过的空隙；游戏 120 秒后可能出现在双路火车的唯一出口，要求下蹲。 |
| `obstacleCliff` | `assets/obstacle-cliff.glb` | 全路断崖 | `GLB/GLTF` | 黑色坑洞和警示边 | 原点放在底部中心，模型宽度横跨三条赛道，碰撞要求玩家跳跃通过。 |
| `obstacleBridge` | `assets/obstacle-bridge.glb` | 全路桥梁 | `GLB/GLTF` | 横跨三条赛道的低桥 | 原点放在底部中心，模型宽度横跨三条赛道，底部高度要求玩家滑行通过。 |
| `roadTexture` | `assets/track-road-texture.webp` | 赛道路面贴图 | `WebP/PNG/JPG` | 深灰路面材质 | 用于替换主路面材质，建议可无缝平铺。 |
| `railTexture` | `assets/track-rail-texture.webp` | 铁轨/枕木贴图 | `WebP/PNG/JPG` | 几何体铁轨和枕木 | 可用于替换轨道材质，不建议做成大图背景。 |
| `sceneryTree` | `assets/scenery-tree.glb` | 树木场景物 | `GLB/GLTF` | 树干加树冠几何体 | 原点放在底部中心，建议低多边形风格。 |
| `sceneryHouse` | `assets/scenery-house.glb` | 房屋/背景建筑 | `GLB/GLTF` | 方块房屋和屋顶 | 原点放在底部中心，作为赛道两侧循环装饰。 |
| `uiCoinIcon` | `assets/ui-coin.svg` | UI 金币图标 | `SVG` 或透明 `PNG/WebP` | CSS 圆形图标 | 尺寸建议 32x32 或可缩放 SVG。 |
| `uiRestartIcon` | `assets/ui-restart.svg` | UI 重启图标 | `SVG` 或透明 `PNG/WebP` | 文本按钮 | 尺寸建议 24x24 或可缩放 SVG。 |

## 替换优先级

1. 先制作 `player`、`coin`、`diamond`、各类 `obstacle*`，这些会最明显影响游戏观感。
2. 再制作 `sceneryTree`、`sceneryHouse`，用于丰富动态背景。
3. 最后补充 `roadTexture`、`railTexture` 和 UI 图标。

## 音频资源

音频入口在 `js/config.js` 中的 `audio` 配置。短音效来自 Kenney CC0 音频包，原始许可保存在 `assets/sounds/`；背景音乐单独提供，不属于该 CC0 声明。

| 代码键名 | 目标文件名 | 用途 | 当前来源 |
| --- | --- | --- | --- |
| `music` | `assets/sounds/bgm-run.mp3` | 游戏进行中的循环背景音乐 | 项目背景音乐 |
| `jump` | `assets/sounds/jump.ogg` | 跳跃音效 | Kenney Interface Sounds |
| `pickup` | `assets/sounds/pickup.ogg` | 金币/钻石拾取音效 | Kenney RPG Sounds |
| `speedUp` | `assets/sounds/speed-up.ogg` | 每 60 秒提速提示音效 | Kenney Interface Sounds |
| `death` | `assets/sounds/death.ogg` | 撞击死亡音效 | Kenney RPG Sounds |

## 建模约定

- 所有 3D 模型建议使用 `GLB`，避免贴图路径丢失。
- 模型原点统一放在底部中心或物体中心，具体见上表。
- 不要把碰撞盒做进模型里；碰撞尺寸由代码中的 hitbox 配置控制。
- 模型风格建议保持明快、低多边形或卡通材质，方便与当前占位风格统一。
