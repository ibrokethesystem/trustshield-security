Trust Shield — Safari Extension
================================

Safari does not load unpacked web extensions directly. Apple requires the
extension to be wrapped in a signed macOS/iOS app using Xcode. This is a
one-time, one-command step.

REQUIREMENTS
  - macOS with Xcode installed (free from the App Store)
  - Safari 16.4 or newer

STEP 1 — Convert this folder into a Safari app project
  Unzip this file, open Terminal, and run:

    xcrun safari-web-extension-converter /path/to/safari-extension

  Xcode will open with a generated project.

STEP 2 — Build and run
  In Xcode, press Cmd+R to build. This installs the container app on your Mac.

STEP 3 — Enable in Safari
  1. Open Safari → Settings → Extensions
  2. Turn on "Trust Shield"
  3. Click "Always Allow on Every Website" so it can scan URLs before they load
  4. Under Safari → Settings → Advanced, enable "Show features for web developers"
     (only needed the first time to allow unsigned extensions)
  5. Under Develop menu → enable "Allow unsigned extensions"

That's it — Trust Shield will now intercept dangerous URLs in Safari the same
way it does in Chrome.

iOS / iPadOS
  Open the generated Xcode project, switch the target to iOS, and run it on
  your device. Then enable the extension in Settings → Safari → Extensions.