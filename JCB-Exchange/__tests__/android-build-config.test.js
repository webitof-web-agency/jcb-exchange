const fs = require('node:fs');
const path = require('node:path');

const androidDir = path.join(__dirname, '..', 'android');
const appBuildGradle = fs.readFileSync(
  path.join(androidDir, 'app', 'build.gradle'),
  'utf8',
);
const rootBuildGradle = fs.readFileSync(
  path.join(androidDir, 'build.gradle'),
  'utf8',
);
const reactNativeVersions = fs.readFileSync(
  path.join(__dirname, '..', 'node_modules', 'react-native', 'gradle', 'libs.versions.toml'),
  'utf8',
);

describe('Android Gradle plugin configuration', () => {
  test('uses the Kotlin version required by the installed React Native Gradle plugin', () => {
    const expectedKotlinVersion = reactNativeVersions.match(/^kotlin\s*=\s*"([^"]+)"$/m)?.[1];

    expect(expectedKotlinVersion).toBeTruthy();
    expect(rootBuildGradle).toContain(`kotlinVersion = "${expectedKotlinVersion}"`);
  });

  test('applies the Kotlin Android plugin exactly once', () => {
    const kotlinPluginApplications = appBuildGradle.match(
      /(?:apply plugin:\s*["']org\.jetbrains\.kotlin\.android["']|id\(["']org\.jetbrains\.kotlin\.android["']\))/g,
    ) || [];

    expect(kotlinPluginApplications).toHaveLength(1);
  });
});
