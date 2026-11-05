/**
 * Release builds are signed with Splix's own private key, never with the stock
 * React Native debug keystore, whose key is public: an APK signed with that
 * one can be installed by anyone as an "update" over Splix, and inherits its
 * data and its App Links.
 *
 * `expo prebuild --clean` writes android/ afresh from app.json, so this lives
 * in a config plugin rather than in android/app/build.gradle. It adds a block
 * to the end of that file which reads the key's location and passwords at
 * build time, from Gradle properties (-P..., or the computer's own
 * ~/.gradle/gradle.properties) or from environment variables of the same name:
 *
 *   SPLIX_RELEASE_STORE_FILE      the .jks file, an absolute path (forward slashes on Windows)
 *   SPLIX_RELEASE_STORE_PASSWORD
 *   SPLIX_RELEASE_KEY_ALIAS
 *   SPLIX_RELEASE_KEY_PASSWORD
 *
 * None of these, nor the key itself, is ever in the repository. Without them
 * a release build stops before it starts and says so, rather than quietly
 * signing with the debug key again. For a throwaway release build that never
 * leaves this computer, SPLIX_ALLOW_DEBUG_SIGNED_RELEASE=true lets it through
 * with the debug key. On EAS (EAS_BUILD=true) signing is left to EAS.
 *
 * Debug builds (the dev client) are not touched. Steps: mobile/RELEASE-SIGNING.md.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const TAG = 'splix-release-signing';
const BEGIN = `// @generated begin ${TAG} (mobile/plugins/withReleaseSigning.js, do not edit)`;
const END = `// @generated end ${TAG}`;

const GRADLE = String.raw`
def splixSetting = { String name ->
    def value = findProperty(name) ?: System.getenv(name)
    value ? value.toString().trim() : null
}
def splixStoreFile = splixSetting('SPLIX_RELEASE_STORE_FILE')
def splixOnEas = System.getenv('EAS_BUILD') == 'true'
def splixDebugKeyAllowed = splixSetting('SPLIX_ALLOW_DEBUG_SIGNED_RELEASE') == 'true'

android {
    signingConfigs {
        if (splixStoreFile) {
            splixRelease {
                storeFile = file(splixStoreFile)
                storePassword = splixSetting('SPLIX_RELEASE_STORE_PASSWORD')
                keyAlias = splixSetting('SPLIX_RELEASE_KEY_ALIAS')
                keyPassword = splixSetting('SPLIX_RELEASE_KEY_PASSWORD')
            }
        }
    }
    buildTypes {
        release {
            if (splixStoreFile) {
                signingConfig = signingConfigs.splixRelease
            } else if (!splixOnEas && !splixDebugKeyAllowed) {
                // Never the debug key by accident.
                signingConfig = null
            }
        }
    }
}

// Stops a release build at the start, not after a quarter of an hour of
// compiling, when there is no key to sign it with.
gradle.taskGraph.whenReady { graph ->
    def buildsRelease = graph.allTasks.any { it.project == project && it.name ==~ /(package|bundle)Release.*/ }
    if (!buildsRelease || splixStoreFile || splixOnEas) return
    if (splixDebugKeyAllowed) {
        logger.warn('Splix: this release build is signed with the public DEBUG key. Keep it on this computer; never hand it out.')
        return
    }
    throw new GradleException(
        'Splix: no release key. Set SPLIX_RELEASE_STORE_FILE, SPLIX_RELEASE_STORE_PASSWORD, ' +
        'SPLIX_RELEASE_KEY_ALIAS and SPLIX_RELEASE_KEY_PASSWORD in ~/.gradle/gradle.properties ' +
        '(or as environment variables). See mobile/RELEASE-SIGNING.md. For a throwaway build that ' +
        'never leaves this computer, add -PSPLIX_ALLOW_DEBUG_SIGNED_RELEASE=true.'
    )
}
`;

const BLOCK = `${BEGIN}\n${GRADLE.trim()}\n${END}\n`;

const applyBlock = (contents) => {
  const start = contents.indexOf(BEGIN);
  if (start === -1) return `${contents.trimEnd()}\n\n${BLOCK}`;
  const end = contents.indexOf(END, start);
  if (end === -1) throw new Error(`withReleaseSigning: "${TAG}" block in app/build.gradle has no end marker`);
  return contents.slice(0, start) + BLOCK + contents.slice(end + END.length).replace(/^\r?\n/, '');
};

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: android/app/build.gradle is not Groovy; update the plugin');
    }
    mod.modResults.contents = applyBlock(mod.modResults.contents);
    return mod;
  });

module.exports = withReleaseSigning;
module.exports.applyBlock = applyBlock;
