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
    bullets: []
};
var inputState = [];
var inputStateClick = [];
var lastShot = [];

function updateState() {
    //move
    inputState.forEach((e, i) => {
        var p = state.players[i];
        p.x += e[0] * 0.005;
        p.y += e[1] * 0.005;
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
    inputStateClick.forEach((e, i) => {
        if (e == 1 && now - lastShot[i] > 500) {
            state.bullets.push(Object.assign({}, state.players[i]));
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
            e.x < -1.1 || e.x > 1.1 ||
            e.y < -1.0 || e.y > 1.0
        ) {
            del.push(i);
        }
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

wss.on('connection', function connection(ws) {
    var me = nPlayers;
    nPlayers += 1;
    state.players.push({x: 0.0, y: 0.0, a: 0.0});
    inputState.push([0,0]);
    inputStateClick.push(0);
    lastShot.push(0);
    clients.push(ws);
    ws.on('message', function incoming(message) {
        if (message) {
            var o = message.match(/(-?[10]),(-?[10]),(-?[\d]+\.[\d]+),([01])/);
            if (o) {
                inputState[me] = [o[1],o[2]];
                state.players[me].a = o[3];
                inputStateClick[me] = o[4];
            }
        }
    });
    ws.send(JSON.stringify({id: me}));
});

server.listen(8080);
console.log('go');
