import {join} from "node:path";
import tailwind from "bun-plugin-tailwind";

await Bun.build({
  entrypoints: [join(import.meta.dir, "ui", "index.html")],
  outdir: join(import.meta.dir, "dist-ui"),
  plugins: [tailwind],
  minify: true,
  target: "browser",
  sourcemap: "none",
});
