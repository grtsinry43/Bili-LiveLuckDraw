import zlib from 'zlib';
import {EventEmitter} from 'events';

class DanmuExtractor extends EventEmitter {
    async getDmMsg(data: Buffer) {
        // console.log(data.toString('hex'));
        // 获取数据包长度，协议类型和操作类型
        const packetLen = parseInt(data.slice(0, 4).toString('hex'), 16);
        const proto = parseInt(data.slice(6, 8).toString('hex'), 16);
        const op = parseInt(data.slice(8, 12).toString('hex'), 16);

        // 若数据包是连着的，则根据第一个数据包的长度进行切分
        if (data.length > packetLen) {
            this.getDmMsg(data.slice(packetLen));
            data = data.slice(0, packetLen);
        }

        // 判断协议类型，若为 2 则用 zlib 解压
        if (proto === 2) {
            // console.log("解压数据");
            data = zlib.inflateSync(data.slice(16));
            this.getDmMsg(data);
            return;
        }

        if (op === 3) {
            console.info("HeartBeat");
        }

        // 判断消息类型
        if (op === 5) {
            try {
                // 解析 json
                // console.log("解析数据");
                const content = JSON.parse(data.slice(16).toString());
                // 发送数据
                this.emit('MsgData', content);
            } catch (e) {
                console.error(`[GETDATA ERROR]: ${e}`);
            }
        }
    }
}

export default DanmuExtractor;
