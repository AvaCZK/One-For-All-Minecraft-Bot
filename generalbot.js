//console.log(process.argv)
if (!process.argv[2]) {
    return
}
let debug = process.argv.includes("--debug");
let login = false
let config
const EventEmitter = require('events');
const mineflayer = require("mineflayer");
const sd = require('silly-datetime');
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const profiles = require(`${process.cwd()}/profiles.json`);
const fs = require('fs');
const fsp = require('fs').promises
const { version } = require("os");
const data = require('toml-require');
const CNTA = require('chinese-numbers-to-arabic');
function logger(logToFile = false, type = "INFO", ...args) {
    if (logToFile) {
        process.send({ type: 'logToFile', value: { type: type, msg: args.join(' ') } })
        return
    }
    let fmtTime = sd.format(new Date(), 'YYYY/MM/DD HH:mm:ss')
    let colortype
    switch (type) {
        case "DEBUG":
            colortype = "\x1b[32m" + type + "\x1b[0m";
            break;
        case "INFO":
            colortype = "\x1b[32m" + type + "\x1b[0m";
            break;
        case "WARN":
            colortype = "\x1b[33m" + type + "\x1b[0m";
            break;
        case "ERROR":
            type = "\x1b[31m" + type + "\x1b[0m";
            colortype;
        case "CHAT":
            colortype = "\x1b[93m" + type + "\x1b[0m";
            break;
        default:
            colortype = type;
            break;
    }
    console.log(`[${fmtTime}][${colortype}][${process.argv[2]}] ${args.join(' ')}`);
}

process.send({ type: 'setReloadCD', value: 10_000 })
//lib
const mapart = require(`./lib/mapart`);
const craftAndExchange = require(`./lib/craftAndExchange`);
if (!profiles[process.argv[2]]) {
    //已經在parent檢查過了 這邊沒有必要
    console.log(`profiles中無 ${process.argv[2]} 資料`)
    process.send({ type: 'setStatus', value: 1000 })
    process.exit(2001)
}
if (!fs.existsSync(`config/${process.argv[2]}`)) {
    fs.mkdirSync(`config/${process.argv[2]}`, { recursive: true });
    console.log(`未發現配置文件 請至 config/${process.argv[2]} 配置`)
}
process.send({ type: 'setStatus', value: 3001 })
const botinfo = {
    server: -1,
    serverCH: -1,
    balance: -1,
    coin: -1,
    tabUpdateTime: new Date(),
}
const bot = (() => { // createMcBot
    const bot = mineflayer.createBot({
        host: profiles[process.argv[2]].host,
        port: profiles[process.argv[2]].port,
        username: profiles[process.argv[2]].username,
        auth: "microsoft",
        version: "1.18.2"
    })
    const ChatMessage = require('prismarine-chat')("1.18.2")
    bot.once('spawn', async () => {
        logger(true, 'INFO', `login as ${bot.username}|type:${process.argv[3]}`)
        bot.taskManager = taskManager;
        taskManager.init();
        await mapart.init(bot, process.argv[2], logger);
        await craftAndExchange.init(bot, process.argv[2], logger);
        process.send({ type: 'setStatus', value: 3200 })
        bot.chatAddPattern(
            /^(\[[A-Za-z0-9-_您]+ -> [A-Za-z0-9-_您]+\] .+)$/,
            'dm'
        )
        bot.chatAddPattern(
            /^\[系統\] (\S+) 想要傳送到 你 的位置$/,
            'tpa'
        )
        bot.chatAddPattern(
            /^\[系統\] (\S+) 想要你傳送到 該玩家 的位置$/,
            'tpahere'
        )
        bot.chatAddPattern(
            /^Summoned to wait by CONSOLE$/,
            'wait'
        )
        login = true
    })
    bot.on('message', async (jsonMsg) => {
        if (debug) {
            logger(false, 'CHAT', jsonMsg.toAnsi())
        }

        //console.log(jsonMsg.toString())
        //let time = new Date();
    })
    bot.on('dm', async (jsonMsg) => {
        // let abc = jsonMsg.toMotd()
        // console.log(abc)
        let args = jsonMsg.toString().split(' ')
        let playerID = args[0].slice(1, args[0].length);
        let cmds = args.slice(3, args.length);
        let isTask = taskManager.isTask(cmds)
        if(!config.setting.whitelist.includes(playerID)){
            logger(true, 'CHAT', jsonMsg.toString())
            return
        }
        if (isTask.vaild) {
            let tk = new Task(10, isTask.name, 'minecraft-dm', cmds, undefined, undefined, playerID, undefined)
            taskManager.assign(tk, isTask.longRunning)
            // console.log(taskManager.isImm(cmds))

        }
        //console.log(jsonMsg.toString())
        logger(true, 'CHAT', jsonMsg.toString())
    })
    bot.on('tpa', p => {
        bot.chat(config.setting.whitelist.includes(p) ? '/tpaccept' : '/tpdeny')
        logger(true, 'INFO', `${config.setting.whitelist.includes(p)?"Accept":"Deny"} ${p}'s tpa request`);
    })
    bot.on('tpahere', p => {
        bot.chat(config.setting.whitelist.includes(p) ? '/tpaccept' : '/tpdeny')
        logger(true, 'INFO', `${config.setting.whitelist.includes(p)?"Accept":"Deny"} ${p}'s tpahere request`);
    })
    bot._client.on('playerlist_header', () => {
        botTabhandler(bot.tablist)
    })
    //---------------
    bot.on('error', async (error) => {
        if (error?.message?.includes('RateLimiter disallowed request')) {
            process.send({ type: 'setReloadCD', value: 60_000 })
            await kill(1900)
        } else if (error?.message?.includes('Failed to obtain profile data for')) {
            await kill(1901)
        } else if (error?.message?.includes('request to https://sessionserver.mojang.com/session/minecraft/join failed')) {
            await kill(1902)
        }
        console.log('[ERROR]name:\n' + error.name)
        console.log('[ERROR]msg:\n' + error.message)
        console.log('[ERROR]code:\n' + error.code)
        logger(true, 'ERROR', error);
        await kill(1000)
    })
    bot.on('kicked', async (reason,loggedIn) => {
        logger(true, 'WARN', `${loggedIn}, kick reason ${reason}`)
        await kill(1000)
    })
    bot.on('death', () => {
        logger(true, 'INFO', `Death at ${new Date()}`)
    })
    bot.once('end', async () => {
        logger(true, 'WARN', `${process.argv[2]} disconnect`)
        await kill(1000)
    })
    bot.once('wait', async () => {
        process.send({ type: 'setReloadCD', value: 120_000 })
        logger(true, 'INFO', `send to wait`)
        await kill(1001)
    })
    //init()
    return bot
})()

async function kill(code = 1000) {
    //process.send({ type: 'restartcd', value: restartcd })
    logger(true, 'WARN', `exiting in status ${code}`)
    if (login) await taskManager.save();
    bot.end()
    process.exit(code)
}
class Task {
    priority = 10;
    displayName = '';
    source = '';
    content = '';
    timestamp = Date.now();
    sendNotification = true;
    //MC-DM
    minecraftUser = '';
    //DC
    discordUser = null;
    //Console
    /**
     * 
     * @param {*} priority 
     * @param {*} displayName 
     * @param {string} source AcceptSource: console, minecraft-dm, discord
     * @param {string[]} content 
     * @param {Date} timestamp 
     * @param {boolean} sendNotification 
     * @param {string | null} minecraftUser 
     * @param {string | null} discordUser 
     */
    constructor(priority = 10, displayName = '未命名', source = '', content = '', timestamp = Date.now(), sendNotification = true, minecraftUser = '', discordUser = null) {
        this.priority = priority;
        this.displayName = displayName;
        this.source = source;
        this.content = content;
        this.timestamp = timestamp;
        this.sendNotification = sendNotification;
        this.minecraftUser = minecraftUser;
        this.discordUser = discordUser;
    }
}

const taskManager = {
    // eventl: new EventEmitter(),
    tasks: [],
    err_tasks: [],
    tasking: false,
    //
    tasksort() {
        this.tasks.sort((a, b) => {
            if (a.priority === b.priority) {
                return a.timestamp - b.timestamp;
            } else {
                return a.priority - b.priority;
            }
        });
    },
    async init() {
        if (!fs.existsSync(`${process.cwd()}/config/${process.argv[2]}/task.json`)) {
            this.save()
        } else {
            let tt = await readConfig(`${process.cwd()}/config/${process.argv[2]}/task.json`)
            this.tasks = tt.tasks
            this.err_tasks = tt.err_tasks
        }
        //console.log(`task init complete / ${this.tasks.length} tasks now`)
        //自動執行
        if (this.tasks.length != 0 && !this.tasking) {
            logger(false,'INFO',`Found ${this.tasks.length} Task, will run at 3 second later.`)
            await sleep(3000)
            await this.loop()
        }
    },
    isTask(args) {
        // {
        //     vaild: true,             
        //     longRunning: false,
        //     permissionRequre: 0,     //reserved             
        // }
        let result
        switch (true) {
            case mapart.identifier.includes(args[0]):
                result = mapart.parse(args)
                break;
            case craftAndExchange.identifier.includes(args[0]):
                result = craftAndExchange.parse(args)
                break;
            case args[0] === 'info':
            case args[0] === 'i':
                result = {
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,     //reserved        
                }
                break;
            default:
                result = {
                    vaild: false,
                }
                break;
        }
        return result
        //return false
    },
    async execute(task) {
        console.log("執行task")
        console.log(task)
        if (task.source == 'console') task.console = logger;
        switch (true) {
            case mapart.identifier.includes(task.content[0]):
                await mapart.execute(bot, task)
                break;
            case craftAndExchange.identifier.includes(task.content[0]):
                await craftAndExchange.execute(bot, task)
                break;
            case task.content[0] === 'info':
            case task.content[0] === 'i':
                await bot_cmd_info();
                break;
            default:
                break;
        }
    },
    async assign(task, longRunning = true) {
        if (longRunning) {
            this.tasks.push(task)
            if (!this.tasking) await this.loop()
        } else {
            this.execute(task)
        }
    },
    async loop() {
        if (this.tasking) return
        this.tasking = true;
        this.tasksort()
        let crtTask = this.tasks[0]
        await this.execute(crtTask)
        this.tasks.shift()
        this.tasking = false;
        if (this.tasks.length) await this.loop()
    },
    async save() {
        let data = {
            'tasks': this.tasks,
            'err_tasks': this.err_tasks,
        }
        // console.log('tasks saving..')
        // console.log(data)
        await fsp.writeFile(`${process.cwd()}/config/${process.argv[2]}/task.json`, JSON.stringify(data, null, '\t'), function (err, result) {
            if (err) console.log('tasks save error', err);
        });
        //console.log('task complete')
    }
    // commit(task) {
    //     this.eventl.emit('commit', task);
    // },
}
async function bot_cmd_info() {

}
function botTabhandler(tab) {
    const header = tab.header.extra
    if (!header) return
    let si = false, ci = false, bi = false
    let serverIdentifier = -1;
    let coinIdentifier = -1;
    let balanceIdentifier = -1;
    for (i in header) {
        if (header[i].text == '所處位置 ') {            //+2
            serverIdentifier = parseInt(i);            // 不知道為啥之前用parseInt
        } else if (header[i].text == '村民錠餘額') {    //+2
            coinIdentifier = parseInt(i);
        } else if (header[i].text == '綠寶石餘額') {    //+3
            balanceIdentifier = parseInt(i);
        }
    }
    if (serverIdentifier != -1 && header[serverIdentifier + 2]?.text?.startsWith('分流')) {
        botinfo.serverCH = header[serverIdentifier + 2].text
        let serverCH = header[serverIdentifier + 2].text.slice(2, header[serverIdentifier + 2].text.length);
        let s = -1;
        try {
            s = CNTA.toInteger(serverCH);
        } catch (e) {
            //return -1;
        }
        botinfo.server = s
        si = true;
    }
    if (coinIdentifier != -1) {
        coin = parseInt(header[coinIdentifier + 2]?.text.replace(/,/g, ''));
        if (coin != NaN) {
            botinfo.coin = coin
            ci = true
        }
    }
    if (balanceIdentifier != -1) {
        bal = parseFloat(header[balanceIdentifier + 3]?.text.replace(/,/g, ''));
        if (bal != NaN) {
            botinfo.balance = bal
            bi = true;
        }
    }
    if (si && ci && bi) botinfo.tabUpdateTime = new Date();
}
async function readConfig(file) {
    var raw_file = await fsp.readFile(file);
    var com_file = await JSON.parse(raw_file);
    return com_file;
}
process.on('uncaughtException', err => {
    logger(true, 'ERROR', err);
    console.log(err)
    kill(1000)
});
process.on('message', async (message) => {
    switch (message.type) {
        case 'init':
            config = message.config;
            break;
        case 'dataRequire':
            dataRequiredata = {
                name: bot.username,
                server: botinfo.server,
                coin: botinfo.coin,
                balance: botinfo.balance,
                position: bot.entity.position,
                tasks: taskManager.tasks,
                runingTask: taskManager.tasking
            }
            process.send({ type: 'dataToParent', value: dataRequiredata })
            break;
        case 'cmd':
            let args = message.text.slice(1).split(' ')
            console.log(args)
            let isTask = taskManager.isTask(args)
            if (isTask.vaild) {
                let tk = new Task(10, isTask.name, 'console', args, undefined, undefined, undefined, undefined)
                taskManager.assign(tk, isTask.longRunning)
                // console.log(taskManager.isImm(cmds))

            }
            //交給CommandManager
            break;
        case 'chat':
            bot.chat(message.text)
            console.log(`已傳送訊息至 ${bot.username}: ${message.text}`);
            break;
        case 'reload':
            process.send({ type: 'setStatus', value: 3002 })
            await kill(1002)
            break;
        case 'exit':
            process.send({ type: 'setStatus', value: 0 })
            await kill(0)
            break;
        default:
            console.log('message from parent:', message);
    }
});