const https = require('https');
const fs = require('fs');
const url = require('url');
const WebSocket = require("ws");

const netlib = require("./files/netlib.js");
const game = require("./files/game.js");

const Queue = game.Queue;

function getDateStr() {
	
	var timeStamp = Date.now();
	
	return timeStamp.toString();
	
}

const serverOptions = { //may want to make key loading asynchronus
  key: fs.readFileSync('./crypto/privateKey.pem'),
  cert: fs.readFileSync('./crypto/certificate.pem')
};

/*
i spent multiple hours of my life trying to figure out what went wrong with openssl
just to find out that i didnt put serverOptions in https.createServer. it is late at night and i am tierd
*/
const httpsServer = https.createServer(serverOptions, function(req, res) { //move init into some function somehow?
	
	var path = req.url;
	
	switch(req.method) {
		case 'GET': {
			if(path === '/') path = '/index.html';
			
			fs.readFile('./files' + path, function(err, data) {
				if(err) {
					//console.log("Error:",err);
					res.writeHead(404, {'Content-Type':'text/plain'});
					res.end('Oops! There was an error in retrieving the data specified by the URL.');
				} else {
					res.writeHead(200, {});
					res.end(data);
				}
			});
		} break;
		case 'POST': {
		} break;
	}
	
	//console.log("[Unix_Timestamp_In_Milliseconds] Request_Method Request_URL - Status_Code");
	console.log("[" + getDateStr() + "] " + req.method + " " + req.url + " - " + res.statusCode); //request monitoring
	
});

const webSocketServer = new netlib.WebSocketServer(httpsServer,{
	connectCallback:(connection)=>{ //beware of CallBack miscapitalization
		console.log("-------- connect callback --------");
		console.log(connection.getID());
		
		connection.userData.state = 'limbo';//add enumerator
	},
	generalDataCallback(data,connection) {
		//console.log('-------- general data callback --------');
		//console.log(connection.getID());
		//console.log(data);
	},
	/*
	generalMessageCallback:(type,data,connection)=>{
		console.log("-------- general message callback --------");
		console.log(connection.getID());
		console.log(type);
		console.log(data);
	},
	*/
	disconnectCallback:(code,reason,connection)=>{
		/*
		console.log("-------- disconnect callback --------");
		console.log(connection.getID());
		console.log(code);
		console.log(reason);
		*/
		
		if(connection.userData.player !== null && world.getEntityByID(connection.userData.player) !== undefined) {
			world.removeEntity(connection.userData.player);
		}
	}
});

let world;

let getDataRequests;
let getPlayerRequests;
let setControlsRequests;

function playerIDIsValid(playerID) {
	return (playerID !== null) && world.getEntityByID(playerID) !== undefined;
}

function main() {
	
	webSocketServer.addMessageTypeCallback('init',(data,connection)=>{
		//console.log('-------- init callback --------');
		//console.log(data);
		//console.log(connection.getID());
		
		connection.userData.state = 'connected';
		connection.userData.username = data.username;
		connection.userData.player = null;
		
		//console.log(connection.userData);
		
		connection.sendMessage('initDone',{});
	});
	
	getDataRequests = new netlib.RequestQueue(webSocketServer,'getData');
	getPlayerRequests = new netlib.RequestQueue(webSocketServer,'getPlayer',(request,connection)=>{
		if(connection.userData.player !== null) {
			if(world.getEntitybyID(connection.userData.player) === undefined) {
				connection.userData.player = null;
			} else {
				request.respond(connection.userData.player);
				return;
			}
		}
	});
	setControlsRequests = new netlib.MessageQueue(webSocketServer,'setControls');
	
	httpsServer.listen(game.PORT_NUMBER,game.DOMAIN_NAME); //is this asynchronus?
	
	world = game.makeWorld();
	
	let tickTimer = new game.TickTimer(game.TARGET_TPS, game.MAX_FALLBEHIND_TIME);
	
	setInterval(()=>{
		tickTimer.check((t)=>{
			
			getDataRequests.forAll((request)=>{
				
				let worldJSON = world.getData(netlib.getDataRequestTreeFromJSON(request.getData())).toJSON();
				
				request.respond(netlib.swapJSON(worldJSON,game.defaultSwapTable));
				
			});
			getPlayerRequests.forAll((request,connection)=>{
				let player = game.makePlayerEntity(connection.userData,request.getData());
				
				let id = world.addEntity(player);
				
				connection.userData.player = id;
				
				request.respond(id);
			});
			setControlsRequests.forAll((data,connection)=>{
				let playerID = connection.userData.player;
				
				if(playerIDIsValid(playerID)) {
					let player = world.getEntityByID(playerID);
					
					player.setControls(data);
				}
			});
			
			world.tick(t);
		});
	},1);
}

main();

console.log("running");
console.log("URL: https://"+game.DOMAIN_NAME+':'+game.PORT_NUMBER);