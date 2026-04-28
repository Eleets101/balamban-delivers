# Native resources (icon + splash)

These are the **source assets** Capacitor uses to generate every iOS and
Android icon/splash size automatically.

| File | Size | Purpose |
|---|---|---|
| `icon.png` | 1024×1024 | App icon (all platforms, all sizes) |
| `splash.png` | 2732×2732 (square) | Launch screen (all device sizes) |

## Generating the platform assets

After replacing either file, run **once** on your local machine (not inside Lovable):

```bash
npm install -g @capacitor/assets
npx capacitor-assets generate --iconBackgroundColor "#0F172A" --splashBackgroundColor "#0F172A"
```

This writes the correctly-sized PNGs into `ios/App/App/Assets.xcassets/`
and `android/app/src/main/res/`. Commit those folders.

## Replacing the source assets

You can replace `icon.png` and `splash.png` with your own designs at any
time — just keep the filenames and (square) dimensions the same, then
re-run the generate command above and rebuild.
