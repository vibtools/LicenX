import * as archiverModule from "archiver";
import fs from "node:fs";
import path from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sdkDirectory = path.join(projectRoot, "SDK", "x_license_python");
const publicDirectory = path.join(projectRoot, "public");
const archivePath = path.join(publicDirectory, "x_license_python.zip");
const tempArchivePath = `${archivePath}.${process.pid}.tmp`;
const fixedArchiveDate = new Date("2000-01-01T00:00:00.000Z");

async function collectSdkFiles(directory, rootDirectory = directory) {
  const entries = await fs.promises.readdir(directory, {
    withFileTypes: true,
  });
  entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );

  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(rootDirectory, absolutePath);
    if (
      relativePath.includes("__pycache__") ||
      relativePath.endsWith(".pyc") ||
      relativePath.includes(".DS_Store")
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await collectSdkFiles(absolutePath, rootDirectory)));
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        archivePath: `x_license_python/${relativePath.split(path.sep).join("/")}`,
      });
    }
  }
  return files;
}

async function buildArchive() {
  if (!fs.existsSync(sdkDirectory)) {
    throw new Error(`Python SDK source directory not found: ${sdkDirectory}`);
  }

  const files = await collectSdkFiles(sdkDirectory);
  if (files.length === 0) {
    throw new Error("Python SDK source directory contains no package files");
  }

  const ZipClass =
    archiverModule.ZipArchive || archiverModule.default || archiverModule;
  const archive =
    typeof ZipClass === "function" && ZipClass.prototype?.file
      ? new ZipClass({ zlib: { level: 9 } })
      : ZipClass("zip", { zlib: { level: 9 } });
  const output = fs.createWriteStream(tempArchivePath);
  const outputFinished = finished(output);

  archive.on("error", (error) => output.destroy(error));
  archive.pipe(output);
  for (const file of files) {
    archive.append(await fs.promises.readFile(file.absolutePath), {
      name: file.archivePath,
      date: fixedArchiveDate,
      mode: 0o644,
    });
  }

  try {
    await archive.finalize();
    await outputFinished;
    await fs.promises.rename(tempArchivePath, archivePath);
  } catch (error) {
    await fs.promises.rm(tempArchivePath, { force: true });
    throw error;
  }

  console.log(`Generated ${archivePath} from ${files.length} SDK files.`);
}

buildArchive().catch((error) => {
  console.error(`Failed to generate Python SDK archive: ${error.message}`);
  process.exitCode = 1;
});
