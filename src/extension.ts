import * as vscode from 'vscode';

let CLIENT_ID: string | undefined;
let CLIENT_SECRET: string | undefined;
const REDIRECT_URI = 'vscode://BingVader.spotify-lyrics/callback';

async function setupCredentials(context: vscode.ExtensionContext) {
    const id = await vscode.window.showInputBox({ 
		prompt: 'Enter Spotify Client ID',
		ignoreFocusOut: true
	});
    const secret = await vscode.window.showInputBox({ 
		prompt: 'Enter Spotify Client Secret', 
		password: true, 
		ignoreFocusOut: true 
	});
    if (id && secret) {
        await context.secrets.store('spotify_client_id', id);
        await context.secrets.store('spotify_client_secret', secret);
        CLIENT_ID = id; CLIENT_SECRET = secret;
        vscode.window.showInformationMessage('Credentials saved securely in your Device!');
    }
}

async function getFullTokens(code: string) {
    const credentials = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI
            }).toString() // Ensure this is a string
        });

        const data: any = await response.json();

        if (response.ok && data.access_token) {
            return {
                access_token: data.access_token,
                refresh_token: data.refresh_token
            };
        } else {
            console.error('Spotify Token Error:', data);
            vscode.window.showErrorMessage(`Spotify Error: ${data.error_description || data.error}`);
            return null;
        }
    } catch (err) {
        console.error('Fetch failed:', err);
        return null;
    }
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('Spotify Lyrics: Extension Activated');

	CLIENT_ID = await context.secrets.get('spotify_client_id');
    CLIENT_SECRET = await context.secrets.get('spotify_client_secret');

    context.subscriptions.push(
        vscode.commands.registerCommand('spotify-lyrics.setup', () => setupCredentials(context))
    );

    const provider = new LyricsViewProvider();
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('spotify-lyrics-view', provider)
    );

		const loginCmd = vscode.commands.registerCommand('spotify-lyrics.login', () => {
		const scopes = 'user-read-currently-playing'; 
		const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
		
		vscode.env.openExternal(vscode.Uri.parse(authUrl));
	});

    // AUTO-LOGIN
    const savedRefreshToken = context.globalState.get<string>('spotify_refresh_token');
    if (savedRefreshToken) {
        try {
            const newToken = await refreshAccessToken(savedRefreshToken);
            if (newToken) {
                startLyricsLoop(newToken, provider, context);
                vscode.window.showInformationMessage('Spotify Lyrics: Auto-logged in!');
            }
        } catch (e) {
            console.error('Auto-login failed:', e);
        }
    }

    const uriHandler = vscode.window.registerUriHandler({
		async handleUri(uri: vscode.Uri) {
			console.log('Full Redirect URI:', uri.toString());
			const query = new URLSearchParams(uri.query);
			
			// Check for error first
			const error = query.get('error');
			if (error) {
				vscode.window.showErrorMessage(`Spotify Auth Error: ${error}`);
				return;
			}

			const code = query.get('code');
			if (!code) {
				// This is what you're seeing now
				vscode.window.showErrorMessage('No code received from Spotify. Check Debug Console.');
				console.log('Query parameters received:', uri.query);
				return;
			}

			const tokens = await getFullTokens(code); 
			if (tokens) {
				await context.globalState.update('spotify_refresh_token', tokens.refresh_token);
				vscode.window.showInformationMessage('Spotify Connected!');
				startLyricsLoop(tokens.access_token, provider, context);
			}
		}
	});

    context.subscriptions.push(loginCmd, uriHandler);
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
    const credentials = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        })
    });

    const data: any = await response.json();
    return data.access_token || null;
}

let currentTrackId: string | null = null;

async function startLyricsLoop(token: string, provider: LyricsViewProvider, context: vscode.ExtensionContext) {
    let currentToken = token;

    setInterval(async () => {
        try {
            const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });

            if (response.status === 200) {
                const data: any = await response.json();
                
                if (data.item.id !== currentTrackId) {
                    currentTrackId = data.item.id;
                    const lyrics = await getLyrics(data.item.artists[0].name, data.item.name);
                    provider.postMessage({ type: 'updateLyrics', lyrics });
                }

                provider.postMessage({ type: 'updateTime', time: data.progress_ms });
            }
        } catch (err) {
            console.error('Sync Error:', err);
        }
    }, 1000);
}

// let data: any | null = null;

async function getAccessToken(code: string): Promise<string | null> {
    const credentials = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI
        })
    });

    const data: any = await response.json();

    console.log('Spotify Token Response:', data);

    if (data.access_token) {
        return data.access_token;
    } else {
        console.error('Failed to get token:', data);
        return null;
    }
}

async function getNowPlaying(token: string) {
    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log("Spotify Response Status:", response.status);

    if (response.status === 204) {
        console.log("Nothing is playing (or Spotify thinks nothing is playing).");
        return null;
    }
    
    if (response.status === 401) {
        console.log("Token expired or invalid.");
        return null;
    }

    const data: any = await response.json();
    console.log("Current Song Data:", data?.item?.name);
    return {
        title: data.item.name,
        artist: data.item.artists[0].name,
        id: data.item.id
    };
}

async function getLyrics(artist: string, title: string) {
    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    try {
        const response = await fetch(url);
		if (!response.ok) {
            return "Lyrics not found.";
        }

        const data: any = await response.json();
        // Returns Synced (LRC) if available, otherwise Plain text
        return data.syncedLyrics || data.plainLyrics || "Lyrics not found on track.";
    } catch (e) {
        return "Error fetching lyrics.";
    }
}

class LyricsViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;


    public postMessage(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        // Load the "shell" immediately
        webviewView.webview.html = this._getHtmlContent();
    }

    private _getHtmlContent() {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: var(--vscode-font-family); 
                    padding: 20px; 
                    background: var(--vscode-sideBar-background); 
                    color: var(--vscode-foreground); 
                }
                .line { padding: 10px 0; opacity: 0.3; transition: all 0.3s; font-size: 1.1rem; }
                .active { opacity: 1; color: #1DB954; font-weight: bold; transform: scale(1.05); }
                #lyrics-container { margin-top: 20px; }
            </style>
        </head>
        <body>
            <div id="lyrics-container">Waiting for Spotify...</div>
            <script>
                const vscode = acquireVsCodeApi();
                let lyricsData = [];

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'updateLyrics') {
                        parseLyrics(message.lyrics);
                    } else if (message.type === 'updateTime') {
                        highlightLine(message.time);
                    }
                });

                function parseLyrics(rawLyrics) {
                    const container = document.getElementById('lyrics-container');
                    if (!container) return;
                    
                    container.innerHTML = '';
                    lyricsData = [];

                    // Check for empty or non-timestamped lyrics
                    if (!rawLyrics || !rawLyrics.includes('[') || rawLyrics.length < 5) {
                        const msgDiv = document.createElement('div');
                        msgDiv.className = 'line active';
                        msgDiv.style.textAlign = 'center';
                        msgDiv.style.opacity = '0.5';
                        msgDiv.innerText = rawLyrics || "No lyrics found.";
                        container.appendChild(msgDiv);
                        return;
                    }

                    const lines = rawLyrics.split(/\\r?\\n/);
                    lines.forEach((line) => {
                        const match = line.match(/\\[(\\d+):(\\d+)[.:](\\d+)\\](.*)/);
                        if (match) {
                            const time = (parseInt(match[1]) * 60 + parseInt(match[2])) * 1000 + parseInt(match[3]);
                            const text = match[4].trim();
                            if (text) {
                                const div = document.createElement('div');
                                div.className = 'line';
                                div.id = 'line-' + time;
                                div.innerText = text;
                                container.appendChild(div);
                                lyricsData.push({ time, element: div });
                            }
                        }
                    });
                }

                function highlightLine(currentTime) {
                    let activeLine = null;
                    for (let i = 0; i < lyricsData.length; i++) {
                        if (currentTime >= lyricsData[i].time) {
                            activeLine = lyricsData[i];
                        } else { break; }
                    }
                    if (activeLine) {
                        document.querySelectorAll('.line').forEach(l => l.classList.remove('active'));
                        activeLine.element.classList.add('active');
                        activeLine.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            </script>
        </body>
        </html>`;
    }
}

export function deactivate() {}