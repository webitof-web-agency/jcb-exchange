import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(scriptDirectory, '..');
const repositoryDirectory = resolve(appDirectory, '..');
const packageJson = JSON.parse(readFileSync(resolve(appDirectory, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(resolve(appDirectory, 'package-lock.json'), 'utf8'));
const workflow = readFileSync(resolve(repositoryDirectory, '.github/workflows/build-apk.yml'), 'utf8');
const androidBuild = readFileSync(resolve(appDirectory, 'android/build.gradle'), 'utf8');
const androidProperties = readFileSync(resolve(appDirectory, 'android/gradle.properties'), 'utf8');

test('Android dependencies stay compatible with React Native 0.87 and AGP 9', () => {
  assert.equal(packageJson.dependencies['react-native-safe-area-context'], '5.10.1');
  assert.equal(packageLock.packages['node_modules/react-native-safe-area-context'].version, '5.10.1');
});

test('GitHub Actions uses the Node version required by the mobile project', () => {
  assert.match(workflow, /node-version:\s*['"]22\.13\.0['"]/);
});

test('Android SDK versions match the React Native 0.87 toolchain', () => {
  assert.match(androidBuild, /buildToolsVersion\s*=\s*["']37\.0\.0["']/);
  assert.match(androidBuild, /compileSdkVersion\s*=\s*37/);
});

test('AGP 9 uses the React Native template Kotlin and DSL compatibility switches', () => {
  assert.match(androidProperties, /^android\.builtInKotlin=false$/m);
  assert.match(androidProperties, /^android\.newDsl=false$/m);
});
