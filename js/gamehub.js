// Optional GameHub adapter for independently runnable games.
(() => {
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  class PortalBridge {
    constructor({ gameId, mode = "default", ranking = true, onBoard = null, isPlaying = () => false }) {
      this.gameId = gameId;
      this.mode = mode;
      this.ranking = ranking;
      this.onBoard = onBoard;
      this.isPlaying = isPlaying;
      this.enabled = location.pathname.startsWith(`/gamehub/play/${gameId}/`);
      this.returnButton = document.getElementById("portalReturn");
      this.status = document.getElementById("portalStatus");
      this.retryButton = document.getElementById("portalRetry");
      this.boardTitle = document.querySelector(".leaderboard-title");
      this.pageId = uuid();
      this.guestPromise = null;
      this.entryPromise = null;
      this.entered = false;
      this.currentRun = null;
      this.telemetry = null;
      this.playing = false;
      if (this.enabled) this.activate();
    }

    activate() {
      this.returnButton.hidden = false;
      this.returnButton.addEventListener("click", () => {
        const record = this.currentRun;
        const pending = record?.finishBody && (!record.finished || (record.nickname && !record.saved));
        if ((this.isPlaying() || pending) && !confirm(
          this.isPlaying() ? "本局还没有结束，返回首页会放弃本局成绩。确定返回吗？"
            : record.nickname ? "成绩尚未同步到全站排行榜，确定返回首页吗？"
              : "本局尚未同步到门户，确定返回首页吗？",
        )) return;
        location.assign("/gamehub/");
      });
      this.retryButton?.addEventListener("click", () => this.retry());
      this.ensureEntry().catch(() => {});
      import("/gamehub/assets/telemetry.js").then(({ createTelemetry }) => {
        this.telemetry = createTelemetry({
          kind: "game", gameId: this.gameId, pageId: this.pageId,
          getGuest: () => this.guest(), initialPlaying: this.playing,
        });
      }).catch(() => {});
    }

    start() {
      if (!this.enabled) return;
      this.playing = true;
      this.telemetry?.setPlaying(true);
      this.currentRun = {
        requestId: uuid(), runId: null, startPromise: null,
        finishBody: null, finishPromise: null, finished: false,
        nickname: null, scorePromise: null, saved: false,
      };
      this.ensureEntry().catch(() => {});
      this.ensureRun(this.currentRun).catch(() => {});
    }

    finish(outcome, metrics) {
      if (!this.enabled) return;
      const record = this.currentRun;
      if (!record || record.finishBody) return;
      this.playing = false;
      this.telemetry?.setPlaying(false);
      record.finishBody = { outcome, metrics };
      this.show("正在同步本局成绩…");
      this.ensureFinish(record).then(() => {
        if (this.currentRun === record && !record.nickname)
          this.show(this.ranking ? "本局已记录。输入昵称后可加入全站排行榜。" : "本局已记录到门户。");
      }).catch(() => {
        if (this.currentRun === record && !record.nickname) this.showFailure("本局尚未同步到门户，请重试。");
      });
      if (this.ranking) this.refreshBoard(record);
    }

    submitScore(nickname) {
      if (!this.enabled || !this.ranking) return;
      const record = this.currentRun;
      if (!record?.finishBody) return;
      record.nickname = nickname.trim() || "Player";
      if (this.boardTitle) this.boardTitle.textContent = "本机记录";
      this.syncScore(record);
    }

    retry() {
      const record = this.currentRun;
      if (!record?.finishBody) return;
      if (record.nickname) this.syncScore(record);
      else {
        this.show("正在重试同步本局…");
        this.ensureFinish(record).then(() => {
          if (this.currentRun === record)
            this.show(this.ranking ? "本局已记录。输入昵称后可加入全站排行榜。" : "本局已记录到门户。");
        }).catch(() => {
          if (this.currentRun === record) this.showFailure("本局尚未同步到门户，请重试。");
        });
      }
    }

    async refreshBoard(record = this.currentRun) {
      if (!this.enabled || !this.ranking || !this.onBoard) return;
      try {
        const response = await fetch(`/gamehub/api/leaderboards/${this.gameId}?limit=10`, {
          credentials: "same-origin", signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error("排行榜暂不可用");
        const data = await response.json();
        if (record === this.currentRun && record?.finishBody) {
          this.boardTitle.textContent = "全站排行榜";
          this.onBoard(data.entries);
        }
      } catch {
        // Keep the local list; score sync has its own explicit status.
      }
    }

    show(message, retryable = false) {
      if (!this.status) return;
      this.status.textContent = message;
      this.status.hidden = !message;
      if (this.retryButton) this.retryButton.hidden = !retryable;
    }

    showFailure(message) {
      this.show(message, true);
      if (this.retryButton) this.retryButton.textContent = this.currentRun?.nickname ? "重试同步成绩" : "重试同步本局";
    }

    syncScore(record) {
      if (record.saved || record.scorePromise) return;
      if (this.currentRun === record) this.show("正在同步到全站排行榜…");
      record.scorePromise = (async () => {
        await this.ensureFinish(record);
        await this.post(`runs/${record.runId}/score`, { nickname: record.nickname });
        record.saved = true;
        if (this.currentRun === record) {
          this.show("成绩已加入全站排行榜。");
          await this.refreshBoard(record);
        }
      })().catch(() => {
        if (this.currentRun === record) this.showFailure("本机已记录，尚未加入全站排行榜，请重试。");
      }).finally(() => { record.scorePromise = null; });
    }

    ensureRun(record) {
      if (record.runId) return Promise.resolve(record.runId);
      if (!record.startPromise) record.startPromise = this.post("runs", {
        requestId: record.requestId, gameId: this.gameId, mode: this.mode, rulesVersion: "v1",
      }).then(data => { record.runId = data.runId; return data.runId; })
        .finally(() => { record.startPromise = null; });
      return record.startPromise;
    }

    ensureFinish(record) {
      if (!record.finishPromise) record.finishPromise = (async () => {
        await this.ensureRun(record);
        const result = await this.post(`runs/${record.runId}/finish`, record.finishBody);
        record.finished = true;
        return result;
      })().catch(error => { record.finishPromise = null; throw error; });
      return record.finishPromise;
    }

    ensureEntry() {
      if (this.entered) return Promise.resolve();
      if (!this.entryPromise) this.entryPromise = this.post("entries", {
        pageId: this.pageId, gameId: this.gameId,
      }).then(() => { this.entered = true; }).finally(() => { this.entryPromise = null; });
      return this.entryPromise;
    }

    guest() {
      if (!this.guestPromise) this.guestPromise = fetch("/gamehub/api/guest", {
        credentials: "same-origin", signal: AbortSignal.timeout(8000),
      }).then(response => {
        if (!response.ok) throw new Error("游客身份暂不可用");
        return response.json();
      }).catch(error => { this.guestPromise = null; throw error; });
      return this.guestPromise;
    }

    async post(path, body) {
      const guest = await this.guest();
      const response = await fetch(`/gamehub/api/${path}`, {
        method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(8000),
        headers: { "Content-Type": "application/json", "X-GameHub-CSRF": guest.csrfToken },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`门户接口返回 ${response.status}`);
      return response.json();
    }
  }

  window.createGameHubBridge = options => new PortalBridge(options);
})();
