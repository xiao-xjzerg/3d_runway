(() => {
  // 创建排行榜存储实例，使未来不同模式可以使用不同 localStorage key。
  function createStore(storageKey) {
    function normalizeName(value) {
      const name = value.trim().replace(/\s+/g, " ").slice(0, 16);
      return name || "PLAYER";
    }

    function rank(entries) {
      return entries.slice().sort((a, b) => (
        b.coins - a.coins ||
        b.score - a.score ||
        a.time - b.time ||
        b.createdAt - a.createdAt
      ));
    }

    function getEntries() {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
        if (!Array.isArray(parsed)) {
          return [];
        }

        return parsed
          .filter((entry) => entry && typeof entry.name === "string")
          .map((entry) => ({
            name: normalizeName(entry.name),
            coins: Number.isFinite(Number(entry.coins)) ? Number(entry.coins) : 0,
            score: Number.isFinite(Number(entry.score)) ? Number(entry.score) : 0,
            time: Number.isFinite(Number(entry.time)) ? Number(entry.time) : 0,
            createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : 0
          }));
      } catch (error) {
        return [];
      }
    }

    function saveEntry(entry) {
      const ranked = rank([...getEntries(), entry]).slice(0, 10);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(ranked));
      } catch (error) {
        // 受限浏览器环境可能禁用 localStorage，仍返回内存排行榜。
      }
      return ranked;
    }

    return Object.freeze({
      normalizeName,
      rank,
      getEntries,
      saveEntry
    });
  }

  window.RunwayLeaderboard = Object.freeze({ createStore });
})();
