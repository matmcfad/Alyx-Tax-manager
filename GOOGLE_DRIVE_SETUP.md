# Google Drive Backup Setup Instructions

This feature is implemented but requires a Google Cloud Console setup before it will work.

## Prerequisites

- A Google account
- Access to [Google Cloud Console](https://console.cloud.google.com)

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top and select "New Project"
3. Name it something like "Alyx Tax Manager"
4. Click "Create"

### 2. Enable the Google Drive API

1. In your new project, go to **APIs & Services** > **Library**
2. Search for "Google Drive API"
3. Click on it and press **Enable**

### 3. Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Select **External** user type (unless you have a Google Workspace org)
3. Fill in required fields:
   - **App name**: Alyx Tax Manager
   - **User support email**: your email
   - **Developer contact**: your email
4. Click **Save and Continue**
5. On the Scopes page, click **Add or Remove Scopes**
6. Find and select: `https://www.googleapis.com/auth/drive.appdata`
7. Click **Update**, then **Save and Continue**
8. On Test Users, add the Google account(s) that will use this app
9. Click **Save and Continue**

### 4. Create OAuth Client ID

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Web application**
4. Name it "Alyx Tax Manager Web Client"
5. Under **Authorized JavaScript origins**, add:
   - Your production domain (e.g., `https://yourdomain.com`)
   - `http://localhost:8000` (for local development)
6. Leave **Authorized redirect URIs** empty (not needed for this flow)
7. Click **Create**
8. Copy the **Client ID** (looks like: `123456789-abc123.apps.googleusercontent.com`)

### 5. Update the Code

1. Open `index.html`
2. Find line ~97 where it says:
   ```javascript
   const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
   ```
3. Replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID

### 6. Deploy and Test

1. Deploy the updated `index.html` to your hosting
2. Open the app and go to **Settings**
3. Scroll to **Cloud Backup** section
4. Click **Connect Google Drive**
5. Sign in with your Google account
6. Grant the requested permissions

## How It Works

Once connected:
- Data automatically syncs to Google Drive 5 seconds after any change
- Backups are stored in a hidden app-specific folder (user won't see files in their Drive)
- If the user opens the app on a new device/browser, they'll be prompted to restore from cloud
- Works offline - changes queue up and sync when back online

## Troubleshooting

**"Google services not available"**
- Make sure the Google Identity Services script loaded (check browser console)
- Try refreshing the page

**"Authentication failed"**
- Verify your Client ID is correct
- Check that your domain is in the Authorized JavaScript origins
- Make sure the user's email is added as a test user (if app is in testing mode)

**Sync errors**
- Check browser console for detailed error messages
- Verify the Drive API is enabled in your Google Cloud project

## Publishing (Optional)

While in "Testing" mode, only users you've added as test users can use the Google sign-in. For broader use:

1. Go to **OAuth consent screen**
2. Click **Publish App**
3. This may require Google verification if you have many users

For a small personal app shared with a few friends, you can just add them as test users instead.
