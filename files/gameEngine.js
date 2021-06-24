(function() {
	let onNode = typeof module !== "undefined" && module.exports;
	
	const netlib = (()=>{
		if(onNode)
			return require('./netlib.js');
		else
			return library.requireByName('netlib');
	})();
	
	let lib = {};
	let aux = {};
	
	//added code
	
	lib.defaultSwapTable = netlib.defaultSwapTable.clone();
	
	lib.Queue = netlib.Queue;
	
	lib.TickTimer = class {
		constructor(targetTPS,maxFallbehind,startTime = Date.now()*0.001) {
			this.maxFallbehind = maxFallbehind;
			this.targetSPT = 1/targetTPS;
			
			this.lastCheckTime = startTime;
			this.timeToSimulate = 0;
		}
		check(func) {
			
			this.timeToSimulate += Date.now()*0.001 - this.lastCheckTime;
			this.lastCheckTime = Date.now()*0.001;
		
			if(this.timeToSimulate > this.maxFallbehind) {
				this.timeToSimulate = 0;
			}
			
			while(this.timeToSimulate >= this.targetSPT) {
				func(this.targetSPT);
				this.timeToSimulate -= this.targetSPT;
			}
		}
	};
	
	lib.vec3 = class {
		constructor(x=0,y=0,z=0) {
			this.x = x;
			this.y = y;
			this.z = z;
		}
		add(v) {
			this.x += v.x;
			this.y += v.y;
			this.z += v.z;
			return this;
		}
		mult(n) {
			this.x *= n;
			this.y *= n;
			this.z *= n;
			return this;
		}
		sub(v) {
			this.x -= v.x;
			this.y -= v.y;
			this.z -= v.z;
			return this;
		}
		div(n) {
			this.x /= n;
			this.y /= n;
			this.z /= n;
			return this;
		}
		divVec(v) {
			this.x /= v.x;
			this.y /= v.y;
			this.z /= v.z;
			return this;
		}
		neg() {
			this.x = -this.x;
			this.y = -this.y;
			this.z = -this.z;
			return this;
		}
		mag() {
			return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z);
		}
		
		equals(v) {
			return this.x === v.x &&
				   this.y === v.y &&
				   this.z === v.z;
		}
		isZero() {
			return (this.x === 0.0) &&
				   (this.y === 0.0) &&
				   (this.z === 0.0);
		}
		
		clone() {
			return new lib.vec3(this.x,this.y,this.z);
		}
		toString() {
			return 'x:' + this.x.toString()
			   + ', y:' + this.y.toString()
			   + ', z:' + this.z.toString();
		}
		
		rotY(r) {
			let tx =  this.x*Math.cos(r) + this.z*Math.sin(r);
			let tz = -this.x*Math.sin(r) + this.z*Math.cos(r);
			
			this.x = tx;
			this.z = tz;
		}
		
		getData(query) {
			let outData = new netlib.DataNode();
			
			outData.addDataIfQueried('x',this.x,query);
			outData.addDataIfQueried('y',this.y,query);
			outData.addDataIfQueried('z',this.z,query);
			
			return outData;
		}
		setData(data) {
			
			data.setDataIfIncluded('x',this,'x');
			data.setDataIfIncluded('y',this,'y');
			data.setDataIfIncluded('z',this,'z');
			
		}
	};
	if(!onNode) {
		let old = lib.vec3;
		lib.vec3 = class extends old {
			getVector3() {
				return new THREE.Vector3(this.x,this.y,this.z);
			}
		};
	}
	
	
	lib.entityTypeDict = {};
	
	lib.World = class {
		constructor() {
			this.entitySet = new netlib.NetSet(
				(type,data)=>{return this.typeFunc(type,data);},
				(...moreArgs)=>{return this.addFunc(...moreArgs);/*console.log(moreArgs);*/},
				(...moreArgs)=>{this.delFunc(...moreArgs);}
			);
			
			this.entityAddCallbacks = [];
		}
		tick(t) {
			this.entitySet.forAll((id,item)=>{
				item.tick(t,this);
			});
		}
		clientTick(t) {
			this.entitySet.forAll((id,item)=>{
				item.clientTick(t,this);
			});
		}
		
		getEntityByID(id) {
			return this.entitySet.getItem(id);
		}
		addEntity(entity) {
			return this.entitySet.addItem(entity);
		}
		removeEntity(id) {
			this.entitySet.removeItem(id);
		}
		
		forAll(callback) {
			this.entitySet.forAll(callback);
		}
		
		typeFunc(type,data) {
			let entity = new lib.entityTypeDict[type]();
			entity.setData(data);
			entity.init();
			
			return entity;
		}
		addFunc(data,id){
			data.setID(id);
			
			for(let i = this.entityAddCallbacks.length-1; i >= 0; i--) {
				if(this.entityAddCallbacks[i](data,id)) {
					this.entityAddCallbacks.splice(i,1);
				}
			}
		}
		delFunc(){}
		
		addEntityAddCallback(callback) {
			this.entityAddCallbacks.push(callback);
		}
		
		getData(query) {
			let outData = new netlib.DataNode();
			
			if(query.queries('entitySet')) {
				outData.addObject('entitySet',this.entitySet,query.getChildQuery('entitySet'));
			}
			
			return outData;
		}
		setData(data) {
			
			if(data.hasChild('entitySet')) {
				this.entitySet.setData(data.getChild('entitySet'));
			}
			
		}
	};
	if(!onNode) {
		let old = lib.World;
		lib.World = class extends old {
			constructor() {
				super();
				
				this.obj3D = new THREE.Object3D();
			}
			
			addFunc(data,id) {
				super.addFunc(data,id);
				
				this.obj3D.add(data.getObj3D());
			}
			delFunc(data,id) {
				super.delFunc(data,id);
				
				this.obj3D.remove(data.getObj3D());
				console.log('[WARNING] delFunc happened on client!');
			}
			
			drawTick(t) {
				this.entitySet.forAll((id,item)=>{
					item.drawTick(t);
				});
			}
			getObj3D() {
				return this.obj3D;
			}
		};
	}
	
	const addEntityType = function(constructor) {
		if(constructor.typeName in lib.entityTypeDict)
			throw "game.addEntityType: typeName already in entityTypeDict";
		
		lib.entityTypeDict[constructor.typeName] = constructor;
	};
	aux.addEntityType = addEntityType;
	
	lib.BasicEntity = class {
		constructor(pos) {
			this.pos = pos || new lib.vec3();
			
			this.id = -1;
			this.tags = [];
		}
		init() {}
		tick() {}
		clientTick() {}
		
		addTag(tag) {
			this.tags.push(tag);
		}
		hasTag(tag) {
			return this.tags.includes(tag);
		}
		
		setID(id) {
			this.id = id;
		}
		getID() {
			return this.id;
		}
		
		getData(query) {
			let outData = new netlib.DataNode();
			
			outData.addObjectIfQueried('pos',this.pos,query);
			
			return outData;
		}
		setData(data) {
			data.setObjectIfIncluded('pos',this.pos);
		}
		getType() {
			return this.constructor.typeName;
		}
	};
	if(!onNode) {
		let old = lib.BasicEntity;
		lib.BasicEntity = class extends old {
			constructor(...moreArgs) {
				super(...moreArgs);
				this.obj3D = new THREE.Object3D();
			}
			init() {
				this.obj3D = new THREE.Object3D();
			}
			drawTick() {
				this.obj3D.position.copy(this.pos.getVector3());
			}
			getObj3D() {
				return this.obj3D;
			}
		};
	}
	
	
	lib.Hitbox = class {
		constructor(pos,dim) {
			if(pos === undefined) pos = new lib.vec3();
			if(dim === undefined) dim = new lib.vec3();
			
			this.pos = pos;
			this.dim = dim;
		}
		inHitbox(hitbox,offA = new lib.vec3(),offB = new lib.vec3()) {
			
			let a1 = this.pos.clone().add(offA);
			let a2 = this.pos.clone().add(offA).add(this.dim);
			let b1 = hitbox.pos.clone().add(offB);
			let b2 = hitbox.pos.clone().add(offB).add(hitbox.dim);
			
			let xInside = !(a2.x <= b1.x || b2.x <= a1.x);
			let yInside = !(a2.y <= b1.y || b2.y <= a1.y);
			let zInside = !(a2.z <= b1.z || b2.z <= a1.z);
			
			return xInside && yInside && zInside;
			
		}
		moveOutOfHitbox(hitbox,moveDir,offA,offB, returnT = false) {
			
			let minT = -1;
			
			if(this.inHitbox(hitbox,offA,offB)) {
				let a1 = this.pos.clone().add(offA);
				let a2 = this.pos.clone().add(offA).add(this.dim);
				let b1 = hitbox.pos.clone().add(offB);
				let b2 = hitbox.pos.clone().add(offB).add(hitbox.dim);
				
				/*
				console.log('DID10');
				console.log(a1.toString());
				console.log('DID11');
				console.log(a2.toString());
				console.log('DID12');
				console.log(b1.toString());
				console.log('DID13');
				console.log(b2.toString());
				*/
				
				//a + moveDir * t = b
				//t = (b - a) / moveDir
				
				let t1 = b1.clone().sub(a2).divVec(moveDir);
				let t2 = b2.clone().sub(a1).divVec(moveDir);
				
				if((!Number.isNaN(t1.x)) && t1.x >= 0 && (minT === -1 || t1.x < minT)) minT = t1.x;
				if((!Number.isNaN(t1.y)) && t1.y >= 0 && (minT === -1 || t1.y < minT)) minT = t1.y;
				if((!Number.isNaN(t1.z)) && t1.z >= 0 && (minT === -1 || t1.z < minT)) minT = t1.z;
				
				if((!Number.isNaN(t1.x)) && t2.x >= 0 && (minT === -1 || t2.x < minT)) minT = t2.x;
				if((!Number.isNaN(t1.y)) && t2.y >= 0 && (minT === -1 || t2.y < minT)) minT = t2.y;
				if((!Number.isNaN(t1.z)) && t2.z >= 0 && (minT === -1 || t2.z < minT)) minT = t2.z;
				
				/*
				let tx1 = (b1.x - a2.x) / moveDir.x;
				let ty1 = (b1.y - a2.y) / moveDir.y;
				let tz1 = (b1.z - a2.z) / moveDir.z;
				
				let tx2 = (b2.x - a1.x) / moveDir.x;
				let ty2 = (b2.y - a1.y) / moveDir.y;
				let tz2 = (b2.z - a1.z) / moveDir.z;
				*/
				
				if(minT === -1) {
					console.log('DID T1');
					console.log(t1.toString());
					console.log('DID T2');
					console.log(t2.toString());
					console.log('DID MOVE');
					console.log(moveDir.toString());
					
					console.trace();
					throw "game.Hitbox.moveOutOfHitbox: hitboxes colliding but no exit vector was found";
				}
				
			}
			
			if(minT === -1) {
				minT = 0;
			}
			
			if(returnT) {
				return minT;
			} else {
				return moveDir.clone().mult(minT);
			}
			
		}
		
		getData(query) {
			let outData = new netlib.DataNode();
			
			outData.addObjectIfQueried('pos',this.pos,query);
			outData.addObjectIfQueried('dim',this.dim,query);
			
			return outData;
		}
		setData(data) {
			
			data.setObjectIfIncluded('pos',this.pos);
			data.setObjectIfIncluded('dim',this.dim);
			
		}
	};
	if(!onNode) {
		let old = lib.Hitbox;
		lib.Hitbox = class extends old {
			makeDebugObj3D() {
				let mesh = new THREE.Mesh(
					new THREE.BoxGeometry(this.dim.x,this.dim.y,this.dim.z),
					new THREE.MeshNormalMaterial()
				);
				mesh.position.copy(this.pos.clone().add(this.dim.clone().mult(0.5)).getVector3());
				
				return mesh;
			}
		};
	}
	
	lib.HitboxList = class {
		constructor(hitboxes=[]) {
			this.hitboxes = new netlib.NetSet((type,itemData)=>{
				let hitbox = new lib.Hitbox();
				hitbox.setData(itemData);
				return hitbox;
			});
			
			for(let i in hitboxes) {
				this.hitboxes.addItem(hitboxes[i]);
			}
		}
		
		inHitbox(hitbox,off1,off2,returnBoolean=true) {
			let inside = this.hitboxes.forAll((id,item)=>{
				
				if(item.inHitbox(hitbox,off1,off2)) {
					
					if(returnBoolean) {
						return true;
					} else {
						return item;
					}
					
				}
				
			});
			
			if(inside) return inside;
			return false;
		}
		inHitboxList(hitboxList,off1,off2,returnBoolean=true) {
			let result = hitboxList.hitboxes.forAll((id,item)=>{
				
				let hitbox = this.inHitbox(item,off1,off2,false);
				if(hitbox) {
					
					if(returnBoolean) {
						return true;
					} else {
						return {a:hitbox,b:item};
					}
					
				}
				
			});
			
			if(result) return result;
			return result;
		}
		
		moveOutOfHitbox(hitbox,moveDir,offA,offB,returnT = false) {
			let movedOnCycle = true;
			let totalT = 0;
			
			offA = offA.clone();
			
			while(movedOnCycle) {
				
				movedOnCycle = false;
				
				this.hitboxes.forAll((id,item)=>{
					let t = item.moveOutOfHitbox(hitbox,moveDir,offA,offB,true);
					if(t > 0) {
						movedOnCycle = true;
						totalT += t;
						offA.add(moveDir.clone().mult(t));
					}
				});
				
			}
			
			if(returnT) {
				return totalT;
			} else {
				return moveDir.clone().mult(totalT);
			}
		}
		moveOutOfHitboxList(hitboxList,moveDir,offA,offB,returnT = false) {
			let movedOnCycle = true;
			let totalT = 0;
			
			offA = offA.clone();
			
			while(movedOnCycle) {
				
				movedOnCycle = false;
				
				hitboxList.hitboxes.forAll((id,item)=>{
					let t = this.moveOutOfHitbox(item,moveDir,offA,offB,true);
					if(t > 0) {
						movedOnCycle = true;
						totalT += t;
						offA.add(moveDir.clone().mult(t));
					}
				});
				
			}
			
			if(returnT) {
				return totalT;
			} else {
				return moveDir.clone().mult(totalT);
			}
		}
		
		addHitbox(hitbox) {
			this.hitboxes.addItem(hitbox);
		}
		
		getData(query) {
			let outData = new netlib.DataNode();
			
			outData.addObjectIfQueried('list',this.hitboxes,query);
			
			return outData;
		}
		setData(data) {
			data.setObjectIfIncluded('list',this.hitboxes);
		}
	}
	if(!onNode) {
		let old = lib.HitboxList;
		lib.HitboxList = class extends old {
			makeDebugObj3D() {
				let obj3D = new THREE.Object3D();
				
				this.hitboxes.forAll((id,item)=>{
					obj3D.add(item.makeDebugObj3D());
				});
				
				return obj3D;
			}
		};
	}
	
	
	lib.Platform = class extends lib.BasicEntity {
		constructor(pos,hitboxList,vel=new lib.vec3()) {
			
			if(pos === undefined) pos = new lib.vec3();
			if(hitboxList === undefined) hitboxList = new lib.HitboxList();
			
			super(pos);
			
			this.vel = vel;
			this.hitboxList = hitboxList;
			
			this.addTag(lib.Platform.tagName);
		}
		
		tick(t,world) {
			this.pos.add(this.vel.clone().mult(t));
		}
		
		getHitboxList() {
			return this.hitboxList;
		}
		getPos() {
			return this.pos.clone();
		}
		getVel() {
			return this.vel.clone();
		}
		
		getData(query) {
			let outData = new netlib.DataNode();
			
			outData.addObjectIfQueried('pos',this.pos,query);
			outData.addObjectIfQueried('vel',this.vel,query);
			
			outData.addObjectIfQueried('hitboxes',this.hitboxList,query);
			
			return outData;
		}
		setData(data) {
			
			data.setObjectIfIncluded('pos',this.pos);
			data.setObjectIfIncluded('vel',this.vel);
			
			data.setObjectIfIncluded('hitboxes',this.hitboxList);
			
		}
	}
	if(!onNode) {
		let old = lib.Platform;
		lib.Platform = class extends old {
			constructor(...moreArgs) {
				super(...moreArgs);
			}
			init(...moreArgs) {
				super.init(...moreArgs);
				
				this.obj3D.add(this.hitboxList.makeDebugObj3D());
			}
		};
	}
	lib.Platform.typeName = 'platform';
	lib.Platform.tagName = 'isPlatform';
	addEntityType(lib.Platform);
	
	lib.PhysicsEntity = class extends lib.BasicEntity {
		constructor(pos,hitboxList,vel=new lib.vec3()) {
			super(pos);
			this.vel = vel;
			this.hitboxList = hitboxList;
			
			this.addTag(lib.PhysicsEntity.tagName);
		}
		
		getPlatformList(platformList) { //subalgorithm of escapePlatforms
			if(!Array.isArray(platformList)) {
				
				if(platformList instanceof lib.World) {
					let old = platformList;
					platformList = ()=>{
						let out = [];
						
						old.forAll((id,entity)=>{
							if(entity.hasTag(lib.Platform.tagName)) {
								out.push(entity);
							}
						});
						
						return out;
					};
				}
				platformList = platformList();
				
			}
			
			return platformList;
		}
		getDirFunc(dirFunc) { //subalgorithm of escapePlatforms
			if(dirFunc instanceof lib.vec3) {
				let old = dirFunc;
				dirFunc = ()=>{
					return old;
				}
			}
			return dirFunc;
		}
		escapePlatforms(platformList, dirFunc, options={}) { //should probably split into multiple function
			
			//platformList can also be a World to check against all platforms in the world
			//platformList can also be a function to generate a list when called (may be fairly useless?)
			//dirFunc can also be a vector to just return one thing
			//offVec=new lib.vec3(), returnHitPlatforms=false, tries=lib.PhysicsEntity.MAX_ESCAPE_ATTEMPTS
			
			//interpret parameters
			
			if(options.pos === undefined) options.pos = this.pos.clone();
			if(options.tries === undefined) options.tries = lib.PhysicsEntity.MAX_ESCAPE_ATTEMPTS;
			
			platformList = this.getPlatformList(platformList);
			
			dirFunc = this.getDirFunc(dirFunc);
			
			//actual algorithm
			
			let movedOnLoop = true;
			
			let offVec = new lib.vec3();
			
			let hitPlatforms = new Set();
			
			for(let i = 0; i < options.tries; i++) {
				
				movedOnLoop = false;
				
				for(let p in platformList) {
					
					let platform = platformList[p]; //quick fix
					
					let dir = dirFunc(platform);

					//needs platform, dirfunc, offVec to be turned into subalgorithm
					let t = this.hitboxList.moveOutOfHitboxList(
						platform.getHitboxList(),
						dir,
						options.pos.clone().add(offVec),
						platform.getPos(),
						true
					);
					
					if(t > 0.0) {
						movedOnLoop = true;
						offVec.add(dir.clone().mult(t));
						
						hitPlatforms.add(platform);
					}
					
				}
				
				if(!movedOnLoop) {
					break;
				}
				
			}
			
			if(movedOnLoop) {
				console.log('[WARNING] gameEngine.PhysicsEntity.escapePlatforms: could not move out of platform hitbox in allowed attempts');
			}
			
			return {offVec:offVec,hitPlatforms:[...hitPlatforms]};
			
		}
		
		inPlatforms(platformList,options={}) { //only returns boolean for now
			
			if(options.pos === undefined) options.pos = this.pos.clone();
			
			platformList = this.getPlatformList(platformList);
			
			for(let p in platformList) {
				
				let platform = platformList[p]; //quick fix

				//needs platform, dirfunc, offVec to be turned into subalgorithm
				let didHit = this.hitboxList.inHitboxList(
					platform.getHitboxList(),
					options.pos.clone(),
					platform.getPos(),
				);
				
				if(didHit) return true;
				
			}
			
			return false;
			
		}
		
		move(platformList, dir, options={}) {
			if(options.steps === undefined) options.steps = 1;
			
			let stepVec = dir.clone().div(options.steps);
			
			let escapeReturn;
			
			for(let i = 0; i < options.steps; i++) {
			
				this.pos.add(stepVec);
				
				escapeReturn = this.escapePlatforms(
					platformList,
					stepVec.clone().neg(),
					{tries:options.tries}
				);
				let offVec = escapeReturn.offVec; //quick and dirty
				
				if(!offVec.isZero()) {
					this.pos.add(offVec);
					break;
				}
				
			}
			
			return escapeReturn;
		}
		
		tick(t,world) {
			
			this.pos.add(this.vel.clone().mult(t));
			
			let {offVec:offVec,hitPlatforms:hitPlatforms} = this.escapePlatforms(
				world,
				(platform)=>{
					let vel = platform.getVel().sub(this.vel);
					
					if(vel.isZero())
						return new lib.vec3(0.0,1.0,0.0);
					return vel;
				},
				{
					returnHitPlatforms:true
				}
			);
			
			if(!(offVec.isZero())) {
				if(hitPlatforms.length === 0)
					throw "gameEngine.PhysicsEntity.tick: hitPlatforms.length === 0 when !offVec.isZero()";
				
				this.pos.add(offVec);
				this.vel = hitPlatforms[0].getVel();
			}

			
		}
		
		getData(query) {
			let outData = super.getData(query);
			
			outData.addObjectIfQueried('vel',this.vel,query);
			
			return outData;
		}
		setData(data) {
			super.setData(data);
			
			data.setObjectIfIncluded('vel',this.vel);
		}
	}
	lib.PhysicsEntity.tagName = 'isPhysicsEntity';
	lib.PhysicsEntity.MAX_ESCAPE_ATTEMPTS = 20;
	
	
	const makePlayerClass = function(constr) {
		let playerConstr = class extends constr {
			constructor(defaultControls,...moreArgs) {
				super(...moreArgs);
				this.controls = defaultControls;
				
				this.addTag('isPlayer');
			}
			setControls(controls) {
				this.controls = controls;
			}
			getControls() {
				return this.controls;
			}
			
			getData(query) {
				let outData = super.getData(query);
				
				outData.addDataIfQueried('controls',this.controls,query);
				
				return outData;
			}
			setData(data) {
				super.setData(data);
				
				data.setDataIfIncluded('controls',this,'controls');
			}
		};
		
		if(onNode) {
			return playerConstr;
		} else {
			return class extends playerConstr {
				getCameraPos() {
					console.log('[WARNING] gameEngine.makePlayerClass: user did not implement [player].getCameraPos');
					return this.pos.clone();
				}
				setVisibility(state) {
					this.obj3D.visible = state;
				}
			};
		}
	}
	aux.makePlayerClass = makePlayerClass;
	
	lib.makeEntity = function(constructor,...moreArgs) {
		let entity = new constructor(...moreArgs);
		entity.init(); //may need more arguments
		return entity;
	}
	lib.makeHitboxList = function(list) {
		
		let hitboxList = new lib.HitboxList();
		
		for(let i in list) {
			hitboxList.addHitbox(
				new lib.Hitbox(
					new lib.vec3(list[i][0][0], list[i][0][1], list[i][0][2]),
					new lib.vec3(list[i][1][0], list[i][1][1], list[i][1][2])
				)
			);
		}
		
		return hitboxList;
		
	}
	
	aux.addEntity = function(spec) {
		
		let constr;
		
		if(spec.makeServerConstr) {
			constr = spec.makeServerConstr();
		} else {
			constr = spec.serverConstr;
		}
		
		if((!onNode) && spec.makeClientConstr) {
			constr = spec.makeClientConstr(constr);
		}
		constr.typeName = spec.typeName;
		
		aux.addEntityType(constr);
		
		return constr;
		
	}
	
	let out = {lib:lib,aux:aux};
	
	if(onNode) {
		module.exports = out;
	} else {
		library.addLib('gameEngine',out);
	}
	
})();