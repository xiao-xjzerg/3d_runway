(() => {
  // 模型、贴图和 UI 资源入口。保持键名稳定即可替换实际文件。
  const assets = Object.freeze({
    player: "assets/player-runner.glb",
    coin: "assets/coin-ring.glb",
    diamond: "assets/diamond-action.glb",
    obstacleTrain: "assets/obstacle-train.glb",
    obstacleLowBarrier: "assets/obstacle-low-barrier.glb",
    obstacleOverhead: "assets/obstacle-overhead-sign.glb",
    obstacleCliff: "assets/obstacle-cliff.glb",
    obstacleBridge: "assets/obstacle-bridge.glb",
    roadTexture: "assets/track-road-texture.webp",
    railTexture: "assets/track-rail-texture.webp",
    sceneryTree: "assets/scenery-tree.glb",
    sceneryHouse: "assets/scenery-house.glb",
    uiCoinIcon: "assets/ui-coin.svg",
    uiRestartIcon: "assets/ui-restart.svg"
  });

  // 音频资源入口。
  const audio = Object.freeze({
    music: "assets/sounds/bgm-run.mp3",
    jump: "assets/sounds/jump.ogg",
    pickup: "assets/sounds/pickup.ogg",
    speedUp: "assets/sounds/speed-up.ogg",
    death: "assets/sounds/death.ogg"
  });

  // 游戏平衡参数。后续难度分支可基于这组默认值覆盖参数。
  const gameplay = Object.freeze({
    lanes: Object.freeze([-2.8, 0, 2.8]),
    laneWidth: 2.8,
    playerZ: 0,
    baseSpeed: 13,
    speedBoostInterval: 60,
    speedBoostFactor: 1.2,
    speedBannerDuration: 2.4,
    doubleLaneObstacleStartTime: 60,
    doubleLaneActionStartTime: 120,
    doubleLaneObstacleChance: 0.22,
    actionGateMinDistance: 18,
    actionGateRecoverySeconds: 1.15,
    leaderboardKey: "threeRunwayCoinLeaderboard",
    gravity: 23,
    jumpVelocity: 8.7,
    roadSegmentLength: 32,
    roadSegmentCount: 9,
    initialEventSpacing: 18,
    minEventDistance: 13.5,
    maxEventDistance: 19.2,
    passageWindowZ: 5.6,
    spawnZ: -96,
    despawnZ: 14
  });

  window.RUNWAY_CONFIG = Object.freeze({ assets, audio, gameplay });

  // 保留早期调试入口，避免外部替换脚本失效。
  window.RUNWAY_ASSET_FILES = assets;
  window.RUNWAY_AUDIO_FILES = audio;
})();
