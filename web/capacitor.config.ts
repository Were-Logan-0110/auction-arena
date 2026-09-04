import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mainrocksfr.auctionarena",
  appName: "Auction Arena",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
