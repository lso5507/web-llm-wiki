import { rmSync } from "node:fs";

rmSync(new URL("../.runtime", import.meta.url), {
  force: true,
  recursive: true,
});
