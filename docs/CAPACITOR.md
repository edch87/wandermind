# Lark — Capacitor wrap notes

Status: not wrapped yet. Web app is built and audited first; Capacitor is the path to native iOS (and later Android) once the web app is launch-ready. This doc captures what's already prepared in the web codebase so the wrap is paste-and-go, plus the native snippets we'll need on day one.

## What's already prepared in the web app

These are decisions baked into the current React/Vite codebase that the Capacitor wrap will inherit for free. Don't undo them.

- `index.html` meta viewport: `width=device-width, initial-scale=1.0, viewport-fit=cover`. No `user-scalable=no` and no `maximum-scale=1`. Both Dynamic Type and pinch-to-zoom are unblocked.
- PWA-style meta tags in `index.html`: `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, `apple-touch-icon`, `theme-color`. WKWebView ignores most of these but they keep the Safari PWA fallback working.
- `src/index.css` `:root` block defines `--dt-scale: 1; font-size: calc(100% * var(--dt-scale))` and `-webkit-text-size-adjust: 100%`. The Dynamic Type bridge below sets `--dt-scale` and all rem-based Tailwind sizes scale.
- `#root` honours safe-area insets on all four sides (`env(safe-area-inset-*)`), so notch and home indicator are respected automatically.
- Every full-screen container uses `minHeight: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))` rather than `100vh` or `min-h-screen`. Stays correct in both Safari PWA and WKWebView.
- All text inputs use `text-base` (16px) to avoid iOS auto-zoom. All interactive elements are ≥44x44.

## Dynamic Type bridge

WKWebView does not honour iOS Dynamic Type for HTML content by default. The fix is a small native bridge that reads `UIApplication.shared.preferredContentSizeCategory`, maps it to a multiplier, and writes the multiplier into the CSS variable `--dt-scale` on the document root via `evaluateJavaScript`. We re-fire it on `UIContentSizeCategoryDidChange` so a user toggling text size in Settings sees the change live.

Add this to `ios/App/App/AppDelegate.swift` after `npx cap add ios`:

```swift
import UIKit
import Capacitor
import WebKit

// Apple's published Dynamic Type multipliers, mapped to UIContentSizeCategory.
private let dynamicTypeScale: [UIContentSizeCategory: CGFloat] = [
    .extraSmall: 0.82,
    .small: 0.88,
    .medium: 0.94,
    .large: 1.00, // system default
    .extraLarge: 1.12,
    .extraExtraLarge: 1.24,
    .extraExtraExtraLarge: 1.35,
    .accessibilityMedium: 1.5,
    .accessibilityLarge: 1.7,
    .accessibilityExtraLarge: 1.9,
    .accessibilityExtraExtraLarge: 2.1,
    .accessibilityExtraExtraExtraLarge: 2.3,
]

extension AppDelegate {
    func applyDynamicTypeScale(to webView: WKWebView) {
        let category = UIApplication.shared.preferredContentSizeCategory
        let scale = dynamicTypeScale[category] ?? 1.0
        let js = "document.documentElement.style.setProperty('--dt-scale', '\(scale)');"
        webView.evaluateJavaScript(js)
    }

    func observeDynamicTypeChanges(webView: WKWebView) {
        NotificationCenter.default.addObserver(
            forName: UIContentSizeCategory.didChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self, weak webView] _ in
            guard let webView = webView else { return }
            self?.applyDynamicTypeScale(to: webView)
        }
    }
}
```

Then, once Capacitor's bridge view controller is loaded (cleanest hook is `applicationDidBecomeActive` so the webview is guaranteed to exist):

```swift
func applicationDidBecomeActive(_ application: UIApplication) {
    guard let bridge = (window?.rootViewController as? CAPBridgeViewController)?.bridge,
          let webView = bridge.webView else { return }
    applyDynamicTypeScale(to: webView)
    observeDynamicTypeChanges(webView: webView)
}
```

The web side needs no further changes. The CSS variable hook is already in `src/index.css` and Tailwind's rem-based scale picks it up automatically.

### Verification at wrap time

In iOS Settings > Display & Text Size > Larger Text, drag the slider end-to-end and confirm Lark scales without layout breaking. Pay attention to:

- Long button labels at max accessibility size (may need vertical stacks)
- Sticky bottom action bars (already use `safe-area-inset-bottom`, should hold)
- Headings (no clamp currently; if one visibly breaks at accessibility sizes, add a clamp at the heading rather than capping `--dt-scale` globally)

## Capacitor wrap checklist (when the web app is ready)

1. `npm install @capacitor/core @capacitor/cli`
2. `npx cap init Lark com.threadrevolution.lark --web-dir dist`
3. `npm install @capacitor/ios && npx cap add ios`
4. Drop the AppDelegate Dynamic Type snippets above in.
5. `npm install @capacitor/status-bar @capacitor/keyboard @capacitor/splash-screen` for the small set of native behaviours we need (status bar style, input avoidance, splash).
6. Configure splash screen and adaptive icons from `src/assets/`. Brand mark is the kite (see `src/components/KiteIcon.tsx`).
7. Test Supabase deep links: confirm-email and reset-password URLs need to either open in Safari and bounce back, or be handled as Universal Links. Decide before TestFlight.
8. `npx cap sync ios && npx cap open ios` and ship a TestFlight build to the friends-and-family group.
