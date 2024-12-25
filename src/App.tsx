import './App.css'
import {Button} from "@/components/ui/button.tsx";
import {useEffect, useRef, useState} from "react";
import {Input} from "@/components/ui/input.tsx";
import {
    Dialog, DialogClose,
    DialogContent,
    DialogDescription, DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog.tsx";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar.tsx";
import {useToast} from "@/hooks/use-toast"
import {Toaster} from "@/components/ui/toaster.tsx";
import {ScrollArea} from "@/components/ui/scroll-area.tsx";
import {Badge} from "@/components/ui/badge.tsx";

interface DanMuItem {
    name: string;
    uid: number;
    content: string;
}

interface Participant {
    name: string;
    uid: number;
}

function App() {
    const {toast} = useToast();
    const openPageHandle = () => {
        window.ipcRenderer.send('open-page', 'https://www.bilibili.com/')
    }

    const realtimeListRef = useRef<HTMLDivElement>(null);
    const realtimeUserListRef = useRef<HTMLDivElement>(null);

    const startHandle = () => {
        if (!isLogin) {
            toast({
                title: '请先登录',
                description: '登录后才能获取详细的弹幕信息哦',
            })
            return;
        }
        if (!roomId) {
            toast({
                title: '请先设置直播间 id',
                description: '要先设置好直播间 id 才能开始获取哦',
            })
            return;
        }
        if (luckyWord === '') {
            toast({
                title: '请先设置互动词',
                description: '要先设置好互动词才能开始获取哦',
            })
            return;
        }
        window.ipcRenderer.send('start', roomId)
        setIsFetching(true);
    }

    const stopHandle = () => {
        setIsFetching(false);
        window.ipcRenderer.send('stop')
    }

    const [user, setUser] = useState({
        name: '',
        avatar: '',
    });


    useEffect(() => {
        window.ipcRenderer.on('user-info', (_event, data) => {
            console.log("获取到用户信息", data);
            // 这里能够获取到用户信息就说明 cookie 可以啦，可以开抓咯
            if (data === null) {
                return;
            }
            setUser({
                name: data.uname,
                avatar: data.face,
            });
            setIsLogin(true);
        });

        window.ipcRenderer.on('danmu_msg', (_event, data) => {
            console.log("获取到弹幕信息", data);
            setIsFetching(true);
            setMsgList((prev) => {
                return [...prev, {
                    name: data.name,
                    uid: data.uid,
                    content: data.content,
                }]
            })
            // 滚动到底部
            setTimeout(() => {
                realtimeListRef.current?.scrollIntoView({
                    block: 'end',
                    behavior: 'smooth',
                });
            }, 500)
        });

        window.ipcRenderer.on('add_user', (_event, data) => {
            console.log("获取到参与者信息", data);
            setParticipants((prev) => {
                return [...prev, {
                    name: data.name,
                    uid: data.uid,
                }]
            });
            // 滚动到底部
            setTimeout(() => {
                realtimeUserListRef.current?.scrollIntoView({
                    block: 'end',
                    behavior: 'smooth',
                });
            }, 500)
        });
        return () => {
            window.ipcRenderer.removeListener('user-info', () => {
            });
            window.ipcRenderer.removeListener('danmu_msg', () => {
            });
        }
    }, []);

    const [roomId, setRoomId] = useState<string>('');
    const [isLogin, setIsLogin] = useState<boolean>(false);

    const [msgList, setMsgList] = useState<DanMuItem[]>([]);
    const [participants, setParticipants] = useState<Participant[]>([]);

    const [isFetching, setIsFetching] = useState<boolean>(false);
    const [luckyWord, setLuckyWord] = useState<string>('');

    useEffect(() => {
        window.ipcRenderer.send('lucky-word', luckyWord)
    }, [luckyWord]);

    const resetHandle = () => {
        window.ipcRenderer.send('reset')
    }

    return (
        <>
            <div className="app-container flex flex-col mb-4">
                <div className="info-container flex justify-between items-center">
                    <div className="room-info-container">
                        <span> 当前直播间 id：</span>
                        <span> {
                            roomId ? roomId : '未设置'
                        } </span>
                        <Dialog>
                            <DialogTrigger>
                                <Button variant={'link'}> 去设置 </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>
                                        设置直播间 id
                                    </DialogTitle>
                                    <DialogDescription>
                                        <div className={'mb-4'}>
                                            请查看直播间地址中的数字部分（如：https://live.bilibili.com/12345678）并填写到下方输入框中 <br/>
                                            程序将自动解析直播间的弹幕信息，并尝试连接弹幕服务器
                                        </div>
                                        <Input value={roomId} onChange={(e) => {
                                            // 这里只允许输入数字
                                            setRoomId(e.target.value.replace(/[^\d]/g, ''))
                                        }}/>
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter className="sm:justify-start">
                                    <DialogClose asChild>
                                        <Button type="button" variant="secondary">
                                            可以啦
                                        </Button>
                                    </DialogClose>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                    {
                        isLogin && <div className="user-info-container flex items-center">
                            <Avatar>
                                <AvatarImage src={user.avatar} alt={user.name}/>
                                <AvatarFallback>USER</AvatarFallback>
                            </Avatar>
                            <span className="ml-4"> {user.name} </span>
                        </div>
                    }
                    {
                        !isLogin &&
                        <div className="user-info-container flex items-center">
                            <span className={
                                'text-sm text-gray-700'
                            }> 登录后才能获取详细的弹幕信息哦 </span>
                            <Button variant={'ghost'} onClick={() => openPageHandle()}> 前往登录 </Button>
                        </div>
                    }
                </div>
                {/*<Input value={roomId} onChange={(e) => setRoomId(e.target.value)}/>*/}
                <div className="main-container flex">
                    <div className="real-time-list flex-1">
                        <div className="mb-4"> 实时弹幕列表</div>
                        <ScrollArea className={"h-[60vh] rounded border p-4"}>
                            <div ref={realtimeListRef}>
                                {
                                    msgList.map((item, index) => {
                                        return (
                                            <div key={index} className="msg-item text-sm text-start p-1">
                                                <span className="name font-bold"> {item.name} </span>
                                                <Badge variant={'secondary'}
                                                       className={"text-[0.75em] p-1 h-3"}> {item.uid} </Badge>
                                                :&nbsp;
                                                <span className="content"> {item.content} </span>
                                            </div>
                                        )
                                    })
                                }
                            </div>
                        </ScrollArea>
                    </div>
                    <div className="real-time-list flex-1">
                        <div className="mb-4"> 已成功参与列表</div>
                        <ScrollArea className={"h-[60vh] rounded border p-4"}>
                            <div ref={realtimeUserListRef}>
                                {
                                    participants.map((item, index) => {
                                        return (
                                            <div key={index} className="msg-item text-sm text-start p-1">
                                                <span className="name font-bold"> {item.name} </span>
                                                <Badge variant={'secondary'}
                                                       className={"text-[0.75em] p-1 h-3"}> {item.uid} </Badge>
                                            </div>
                                        )
                                    })
                                }
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </div>


            <div className={"actions-container flex"}>
                <div className={"flex flex-1 pr-8 items-center"}>
                    <div className={"mr-4"}> 设置互动词 &nbsp;:</div>
                    <Input className={"flex-1"} value={luckyWord} onChange={(e) => setLuckyWord(e.target.value)}/>
                </div>
                {
                    !isFetching &&
                    <Button className={""} onClick={() => startHandle()}> 开始获取
                    </Button>
                }

                {
                    isFetching && <Button className={""} onClick={() => stopHandle()}> 停止获取
                    </Button>
                }
                {
                    !isFetching && participants.length > 0 &&
                    <Button variant={'ghost'} onClick={() => {
                        const lucky = participants[Math.floor(Math.random() * participants.length)];
                        toast({
                            title: '中奖用户',
                            description: ` 恭喜 ${lucky.name} (uid: ${lucky.uid}) 中奖！`,
                            action: (
                                <Button onClick={() => {
                                    navigator.clipboard.writeText(`@${lucky.name}(${lucky.uid})`);
                                    toast({
                                        title: '复制成功',
                                        description: ` 已将用户 ${lucky?.name} 的信息复制到剪贴板中 `,
                                    })
                                }
                                }> 复制 </Button>
                            )
                        })
                        // 从列表中移除
                        setParticipants((prev) => {
                            return prev.filter((item) => item.uid !== lucky.uid);
                        });
                    }}> 开始抽奖 </Button>
                }
                <Button variant={'ghost'} onClick={() => {
                    setMsgList([]);
                    setParticipants([]);
                    resetHandle();
                }}> 清空所有列表 </Button>
            </div>
            <Toaster/>
        </>
    )
}

export default App
