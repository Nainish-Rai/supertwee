import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

const BROWSERS = [
  {
    id: 'chrome',
    displayName: 'Google Chrome',
    cookieBackend: 'chromium',
    keychainEntries: [
      { service: 'Chrome Safe Storage', account: 'Chrome' },
      { service: 'Chrome Safe Storage', account: 'Google Chrome' },
      { service: 'Google Chrome Safe Storage', account: 'Chrome' },
      { service: 'Google Chrome Safe Storage', account: 'Google Chrome' }
    ],
    macPath: 'Library/Application Support/Google/Chrome',
    linuxPath: '.config/google-chrome',
    winPath: 'AppData/Local/Google/Chrome/User Data'
  },
  {
    id: 'chromium',
    displayName: 'Chromium',
    cookieBackend: 'chromium',
    keychainEntries: [{ service: 'Chromium Safe Storage', account: 'Chromium' }],
    macPath: 'Library/Application Support/Chromium',
    linuxPath: '.config/chromium',
    winPath: 'AppData/Local/Chromium/User Data'
  },
  {
    id: 'brave',
    displayName: 'Brave',
    cookieBackend: 'chromium',
    keychainEntries: [
      { service: 'Brave Safe Storage', account: 'Brave' },
      { service: 'Brave Browser Safe Storage', account: 'Brave Browser' }
    ],
    macPath: 'Library/Application Support/BraveSoftware/Brave-Browser',
    linuxPath: '.config/BraveSoftware/Brave-Browser',
    winPath: 'AppData/Local/BraveSoftware/Brave-Browser/User Data'
  },
  {
    id: 'edge',
    displayName: 'Microsoft Edge',
    cookieBackend: 'chromium',
    keychainEntries: [
      { service: 'Microsoft Edge Safe Storage', account: 'Microsoft Edge' },
      { service: 'Edge Safe Storage', account: 'Microsoft Edge' }
    ],
    macPath: 'Library/Application Support/Microsoft Edge',
    linuxPath: '.config/microsoft-edge',
    winPath: 'AppData/Local/Microsoft/Edge/User Data'
  },
  {
    id: 'helium',
    displayName: 'Helium',
    cookieBackend: 'chromium',
    keychainEntries: [{ service: 'Helium Storage Key', account: 'Helium' }],
    macPath: 'Library/Application Support/net.imput.helium'
  },
  {
    id: 'comet',
    displayName: 'Comet',
    cookieBackend: 'chromium',
    keychainEntries: [{ service: 'Comet Safe Storage', account: 'Comet' }],
    macPath: 'Library/Application Support/Comet'
  },
  {
    id: 'dia',
    displayName: 'Dia',
    cookieBackend: 'chromium',
    keychainEntries: [{ service: 'Dia Safe Storage', account: 'Dia' }],
    macPath: 'Library/Application Support/Dia/User Data'
  },
  {
    id: 'firefox',
    displayName: 'Firefox',
    cookieBackend: 'firefox',
    keychainEntries: [],
    macPath: 'Library/Application Support/Firefox',
    linuxPath: '.mozilla/firefox',
    winPath: 'AppData/Roaming/Mozilla/Firefox'
  }
];

export function getBrowser(id) {
  const normalized = String(id).trim().toLowerCase();
  const found = BROWSERS.find((browser) => browser.id === normalized);
  if (!found) {
    throw new Error(`Unknown browser: "${id}"\nSupported browsers: ${BROWSERS.map((browser) => browser.id).join(', ')}`);
  }
  return found;
}

export function listBrowserIds() {
  return BROWSERS.map((browser) => browser.id);
}

export function browserUserDataDir(browser) {
  const home = homedir();
  const os = platform();
  if (os === 'darwin' && browser.macPath) return join(home, browser.macPath);
  if (os === 'linux' && browser.linuxPath) return join(home, browser.linuxPath);
  if (os === 'win32' && browser.winPath) return join(home, browser.winPath);
  return undefined;
}

export function detectBrowser() {
  const chromiumBrowsers = BROWSERS.filter((browser) => browser.cookieBackend === 'chromium');
  for (const browser of chromiumBrowsers) {
    const dir = browserUserDataDir(browser);
    if (dir && existsSync(dir)) return browser;
  }
  return BROWSERS[0];
}

export function getKeychainEntries(browser) {
  return browser.keychainEntries;
}
