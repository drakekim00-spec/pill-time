import { defineConfig } from "@apps-in-toss/web-framework/config";

/**
 * appName · displayName · icon 은 앱인토스 콘솔 등록값과 동일하게 맞추세요.
 * https://developers-apps-in-toss.toss.im/
 */
export default defineConfig({
  appName: "pill-time",
  brand: {
    displayName: "복약 알림",
    primaryColor: "#6ba8ff",
    icon: "",
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
