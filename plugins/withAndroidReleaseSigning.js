const { withAppBuildGradle } = require("expo/config-plugins");

const RELEASE_SIGNING_BLOCK = `        release {
            def keystorePropertiesFile = rootProject.file("../credentials/android/keystore.properties")
            if (keystorePropertiesFile.exists()) {
                def keystoreProperties = new Properties()
                keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
                storeFile rootProject.file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }`;

/**
 * Wire release builds to credentials/android/keystore.properties so Play Store
 * AABs are not signed with the debug keystore. Survives expo prebuild --clean.
 */
function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes("credentials/android/keystore.properties")) {
      return config;
    }

    if (!contents.includes("signingConfigs {") || !contents.includes("signingConfig signingConfigs.debug")) {
      throw new Error(
        "withAndroidReleaseSigning: unexpected android/app/build.gradle signing block"
      );
    }

    contents = contents.replace(
      /signingConfigs \{\s*debug \{[\s\S]*?\n        \}\n    \}/,
      (match) => match.replace(/\n    \}$/, `\n${RELEASE_SIGNING_BLOCK}\n    }`)
    );

    contents = contents.replace(
      /release \{\s*\/\/ Caution! In production[\s\S]*?signingConfig signingConfigs\.debug/,
      "release {\n            signingConfig signingConfigs.release"
    );

    // Fallback if the caution comment was already removed
    contents = contents.replace(
      /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig signingConfigs.release"
    );

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withAndroidReleaseSigning;
