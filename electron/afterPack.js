const { execSync } = require("child_process");
const path = require("path");

exports.default = async function (context) {
  if (context.electronPlatformName === "darwin") {
    const appPath = path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`
    );
    console.log(`[afterPack] Ad-hoc signing macOS app bundle at: ${appPath}`);
    try {
      execSync(`codesign --force --deep --sign - "${appPath}"`, {
        stdio: "inherit",
      });
      console.log(`[afterPack] Successfully ad-hoc signed ${appPath}`);
    } catch (err) {
      console.error(`[afterPack] Failed to sign bundle:`, err);
    }
  }
};
