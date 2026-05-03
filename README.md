🎵 Spotify Synced Lyrics for VS Code
Bring your Spotify listening experience directly into your workspace. This extension fetches real-time synced lyrics from LRCLIB and displays them in your VS Code sidebar, perfectly timed with your music.

✨ Features
Real-time Sync: Lyrics scroll automatically as the song plays.

Sidebar Integration: Keep your lyrics visible without leaving your editor.

Secure Storage: Your Spotify API keys are stored safely in the OS Keychain using VS Code's SecretStorage.

DIY Privacy: Use your own Spotify Developer credentials—no middleman servers.

🚀 Setup Instructions
Because this extension uses the Spotify API directly, you need to link it to your own Spotify Developer App.

1. Create your Spotify App
Go to the Spotify Developer Dashboard.

Click Create App.

Set the App Name and Description (e.g., "My VS Code Lyrics").

Crucial: Add the following to your Redirect URIs:
vscode://BingVader.spotify-lyrics/callback

Save your changes and copy your Client ID and Client Secret.

2. Configure the Extension
Open VS Code.

Press Ctrl + Shift + P (or Cmd + Shift + P on Mac).

Type and select: Spotify Lyrics: Setup Credentials.

Paste your Client ID and Client Secret when prompted. (They are saved securely on your machine).

3. Login
Press Ctrl + Shift + P.

Run Spotify Lyrics: Login.

Authorize the app in the browser window that opens.

🛠️ Usage
Open the Spotify Lyrics icon in the Activity Bar (Sidebar).

Play any song on your Spotify Desktop or Mobile app.

The lyrics will automatically load and start syncing.

🔒 Privacy & Security
This extension is built with security in mind:

No Backend: Your data never touches a third-party server. It goes directly from Spotify/LRCLIB to your machine.

Local Secrets: We use context.secrets to ensure your Client Secret is never stored in plain text or uploaded to GitHub.

📜 License
Distributed under the MIT License. See LICENSE for more information.

Developed with ❤️ by [BingVader](https://github.com/BingVader)