import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { pbkdf2Sync, createDecipheriv, randomUUID } from 'node:crypto';
import { join, win32 as winPath } from 'node:path';
import { platform, tmpdir } from 'node:os';
import { getKeychainEntries } from './browsers.mjs';

const WINDOWS_DPAPI_RUNTIME_HINT =
  'DPAPI types are unavailable in this PowerShell runtime. Prefer Windows PowerShell (powershell.exe).';

function getMacOSKey(browser) {
  const candidates = getKeychainEntries(browser);
  for (const candidate of candidates) {
    try {
      const password = execFileSync(
        'security',
        ['find-generic-password', '-w', '-s', candidate.service, '-a', candidate.account],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      if (password) return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
    } catch {}
  }
  throw new Error(
    `Could not read ${browser.displayName} Safe Storage password from macOS Keychain.\n` +
      'Fix: open the browser profile logged into X, then retry.\n' +
      'Or pass cookies manually:  supertwee sync --cookies <ct0> <auth_token>'
  );
}

function getLinuxKeys(browser) {
  const v10 = pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');
  const appNames = {
    chrome: ['chrome'],
    chromium: ['chromium'],
    brave: ['brave'],
    helium: ['chrome'],
    comet: ['chrome']
  };
  const apps = appNames[browser.id] ?? ['chrome'];
  for (const app of apps) {
    try {
      const password = execFileSync('secret-tool', ['lookup', 'application', app], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000
      }).trim();
      if (password) return { v10, v11: pbkdf2Sync(password, 'saltysalt', 1, 16, 'sha1') };
    } catch {}
  }
  return { v10, v11: null };
}

function windowsPowerShellCandidates(env = process.env, pathExists = existsSync) {
  const systemRoot = env.SystemRoot || env.WINDIR;
  if (!systemRoot || !winPath.isAbsolute(systemRoot)) return [];
  const candidates = [
    winPath.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    winPath.join(systemRoot, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  ];
  return [...new Set(candidates.filter((candidate) => pathExists(candidate)))];
}

function buildWindowsDpapiScript(outputMode) {
  const outputLine =
    outputMode === 'base64'
      ? '    [System.Console]::WriteLine([System.Convert]::ToBase64String($dec))'
      : '    [System.Console]::WriteLine([System.Text.Encoding]::UTF8.GetString($dec))';
  return [
    "$ErrorActionPreference = 'Stop'",
    "$assemblies = @('System.Security.Cryptography.ProtectedData', 'System.Security')",
    '$dpapiReady = $false',
    'foreach ($assembly in $assemblies) {',
    '  try { Add-Type -AssemblyName $assembly -ErrorAction Stop | Out-Null } catch {}',
    '  try {',
    '    [void][System.Security.Cryptography.ProtectedData]',
    '    [void][System.Security.Cryptography.DataProtectionScope]',
    '    $dpapiReady = $true',
    '    break',
    '  } catch {}',
    '}',
    'if (-not $dpapiReady) {',
    `  throw '${WINDOWS_DPAPI_RUNTIME_HINT}'`,
    '}',
    '$input | ForEach-Object {',
    '  $line = "$_".Trim()',
    '  if ($line) {',
    '    $bytes = [System.Convert]::FromBase64String($line)',
    '    $dec = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
    outputLine,
    '  }',
    '}'
  ].join('\n');
}

function runWindowsDpapi(encryptedValue, outputMode, options) {
  const script = buildWindowsDpapiScript(outputMode);
  const commands = windowsPowerShellCandidates(options.env, options.pathExists);
  let sawRuntime = false;
  let lastProblem = '';

  for (const command of commands) {
    const result = (options.spawn ?? spawnSync)(command, ['-NonInteractive', '-NoProfile', '-Command', script], {
      input: encryptedValue.toString('base64'),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeoutMs,
      windowsHide: true
    });

    const out = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    const err = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    if (result.error) {
      if (result.error.code === 'ENOENT') continue;
      sawRuntime = true;
      lastProblem = `${command}: ${result.error.message}`;
      continue;
    }

    sawRuntime = true;
    if (result.status === 0 && out) return out;
    const detail = err || `Process exited with status ${result.status ?? 'unknown'}.`;
    if (!lastProblem || detail.includes(WINDOWS_DPAPI_RUNTIME_HINT)) {
      lastProblem = `${command}: ${detail}`;
    }
  }

  if (!sawRuntime) {
    throw new Error(
      `${options.failureLabel}\n` +
        'Could not find a trusted Windows PowerShell binary for DPAPI decryption.\n' +
        'Expected Windows PowerShell under %SystemRoot%\\System32 or %SystemRoot%\\Sysnative.\n' +
        'Or pass cookies manually:  supertwee sync --cookies <ct0> <auth_token>'
    );
  }

  throw new Error(
    `${options.failureLabel}\n` +
      (lastProblem ? `${lastProblem}\n` : '') +
      'Try running as the same Windows user that owns the browser profile.\n' +
      'Or pass cookies manually:  supertwee sync --cookies <ct0> <auth_token>'
  );
}

function getWindowsKey(chromeUserDataDir, browser) {
  const localStatePath = join(chromeUserDataDir, 'Local State');
  if (!existsSync(localStatePath)) {
    throw new Error(
      `${browser.displayName} "Local State" not found at: ${localStatePath}\n` +
        'Make sure the browser is installed and has been opened at least once.\n' +
        'Or pass cookies manually:  supertwee sync --cookies <ct0> <auth_token>'
    );
  }

  let localState;
  try {
    localState = JSON.parse(readFileSync(localStatePath, 'utf8'));
  } catch {
    throw new Error(`Could not read Local State at: ${localStatePath}`);
  }

  const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;
  if (!encryptedKeyB64) {
    throw new Error(
      'Could not find os_crypt.encrypted_key in Local State.\n' +
        'Pass cookies manually:  supertwee sync --cookies <ct0> <auth_token>'
    );
  }

  const encryptedKeyWithPrefix = Buffer.from(encryptedKeyB64, 'base64');
  if (encryptedKeyWithPrefix.subarray(0, 5).toString('ascii') !== 'DPAPI') {
    throw new Error('Encryption key does not have expected DPAPI prefix.');
  }

  const encryptedKey = encryptedKeyWithPrefix.subarray(5);
  const out = runWindowsDpapi(encryptedKey, 'base64', {
    failureLabel: 'Could not decrypt encryption key via DPAPI.',
    timeoutMs: 10000
  });
  return Buffer.from(out, 'base64');
}

function decryptWindowsCookie(encryptedValue, key) {
  if (encryptedValue.length > 3 && encryptedValue.subarray(0, 3).toString('ascii') === 'v10') {
    const nonce = encryptedValue.subarray(3, 15);
    const ciphertextAndTag = encryptedValue.subarray(15);
    const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);
    const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  }

  try {
    const out = runWindowsDpapi(encryptedValue, 'utf8', {
      failureLabel: 'Could not decrypt Windows cookie via DPAPI.',
      timeoutMs: 5000
    });
    if (out) return out;
  } catch {}

  return encryptedValue.toString('utf8');
}

function sanitizeCookieValue(name, value, browser) {
  const cleaned = value.replace(/\0+$/g, '').trim();
  if (!cleaned) {
    throw new Error(
      `Cookie ${name} was empty after decryption.\n\n` +
        'This usually happens when the browser is open. Try:\n' +
        `  1. Close ${browser.displayName} completely and run supertwee sync again\n` +
        '  2. Try a different profile:\n' +
        '     supertwee sync --chrome-profile-directory "Profile 1"\n' +
        '  3. Or pass cookies manually:\n' +
        '     supertwee sync --cookies <ct0> <auth_token>'
    );
  }
  if (!/^[\x21-\x7E]+$/.test(cleaned)) {
    throw new Error(
      `Could not decrypt the ${name} cookie.\n\n` +
        'This usually happens when the browser is open or the wrong profile is selected.\n\n' +
        'Try:\n' +
        `  1. Close ${browser.displayName} completely and run supertwee sync again\n` +
        '  2. Try a different profile:\n' +
        '     supertwee sync --chrome-profile-directory "Profile 1"\n' +
        '  3. Or pass cookies manually:\n' +
        '     supertwee sync --cookies <ct0> <auth_token>'
    );
  }
  return cleaned;
}

function decryptCookieValue(encryptedValue, key, dbVersion = 0, v11Key) {
  if (encryptedValue.length === 0) return '';
  const isV10 = encryptedValue[0] === 0x76 && encryptedValue[1] === 0x31 && encryptedValue[2] === 0x30;
  const isV11 = encryptedValue[0] === 0x76 && encryptedValue[1] === 0x31 && encryptedValue[2] === 0x31;

  if (isV10 || isV11) {
    if (isV11 && v11Key === null) {
      throw new Error(
        'This cookie uses a GNOME keyring key (v11), but the keyring\n' +
          'password could not be retrieved.\n\n' +
          'Fix:\n' +
          '  1. Install libsecret-tools:  sudo apt-get install libsecret-tools\n' +
          '  2. Check the entry exists:   secret-tool lookup application chrome\n' +
          '  3. Or pass cookies manually: supertwee sync --cookies <ct0> <auth_token>'
      );
    }

    const decryptKey = isV11 && v11Key ? v11Key : key;
    const iv = Buffer.alloc(16, 0x20);
    const ciphertext = encryptedValue.subarray(3);
    const decipher = createDecipheriv('aes-128-cbc', decryptKey, iv);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    if (dbVersion >= 24 && decrypted.length > 32) {
      decrypted = decrypted.subarray(32);
    }
    return decrypted.toString('utf8');
  }

  return encryptedValue.toString('utf8');
}

function queryDbVersion(dbPath) {
  const tryQuery = (path) =>
    execFileSync('sqlite3', [path, "SELECT value FROM meta WHERE key='version';"], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    }).trim();
  try {
    return parseInt(tryQuery(dbPath), 10) || 0;
  } catch {
    const tmpDb = join(tmpdir(), `supertwee-meta-${randomUUID()}.db`);
    try {
      copyFileSync(dbPath, tmpDb);
      return parseInt(tryQuery(tmpDb), 10) || 0;
    } catch {
      return 0;
    } finally {
      try {
        unlinkSync(tmpDb);
      } catch {}
    }
  }
}

function resolveCookieDbPath(chromeUserDataDir, profileDirectory) {
  const networkPath = join(chromeUserDataDir, profileDirectory, 'Network', 'Cookies');
  if (existsSync(networkPath)) return networkPath;
  return join(chromeUserDataDir, profileDirectory, 'Cookies');
}

function queryCookies(dbPath, domain, names, browser) {
  if (!existsSync(dbPath)) {
    throw new Error(
      `${browser.displayName} Cookies database not found at: ${dbPath}\n` +
        'Fix: Make sure the browser is installed and has been opened at least once.\n' +
        'If you use a non-default profile, pass --chrome-profile-directory <name>.\n' +
        'Or pass cookies manually:  supertwee sync --cookies <ct0> <auth_token>'
    );
  }

  const safeDomain = domain.replace(/'/g, "''");
  const nameList = names.map((name) => `'${name.replace(/'/g, "''")}'`).join(',');
  const sql = `SELECT name, host_key, hex(encrypted_value) as encrypted_value_hex, value FROM cookies WHERE host_key LIKE '%${safeDomain}' AND name IN (${nameList});`;
  const tryQuery = (path) =>
    execFileSync('sqlite3', ['-json', path, sql], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000
    }).trim();

  let output;
  try {
    output = tryQuery(dbPath);
  } catch {
    const tmpDb = join(tmpdir(), `supertwee-cookies-${randomUUID()}.db`);
    try {
      copyFileSync(dbPath, tmpDb);
      output = tryQuery(tmpDb);
    } catch (error) {
      throw new Error(
        `Could not read ${browser.displayName} Cookies database.\n` +
          `Path: ${dbPath}\n` +
          `Error: ${error.message}\n` +
          `Fix: If ${browser.displayName} is open, close it and retry.\n` +
          'Or pass cookies manually:  supertwee sync --cookies <ct0> <auth_token>'
      );
    } finally {
      try {
        unlinkSync(tmpDb);
      } catch {}
    }
  }

  const dbVersion = queryDbVersion(dbPath);
  if (!output || output === '[]') return { cookies: [], dbVersion };
  try {
    return { cookies: JSON.parse(output), dbVersion };
  } catch {
    return { cookies: [], dbVersion };
  }
}

export function extractChromeXCookies(chromeUserDataDir, profileDirectory = 'Default', browser = undefined) {
  const os = platform();
  const resolvedBrowser = browser ?? {
    id: 'chrome',
    displayName: 'Google Chrome',
    cookieBackend: 'chromium',
    keychainEntries: []
  };
  const dbPath = resolveCookieDbPath(chromeUserDataDir, profileDirectory);

  let key;
  let v11Key;
  let isWindows = false;

  if (os === 'darwin') {
    key = getMacOSKey(resolvedBrowser);
  } else if (os === 'linux') {
    const linuxKeys = getLinuxKeys(resolvedBrowser);
    key = linuxKeys.v10;
    v11Key = linuxKeys.v11;
  } else if (os === 'win32') {
    key = getWindowsKey(chromeUserDataDir, resolvedBrowser);
    isWindows = true;
  } else {
    throw new Error(
      `Automatic cookie extraction is not supported on ${os}.\n` +
        'Pass cookies manually:  supertwee sync --cookies <ct0> <auth_token>'
    );
  }

  let result = queryCookies(dbPath, '.x.com', ['ct0', 'auth_token'], resolvedBrowser);
  if (result.cookies.length === 0) {
    result = queryCookies(dbPath, '.twitter.com', ['ct0', 'auth_token'], resolvedBrowser);
  }

  const decrypted = new Map();
  for (const cookie of result.cookies) {
    const hexValue = cookie.encrypted_value_hex;
    if (hexValue && hexValue.length > 0) {
      const buffer = Buffer.from(hexValue, 'hex');
      decrypted.set(
        cookie.name,
        isWindows ? decryptWindowsCookie(buffer, key) : decryptCookieValue(buffer, key, result.dbVersion, v11Key)
      );
    } else if (cookie.value) {
      decrypted.set(cookie.name, cookie.value);
    }
  }

  const ct0 = decrypted.get('ct0');
  const authToken = decrypted.get('auth_token');
  if (!ct0) {
    throw new Error(
      `No ct0 CSRF cookie found for x.com in ${resolvedBrowser.displayName}.\n` +
        'This means you are not logged into X in this browser.\n\n' +
        'Fix:\n' +
        `  1. Open ${resolvedBrowser.displayName}\n` +
        '  2. Go to https://x.com and log in\n' +
        '  3. Re-run this command\n\n' +
        (profileDirectory !== 'Default'
          ? `Using profile: "${profileDirectory}"\n`
          : 'Using the Default profile. If your X login is in a different profile,\npass --chrome-profile-directory <name> (e.g., "Profile 1").\n') +
        '\nOr pass cookies manually:  supertwee sync --cookies <ct0> <auth_token>'
    );
  }

  const cleanCt0 = sanitizeCookieValue('ct0', ct0, resolvedBrowser);
  const cookieParts = [`ct0=${cleanCt0}`];
  if (authToken) cookieParts.push(`auth_token=${sanitizeCookieValue('auth_token', authToken, resolvedBrowser)}`);
  return { csrfToken: cleanCt0, cookieHeader: cookieParts.join('; ') };
}
