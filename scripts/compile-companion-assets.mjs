import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import { compileVectorAssetFile, compiledAssetModuleSource } from 'bloom-gamekit-tooling/modules/vector-assets/compiler.js';
import { validateCompiledAsset } from 'bloom-gamekit-tooling/modules/vector-assets/schema.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GAMEKIT_SOURCE_COMMIT = '9f3b67625cae75c80c58a293fd7a7a94486e403b';
const COMPILER_VERSION = '0.6.0';
const CURVE_SEGMENTS = 16;

export async function compileCompanionAssets() {
  const sourcePath = resolve(ROOT, 'src/assets/companions/pebble-mole.svg');
  const source = await readFile(sourcePath);
  const asset = await compileVectorAssetFile(sourcePath, 'src/assets/companions/pebble-mole.svg', { curveSegments: CURVE_SEGMENTS });
  validateCompiledAsset(asset);
  if (asset.compilerVersion !== COMPILER_VERSION) {
    throw new Error(`Bloom GameKit vector compiler mismatch: ${asset.compilerVersion} != ${COMPILER_VERSION}`);
  }

  const outputDir = resolve(ROOT, 'dist/.generated');
  await mkdir(outputDir, { recursive: true });
  const { sourcePaths, ...runtimeAsset } = asset;
  await writeFile(resolve(outputDir, 'pebble-mole.compiled.js'), compiledAssetModuleSource(runtimeAsset, 'pebbleMole'));
  const entryPath = resolve(outputDir, 'companion-vector-runtime-entry.mjs');
  await writeFile(entryPath, [
    "import { WebGLDevice, MeshRenderer } from 'bloom-gamekit-tooling/modules/rendering/index.js';",
    "import { createVectorAsset } from 'bloom-gamekit-tooling/modules/vector-assets/index.js';",
    "import { pebbleMole } from './pebble-mole.compiled.js';",
    'globalThis.DigmoriVectorKit = Object.freeze({ WebGLDevice, MeshRenderer, createVectorAsset, pebbleMole });',
    '',
  ].join('\n'));
  const result = await bundle({
    entryPoints: [entryPath],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    write: false,
  });
  if (result.errors.length) throw new Error(result.errors.map(error => error.text).join('\n'));

  return {
    runtimeCode: result.outputFiles[0].text,
    gamekitSourceCommit: GAMEKIT_SOURCE_COMMIT,
    compilerVersion: asset.compilerVersion,
    curveSegments: CURVE_SEGMENTS,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    geometryBytes: asset.geometry.vertices.byteLength + asset.geometry.indices.byteLength
      + Object.values(asset.geometry.expressionIndices).reduce((total, indices) => total + indices.byteLength, 0),
    vertices: asset.geometry.vertices.length / asset.geometry.strideFloats,
    triangles: asset.geometry.indices.length / 3,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await compileCompanionAssets();
  console.log(JSON.stringify({ ...result, runtimeCode: undefined }, null, 2));
}
