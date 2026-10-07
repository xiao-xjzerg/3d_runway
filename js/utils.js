(() => {
  // 返回 [min, max) 范围内的浮点随机数。
  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  // 返回包含 min 和 max 的整数随机数。
  function randomInt(min, max) {
    return Math.floor(randomRange(min, max + 1));
  }

  // Fisher-Yates 原地洗牌。
  function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = randomInt(0, i);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  // 标准 AABB 重叠检测。
  function boxesOverlap(a, b) {
    return (
      a.min.x <= b.max.x &&
      a.max.x >= b.min.x &&
      a.min.y <= b.max.y &&
      a.max.y >= b.min.y &&
      a.min.z <= b.max.z &&
      a.max.z >= b.min.z
    );
  }

  window.RunwayUtils = Object.freeze({
    randomRange,
    randomInt,
    shuffleInPlace,
    boxesOverlap
  });
})();
