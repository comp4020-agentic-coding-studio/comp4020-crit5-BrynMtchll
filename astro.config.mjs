import { defineConfig } from "astro/config";

// Deployed under username.github.io/comp4020-crit5-BrynMtchll/, so every
// internal link and asset URL needs that path prefix. Astro applies `base` to
// asset URLs it generates itself (this file's imported CSS, `astro:assets`)
// automatically; anything you write by hand — an `<a href>`, a fetch path —
// needs `import.meta.env.BASE_URL` prepended yourself, or it 404s once
// deployed while working fine locally at the site root.
export default defineConfig({
  base: "/comp4020-crit5-BrynMtchll/",
});
