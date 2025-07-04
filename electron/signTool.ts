/**
 * 感谢开源项目！感谢社区的每一位贡献者！
 * 参考：
 * https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/sign/wbi.html#javascript
 */

import md5 from 'md5'
import {fetchWithCookies} from "./api.ts";

const mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
]

// 对 imgKey 和 subKey 进行字符顺序打乱编码
const getMixinKey = (orig: string) =>
    mixinKeyEncTab
        .map((n) => orig[n])
        .join("")
        .slice(0, 32);

// 为请求参数进行 wbi 签名
function encWbi(
    params: { [key: string]: string | number | object },
    img_key: string,
    sub_key: string
) {
    const mixin_key = getMixinKey(img_key + sub_key),
        curr_time = Math.round(Date.now() / 1000),
        chr_filter = /[!'()*]/g;

    Object.assign(params, {wts: curr_time}); // 添加 wts 字段
    // 按照 key 重排参数
    const query = Object.keys(params)
        .sort()
        .map((key) => {
            // 过滤 value 中的 "!'()*" 字符
            const value = params[key].toString().replace(chr_filter, "");
            return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        })
        .join("&");

    const wbi_sign = md5(query + mixin_key); // 计算 w_rid

    return query + "&w_rid=" + wbi_sign;
}

// 获取最新的 img_key 和 sub_key
async function getWbiKeys() {
    const res = await fetchWithCookies('https://api.bilibili.com/x/web-interface/nav', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
            Referer: 'https://www.bilibili.com/'
        }
    })
    const {
        data: {
            wbi_img: {img_url, sub_url},
        },
    } = (await res.json()) as {
        data: {
            wbi_img: { img_url: string; sub_url: string };
        };
    };

    return {
        img_key: img_url.slice(
            img_url.lastIndexOf('/') + 1,
            img_url.lastIndexOf('.')
        ),
        sub_key: sub_url.slice(
            sub_url.lastIndexOf('/') + 1,
            sub_url.lastIndexOf('.')
        )
    }
}

export async function signRequest(args: { [key: string]: string | number | object }) {
    const web_keys = await getWbiKeys()
    const params = {...args},
        img_key = web_keys.img_key,
        sub_key = web_keys.sub_key;
    return encWbi(params, img_key, sub_key)
}

