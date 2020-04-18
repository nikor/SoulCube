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
    players: []
};
var inputState = [];

function updateState() {
    inputState.forEach((e, i) => {
        state.players[i].x += e[0] * 0.005;
        state.players[i].y += e[1] * 0.005;
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
    state.players.push({x: 0.0, y: 0.0});
    inputState.push([0,0]);
    clients.push(ws);
    ws.on('message', function incoming(message) {
        if (message) {
            var o = message.match(/(-?[10]),(-?[10])/);
            if (o) {
                inputState[me] = [o[1],o[2]];
            }
        }
        //console.log('received: %s', message);
    });
});

server.listen(8080);
console.log('go');
