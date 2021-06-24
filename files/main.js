const netlib = library.requireByName('netlib');
const game = library.requireByName('game');

//too many global variables

var camera, renderer;

var scene;
var connection;

let world;

let tickTimer;

let updateChecker;

let controls;

let cameraController;

let debugCam = true;

let doClientTick = true; //to be set on console;

function joinGame(url,data,callback) {
	
	let connection;
	
	connection = new netlib.Connection(url,{
		connectCallback: ()=>{
			console.log("-------- connect callback --------");
			
			connection.sendMessage('init',data);
		},
		generalDataCallback: (data)=>{
			//console.log("-------- data callback --------");
			//console.log(data);
		}
	});
	
	connection.addMessageTypeCallback('initDone',(data)=>{
		//console.log('-------- initDone callback --------');
		//console.log(data);
		callback();
	});
	
	return connection;
	
}

class UpdateChecker {
	constructor(connection, minDelay = 1.0/60.0, maxUpdates = 10) {
		this.connection = connection;
		this.lastRequestTime = 0;
		this.minDelay = minDelay;
		this.shouldSendMessage = true;
		this.maxUpdates = maxUpdates;
		
		this.updateQueue = new game.Queue();
	}
	check() {
		if(this.shouldSendMessage && (Date.now() - this.lastRequestTime)/1000.0 >= this.minDelay) {
			let request = new netlib.DataRequestNode(null);
			
			this.connection.sendRequest('getData',request.toJSON(),(data)=>{
				this.updateQueue.enqueue(data);
				
				//console.log(JSON.stringify(data));
				//console.log(JSON.stringify(data).length)
				
				if(this.updateQueue.itemCount() > this.maxUpdates) {
					this.updateQueue.dequeue();
				}
				
				this.shouldSendMessage = true;
			});
			
			this.shouldSendMessage = false;
			this.lastRequestTime = Date.now();
		}
	}
	getUpdate() {
		return netlib.swapJSON(this.updateQueue.dequeue(),game.defaultSwapTable);
	}
	hasUpdates() {
		return !(this.updateQueue.isEmpty())
	}
}

let playerEntityTracker;
let controlsSender;

class ControlsSender {
	constructor(connection, minDelay = 1.0/60.0,player = null) {
		this.connection = connection;
		this.lastSendTime = 0;
		this.minDelay = minDelay;
		this.player = player;
	}
	check() {
		if((this.player !== null) && (Date.now() - this.lastSendTime)/1000.0 >= this.minDelay) {
			this.connection.sendMessage('setControls',this.player.getControls());
			this.lastSendTime = Date.now();
		}
	}
	setPlayer(player) {
		this.player = player;
	}
}

class PlayerEntityTracker {
	constructor(world,connection) {
		this.entityID = null;
		
		this.world = world;
		this.connection = connection;
	}
	playerIsValid() {
		return (this.entityID !== null) && (this.world.getEntityByID(this.entityID) !== undefined);
	}
	requestPlayer(callback) {
		this.connection.sendRequest('getPlayer',{},(data)=>{
			this.entityID = data;
			
			let entity = this.world.getEntityByID(this.entityID);
			
			if(entity !== undefined) {
				callback(entity);
			} else {
				this.world.addEntityAddCallback((entity)=>{
					if(entity.hasTag('isPlayer') && entity.getID() === this.entityID) {
						callback(entity);
						return true;
					}
				});
			}
		});
	}
	requestPlayerIfInvalid(callback) {
		if(!this.playerIsValid()) {
			this.requestPlayer(callback);
		}
	}
	getEntityID() {
		return this.entityID;
	}
	
	ifPlayerIsValid(callback) {
		if(this.playerIsValid()) {
			let entity = this.world.getEntityByID(this.getEntityID());
			callback(entity);
		}
	}
}

function checkCanvasResize(renderer) {
	
	const canvas = renderer.domElement;
	
	if(canvas.width !== canvas.clinetWidth || canvas.height !== canvas.clientHeight) {
		
		renderer.setSize(canvas.clientWidth, canvas.clientHeight,false);
		camera.aspect = canvas.clientWidth / canvas.clientHeight;
		camera.updateProjectionMatrix();
		
	}
	
}

class Controls {
	constructor(element) {
		this.element = element;
		this.keys = {};
		this.rotX = 0;
		this.rotY = 0;
		
		this.element.addEventListener("keydown", (e)=> {
			this.keys[e.code] = true;
		});
		this.element.addEventListener("keyup", (e)=> {
			this.keys[e.code] = false;
		});
		this.element.addEventListener("mousemove", (e)=> {
			
			this.rotY -= e.movementX / this.element.clientWidth * Math.PI * 2.0;
			this.rotX -= e.movementY / this.element.clientHeight * Math.PI;
			
			if(this.rotX < -Math.PI * 0.5) this.rotX = -Math.PI * 0.5;
			if(this.rotX > Math.PI * 0.5) this.rotX = Math.PI * 0.5;
			
		});
		this.element.addEventListener("click", (e)=> {
			this.element.requestPointerLock();
		});
	}
	keyDown(k) {
		return this.keys[k] || false;
	}
	getRotX() {
		return this.rotX;
	}
	getRotY() {
		return this.rotY;
	}
	
	addKeyDownCallback(callback) {
		this.element.addEventListener("keydown",(e)=>{
			callback(e.code);
		});
	}
	addKeyCodeDownCallback(keycode,callback) {
		this.addKeyDownCallback((code)=>{
			if(code === keycode) {
				callback();
			}
		});
	}
	
	check() {
	}
};

class BasicCameraController {
	constructor() {
		this.camera = null;
		this.controls = null;
	}
	set() {}
	free() {}
	setCamera(camera) {
		this.camera = camera;
	}
	setControls(controls) {
		this.controls = controls;
	}
}

class FreeCameraController extends BasicCameraController {
	constructor(speed=0.25) {
		super();
		this.speed = speed;
	}
	set() {
		this.camera.rotation.order = 'YXZ';
	}
	update(t) {
		
		var v = new THREE.Vector3(0.0,0.0,0.0);
		if(this.controls.keyDown('KeyW'))      v.add(new THREE.Vector3( 0.0, 0.0,-1.0));
		if(this.controls.keyDown('KeyS'))      v.add(new THREE.Vector3( 0.0, 0.0, 1.0));
		if(this.controls.keyDown('KeyA'))      v.add(new THREE.Vector3(-1.0, 0.0, 0.0));
		if(this.controls.keyDown('KeyD'))      v.add(new THREE.Vector3( 1.0, 0.0, 0.0));
		if(this.controls.keyDown('ShiftLeft')) v.add(new THREE.Vector3( 0.0,-1.0, 0.0));
		if(this.controls.keyDown('Space'))     v.add(new THREE.Vector3( 0.0, 1.0, 0.0));
		v.multiplyScalar(this.speed*t);
		
		v.applyAxisAngle(new THREE.Vector3(0.0,1.0,0.0),this.controls.getRotY());
		
		this.camera.position.add(v);
		
		this.camera.rotation.x = this.controls.getRotX();
		this.camera.rotation.y = this.controls.getRotY();
	}
}

class PlayerCameraController extends BasicCameraController {
	constructor(playerEntityTracker) {
		super();
		this.playerEntityTracker = playerEntityTracker;
	}
	set() {
		this.camera.rotation.order = 'YXZ';
		this.playerEntityTracker.ifPlayerIsValid((entity)=>{
			entity.setVisibility(false);
		});
	}
	update(t) {
		this.playerEntityTracker.ifPlayerIsValid((entity)=>{
			
			this.camera.position.copy(entity.getCameraPos().getVector3());
			
			this.camera.rotation.x = this.controls.getRotX();
			this.camera.rotation.y = this.controls.getRotY();
		});
	}
	free() {
		this.playerEntityTracker.ifPlayerIsValid((entity)=>{
			entity.setVisibility(true);
		});
	}
}

class MultiCameraController { //incompatable with being put inside itself (for now)
	constructor(camera,controls,controllers) {
		this.camera = camera;
		this.controls = controls;
		
		this.controllers = {};
		
		this.currentControllerName = null;
		
		for(let i in controllers) {
			this.addController(i,controllers[i]);
		}
	}
	addController(name,controller) {
		this.controllers[name] = controller;
		controller.setCamera(this.camera);
		controller.setControls(this.controls);
	}
	
	getCurrentControllerName() {
		return this.currentControllerName;
	}
	getCurrentController() {
		if(this.currentControllerName === null)
			return null;
		return this.controllers[this.currentControllerName];
	}
	
	useController(name) {
		if(this.getCurrentController() !== null)
			this.getCurrentController().free();
		this.currentControllerName = name;
		this.getCurrentController().set();
	}
	update(t) {
		if(this.getCurrentController() === null) {
			console.log('[WARNING] MultiCameraController: no controller in use');
		} else {
			this.getCurrentController().update(t);
		}
	}
}

window.onload = function() {
	
	const canvas = document.getElementById("c"); //can't be a global variable?
	renderer = new THREE.WebGLRenderer({canvas});
	
	camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
	camera.position.z = 5; //may want to remove
	
	scene = new THREE.Scene();
	
	controls = new Controls(canvas);
	
	world = new game.World();
	scene.add(world.getObj3D());
	
	connection = joinGame(
		'wss://'+game.WAN_DOMAIN_NAME+':'+game.PORT_NUMBER.toString()+'/',
		{username:"bop song"},
		()=>{
			playerEntityTracker.requestPlayer((player)=>{
				player.setVisibility(false);
				controlsSender.setPlayer(player);
			});
			
			setInterval(()=>{
				updateChecker.check();
				controlsSender.check();
				
				tickTimer.check((t)=>{
					if(doClientTick)
						world.clientTick(t); //should be correct order in relation to setting from updates
					
					while(updateChecker.hasUpdates()) {
						let dataTree = netlib.getDataTreeFromJSON(updateChecker.getUpdate());
						
						world.setData(dataTree);
					}
				});
				
			},1);
		}
	);
	
	playerEntityTracker = new PlayerEntityTracker(world,connection);
	
	updateChecker = new UpdateChecker(connection,1.0/60.0,3);
	controlsSender = new ControlsSender(connection,1.0/60.0);
	
	tickTimer = new game.TickTimer(game.TARGET_TPS, game.MAX_FALLBEHIND_TIME);
	
	cameraController = new MultiCameraController(camera,controls,{
		standard:new PlayerCameraController(playerEntityTracker),
		debug:new FreeCameraController(10.0)
	});
	cameraController.useController('standard');
	
	controls.addKeyCodeDownCallback('KeyP',()=>{
		if(cameraController.getCurrentControllerName() === 'debug') {
			cameraController.useController('standard');
		} else {
			cameraController.useController('debug');
		}
	});
	
	animate(-1.0/0.06);
	
}

let lastAnimateTimestamp = -2.0/0.06;

function animate(time) {
	
	let delta = (time - lastAnimateTimestamp) * 0.001;
	lastAnimateTimestamp = time;
	requestAnimationFrame(animate);
	
	controls.check();
	
	playerEntityTracker.ifPlayerIsValid((player)=>{
		if(cameraController.getCurrentControllerName() !== 'debug') {
			player.setControls(game.getControlsData(controls));
		}
	});
	
	world.drawTick(delta);
	
	cameraController.update(delta);
	
	checkCanvasResize(renderer);
	renderer.render(scene, camera);
	
}