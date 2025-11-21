# App Icon Instructions

You need to create two icon files for the PWA to work properly:

## Required Icons:
- `icon-192.png` (192x192 pixels)
- `icon-512.png` (512x512 pixels)

## Quick Option: Use an Online Icon Generator

### Recommended Tool: favicon.io
1. Go to https://favicon.io/favicon-generator/
2. Configure your icon:
   - **Text:** AIM (or $$$ or any symbol you prefer)
   - **Background:** Circle
   - **Font Family:** Roboto (or any)
   - **Font Size:** 80
   - **Background Color:** #2563eb (blue - matches the app theme)
   - **Font Color:** #ffffff (white)
3. Click "Download"
4. Extract the zip file
5. Find `android-chrome-192x192.png` and rename it to `icon-192.png`
6. Find `android-chrome-512x512.png` and rename it to `icon-512.png`
7. Copy both files to the app folder

## Alternative: Use any image editor
- Create a 512x512 image with your design
- Export as PNG at 512x512 (icon-512.png)
- Resize to 192x192 and export (icon-192.png)
- Simple design works best: solid color background with white text/symbol

## Temporary Workaround
If you want to test the PWA without proper icons, you can:
1. Create two 1x1 pixel placeholder PNGs named icon-192.png and icon-512.png
2. The app will still install and work, just won't have pretty icons

The icons will appear:
- On your home screen/app drawer when installed
- In the browser tab
- In the app switcher
