const static = require('node-static');
const file = new static.Server('./public');
const http = require('http');
const WebSocket = require('ws');
const url = require('url');

const server = http.createServer(
    function (request, response) {
        const pathname = url.parse(request.url).pathname;
        console.log('static', pathname);
        request.addListener('end', function () {
            file.serve(request, response);
        }).resume();
    }
);

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', function (request, socket, head) {
    const pathname = url.parse(request.url).pathname;
    if (pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, function done(ws) {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

var clients = [];
var nPlayers = 0;
var state = {
    players: [],
    bullets: [],
};
var inputState = [];
var inputStateClick = [];
var lastShot = [];

function updateState() {
    //move
    var pspeed = 0.004;
    var pospeed = pspeed * Math.sin(Math.PI/4);
    inputState.forEach((e, i) => {
        var p = state.players[i];
        if (e[0] == 0) {
            p.y += e[1] * pspeed;
        } else if (e[1] == 0) {
            p.x += e[0] * pspeed;
        } else {
            p.x += e[0] * pospeed;
            p.y += e[1] * pospeed;
        }

        if (p.x < -1.0) {
            p.x = -1.0;
        }
        if (p.x > 1.0) {
            p.x = 1.0;
        }
        if (p.y < -1.0) {
            p.y = -1.0;
        }
        if (p.y > 1.0) {
            p.y = 1.0;
        }
    });

    //shot
    let now = new Date();
    var bspeed = 0.007;
    inputStateClick.forEach((e, i) => {
        if (e == 1 && now - lastShot[i] > 200) {
            var b = Object.assign({}, state.players[i]);
            var a = b.a - (Math.PI * 3/2);
            b.x += bspeed * Math.sin(a);
            b.y += bspeed * Math.cos(a);
            state.bullets.push(b);
            lastShot[i] = now;
        }
    });

    //bullets
    var del = [];
    state.bullets.forEach((e,i) => {
        var a = e.a - (Math.PI * 3/2);
        e.x += 0.007 * Math.sin(a);
        e.y += 0.007 * Math.cos(a);
        if (
            e.x < -1.5 || e.x > 1.5 ||
            e.y < -1.5 || e.y > 1.5
        ) {
            del.push(i);
        }
    });
    del.forEach(e => {
        state.bullets.splice(e,1);
    });

    //death
    state.players.forEach(p => {
        state.bullets.forEach(b => {
            var x = b.x - p.x;
            var y = b.y - p.y;
            if (x * x + y * y < 0.0001) {
                p.x = (Math.random() - 0.5) * 2;
                p.y = (Math.random() - 0.5) * 2;
                p.bx = p.x + 0.1;
                p.by = p.y + 0.1;
            }
        })
    });
}

setInterval(updateState, 10);

function sendState() {
    var tempState = JSON.stringify(state)
    clients.forEach(ws => {
        ws.send(tempState);
    });
    setTimeout(sendState,10);
}
sendState();




var uuidToId = {};
var idToUuid = [];

function getUuid() {
    var uuid = null;
    do {
        uuid = 'K' + Math.floor(Math.random() * 100000);
    } while(uuidToId[uuid]);
    return uuid;
}

wss.on('connection', function connection(ws) {
    var uuid = getUuid();

    uuidToId[uuid] = { id: nPlayers, ws: ws };
    nPlayers += 1;
    var x = (Math.random() - 0.5) * 2;
    var y = (Math.random() - 0.5) * 2;

    state.players.push({
        x: x,
        y: y,
        a: 0.0,
        bx: x + 0.1,
        by: y + 0.1,
        ba: 0.0
    });

    idToUuid.push(uuid);
    inputState.push([0,0]);
    inputStateClick.push(0);
    lastShot.push(0);
    clients.push(ws);

    ws.on('message', function incoming(message) {
        var me = uuidToId[uuid].id;
        if (message) {
            var o = message.match(/(-?[10]),(-?[10]),(-?[\d]+\.[\d]+),([01])/);
            if (o) {
                inputState[me] = [o[1],o[2]];
                state.players[me].a = o[3];
                inputStateClick[me] = o[4];
            }
        }
    });
    ws.on('close', () => {
        var lplayer = state.players.pop();
        var luuid   = idToUuid.pop();
        var linput  = inputState.pop();
        var lclick  = inputStateClick.pop();
        var lshot   = lastShot.pop();
        var lclient = clients.pop();
        nPlayers -= 1;

        if (luuid != uuid) {
            var me = uuidToId[uuid].id;

            state.players[me]   = lplayer;
            idToUuid[me]        = luuid;
            inputState[me]      = linput;
            inputStateClick[me] = lclick;
            lastShot[me]        = lshot;
            clients[me]         = lclick;

            uuidToId[luuid].id  = me;
            uuidToId[luuid].ws.send(JSON.stringify({id: uuidToId[luuid].id}));
        }
        delete uuidToId[uuid];
    });
    ws.send(JSON.stringify({id: uuidToId[uuid].id}));
});

server.listen(8080);
console.log('go');
