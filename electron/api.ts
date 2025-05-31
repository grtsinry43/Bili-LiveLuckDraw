import fetch from 'node-fetch';
import WebSocket from 'ws';
import {Buffer} from 'buffer';
import DanmuExtractor from './DanmuExtractor';
import {getBuvid3, getCookies, getUid, sendMsgToRenderer} from "./main.ts";
import fetchCookie from 'fetch-cookie';
import Cookie = Electron.Cookie;
import {ipcMain} from "electron";
import {signRequest} from "./signTool.ts";

export const fetchWithCookies = fetchCookie(fetch);

// 初始化弹幕提取器
const danmuExtractor = new DanmuExtractor();

interface RoomInitResponse {
    data: {
        room_id: number;
    };
}

interface DanmuInfoResponse {
    data: {
        host_list: { host: string; wss_port: number }[];
        token: string;
    };
}

// 获取真实房间号
export async function getRoomId(shortId: string): Promise<number> {
    const response = await fetch(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${shortId}`);
    const data = await response.json() as RoomInitResponse;
    console.log("获取真实房间号", data.data.room_id);
    return data.data.room_id;
}

// 获取消息流服务器和密钥
export async function getDanmuInfo(roomId: number): Promise<DanmuInfoResponse['data']> {
    const params = {
        id: roomId,
        web_location: 444.8,
        type: 0,
    }
    const args = await signRequest(params);
    // console.log("签名请求参数", args.split("&").join("\n  "), "\n ")
    // 这里请求的时候需要带上全部的 cookie，否则拿到的 key 无法登录使用（！小坑）
    const response = await fetchWithCookies(`https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?${args}`, {
        headers: {
            'Cookie': getCookies().map((cookie: Cookie) => `${cookie.name}=${cookie.value}`).join('; ')
        }
    });
    const data = await response.json() as DanmuInfoResponse;
    // console.log("获取消息流服务器和密钥", data.data);
    return data.data;
}

// 生成鉴权包
function generateCertificate(roomId: number, token: string, _uid: number, buvid: string): Buffer {
    // console.log("生成鉴权包", roomId, token, uid, buvid);
    const headerLength = 16;
    const protocol = 1;
    const type = 7;
    const sequence = 2;
    const body = JSON.stringify({
        uid: _uid,
        roomid: roomId,
        protover: 2, // 这里协议版本一定要是 2，否则无法解析数据！哭，3 还不行
        buvid: buvid,
        platform: 'web',
        type: 2,
        key: token,
    });

    // console.log("生成鉴权包", body);

    const bodyBuffer = Buffer.from(body);
    const headerBuffer = Buffer.alloc(headerLength);
    headerBuffer.writeUInt32BE(headerLength + bodyBuffer.length, 0);
    headerBuffer.writeUInt16BE(headerLength, 4);
    headerBuffer.writeUInt16BE(protocol, 6);
    headerBuffer.writeUInt32BE(type, 8);
    headerBuffer.writeUInt32BE(sequence, 12);

    return Buffer.concat([headerBuffer, bodyBuffer]);
}

// 生成心跳包
function generateHeartbeat(): Buffer {
    const headerLength = 16;
    const protocol = 1;
    const type = 2;
    const sequence = 2;
    // 好小众的内容格式（
    const body = '[Object object]';

    const bodyBuffer = Buffer.from(body);
    const headerBuffer = Buffer.alloc(headerLength);
    headerBuffer.writeUInt32BE(headerLength + bodyBuffer.length, 0);
    headerBuffer.writeUInt16BE(headerLength, 4);
    headerBuffer.writeUInt16BE(protocol, 6);
    headerBuffer.writeUInt32BE(type, 8);
    headerBuffer.writeUInt32BE(sequence, 12);

    return Buffer.concat([headerBuffer, bodyBuffer]);
}

// 发送认证包
function sendCertificate(ws: WebSocket, roomId: number, token: string, uid: number, buvid: string) {
    const certificate = generateCertificate(roomId, token, uid, buvid);
    // 打印一下 HEX，友好排版
    console.log("发送认证包", certificate.toString('hex').match(/.{1,32}/g)?.join('\n'));
    ws.send(certificate);
}

// 处理 WebSocket 消息
function handleWebSocketMessages(_ws: WebSocket, data: WebSocket.Data) {
    if (data instanceof Buffer) {
        // 核心处理咯
        danmuExtractor.getDmMsg(data);
    }
}

danmuExtractor.on('MsgData', (content) => {
    // console.log('Extracted message:', content);
    if (content.cmd === 'DANMU_MSG') { // 这里只要弹幕吧，因为目前的需求只是抽奖
        // console.log(content.info);
        const userUID = content.info[2][0];
        const userName = content.info[2][1];
        const message = content.info[1];
        console.log(`${userName}(uid: ${userUID}) 的弹幕: ${message}`);
        sendMsgToRenderer('danmu_msg', {
            name: userName,
            uid: userUID,
            content: message
        })
        checkForKeywords(message, userName, userUID);
    }
});

// 关键词匹配
const participants: number[] = [];
let keyword = '';

function checkForKeywords(content: string, userName: string, uid: number) {
    if (keyword === '') {
        return;
    }

    if (content.includes(keyword)) {
        if (!participants.includes(uid)) {
            participants.push(uid);
            sendMsgToRenderer('add_user', {
                name: userName,
                uid: uid,
            });
            console.log(` 匹配到关键词：${keyword}，${userName} 进入抽奖 `);
        }
    }
}

ipcMain.on('lucky-word', (_event, word) => {
    keyword = word;
    console.log('设置关键词', word);
});

ipcMain.on('reset', () => {
    participants.length = 0;
    console.log('重置抽奖');
});


// 开启 WebSocket 连接并监听弹幕
export async function startWebSocket(shortId: string) {
    console.log('开始 WebSocket 连接');
    const roomId = await getRoomId(shortId);
    const danmuInfo = await getDanmuInfo(roomId);
    console.log("socket服务器地址", `wss://${danmuInfo.host_list[0].host}:${danmuInfo.host_list[0].wss_port}/sub`);

    // 为 ws 设置 userAgent
    const ws = new WebSocket(`wss://${danmuInfo.host_list[0].host}:${danmuInfo.host_list[0].wss_port}/sub`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        }
    });

    ws.on('open', () => {
        console.log('WebSocket 连接成功');
        sendCertificate(ws, roomId, danmuInfo.token, getUid(), getBuvid3());
    });

    ws.on('message', (data) => {
        handleWebSocketMessages(ws, data);
    });

    ws.on('error', (err) => {
        console.log('WebSocket 错误:', err);
    });

    ws.on('close', () => {
        console.log('WebSocket 连接关闭');
    });

    ipcMain.on('stop', () => {
        keyword = '';
        console.log('停止获取弹幕');
        ws.close();
    });

    // 心跳包
    setInterval(() => {
        ws.send(generateHeartbeat());
    }, 10000);
}
