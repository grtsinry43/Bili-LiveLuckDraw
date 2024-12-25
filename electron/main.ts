import {app, BrowserWindow} from 'electron'
// import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

// const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

import fetchCookie from 'fetch-cookie';

const fetchWithCookies = fetchCookie(fetch);

let COOKIES: Cookie[] = [];
let buvid3: string = '';
let uid: number = 0;

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win1: BrowserWindow | null
let win2: BrowserWindow | null

function createWindow() {
    win1 = new BrowserWindow({
        icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
        },
    })

    // Test active push message to Renderer-process.
    win1.webContents.on('did-finish-load', () => {
        win1?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    if (VITE_DEV_SERVER_URL) {
        win1.loadURL(VITE_DEV_SERVER_URL)
    } else {
        // win.loadFile('dist/index.html')
        win1.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
        win1 = null
        win2 = null
    }
})

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(() => {
    console.log('app.whenReady')
    createWindow()
})

function createLoginWindowExternal(url: string) {
    win2 = new BrowserWindow({
        icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
        },
    })

    win2.loadURL(url)
    win2.on('close', () => {
        win2?.webContents.session.cookies.get({url: 'https://www.bilibili.com'}).then((cookies) => {
            // 这里拿到 cookie 了，就可以做一些事情了（嘿嘿）
            COOKIES = cookies;
            const buvid3Cookie = cookies.find(cookie => cookie.name === 'buvid3');
            if (buvid3Cookie) {
                // 拿到了 cookie（用于验证的这个）
                console.log('buvid3:', buvid3Cookie.value);
                buvid3 = buvid3Cookie.value;
            } else {
                // 没拿到 cookie
                console.log('buvid3 cookie not found');
            }
        });
    })
    // 窗口关闭时尝试获取用户信息，并发送给渲染进程
    win2.on('closed', async () => {
        try {
            const response = await fetchWithCookies("https://api.bilibili.com/x/web-interface/nav", {
                headers: {
                    'Cookie': COOKIES.map((cookie: Cookie) => `${cookie.name}=${cookie.value}`).join('; ')
                }
            });

            const data = await response.json();
            if (data.code !== 0) {
                console.error(data);
                win1?.webContents.send('user-info', null);
                return;
            }
            win1?.webContents.send('user-info', data.data);
            uid = data.data.mid;
        } catch (error) {
            console.error('Error fetching user info:', error);
            win1?.webContents.send('user-info', null);
        }
    });

}

// Ipc
import {ipcMain} from 'electron'
import {startWebSocket} from "./api.ts";
import Cookie = Electron.Cookie;

ipcMain.on('open-page', (_event, url) => {
    createLoginWindowExternal(url)
})

ipcMain.on('start', (_, args) => {
    console.log('start', args);
    startWebSocket(args);
})

export const getCookies = () => {
    return COOKIES;
}

// 一个给渲染进程发送消息的方法（使用 win1）
export const sendMsgToRenderer = (channel: string, msg: {
    name: string;
    uid?: number;
    content?: string;
}) => {
    win1?.webContents.send(channel, msg);
}

export const getBuvid3 = () => {
    return buvid3;
}

export const getUid = () => {
    return uid;
}
