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
function length(x, y) {
    return Math.sqrt(x*x + y*y);
};

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
    trees: []
};
for (var i = 0; i < 20; i += 1) {
    state.trees.push( {
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        s: 0.01 + Math.random() * 0.03
    });
}
var inputState = [];
var inputStateClick = [];
var inputInteract = [];
var lastShot = [];

const boxDist = 0.05;

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

        //move box
        if (p.carry) {
            var a = p.a - (Math.PI * 3/2);
            p.bx = p.x + boxDist * Math.sin(a);
            p.by = p.y + boxDist * Math.cos(a);
        }

        //out of my tree
        state.trees.forEach(t => {
            var dx = p.x - t.x;
            var dy = p.y - t.y;
            var fp = 1.8;
            if (length(dx, dy) < t.s * fp) {
                var a = Math.PI/2 - Math.atan2(dy, dx);
                p.x = t.x + t.s * fp * Math.sin(a);
                p.y = t.y + t.s * fp * Math.cos(a);
            }

            var dx = p.bx - t.x;
            var dy = p.by - t.y;
            var fb = 1.8;
            if (length(dx, dy) < t.s * fb) {
                var a = Math.PI/2 - Math.atan2(dy, dx);
                p.bx = t.x + t.s * fb * Math.sin(a);
                p.by = t.y + t.s * fb * Math.cos(a);
            }
        });

    });

    //shot
    let now = new Date();
    var bspeed = 0.007;
    inputStateClick.forEach((e, i) => {
        var p = state.players[i];
        var shootspeed = (1 + length(p.x-p.bx, p.y-p.by)*5) * 100;
        if (e == 1 && now - lastShot[i] > shootspeed && !state.players[i].carry) {
            var b = Object.assign({}, state.players[i]);
            var a = b.a - (Math.PI * 3/2);
            b.x += bspeed * Math.sin(a);
            b.y += bspeed * Math.cos(a);
            state.bullets.push(b);
            lastShot[i] = now;
        }
    });

    //bullets
    var bulletDel = [];
    state.bullets.forEach((e,i) => {
        var a = e.a - (Math.PI * 3/2);
        e.x += 0.007 * Math.sin(a);
        e.y += 0.007 * Math.cos(a);
        if (
            e.x < -1.5 || e.x > 1.5 ||
            e.y < -1.5 || e.y > 1.5
        ) {
            bulletDel.push(i);
        }
    });

    //death
    state.players.forEach(p => {
        state.bullets.forEach((b,i) => {
            var x = b.x - p.x;
            var y = b.y - p.y;
            var dbx = (b.x - p.bx);
            var dby = (b.y - p.by);
            var a = p.ba * -1;
            var rx = dbx * Math.cos(a) - dby * Math.sin(a);
            var ry = dbx * Math.sin(a) + dby * Math.cos(a);
            if (
                x * x + y * y < 0.0001 ||
                (Math.abs(dbx) < 0.02 && Math.abs(dby) < 0.02)
            ) {
                bulletDel.push(i);
                p.x = (Math.random() - 0.5) * 2;
                p.y = (Math.random() - 0.5) * 2;
                p.bx = p.x + boxDist;
                p.by = p.y;
                p.carry = true;
            }
        })
    });
    //bullet on tree action
    state.trees.forEach(t => {
        state.bullets.forEach((b,i) => {
            var x = b.x - t.x;
            var y = b.y - t.y;
            if (length(x, y) < t.s) {
                bulletDel.push(i);
            }
        })
    });

    bulletDel.forEach(e => {
        state.bullets.splice(e,1);
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
        bx: x + boxDist,
        by: y,
        //ba: (Math.random() -0.5) * 2 * Math.PI,
        ba: 0,
        carry: true
    });

    idToUuid.push(uuid);
    inputState.push([0,0]);
    inputStateClick.push(0);
    inputInteract.push(0);
    lastShot.push(0);
    clients.push(ws);

    ws.on('message', function incoming(message) {
        var me = uuidToId[uuid].id;
        if (message) {
            var o = message.match(/(-?[10]),(-?[10]),(-?[\d]+\.[\d]+),([01]),([01])/);
            if (o) {
                inputState[me] = [o[1],o[2]];
                inputStateClick[me] = o[4];

                //player and box angle
                var p = state.players[me];
                var da = o[3] - p.a;
                p.a = o[3];
                if (p.carry) {
                    p.ba += da;
                }

                //pick up?
                if (o[5] == 1 && inputInteract[me] == 0) {
                    if (p.carry) {
                        p.carry = false;
                    } else {
                        var a = p.a - (Math.PI * 3/2);
                        var ebx = p.x + boxDist * Math.sin(a);
                        var eby = p.y + boxDist * Math.cos(a);
                        var dx = ebx - p.bx;
                        var dy = eby - p.by;
                        var dist2 = dx * dx + dy * dy;
                        if (dist2 < 0.001) {
                            p.carry = true;
                        }
                    }
                }
                inputInteract[me] = o[5];
            }
        }
    });
    ws.on('close', () => {
        var lplayer = state.players.pop();
        var luuid   = idToUuid.pop();
        var linput  = inputState.pop();
        var lclick  = inputStateClick.pop();
        var linter  = inputInteract.pop();
        var lshot   = lastShot.pop();
        var lclient = clients.pop();
        nPlayers -= 1;

        if (luuid != uuid) {
            var me = uuidToId[uuid].id;

            state.players[me]   = lplayer;
            idToUuid[me]        = luuid;
            inputState[me]      = linput;
            inputStateClick[me] = lclick;
            inputInteract[me]   = linter;
            lastShot[me]        = lshot;
            clients[me]         = lclient;

            uuidToId[luuid].id  = me;
            uuidToId[luuid].ws.send(JSON.stringify({id: uuidToId[luuid].id}));
        }
        delete uuidToId[uuid];
    });
    ws.send(JSON.stringify({id: uuidToId[uuid].id}));
});

server.listen(8080);
console.log('go');
