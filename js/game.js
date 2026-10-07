    (() => {
      // 检查外部依赖和拆分后的本地模块是否按顺序加载。
      if (
        !window.THREE ||
        !window.RUNWAY_CONFIG ||
        !window.RunwayAudio ||
        !window.RunwayUtils ||
        !window.RunwayLeaderboard
      ) {
        document.body.innerHTML = '<div class="runtime-error"><div><h1>游戏模块未加载</h1><p>请检查 Three.js CDN 以及 js/ 目录中的脚本文件。</p></div></div>';
        return;
      }

      // 从配置模块读取资源和默认游戏平衡参数。
      const { assets: ASSET_FILES, gameplay } = window.RUNWAY_CONFIG;
      const {
        lanes: LANES,
        laneWidth: LANE_WIDTH,
        playerZ: PLAYER_Z,
        baseSpeed: BASE_SPEED,
        speedBoostInterval: SPEED_BOOST_INTERVAL,
        speedBoostFactor: SPEED_BOOST_FACTOR,
        speedBannerDuration: SPEED_BANNER_DURATION,
        doubleLaneObstacleStartTime: DOUBLE_LANE_OBSTACLE_START_TIME,
        doubleLaneActionStartTime: DOUBLE_LANE_ACTION_START_TIME,
        doubleLaneObstacleChance: DOUBLE_LANE_OBSTACLE_CHANCE,
        actionGateMinDistance: ACTION_GATE_MIN_DISTANCE,
        actionGateRecoverySeconds: ACTION_GATE_RECOVERY_SECONDS,
        leaderboardKey: LEADERBOARD_KEY,
        gravity: GRAVITY,
        jumpVelocity: JUMP_VELOCITY,
        roadSegmentLength: ROAD_SEGMENT_LENGTH,
        roadSegmentCount: ROAD_SEGMENT_COUNT,
        initialEventSpacing: INITIAL_EVENT_SPACING,
        minEventDistance: MIN_EVENT_DISTANCE,
        maxEventDistance: MAX_EVENT_DISTANCE,
        passageWindowZ: PASSAGE_WINDOW_Z,
        spawnZ: SPAWN_Z,
        despawnZ: DESPAWN_Z
      } = gameplay;

      // 通用算法和排行榜存储由独立模块提供。
      const { randomRange, randomInt, shuffleInPlace, boxesOverlap } = window.RunwayUtils;
      const leaderboardStore = window.RunwayLeaderboard.createStore(LEADERBOARD_KEY);

      // 统一缓存 DOM，避免游戏循环里反复查询节点。
      const dom = {
        root: document.getElementById("gameRoot"),
        timer: document.getElementById("timerValue"),
        level: document.getElementById("levelValue"),
        speedBanner: document.getElementById("speedBanner"),
        score: document.getElementById("scoreValue"),
        coins: document.getElementById("coinValue"),
        startOverlay: document.getElementById("startOverlay"),
        gameOverOverlay: document.getElementById("gameOverOverlay"),
        finalStats: document.getElementById("finalStats"),
        leaderboardForm: document.getElementById("leaderboardForm"),
        playerName: document.getElementById("playerName"),
        saveScoreBtn: document.getElementById("saveScoreBtn"),
        leaderboardList: document.getElementById("leaderboardList"),
        startBtn: document.getElementById("startBtn"),
        restartBtn: document.getElementById("restartBtn")
      };

      // Three.js 基础对象。
      let scene;
      let camera;
      let renderer;
      let clock;
      let player;
      let playerVisual;
      let materials;
      let audio;

      // 游戏运行状态和本局数据。
      let running = false;
      let score = 0;
      let coinCount = 0;
      let currentSpeed = BASE_SPEED;
      let laneIndex = 1;
      let targetX = LANES[laneIndex];
      let verticalVelocity = 0;
      let slideHeld = false;
      let elapsed = 0;
      let visualElapsed = 0;
      let spawnDistance = 0;
      let nextSpawnDistance = 20;
      let nextSpeedBoostAt = SPEED_BOOST_INTERVAL;
      let speedBoostCount = 0;
      let speedBannerTimer = 0;
      let scoreSubmitted = false;
      const portal = window.createGameHubBridge({
        gameId: "3d-runway",
        isPlaying: () => running,
        onBoard: (entries) => renderLeaderboard(entries.map((entry) => ({
          name: entry.nickname,
          coins: entry.metrics.coins,
          score: entry.metrics.score,
          time: entry.metrics.time,
          createdAt: entry.acceptedAt
        })))
      });

      // 可循环复用的世界对象集合。
      const roadSegments = [];
      const obstacles = [];
      const coins = [];
      const sceneryItems = [];
      const lookTarget = new THREE.Vector3();

      // 初始化顺序：场景 -> 事件 -> 世界初始状态 -> 动画循环。
      initScene();
      audio = window.RunwayAudio.createController();
      bindEvents();
      resetWorld();
      animate();

      // 创建 Three.js 场景、相机、渲染器和初始物体。
      function initScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x8fd3ff);
        scene.fog = new THREE.Fog(0x8fd3ff, 34, 150);

        camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
        camera.position.set(0, 5.4, 9);
        camera.lookAt(0, 1.2, -9);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        dom.root.appendChild(renderer.domElement);

        materials = createMaterials();
        addLights();
        createRoad();
        player = createPlayer();
        scene.add(player);
        createInitialScenery();
      }

      // 集中创建材质，确保占位模型保持统一的卡通风格。
      function createMaterials() {
        return {
          road: new THREE.MeshPhongMaterial({ color: 0x3f4654, shininess: 10 }),
          laneLine: new THREE.MeshPhongMaterial({ color: 0xf8fafc, shininess: 20 }),
          rail: new THREE.MeshPhongMaterial({ color: 0x1f2937, shininess: 60 }),
          railTie: new THREE.MeshPhongMaterial({ color: 0x6b4f3b, shininess: 8 }),
          playerBody: new THREE.MeshToonMaterial({ color: 0x2563eb }),
          playerHead: new THREE.MeshToonMaterial({ color: 0xf97316 }),
          playerLimb: new THREE.MeshToonMaterial({ color: 0x0f766e }),
          coin: new THREE.MeshPhongMaterial({ color: 0xfacc15, specular: 0xffffff, shininess: 90 }),
          coinEdge: new THREE.MeshPhongMaterial({ color: 0xf59e0b, shininess: 50 }),
          diamond: new THREE.MeshPhongMaterial({ color: 0x38bdf8, specular: 0xffffff, shininess: 120 }),
          diamondCore: new THREE.MeshPhongMaterial({ color: 0xe0f2fe, specular: 0xffffff, shininess: 160 }),
          train: new THREE.MeshToonMaterial({ color: 0xef4444 }),
          trainTrim: new THREE.MeshToonMaterial({ color: 0x0ea5e9 }),
          barrier: new THREE.MeshToonMaterial({ color: 0xf97316 }),
          barrierStripe: new THREE.MeshToonMaterial({ color: 0xf8fafc }),
          overhead: new THREE.MeshToonMaterial({ color: 0x06b6d4 }),
          overheadTrim: new THREE.MeshToonMaterial({ color: 0xfacc15 }),
          cliffVoid: new THREE.MeshPhongMaterial({ color: 0x020617, shininess: 5 }),
          warning: new THREE.MeshToonMaterial({ color: 0xfacc15 }),
          warningDark: new THREE.MeshToonMaterial({ color: 0x111827 }),
          treeTrunk: new THREE.MeshPhongMaterial({ color: 0x8b5a2b, shininess: 8 }),
          treeCrown: new THREE.MeshToonMaterial({ color: 0x22c55e }),
          houseWall: new THREE.MeshToonMaterial({ color: 0xf4a261 }),
          houseRoof: new THREE.MeshToonMaterial({ color: 0x9333ea }),
          window: new THREE.MeshPhongMaterial({ color: 0xbfdbfe, shininess: 80 }),
          shadow: new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.18 })
        };
      }

      // 场景光源：半球光提供环境亮度，方向光产生阴影和立体感。
      function addLights() {
        scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 0.72));

        const sun = new THREE.DirectionalLight(0xffffff, 1.05);
        sun.position.set(-8, 16, 9);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.left = -24;
        sun.shadow.camera.right = 24;
        sun.shadow.camera.top = 24;
        sun.shadow.camera.bottom = -24;
        scene.add(sun);
      }

      // 给占位模型标记对应资源键名和目标文件名。
      function tagAsset(object, assetKey) {
        object.userData.assetKey = assetKey;
        object.userData.assetFile = ASSET_FILES[assetKey];
        return object;
      }

      // 创建多段路面，后续在 Z 轴循环移动，形成无尽赛道。
      function createRoad() {
        for (let i = 0; i < ROAD_SEGMENT_COUNT; i += 1) {
          const segment = createRoadSegment();
          segment.position.z = -i * ROAD_SEGMENT_LENGTH;
          roadSegments.push(segment);
          scene.add(segment);
        }
      }

      // 单段路面包含主地面、车道虚线、铁轨和枕木。
      function createRoadSegment() {
        const group = new THREE.Group();
        tagAsset(group, "roadTexture");

        const base = new THREE.Mesh(new THREE.PlaneGeometry(10.6, ROAD_SEGMENT_LENGTH), materials.road);
        base.rotation.x = -Math.PI / 2;
        base.receiveShadow = true;
        group.add(base);

        [-1.4, 1.4].forEach((x) => {
          for (let z = -ROAD_SEGMENT_LENGTH / 2 + 2; z < ROAD_SEGMENT_LENGTH / 2; z += 7) {
            const dash = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 3.2), materials.laneLine);
            dash.position.set(x, 0.035, z);
            dash.receiveShadow = true;
            group.add(dash);
          }
        });

        LANES.forEach((laneX) => {
          [-0.56, 0.56].forEach((offset) => {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, ROAD_SEGMENT_LENGTH), materials.rail);
            tagAsset(rail, "railTexture");
            rail.position.set(laneX + offset, 0.08, 0);
            rail.castShadow = true;
            rail.receiveShadow = true;
            group.add(rail);
          });

          for (let z = -ROAD_SEGMENT_LENGTH / 2; z <= ROAD_SEGMENT_LENGTH / 2; z += 4) {
            const tie = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.28), materials.railTie);
            tagAsset(tie, "railTexture");
            tie.position.set(laneX, 0.05, z);
            tie.castShadow = true;
            tie.receiveShadow = true;
            group.add(tie);
          }
        });

        return group;
      }

      // 创建玩家占位机器人；替换 GLB 时保留 group 原点约定即可。
      function createPlayer() {
        const group = new THREE.Group();
        tagAsset(group, "player");
        group.position.set(0, 0, PLAYER_Z);

        playerVisual = new THREE.Group();
        group.add(playerVisual);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.82, 0.68), materials.playerBody);
        body.position.y = 0.86;
        body.castShadow = true;
        playerVisual.add(body);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), materials.playerHead);
        head.position.y = 1.42;
        head.castShadow = true;
        playerVisual.add(head);

        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.54, 0.16), materials.playerLimb);
        pack.position.set(0, 0.94, 0.43);
        pack.castShadow = true;
        playerVisual.add(pack);

        [-0.46, 0.46].forEach((x) => {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.66, 12), materials.playerLimb);
          arm.position.set(x, 0.86, 0);
          arm.rotation.z = x > 0 ? 0.28 : -0.28;
          arm.castShadow = true;
          playerVisual.add(arm);
        });

        [-0.2, 0.2].forEach((x) => {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.64, 12), materials.playerLimb);
          leg.position.set(x, 0.32, 0);
          leg.castShadow = true;
          playerVisual.add(leg);
        });

        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.58, 24), materials.shadow);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.015;
        group.add(shadow);

        return group;
      }

      // 初始生成道路两侧装饰，提升奔跑时的空间感。
      function createInitialScenery() {
        for (let z = -12; z > -210; z -= 12) {
          sceneryItems.push(createSceneryItem(z));
        }
      }

      // 随机生成一个场景装饰：树或房屋。
      function createSceneryItem(z) {
        const group = Math.random() > 0.45 ? createTree() : createHouse();
        resetSceneryPosition(group, z);
        scene.add(group);
        return group;
      }

      // 将场景装饰重置到远处，并随机左右侧、角度和缩放。
      function resetSceneryPosition(group, z) {
        const side = Math.random() > 0.5 ? 1 : -1;
        const x = side * randomRange(6.2, 10.4);
        group.position.set(x, 0, z);
        group.rotation.y = side > 0 ? randomRange(-0.45, 0.15) : randomRange(-0.15, 0.45);
        const scale = randomRange(0.82, 1.36);
        group.scale.setScalar(scale);
      }

      // 树木占位模型。
      function createTree() {
        const group = new THREE.Group();
        tagAsset(group, "sceneryTree");

        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.05, 10), materials.treeTrunk);
        trunk.position.y = 0.52;
        trunk.castShadow = true;
        group.add(trunk);

        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.82, 1.5, 8), materials.treeCrown);
        crown.position.y = 1.55;
        crown.castShadow = true;
        group.add(crown);

        return group;
      }

      // 房屋占位模型。
      function createHouse() {
        const group = new THREE.Group();
        tagAsset(group, "sceneryHouse");

        const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.25, 1.35), materials.houseWall);
        body.position.y = 0.62;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.72, 4), materials.houseRoof);
        roof.position.y = 1.45;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        group.add(roof);

        const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.035), materials.window);
        windowMesh.position.set(0, 0.78, 0.69);
        group.add(windowMesh);

        return group;
      }

      // 重置一局游戏的所有动态状态。
      function resetWorld() {
        clearDynamicObjects();
        score = 0;
        coinCount = 0;
        currentSpeed = BASE_SPEED;
        laneIndex = 1;
        targetX = LANES[laneIndex];
        verticalVelocity = 0;
        slideHeld = false;
        elapsed = 0;
        visualElapsed = 0;
        spawnDistance = 0;
        nextSpawnDistance = INITIAL_EVENT_SPACING;
        nextSpeedBoostAt = SPEED_BOOST_INTERVAL;
        speedBoostCount = 0;
        speedBannerTimer = 0;
        scoreSubmitted = false;
        player.position.set(targetX, 0, PLAYER_Z);
        playerVisual.scale.set(1, 1, 1);
        playerVisual.rotation.set(0, 0, 0);
        dom.speedBanner.classList.remove("is-visible");
        updateHud();

        for (let i = 0; i < 6; i += 1) {
          spawnCourseEvent(-36 - i * INITIAL_EVENT_SPACING);
        }
      }

      // 清理上一局留下的障碍和收集品。
      function clearDynamicObjects() {
        obstacles.forEach((entry) => scene.remove(entry.group));
        coins.forEach((entry) => scene.remove(entry.group));
        obstacles.length = 0;
        coins.length = 0;
      }

      // 随机生成一个课程事件：双路封锁、全路动作门或单车道障碍。
      function spawnCourseEvent(z) {
        const eventRoll = Math.random();
        const doubleLaneEnabled = elapsed >= DOUBLE_LANE_OBSTACLE_START_TIME;

        if (doubleLaneEnabled && eventRoll < DOUBLE_LANE_OBSTACLE_CHANCE) {
          if (spawnDoubleLaneBlockEvent(z)) {
            return;
          }

          spawnSingleLaneEvent(z);
          return;
        }

        // 去除双路事件占用的概率区间，保持断崖、桥梁的原有相对比例。
        const standardEventRoll = doubleLaneEnabled
          ? (eventRoll - DOUBLE_LANE_OBSTACLE_CHANCE) / (1 - DOUBLE_LANE_OBSTACLE_CHANCE)
          : eventRoll;

        if (standardEventRoll < 0.14) {
          if (spawnActionGateEvent("cliff", "jump", z)) {
            return;
          }
        }

        if (standardEventRoll < 0.28) {
          if (spawnActionGateEvent("bridge", "slide", z)) {
            return;
          }
        }

        spawnSingleLaneEvent(z);
      }

      // 一分钟后可生成双路封锁；两分钟后唯一出口还需要跳跃或下蹲通过。
      function spawnDoubleLaneBlockEvent(z) {
        const openLaneCandidates = shuffleInPlace(LANES.map((_, lane) => lane));

        for (const openLane of openLaneCandidates) {
          const placements = LANES
            .map((_, lane) => lane)
            .filter((lane) => lane !== openLane)
            .map((lane) => ({ type: "train", lane }));

          if (elapsed >= DOUBLE_LANE_ACTION_START_TIME) {
            const actionObstacleType = Math.random() < 0.5 ? "lowBarrier" : "overhead";
            placements.push({ type: actionObstacleType, lane: openLane });
          }

          const placed = spawnSafeObstacleSet(placements, z);
          if (!placed) {
            continue;
          }

          // 金币从障碍前方延伸到后方，提前提示唯一可通行的出口。
          spawnCoinLine(openLane, z + 7, 5);
          return true;
        }

        return false;
      }

      // 生成必须通过动作处理的全路事件，例如断崖和桥梁。
      function spawnActionGateEvent(type, requiredAction, z) {
        if (!hasSafeActionGateSpacing(type, z)) {
          return false;
        }

        if (!spawnSafeObstacle(type, 1, z)) {
          return false;
        }

        spawnDiamond(requiredAction, 1, requiredAction === "jump" ? z - 0.15 : z);
        spawnCoinLine(randomInt(0, 2), z - randomRange(7, 10), randomInt(2, 4));
        return true;
      }

      // 断崖与桥梁要求相反动作，二者之间必须留出完成动作和恢复姿态的距离。
      function hasSafeActionGateSpacing(type, z) {
        const oppositeType = type === "cliff" ? "bridge" : "cliff";
        const requiredDistance = Math.max(
          ACTION_GATE_MIN_DISTANCE,
          currentSpeed * ACTION_GATE_RECOVERY_SECONDS
        );

        return !obstacles.some(
          (obstacle) =>
            obstacle.type === oppositeType &&
            Math.abs(obstacle.group.position.z - z) < requiredDistance
        );
      }

      // 生成单车道障碍，并在安全车道上补金币和钻石。
      function spawnSingleLaneEvent(z) {
        const obstacleTypes = ["train", "lowBarrier", "overhead"];
        const preferredLane = randomInt(0, 2);
        const preferredType = obstacleTypes[randomInt(0, obstacleTypes.length - 1)];
        const placed = spawnSafeObstacle(preferredType, preferredLane, z) || spawnFallbackSingleLaneObstacle(z, preferredType, preferredLane);

        if (!placed) {
          spawnCoinLine(randomInt(0, 2), z - randomRange(5, 8), randomInt(3, 5));
          return;
        }

        const coinLane = chooseDifferentLane(placed.lane);
        const coinStart = z - randomRange(5, 8);
        spawnCoinLine(coinLane, coinStart, randomInt(3, 5));

        if (Math.random() > 0.58) {
          spawnCoinLine(randomInt(0, 2), z - randomRange(14, 18), 3);
        }

        if (Math.random() > 0.68) {
          const requiredAction = Math.random() > 0.5 ? "jump" : "slide";
          spawnDiamond(requiredAction, randomInt(0, 2), z - randomRange(10, 14));
        }
      }

      // 当首选障碍不安全时，尝试其他类型和车道。
      function spawnFallbackSingleLaneObstacle(z, skippedType, skippedLane) {
        const candidates = [];
        ["train", "lowBarrier", "overhead"].forEach((type) => {
          for (let lane = 0; lane < LANES.length; lane += 1) {
            if (type !== skippedType || lane !== skippedLane) {
              candidates.push({ type, lane });
            }
          }
        });

        shuffleInPlace(candidates);
        for (const candidate of candidates) {
          const placed = spawnSafeObstacle(candidate.type, candidate.lane, z);
          if (placed) {
            return placed;
          }
        }

        return null;
      }

      // 真实创建障碍对象；外部应通过 spawnSafeObstacle 调用。
      function spawnObstacle(type, lane, z) {
        const group = new THREE.Group();
        const isFullWidthObstacle = type === "cliff" || type === "bridge";
        group.position.set(isFullWidthObstacle ? 0 : LANES[lane], 0, z);

        let hitbox;
        if (type === "train") {
          tagAsset(group, "obstacleTrain");
          buildTrainObstacle(group);
          hitbox = makeHitbox(0, 1.62, 0, 2.16, 3.24, 4.8);
        } else if (type === "lowBarrier") {
          tagAsset(group, "obstacleLowBarrier");
          buildLowBarrier(group);
          hitbox = makeHitbox(0, 0.38, 0, 2.1, 0.76, 1.15);
        } else if (type === "cliff") {
          tagAsset(group, "obstacleCliff");
          buildCliffObstacle(group);
          hitbox = makeHitbox(0, 0.36, 0, 8.9, 0.72, 2.35);
        } else if (type === "bridge") {
          tagAsset(group, "obstacleBridge");
          buildBridgeObstacle(group);
          hitbox = makeHitbox(0, 1.45, 0, 8.9, 0.78, 1.42);
        } else {
          tagAsset(group, "obstacleOverhead");
          buildOverheadObstacle(group);
          hitbox = makeHitbox(0, 1.48, 0, 2.16, 0.68, 1.2);
        }

        scene.add(group);
        obstacles.push({ group, type, lane: isFullWidthObstacle ? null : lane, hitbox });
        return obstacles[obstacles.length - 1];
      }

      // 障碍创建前检查同一窗口内的硬障碍不能封死三条车道。
      function spawnSafeObstacle(type, lane, z) {
        const placed = spawnSafeObstacleSet([{ type, lane }], z);
        return placed ? placed[0] : null;
      }

      // 原子校验并生成同一横截面的多个障碍，避免双路组合只生成一部分。
      function spawnSafeObstacleSet(placements, z) {
        if (!isObstacleSetPlacementPassable(placements, z)) {
          return null;
        }

        return placements.map((placement) => spawnObstacle(placement.type, placement.lane, z));
      }

      // 只检查完全不可跨越的硬障碍；可跳跃或下蹲通过的障碍不占用车道出口。
      function isObstacleSetPlacementPassable(placements, z) {
        const blockedLanes = new Set();

        obstacles
          .filter((obstacle) => Math.abs(obstacle.group.position.z - z) <= PASSAGE_WINDOW_Z)
          .forEach((obstacle) => addHardBlockedLane(blockedLanes, obstacle.type, obstacle.lane));

        placements.forEach(({ type, lane }) => addHardBlockedLane(blockedLanes, type, lane));
        return blockedLanes.size < LANES.length;
      }

      // 火车/高墙无法通过，只有这类障碍会永久占用所在车道。
      function addHardBlockedLane(blockedLanes, type, lane) {
        if (type === "train" && Number.isInteger(lane) && lane >= 0 && lane < LANES.length) {
          blockedLanes.add(lane);
        }
      }

      // 火车/高墙占位模型。
      function buildTrainObstacle(group) {
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.12, 3.1, 4.65), materials.train);
        body.position.y = 1.55;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const front = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.42, 4.74), materials.trainTrim);
        front.position.y = 2.92;
        front.castShadow = true;
        group.add(front);

        const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.08), materials.window);
        windowMesh.position.set(0, 2.15, 2.36);
        windowMesh.castShadow = true;
        group.add(windowMesh);

        const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.22, 0.1), materials.trainTrim);
        bumper.position.set(0, 0.48, 2.38);
        bumper.castShadow = true;
        group.add(bumper);
      }

      // 低矮栏杆占位模型，玩家可跳过或换道。
      function buildLowBarrier(group) {
        [-0.82, 0.82].forEach((x) => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.75, 10), materials.barrier);
          post.position.set(x, 0.38, 0);
          post.castShadow = true;
          group.add(post);
        });

        const rail = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.22, 0.24), materials.barrierStripe);
        rail.position.set(0, 0.58, 0);
        rail.castShadow = true;
        group.add(rail);

        const base = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.12, 0.82), materials.barrier);
        base.position.set(0, 0.08, 0);
        base.castShadow = true;
        group.add(base);
      }

      // 高空悬挂物占位模型，玩家可滑行或换道。
      function buildOverheadObstacle(group) {
        const sign = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.62, 0.72), materials.overhead);
        sign.position.set(0, 1.48, 0);
        sign.castShadow = true;
        group.add(sign);

        const trim = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.12, 0.78), materials.overheadTrim);
        trim.position.set(0, 1.83, 0);
        trim.castShadow = true;
        group.add(trim);

        [-0.78, 0.78].forEach((x) => {
          const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8), materials.rail);
          cable.position.set(x, 2.18, 0);
          cable.castShadow = true;
          group.add(cable);
        });
      }

      // 全路断崖占位模型，玩家必须跳跃通过。
      function buildCliffObstacle(group) {
        const pit = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.08, 2.45), materials.cliffVoid);
        pit.position.y = 0.07;
        pit.receiveShadow = true;
        group.add(pit);

        [-1.12, 1.12].forEach((z) => {
          const edge = new THREE.Mesh(new THREE.BoxGeometry(9.25, 0.18, 0.18), materials.warning);
          edge.position.set(0, 0.16, z);
          edge.castShadow = true;
          group.add(edge);
        });

        for (let x = -4; x <= 4; x += 1) {
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 2.35), x % 2 === 0 ? materials.warning : materials.warningDark);
          stripe.position.set(x, 0.2, 0);
          stripe.rotation.y = Math.PI / 5;
          group.add(stripe);
        }
      }

      // 全路桥梁占位模型，玩家必须滑行通过。
      function buildBridgeObstacle(group) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.72, 1.25), materials.overhead);
        beam.position.set(0, 1.45, 0);
        beam.castShadow = true;
        beam.receiveShadow = true;
        group.add(beam);

        const top = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.2, 1.38), materials.overheadTrim);
        top.position.set(0, 1.9, 0);
        top.castShadow = true;
        group.add(top);

        [-4.65, 4.65].forEach((x) => {
          const support = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.9, 1.32), materials.rail);
          support.position.set(x, 0.95, 0);
          support.castShadow = true;
          group.add(support);
        });
      }

      // 沿一条车道生成一串金币。
      function spawnCoinLine(lane, zStart, count) {
        for (let i = 0; i < count; i += 1) {
          spawnCoin(lane, zStart - i * 2.8);
        }
      }

      // 创建普通金币；金币价值为 1。
      function spawnCoin(lane, z) {
        const group = new THREE.Group();
        tagAsset(group, "coin");
        group.position.set(LANES[lane], 1.22, z);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.085, 14, 34), materials.coin);
        ring.castShadow = true;
        group.add(ring);

        const core = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 12, 26), materials.coinEdge);
        core.castShadow = true;
        group.add(core);

        scene.add(group);
        coins.push({
          group,
          type: "coin",
          value: 1,
          hitbox: makeHitbox(0, 0, 0, 0.78, 0.78, 0.78)
        });
      }

      // 创建钻石；高位钻石自然需要跳起来碰撞，低位钻石正常碰撞即可拾取。
      function spawnDiamond(requiredAction, lane, z) {
        const group = new THREE.Group();
        tagAsset(group, "diamond");
        const y = requiredAction === "jump" ? 2.18 : 0.54;
        group.position.set(LANES[lane], y, z);

        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.44, 1), materials.diamond);
        gem.rotation.x = Math.PI / 8;
        gem.castShadow = true;
        group.add(gem);

        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), materials.diamondCore);
        core.castShadow = true;
        group.add(core);

        const actionRing = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 10, 32), requiredAction === "jump" ? materials.warning : materials.overheadTrim);
        actionRing.rotation.x = Math.PI / 2;
        actionRing.castShadow = true;
        group.add(actionRing);

        scene.add(group);
        coins.push({
          group,
          type: "diamond",
          value: 10,
          requiredAction,
          hitbox: makeHitbox(0, 0, 0, 0.92, 0.92, 0.92)
        });
      }

      // 绑定键盘、触控和按钮事件。
      function bindEvents() {
        dom.startBtn.addEventListener("click", startGame);
        dom.restartBtn.addEventListener("click", startGame);
        dom.leaderboardForm.addEventListener("submit", submitLeaderboardScore);
        window.addEventListener("resize", resizeRenderer);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        document.querySelectorAll("[data-action]").forEach((button) => {
          button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            handleAction(button.dataset.action);
          });

          if (button.dataset.action === "slide") {
            ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
              button.addEventListener(eventName, () => setSlideHeld(false));
            });
          }
        });
      }

      // 开始/重开一局，并在用户手势后启动音乐。
      function startGame() {
        resetWorld();
        running = true;
        audio.playMusic();
        dom.leaderboardForm.reset();
        dom.playerName.disabled = false;
        dom.saveScoreBtn.disabled = false;
        dom.saveScoreBtn.textContent = "保存成绩";
        dom.startOverlay.classList.add("is-hidden");
        dom.gameOverOverlay.classList.add("is-hidden");
        portal.start();
      }

      // 游戏结束：停止运行、播放死亡音效、展示统计和排行榜。
      function endGame() {
        if (!running) {
          return;
        }

        running = false;
        audio.stopMusic();
        audio.play("death");
        dom.finalStats.textContent = `Score ${Math.floor(score)} · Coins ${coinCount} · Time ${formatTime(elapsed)}`;
        dom.leaderboardForm.reset();
        dom.playerName.disabled = false;
        dom.saveScoreBtn.disabled = false;
        dom.saveScoreBtn.textContent = "保存成绩";
        renderLeaderboard();
        dom.gameOverOverlay.classList.remove("is-hidden");
        portal.finish("completed", { coins: coinCount, score: Math.floor(score), time: Number(elapsed.toFixed(1)) });
        window.setTimeout(() => dom.playerName.focus(), 80);
      }

      // 提交排行榜成绩，按金币数为主排序。
      function submitLeaderboardScore(event) {
        event.preventDefault();
        if (running || scoreSubmitted) {
          return;
        }

        const name = leaderboardStore.normalizeName(dom.playerName.value);
        const ranked = leaderboardStore.saveEntry({
          name,
          coins: coinCount,
          score: Math.floor(score),
          time: Number(elapsed.toFixed(1)),
          createdAt: Date.now()
        });
        renderLeaderboard(ranked);
        scoreSubmitted = true;
        dom.playerName.value = name;
        dom.playerName.disabled = true;
        dom.saveScoreBtn.disabled = true;
        dom.saveScoreBtn.textContent = "已保存";
        portal.submitScore(name);
      }

      // 处理键盘输入，并阻止方向键/空格导致页面默认行为。
      function handleKeyDown(event) {
        const key = event.key.toLowerCase();
        const activeKeys = ["arrowleft", "arrowright", "arrowdown", "a", "d", "s", " "];
        if (activeKeys.includes(key)) {
          event.preventDefault();
        }

        if (event.repeat) {
          return;
        }

        if (key === "arrowleft" || key === "a") {
          handleAction("left");
        } else if (key === "arrowright" || key === "d") {
          handleAction("right");
        } else if (key === " ") {
          handleAction("jump");
        } else if (key === "arrowdown" || key === "s") {
          handleAction("slide");
        }
      }

      // 松开下蹲键时立即起身，不再等待固定滑行动画时间。
      function handleKeyUp(event) {
        const key = event.key.toLowerCase();
        if (key === "arrowdown" || key === "s") {
          event.preventDefault();
          setSlideHeld(false);
        }
      }

      // 将抽象动作转成车道切换、跳跃或滑行动作。
      function handleAction(action) {
        if (!running) {
          return;
        }

        if (action === "left") {
          laneIndex = Math.max(0, laneIndex - 1);
          targetX = LANES[laneIndex];
        } else if (action === "right") {
          laneIndex = Math.min(LANES.length - 1, laneIndex + 1);
          targetX = LANES[laneIndex];
        } else if (action === "jump") {
          if (player.position.y <= 0.02 && !slideHeld) {
            verticalVelocity = JUMP_VELOCITY;
            audio.play("jump");
          }
        } else if (action === "slide") {
          setSlideHeld(true);
        }
      }

      // 下蹲状态由输入按住时间决定：按下立刻变矮，松开立刻恢复。
      function setSlideHeld(isHeld) {
        slideHeld = isHeld && running;
        if (slideHeld && player.position.y <= 0.02) {
          playerVisual.scale.y = 0.48;
        } else if (!slideHeld) {
          playerVisual.scale.y = 1;
        }
      }

      // 主动画循环；即使暂停也保持渲染和待机动画。
      function animate() {
        requestAnimationFrame(animate);

        if (!clock) {
          clock = new THREE.Clock();
        }

        const dt = Math.min(clock.getDelta(), 0.034);
        if (running) {
          updateGame(dt);
        } else {
          updateIdle(dt);
        }

        renderer.render(scene, camera);
      }

      // 运行中的游戏更新：速度、移动、生成、碰撞和 HUD。
      function updateGame(dt) {
        elapsed += dt;
        visualElapsed += dt;
        applySpeedBoosts();
        updateSpeedBanner(dt);
        const move = currentSpeed * dt;
        score += move * 3.2;

        updatePlayer(dt);
        moveRoad(move);
        updateScenery(move);
        updateDynamicObjects(move);
        maybeSpawnCourse(move);
        updateCamera(dt);
        updateHud();
      }

      // 每 60 秒把当前速度乘以 1.2，并显示提速提示。
      function applySpeedBoosts() {
        while (elapsed >= nextSpeedBoostAt) {
          currentSpeed *= SPEED_BOOST_FACTOR;
          speedBoostCount += 1;
          nextSpeedBoostAt += SPEED_BOOST_INTERVAL;
          speedBannerTimer = SPEED_BANNER_DURATION;
          dom.speedBanner.textContent = `SPEED UP +20% · x${Math.pow(SPEED_BOOST_FACTOR, speedBoostCount).toFixed(2)}`;
          dom.speedBanner.classList.add("is-visible");
          audio.play("speedUp");
        }
      }

      // 控制提速提示的显示时长。
      function updateSpeedBanner(dt) {
        if (speedBannerTimer <= 0) {
          return;
        }

        speedBannerTimer = Math.max(0, speedBannerTimer - dt);
        if (speedBannerTimer === 0) {
          dom.speedBanner.classList.remove("is-visible");
        }
      }

      // 未开始或 Game Over 时的轻微待机动画。
      function updateIdle(dt) {
        visualElapsed += dt;
        playerVisual.rotation.y = Math.sin(visualElapsed * 0.8) * 0.08;
        coins.forEach((coin) => {
          coin.group.rotation.y += dt * 2.2;
        });
        updateCamera(dt);
      }

      // 更新玩家横向插值、跳跃重力和滑行动画。
      function updatePlayer(dt) {
        player.position.x = THREE.MathUtils.lerp(player.position.x, targetX, Math.min(1, dt * 11));

        if (verticalVelocity !== 0 || player.position.y > 0) {
          player.position.y += verticalVelocity * dt;
          verticalVelocity -= GRAVITY * dt;

          if (player.position.y <= 0) {
            player.position.y = 0;
            verticalVelocity = 0;
          }
        }

        const targetScaleY = slideHeld && player.position.y <= 0.02 ? 0.48 : 1;
        playerVisual.scale.y = THREE.MathUtils.lerp(playerVisual.scale.y, targetScaleY, Math.min(1, dt * 13));
        playerVisual.rotation.z = Math.sin(visualElapsed * 12) * 0.025;
        playerVisual.rotation.y = THREE.MathUtils.lerp(playerVisual.rotation.y, 0, Math.min(1, dt * 6));
      }

      // 路面段循环前移，制造玩家向前奔跑的错觉。
      function moveRoad(move) {
        roadSegments.forEach((segment) => {
          segment.position.z += move;
          if (segment.position.z > ROAD_SEGMENT_LENGTH) {
            segment.position.z -= ROAD_SEGMENT_LENGTH * ROAD_SEGMENT_COUNT;
          }
        });
      }

      // 场景装饰循环前移，超过镜头后重置到远方。
      function updateScenery(move) {
        sceneryItems.forEach((item) => {
          item.position.z += move;
          if (item.position.z > DESPAWN_Z + 12) {
            resetSceneryPosition(item, -220 - randomRange(0, 55));
          }
        });
      }

      // 更新障碍和收集品，并进行 AABB 碰撞检测。
      function updateDynamicObjects(move) {
        const playerBox = getPlayerBox();

        for (let i = obstacles.length - 1; i >= 0; i -= 1) {
          const obstacle = obstacles[i];
          obstacle.group.position.z += move;

          if (obstacle.group.position.z > DESPAWN_Z) {
            scene.remove(obstacle.group);
            obstacles.splice(i, 1);
            continue;
          }

          if (boxesOverlap(playerBox, getWorldHitbox(obstacle.group, obstacle.hitbox))) {
            endGame();
            return;
          }
        }

        for (let i = coins.length - 1; i >= 0; i -= 1) {
          const coin = coins[i];
          coin.group.position.z += move;
          coin.group.rotation.y += coin.type === "diamond" ? 0.18 : 0.12;
          coin.group.rotation.z += coin.type === "diamond" ? 0.045 : 0.025;

          if (coin.group.position.z > DESPAWN_Z) {
            scene.remove(coin.group);
            coins.splice(i, 1);
            continue;
          }

          if (boxesOverlap(playerBox, getWorldHitbox(coin.group, coin.hitbox))) {
            scene.remove(coin.group);
            coins.splice(i, 1);
            coinCount += coin.value;
            score += 25 * coin.value;
            audio.play("pickup");
          }
        }
      }

      // 按当前密度生成下一组课程事件。
      function maybeSpawnCourse(move) {
        spawnDistance += move;
        if (spawnDistance < nextSpawnDistance) {
          return;
        }

        spawnDistance = 0;
        nextSpawnDistance = randomRange(MIN_EVENT_DISTANCE, MAX_EVENT_DISTANCE);
        spawnCourseEvent(SPAWN_Z - randomRange(0, 7));
      }

      // 摄像机轻微跟随玩家横向移动；跳跃时镜头抬高并后拉，让路面产生远离感。
      function updateCamera(dt) {
        const desiredX = player.position.x * 0.42;
        const jumpViewLift = THREE.MathUtils.clamp(player.position.y / 2.0, 0, 1);
        const desiredY = 5.35 + jumpViewLift * 0.72;
        const desiredZ = 9 + jumpViewLift * 1.28;
        const desiredLookY = 1.18 + jumpViewLift * 0.36;
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, desiredX, Math.min(1, dt * 4));
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, desiredY, Math.min(1, dt * 5));
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, desiredZ, Math.min(1, dt * 5));
        lookTarget.set(player.position.x * 0.28, desiredLookY, -9.5);
        camera.lookAt(lookTarget);
      }

      // 更新计时、等级、得分和金币 HUD。
      function updateHud() {
        dom.timer.textContent = formatTime(elapsed);
        dom.level.textContent = String(speedBoostCount + 1);
        dom.score.textContent = String(Math.floor(score));
        dom.coins.textContent = String(coinCount);
      }

      // 格式化计时牌，保留到 0.1 秒。
      function formatTime(seconds) {
        const totalTenths = Math.max(0, Math.floor(seconds * 10));
        const minutes = Math.floor(totalTenths / 600);
        const wholeSeconds = Math.floor((totalTenths % 600) / 10);
        const tenths = totalTenths % 10;
        return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${tenths}`;
      }

      // 渲染 Game Over 页的金币排行榜。
      function formatLeaderboardDate(value) {
        if (!Number.isFinite(value) || value <= 0) return "—";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "—";
        return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
      }

      function renderLeaderboard(entries = leaderboardStore.getEntries()) {
        const ranked = leaderboardStore.rank(entries).slice(0, 10);
        dom.leaderboardList.innerHTML = "";

        if (ranked.length === 0) {
          const empty = document.createElement("li");
          empty.className = "leaderboard-empty";
          empty.textContent = "暂无成绩";
          dom.leaderboardList.appendChild(empty);
          return;
        }

        ranked.forEach((entry, index) => {
          const item = document.createElement("li");

          const rank = document.createElement("span");
          rank.className = "leaderboard-rank";
          rank.textContent = String(index + 1).padStart(2, "0");

          const name = document.createElement("span");
          name.className = "leaderboard-name";
          name.textContent = entry.name;

          const result = document.createElement("span");
          result.className = "leaderboard-result";
          result.textContent = `${entry.coins} 金币 · ${entry.score} 分 · ${entry.time.toFixed(1)} 秒`;

          const date = document.createElement("span");
          date.className = "leaderboard-date";
          date.textContent = formatLeaderboardDate(entry.createdAt);

          item.append(rank, name, result, date);
          dom.leaderboardList.appendChild(item);
        });
      }

      // 窗口尺寸变化时同步相机和渲染器。
      function resizeRenderer() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }

      // 创建局部碰撞盒配置。
      function makeHitbox(cx, cy, cz, sx, sy, sz) {
        return {
          center: new THREE.Vector3(cx, cy, cz),
          size: new THREE.Vector3(sx, sy, sz)
        };
      }

      // 根据玩家当前姿态生成玩家世界 AABB。
      function getPlayerBox() {
        const isSliding = (slideHeld && player.position.y <= 0.02) || playerVisual.scale.y < 0.74;
        const size = {
          x: 0.86,
          y: isSliding ? 0.82 : 1.64,
          z: 0.88
        };
        return {
          min: {
            x: player.position.x - size.x / 2,
            y: player.position.y,
            z: PLAYER_Z - size.z / 2
          },
          max: {
            x: player.position.x + size.x / 2,
            y: player.position.y + size.y,
            z: PLAYER_Z + size.z / 2
          }
        };
      }

      // 将物体局部 hitbox 转成世界 AABB。
      function getWorldHitbox(group, hitbox) {
        const center = {
          x: group.position.x + hitbox.center.x,
          y: group.position.y + hitbox.center.y,
          z: group.position.z + hitbox.center.z
        };

        return {
          min: {
            x: center.x - hitbox.size.x / 2,
            y: center.y - hitbox.size.y / 2,
            z: center.z - hitbox.size.z / 2
          },
          max: {
            x: center.x + hitbox.size.x / 2,
            y: center.y + hitbox.size.y / 2,
            z: center.z + hitbox.size.z / 2
          }
        };
      }

      // 为金币线选择一条不同于障碍的车道。
      function chooseDifferentLane(lane) {
        let next = randomInt(0, 2);
        if (next === lane) {
          next = (next + randomInt(1, 2)) % 3;
        }
        return next;
      }

    })();
