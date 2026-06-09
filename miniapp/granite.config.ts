import { defineConfig } from "@apps-in-toss/web-framework/config";

/**
 * appName · displayName · icon 은 앱인토스 콘솔 등록값과 동일하게 맞추세요.
 * https://developers-apps-in-toss.toss.im/
 */
export default defineConfig({
  appName: "pill-time",
  brand: {
    displayName: "약먹을시간",
    primaryColor: "#6ba8ff",
    icon: "https://drakekim00-spec.github.io/pill-time/brand-icon.png",
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite dev",
      build: "vite build",
    },
  },
  permissions: [],
  outdir: "dist",
});
