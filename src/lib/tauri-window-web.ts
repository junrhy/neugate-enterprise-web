export function getCurrentWindow() {
  return {
    setTitle: async (title: string) => {
      document.title = title;
    },
    setFullscreen: async (fullscreen: boolean) => {
      if (fullscreen) {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        }
      } else {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    },
    hide: async () => {},
    show: async () => {},
    close: async () => {},
    minimize: async () => {},
    maximize: async () => {},
    unmaximize: async () => {},
    isMaximized: async () => false,
  };
}
