import { defineConfig } from "astro/config";
import soraneAstro from "@sorane/astro";

export default defineConfig({
  integrations: [
    soraneAstro({
      site: {
        title: "sorane Astro minimal",
        description: "Astro-rendered content with sorane OKF outputs",
        baseUrl: "https://example.dev",
      },
      collections: {
        posts: "blog",
      },
      validate: "error",
    }),
  ],
});
