import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const task = process.argv[2];
if (!['assembleDebug', 'bundleRelease', 'lintDebug'].includes(task)) throw new Error('Tarea Gradle no permitida');
const env = { ...process.env };
const windows = process.platform === 'win32';
if (windows) {
    const jbr = path.join(env.ProgramFiles || 'C:/Program Files', 'Android', 'Android Studio', 'jbr');
    if (!env.JAVA_HOME && existsSync(jbr)) env.JAVA_HOME = jbr;
    const sdk = path.join(env.LOCALAPPDATA || '', 'Android', 'Sdk');
    if (!env.ANDROID_HOME && existsSync(sdk)) env.ANDROID_HOME = sdk;
}
const result = spawnSync(windows ? 'cmd.exe' : './gradlew',
    windows ? ['/d', '/c', 'gradlew.bat', task, '--console=plain'] : [task, '--console=plain'],
    { cwd: path.join(root, 'android'), env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
