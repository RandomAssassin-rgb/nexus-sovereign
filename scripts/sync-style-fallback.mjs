import { copyFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const assetsDir = join(root, "dist", "assets");
const outputFile = join(root, "public", "nexus-ui-fallback.css");

const cssFiles = (await readdir(assetsDir)).filter((file) => file.endsWith(".css"));

if (cssFiles.length === 0) {
  throw new Error(`No CSS files found in ${assetsDir}`);
}

const preferredFile = cssFiles.find((file) => /^index-.*\.css$/i.test(file));

const selectedFile =
  preferredFile ||
  (
    await Promise.all(
      cssFiles.map(async (file) => ({
        file,
        size: (await stat(join(assetsDir, file))).size,
      })),
    )
  )
    .sort((left, right) => right.size - left.size)[0]
    .file;

await copyFile(join(assetsDir, selectedFile), outputFile);
console.log(`Synced ${selectedFile} -> public/nexus-ui-fallback.css`);
