import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(scriptDirectory, '..');
const repositoryDirectory = resolve(appDirectory, '..');
const workflow = readFileSync(resolve(repositoryDirectory, '.github/workflows/build-ios-ipa.yml'), 'utf8');
const project = readFileSync(resolve(appDirectory, 'ios/JCBExchange.xcodeproj/project.pbxproj'), 'utf8');
const podfile = readFileSync(resolve(appDirectory, 'ios/Podfile'), 'utf8');
const infoPlist = readFileSync(resolve(appDirectory, 'ios/JCBExchange/Info.plist'), 'utf8');
const appDelegate = readFileSync(resolve(appDirectory, 'ios/JCBExchange/AppDelegate.swift'), 'utf8');
const appIcon = readFileSync(resolve(appDirectory, 'ios/JCBExchange/Images.xcassets/AppIcon.appiconset/Contents.json'), 'utf8');

test('iOS native target matches the JavaScript app identity', () => {
  assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = "com\.webitof\.jcbexchange";/);
  assert.match(project, /productName = JCBExchange;/);
  assert.match(podfile, /target 'JCBExchange' do/);
  assert.match(appDelegate, /withModuleName: "JCBExchange"/);
});

test('iOS release metadata and required permissions are configured', () => {
  assert.match(infoPlist, /<string>JCB Exchange<\/string>/);
  assert.match(infoPlist, /NSCameraUsageDescription/);
  assert.match(infoPlist, /NSPhotoLibraryUsageDescription/);
  assert.match(infoPlist, /<string>remote-notification<\/string>/);
  assert.match(appIcon, /AppIcon-1024\.png/);
});

test('Firebase configuration is optional locally but copied into release bundles when supplied', () => {
  assert.match(project, /Copy Firebase configuration when provided/);
  assert.match(project, /GoogleService-Info\.plist/);
  assert.match(workflow, /FIREBASE_IOS_PLIST_BASE64/);
  assert.match(workflow, /base64 --decode > ios\/JCBExchange\/GoogleService-Info\.plist/);
});

test('GitHub Actions exposes a signed IPA workflow with safe signing inputs', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /runs-on: macos-14/);
  assert.match(workflow, /build_output:/);
  assert.match(workflow, /- ipa/);
  assert.match(workflow, /IOS_CERTIFICATE_BASE64/);
  assert.match(workflow, /IOS_PROVISIONING_PROFILE_BASE64/);
  assert.match(workflow, /IOS_TEAM_ID/);
  assert.match(workflow, /bundle exec pod install --project-directory=ios/);
  assert.match(workflow, /-exportArchive/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});
