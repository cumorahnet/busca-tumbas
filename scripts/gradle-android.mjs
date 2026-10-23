import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
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
    if (!env.JAVA_HOME) {
        // Android Studio can ship a JBR newer than this Gradle supports.
        const cachedJdks = path.join(env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'jdks');
        const candidates = [jbr];
        if (existsSync(cachedJdks)) {
            for (const entry of readdirSync(cachedJdks, { withFileTypes: true })) {
                if (entry.isDirectory()) candidates.push(path.join(cachedJdks, entry.name));
            }
        }
        const java21 = candidates.find(candidate => {
            const release = path.join(candidate, 'release');
            return existsSync(path.join(candidate, 'bin', 'java.exe')) && existsSync(release)
                && /^JAVA_VERSION="21(?:\.|"|\+)/m.test(readFileSync(release, 'utf8'));
        });
        if (java21) env.JAVA_HOME = java21;
        else throw new Error('Se requiere Java 21: configura JAVA_HOME con un JDK 21.');
    }
    const sdk = path.join(env.LOCALAPPDATA || '', 'Android', 'Sdk');
    if (!env.ANDROID_HOME && existsSync(sdk)) env.ANDROID_HOME = sdk;
}
const result = spawnSync(windows ? 'cmd.exe' : './gradlew',
    windows ? ['/d', '/c', 'gradlew.bat', task, '--console=plain'] : [task, '--console=plain'],
    { cwd: path.join(root, 'android'), env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
