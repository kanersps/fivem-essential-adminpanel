var express = require('express'),
	app = express(),
	settings = require(__dirname + '/settings.json'),
	argon2 = require('argon2'),
	jsonfile = require('jsonfile'),
	http = require('http').Server(app),
	io = require('socket.io')(http),
	Q3RCon = require('quake3-rcon'),
	request = require('request'),
	EventSource = require('eventsource');

var loggedIn = {}

// wra14eidx3rwrl0

app.get('/', (req, res) => {
	res.sendFile(__dirname + "/public/index.html")
})

var rcon = new Q3RCon({
	address: settings.server_ip,
	port: settings.server_port,
	password: settings.rcon_password
});

var onlinePlayers = {},
	chat = {},
	serverInfo = {};

io.on('connection', (socket) => {
	socket.on('login', (password) => {
		argon2.verify(settings.admin_password, password).then(match => {
			if (match) {
				socket.emit('success', onlinePlayers, chat, serverInfo)
				loggedIn[socket.id] = socket;
			} else {
				socket.emit('failed')
			}
		}).catch(err => {
			throw err;
		});
	})

	socket.on('func', (t, p, v) => {
		if (loggedIn[socket.id] == undefined)
			return;

		switch (t) {
			case "kick":
				if (onlinePlayers[p] != undefined) {
					rcon.send('ap_kick ' + p, (response) => {
						var response = response.split('\n')
						if (response[0] == 'print') {
							if (response[1] == "kicked")
								socket.emit('kicked', p)
						}
					})
				}
				break;
			case "setrank":
				if (onlinePlayers[p] !== undefined) {
					rcon.send('setadmin ' + onlinePlayers[p].id + " " + parseInt(v), (response) => {
						var response = response.split('\n')
						socket.emit('rankset', p, v, onlinePlayers[p].username)
					})
				}
				break;
			case "setmoney":
				if (onlinePlayers[p] !== undefined) {
					rcon.send('setmoney ' + onlinePlayers[p].id + " " + parseInt(v), (response) => {
						var response = response.split('\n')
						socket.emit('toast', "Money of " + onlinePlayers[p].username + " set to " + v)
					})
				}
				break;
			case "restartr":
				rcon.send('restart ' + p, function(resp){
					socket.emit('toast', "Resource " + p + " restarted.")
				})
				break;
			case "startr":
				rcon.send('start ' + p, function(resp){
					socket.emit('toast', "Resource " + p + " started.")
				})
				break;
			case "stopr":
				rcon.send('stop ' + p, function(resp){
					socket.emit('toast', "Resource " + p + " stopped.")
				})
				break;
			case "stop":
				rcon.send('quit', (resp) => {})
				socket.emit('toast', "Server stopping...")
				break;
			case "message":
				if (v !== undefined) {
					rcon.send('say ' + v, (resp) => {})
					socket.emit('toast', "Message broadcasted")
					var newId = Math.floor(Math.random() * 1000);
					chat[newId] = "<font style='color: #01579b; font-weight: bold;'>CONSOLE </font>" + v
					socket.emit('chat', chat[newId])
				}
				break;
			case "run":
				if (p !== undefined && p.length > 0) {
					rcon.send(p, (resp) => {
						socket.emit('toast', resp)
					})
				} else
					socket.emit('toast', "Please enter a valid command.")
				break;
			case "slay":
				if (onlinePlayers[p] !== undefined) {
					rcon.send('ap_slay ' + parseInt(onlinePlayers[p].id), (resp) => {})
					socket.emit('toast', "User " + onlinePlayers[p].username + " has been slayed.")
				}
				break;
			case "refresh":
				rcon.send('getPlayers', (response) => {
					onlinePlayers = {}
					var response = response.split("\n")
					if (response[0] == 'print') {
						for (var i in response) {
							if (i !== '0') {
								var temp = response[i].split(" ")
								var player = {}
								player.username = temp[0].replace(/_/g, " ")
								player.rank = parseInt(temp[1]);
								player.id = parseInt(temp[2]);

								onlinePlayers[i] = player
							}
						}
						socket.emit('refresh', onlinePlayers)
						socket.emit('toast', "List refreshed")
					}
				})
				break;
		}
	})
});

http.listen(3022, () => {
	if (settings.admin_password == "") {
		console.log("First run detected.")
		var password = Array(15 + 1).join((Math.random().toString(36) + '00000000000000000').slice(2, 18)).slice(0, 15);
		argon2.generateSalt().then(salt => {
			argon2.hash(password, salt, {
				type: argon2.argon2d
			}).then(hash => {
				settings.admin_password = hash;
				jsonfile.writeFile(__dirname + "/settings.json", settings, { spaces: 3 }, (err) => {
					if (err)
						throw err;

					console.log("This is your new password, use this to login to the admin panel\n" + password + "\nSave this carefully, if you want to reset it remove it in: settings.json")
				})
			}).catch(err => {
				throw err;
			});
		});
	} else {
		console.log("Admin panel running on: 0.0.0.0:3022")
	}
})

const es = new EventSource("http://" + settings.server_ip + ":" + settings.server_port + "/log");
es.addEventListener('chatMessage', e => {
	const msg = JSON.parse(e.data);
	var ID = Math.floor(Math.random() * 10000);
	chat[ID] = "(" + msg.guid + ") " + msg.name + ": " + msg.message;
	for (var e in loggedIn) {
		loggedIn[e].emit('chat', chat[ID])
	}
});
es.addEventListener('serverStart', e => {
	serverInfo.hostname = JSON.parse(e.data).hostname;
})

request({
	uri: "http://" + settings.server_ip + ":" + settings.server_port + "/info.json",
	method: "GET",
	json: true,
}, (err, resp, body) => {
	serverInfo.resources = body.resources;
})

// Initialization
rcon.send('getPlayers', (response) => {
	var response = response.split("\n")
	onlinePlayers = {}
	if (response[0] == 'print') {
		for (var i in response) {
			if (i !== '0') {
				var temp = response[i].split(" ")
				var player = {}
				player.username = temp[0].replace(/_/g, " ")
				player.rank = parseInt(temp[1]);
				player.id = parseInt(temp[2]);

				onlinePlayers[i] = player
			}
		}
	}
})
