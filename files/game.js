(function(){
	let onNode = typeof module !== "undefined" && module.exports;
	
	//engine
	
	const netlib = (()=>{
		if(onNode)
			return require('./netlib.js');
		else
			return library.requireByName('netlib');
	})();
	
	let gameEngine = (()=>{
		if(onNode)
			return require('./gameEngine.js');
		else
			return library.requireByName('gameEngine');
	})();
	let lib = gameEngine.lib;
	let aux = gameEngine.aux;
	
	lib.DOMAIN_NAME = 'localhost';
	lib.WAN_DOMAIN_NAME = lib.DOMAIN_NAME;//'67.183.59.250';
	lib.PORT_NUMBER = 8080;
	
	lib.defaultSwapTable.addSwap('entitySet','w');
	lib.defaultSwapTable.addSwap('itemList','v');
	lib.defaultSwapTable.addSwap('type','u');
	lib.defaultSwapTable.addSwap('pos','t');
	lib.defaultSwapTable.addSwap('vel','s');
	lib.defaultSwapTable.addSwap('data','r');
	lib.defaultSwapTable.addSwap('grav','q');
	
	lib.TARGET_TPS = 60;
	lib.MAX_FALLBEHIND_TIME = 2;
	
	lib.STANDARD_GRAVITY = new lib.vec3(0.0,-9.81,0.0);
	
	const addEntityType = aux.addEntityType;
	
	lib.Box = class extends lib.BasicEntity {
		constructor(...moreArgs) {
			super(...moreArgs);
			
			this.vel = new lib.vec3();
			this.grav = lib.STANDARD_GRAVITY;
		}
		tick(t) {
			this.vel.add(this.grav.clone().mult(t));
			this.pos.add(this.vel.clone().mult(t));
		}
		
		getData(query) {
			let outData = new netlib.DataNode();
			
			outData.addObjectIfQueried('pos', this.pos, query);
			outData.addObjectIfQueried('vel', this.vel, query);
			outData.addObjectIfQueried('grav',this.grav,query);
			
			return outData;
		}
		setData(data) {
			
			data.setObjectIfIncluded('pos',this.pos);
			data.setObjectIfIncluded('vel',this.vel);
			data.setObjectIfIncluded('grav',this.grav);
			
		}
	}
	lib.Box.typeName = 'box';
	if(!onNode) {
		let old = lib.Box;
		lib.Box = class extends old {
			constructor(...moreArgs) {
				super(...moreArgs);
			}
			init(...moreArgs) {
				super.init(...moreArgs);
				this.obj3D.add(new THREE.Mesh(
					new THREE.BoxGeometry(1,1,1),
					new THREE.MeshNormalMaterial()
				));
			}
		};
	}
	addEntityType(lib.Box);
	
	lib.Spectator = class extends lib.BasicEntity {
		constructor(...moreArgs) {
			super(...moreArgs);
			this.addTag('isPlayer');
			
			this.moveDirs = {
				left:false,
				right:false,
				up:false,
				down:false,
				forward:false,
				backward:false,
				rotY:0
			};
		}
		tick(t) {
			
			let v = new lib.vec3();
			
			if(this.moveDirs.left)     v.add(new lib.vec3(-1.0, 0.0, 0.0));
			if(this.moveDirs.right)    v.add(new lib.vec3( 1.0, 0.0, 0.0));
			if(this.moveDirs.down)     v.add(new lib.vec3( 0.0,-1.0, 0.0));
			if(this.moveDirs.up)       v.add(new lib.vec3( 0.0, 1.0, 0.0));
			if(this.moveDirs.forward)  v.add(new lib.vec3( 0.0, 0.0,-1.0));
			if(this.moveDirs.backward) v.add(new lib.vec3( 0.0, 0.0, 1.0));
			
			v.mult(t*5.0);
			
			v.rotY(this.moveDirs.rotY);
			
			this.pos.add(v);
		}
		
		setControls(dirs) {
			this.moveDirs = dirs;
		}
		getControls() {
			return this.moveDirs;
		}
		
		getData(query) {
			let outData = new netlib.DataNode();
			
			outData.addObjectIfQueried('pos',this.pos,query);
			outData.addDataIfQueried('moveDirs',this.moveDirs,query);
			
			return outData;
		}
		setData(data) {
			
			data.setObjectIfIncluded('pos',this.pos);
			data.setDataIfIncluded('moveDirs',this,'moveDirs');
			
		}
	}
	lib.Spectator.typeName = 'spectator';
	if(!onNode) {
		let old = lib.Spectator;
		lib.Spectator = class extends old {
			constructor(...moreArgs) {
				super(...moreArgs);
			}
			init() {
				this.obj3D.add(new THREE.Mesh(
					new THREE.BoxGeometry(1,2,1),
					new THREE.MeshNormalMaterial()
				));
			}
			
			getCameraPos() {
				return this.pos.clone();
			}
			
			setVisibility(state) {
				this.obj3D.visible = state;
			}
		};
	}
	addEntityType(lib.Spectator);
	
	const makePlayerClass = aux.makePlayerClass;
	
	lib.Player = aux.addEntity({
		typeName:'player',
		makeServerConstr:()=>{
			return class extends (makePlayerClass(lib.PhysicsEntity)) {
				constructor(pos) {
					super({
						jump:false,
						forward:false,
						backward:false,
						left:false,
						right:false,
						rotY:0.0
					},pos,/*new lib.HitboxList([
						new lib.Hitbox(new lib.vec3(-0.5,0.0,-0.5), new lib.vec3(1.0,2.0,1.0)),
						new lib.Hitbox(new lib.vec3(-0.1,1.4,-10.5), new lib.vec3(0.2,0.2,10.0)),
						new lib.Hitbox(new lib.vec3(-0.5,-5.0,-0.25), new lib.vec3(0.2,5.0,0.5)),
						new lib.Hitbox(new lib.vec3( 0.3,-5.0,-0.25), new lib.vec3(0.2,5.0,0.5)),
						new lib.Hitbox(new lib.vec3( 0.5,1.0,0.0), new lib.vec3(0.25,0.1,0.1)),
						new lib.Hitbox(new lib.vec3(-0.75,1.0,0.0), new lib.vec3(0.25,0.1,0.1))
					])*/new lib.HitboxList([
						new lib.Hitbox(new lib.vec3(-0.5,0.0,-0.5), new lib.vec3(1.0,2.0,1.0)),
						new lib.Hitbox(new lib.vec3(-0.1,1.4,-0.8), new lib.vec3(0.2,0.2,0.3))
					]));
					
					this.grav = lib.STANDARD_GRAVITY;
				}
				clientTick(t,world) {
					this.tick(t,world);
				}
				tick(t,world) {
					if(this.pos.y < -100.0) {
						this.pos = new lib.vec3(15.0,20.0,15.0);
					}
					
					this.vel.add(this.grav.clone().mult(t));
					
					super.tick(t,world);
					
					//process jumping
					
					if(this.controls.jump && this.inPlatforms(world,{pos:this.pos.clone().add(lib.Player.JUMP_TEST_DROP)})) {
						this.vel.add(lib.Player.JUMP_VEL);
					}
					
					//process horizontal movement
					let v = new lib.vec3();
			
					if(this.controls.left)     v.add(new lib.vec3(-1.0, 0.0, 0.0));
					if(this.controls.right)    v.add(new lib.vec3( 1.0, 0.0, 0.0));
					if(this.controls.forward)  v.add(new lib.vec3( 0.0, 0.0,-1.0));
					if(this.controls.backward) v.add(new lib.vec3( 0.0, 0.0, 1.0));
					
					v.mult(t*lib.Player.SPEED);
					
					v.rotY(this.controls.rotY);
					
					this.move(world,new lib.vec3(v.x,0.0,0.0));
					this.move(world,new lib.vec3(0.0,0.0,v.z));
					
				}
			}
		},
		makeClientConstr:(baseClass)=>{
			return class extends baseClass {
				init(...moreArgs) {
					super.init(...moreArgs);
					
					this.obj3D.add(this.hitboxList.makeDebugObj3D());
				}
				getCameraPos() {
					return this.pos.clone().add(new lib.vec3(0.0,1.5,0.0));
				}
				drawTick() {
					super.drawTick();
					
					this.obj3D.setRotationFromAxisAngle(new THREE.Vector3(0.0,1.0,0.0), this.controls.rotY);
				}
			}
		}
	});
	/*
	lib.Player.SPEED =  30.0;
	lib.Player.JUMP_VEL = lib.STANDARD_GRAVITY.clone().mult(-1.0);
	lib.Player.JUMP_TEST_DROP = new lib.vec3(0.0,-0.01,0.0);
	*/
	lib.Player.SPEED = 5.0;
	lib.Player.JUMP_VEL = lib.STANDARD_GRAVITY.clone().mult(-1.0);
	lib.Player.JUMP_TEST_DROP = new lib.vec3(0.0,-0.01,0.0);
	
	lib.MovingPlatform = aux.addEntity({
		typeName:'movingPlatform',
		makeServerConstr:()=>{
			return class extends lib.Platform {
				constructor(startPos=new lib.vec3(0.0,0.0,0.0)) {
					super(
						startPos,
						new lib.HitboxList([
							new lib.Hitbox(new lib.vec3(0.0,0.0,0.0),new lib.vec3(2.0,0.5,2.0))
						]),
						new lib.vec3(2.0,0.0,0.0)
					);
				}
				tick(t,world) {
					
					if(this.pos.x >= 48) this.vel = new lib.vec3(-2.0,0.0,0.0);
					if(this.pos.x <= 30) this.vel = new lib.vec3( 2.0,0.0,0.0);
					
					super.tick(t,world);
				}
			};
		}
	});
	
	if(!onNode) {
		lib.getControlsData = function(controls) {
			/*
			return {
				left:controls.keyDown('KeyA'),
				right:controls.keyDown('KeyD'),
				up:controls.keyDown('Space'),
				down:controls.keyDown('ShiftLeft'),
				forward:controls.keyDown('KeyW'),
				backward:controls.keyDown('KeyS'),
				rotY:controls.getRotY()
			};
			*/
			
			return {
				jump:controls.keyDown('Space'),
				forward:controls.keyDown('KeyW'),
				backward:controls.keyDown('KeyS'),
				left:controls.keyDown('KeyA'),
				right:controls.keyDown('KeyD'),
				rotY:controls.getRotY()
			};
			
		}
	}
	
	lib.makeWorld = function() {
		let world = new lib.World();
		
		world.addEntity(lib.makeEntity(lib.Box));
		world.addEntity(lib.makeEntity(
			lib.Platform,
			new lib.vec3(0.0,0.0,0.0),
			new lib.HitboxList([
				new lib.Hitbox(new lib.vec3(10.0,0.0,10.0),new lib.vec3(20.0,0.5,20.0)),
				new lib.Hitbox(new lib.vec3(10.0,1.0,30.0),new lib.vec3(20.0,1.0,1.0)),
				new lib.Hitbox(new lib.vec3(10.0,2.0,31.0),new lib.vec3(20.0,1.0,1.0)),
				new lib.Hitbox(new lib.vec3(10.0,3.0,32.0),new lib.vec3(20.0,1.0,1.0)),
				new lib.Hitbox(new lib.vec3(10.0,4.0,33.0),new lib.vec3(20.0,1.0,1.0)),
				new lib.Hitbox(new lib.vec3(10.0,5.0,34.0),new lib.vec3(20.0,1.0,1.0)),
				new lib.Hitbox(new lib.vec3(10.0,6.0,35.0),new lib.vec3(20.0,1.0,1.0)),
			])
		));
		world.addEntity(lib.makeEntity(
			lib.Platform,
			new lib.vec3(40.0,0.0,0.0),
			new lib.HitboxList([
				new lib.Hitbox(new lib.vec3(10.0,0.0,10.0),new lib.vec3(20.0,0.5,20.0)),
				new lib.Hitbox(new lib.vec3(10.0,1.0,30.0),new lib.vec3(20.0,1.0,1.0)),
				new lib.Hitbox(new lib.vec3(10.0,2.0,31.0),new lib.vec3(20.0,1.0,1.0)),
				new lib.Hitbox(new lib.vec3(10.0,3.0,32.0),new lib.vec3(20.0,1.0,1.0)),
				new lib.Hitbox(new lib.vec3(10.0,4.0,33.0),new lib.vec3(20.0,1.0,1.0)),
				new lib.Hitbox(new lib.vec3(10.0,5.0,34.0),new lib.vec3(20.0,1.0,1.0)),
				new lib.Hitbox(new lib.vec3(10.0,6.0,35.0),new lib.vec3(20.0,1.0,1.0)),
			])
		));
		world.addEntity(lib.makeEntity(
			lib.MovingPlatform,
			new lib.vec3(30.0,0.0,10.0)
		));
		world.addEntity(lib.makeEntity(
			lib.MovingPlatform,
			new lib.vec3(48.0,0.0,28.0)
		));
		
		//world.addEntity(lib.makeEntity(lib.Player,new lib.vec3(20.0,20.0,20.0)));
		
		return world;
	}
	lib.makePlayerEntity = function(userData,spawnData) {
		//return lib.makeEntity(lib.Spectator, new lib.vec3(0.0,3.0,0.0));
		return lib.makeEntity(lib.Player, new lib.vec3(15.0,20.0,15.0));
	}
	
	if(onNode) {
		module.exports = lib;
	} else {
		library.addLib('game',lib);
	}
	
})();