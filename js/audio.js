(() => {
  // 创建独立音频控制器，负责预载、音量、循环和播放失败兜底。
  function createController(audioFiles = window.RUNWAY_CONFIG.audio) {
    const elements = Object.fromEntries(
      Object.entries(audioFiles).map(([key, src]) => {
        const element = new Audio(src);
        element.preload = "auto";
        element.volume = key === "music" ? 0.46 : 0.64;
        element.loop = key === "music";
        return [key, element];
      })
    );

    return Object.freeze({
      play(name) {
        const element = elements[name];
        if (!element) {
          return;
        }
        element.currentTime = 0;
        element.play().catch(() => {});
      },

      playMusic() {
        const music = elements.music;
        music.currentTime = 0;
        music.play().catch(() => {});
      },

      stopMusic() {
        const music = elements.music;
        music.pause();
        music.currentTime = 0;
      }
    });
  }

  window.RunwayAudio = Object.freeze({ createController });
})();
