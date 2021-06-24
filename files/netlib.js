(function() { //should probably prefix a lot of the methods with underscores
	
	let onNode = typeof module !== "undefined" && module.exports;
	
	let lib = {};
	
	lib.Queue = class {
		constructor(itemList = []) {
			this.itemList = itemList;
		}
		enqueue(item) {
			this.itemList.push(item);
		}
		dequeue() {
			return this.itemList.shift();
		}
		isEmpty() {
			return this.itemList.length === 0;
		}
		hasMore() {
			return !this.isEmpty();
		}
		itemCount() {
			return this.itemList.length;
		}
	};
	
	//data node stuff
	
	lib.DataRequestNode = class {
		constructor(children = {},userData = {},parent=null) {
			this.children = children;
			this.userData = userData;
			this.parent = parent;
		}
		getJSON() {
			let childJSON = {};
			
			if(this.children === null) {
				childJSON = null;
			} else {
				for(let c in this.children) {
					childJSON[c] = this.children[c].getJSON();
				}
			}
			
			return {
				children: childJSON,
				userData: this.userData
			};
		}
		
		addChild(name,child) {
			if(name in this.children) {
				throw "netlib.DataRequestTreeNode.addChild: child name already in node";
			}
			
			this.children[name] = child;
			child.setParent(this);
		}
		
		setParent(parent) {
			this.parent = parent;
		}
		getInheritedUserData() {
			if(this.parent === null) {
				return this.userData;
			} else {
				return {...this.parent.getInheritedUserData(), ...this.userData};
			}
		}
		
		queriesAll() {
			return this.children === null;
		}
		queries(child) {
			return this.queriesAll() || child in this.children;
		}
		
		getChildQuery(name) {
			if(this.children === null) {
				return new lib.DataRequestNode(null,{},this);
			} else {
				if(!(name in this.children))
					throw "netlib.DataRequestNode.getChildQuery: name not in children";
				
				return this.children[name];
			}
		}
	}
	lib.DataQueryNode = lib.DataRequestNode;
	lib.DataQueryNode.prototype.toJSON = lib.DataQueryNode.prototype.getJSON;
	
	lib.getDataRequestTreeFromJSON = function(json) {
		
		if(json.children === null) {
			return new lib.DataRequestNode(null,json.userData);
		} else {
			let node = new lib.DataRequestNode({},json.userData);
			
			for(i in json.children) {
				node.addChild(i,lib.getDataRequestTreeFromJSON(json.children[i]));
			}
			
			return node;
		}
		
	}
	
	lib.DataNode = class { //significant amount of shared code with DataRequestNode
		constructor(childData = {},userData = {},isParentNode = null) {
			this.childData = childData;
			this.userData = userData;
			this.parent = null;
			
			if(isParentNode === null) {
				isParentNode = typeof this.childData === 'object' && this.childData !== null;
			}
			
			this.isParentNode = isParentNode;
		}
		toJSON() {
			
			let childJSON = {};
			
			if(this.isParentNode) {
				for(let c in this.childData) {
					childJSON[c] = this.childData[c].toJSON();
				}
			} else {
				childJSON = this.childData;
			}
			
			return {
				childData: childJSON,
				userData: this.userData,
				isParentNode:this.isParentNode
			};
		}
		
		addChildNode(name,node) {
			this.childData[name] = node;
			node.setParent(this);
		}
		addChildData(name,data,userData={}) {
			this.addChildNode(name, new lib.DataNode(data,userData,false));
		}
		addChildObject(name,obj,query = new lib.DataRequestNode(null)) {
			this.addChildNode(name,obj.getData(query));
		}
		
		addNodeIfQueried(name,node,query) { //repeated code
			if(query.queries(name)) {
				this.addChildQuery(name,node);
			}
		}
		addObjectIfQueried(name,obj,query) {
			if(query.queries(name)) {
				this.addChildObject(name,obj,query.getChildQuery(name));
			}
		}
		addDataIfQueried(name,data,query) {
			if(query.queries(name)) {
				this.addChildData(name,data);
			}
		}
		
		setParent(parent) {
			this.parent = parent;
		}
		getInheritedUserData() {
			if(this.parent === null) {
				return this.userData;
			} else {
				return {...this.parent.getInheritedUserData(), ...this.userData};
			}
		}
		
		forChildren(func) {
			if(!this.isParentNode)
				throw "netlib.DataNode.forChildren: this is a parent node";
			
			for(let i in this.childData) {
				func(i,this.childData[i])
			}
			
		}
		getData() {
			if(this.isParentNode)
				console.log("[WARNING] lib.DataNode.getData is being called on a parent node");
			
			return this.childData;
		}
		
		getChild(child) {
			if(!this.isParentNode)
				console.log("[WARNING] lib.DataNode.getChild is being called on a parent node");
			
			return this.childData[child];
		}
		
		hasChild(child) {
			return child in this.childData;
		}
		
		setObjectIfIncluded(name,obj) {
			if(this.hasChild(name)) {
				obj.setData(this.getChild(name));
			}
		}
		setDataIfIncluded(name,parent,child) { //weird
			if(this.hasChild(name)) {
				parent[child] = this.getChild(name).getData();
			}
		}
	};
	lib.getDataTreeFromJSON = function(json) {
		
		if(json.isParentNode) {
			let node = new lib.DataNode({},json.userData,true);
			
			for(i in json.childData) {
				node.addChildNode(i,lib.getDataTreeFromJSON(json.childData[i]));
			}
			
			return node;
		} else {
			return new lib.DataNode(json.childData,json.userData,false);
		}
	}
	lib.DataNode.prototype.addNode = lib.DataNode.prototype.addChildNode;
	lib.DataNode.prototype.addData = lib.DataNode.prototype.addChildData;
	lib.DataNode.prototype.addObject = lib.DataNode.prototype.addChildObject;
	
	//netset
	
	lib.NetSet = class {
		constructor(typeFunc,addFunc=(()=>{}),delFunc=(()=>{})) {
			this.set = {};
			this.idGenerator = new lib.NetSet.IDGenerator();
			
			this.typeFunc = typeFunc;
			this.addFunc = addFunc;
			this.delFunc = delFunc;
		}
		
		addItem(item,type=undefined) {
			let id = this.idGenerator.genNewID();
			
			if(type === undefined) {
				if(typeof item === 'object' && item !== null) {
					if('getType' in item.__proto__) {
						type = item.getType();
					} else {
						type = '';
					}
				} else {
					type = null;
				}
				
				/*
				if('getType' in item) {
					type = item.getType();
				} else if() {
					
				} else {
					type = null;
				}
				*/
			}
			
			//if type is null, the object is assumed to have no typing methods
			//otherwise, it is.
			
			this.set[id] = {
				data:item,
				type:type
			}; //may want to add isCurrent/isVerified flag later
			
			this.addFunc(this.set[id].data, id);
			
			return id;
		}
		removeItem(id) {
			this.delFunc(this.set[id].data, id);
			delete this.set[id];
		}
		
		forAll(func) {
			for(let i in this.set) {
				let result = func(i,this.set[i].data,this.set[i].type);
				if(result !== undefined) {
					return result;
				}
			}
		}
		getItem(id) {
			let group = this.set[id];
			if(group === undefined) return undefined;
			return group.data;
		}
		
		getSetData(query) {
			let setData = new lib.DataNode();
			
			for(let i in this.set) {
				if(query.queries(i)) {
					
					let itemData = new lib.DataNode();
					itemData.addData('type',this.set[i].type);
					
					if(this.set[i].type !== null) {
						itemData.addObject('data', this.set[i].data, query.getChildQuery(i));
					} else {
						itemData.addData('data',this.set[i].data);
					}
					
					setData.addNode(i,itemData);
				}
			}
			
			return setData;
		}
		getIDList() { //Object.keys?
			let list = [];
			
			for(let i in this.set) {
				list.push(i);
			}
			
			return list;
		}
		getData(query) {
			
			let outData = new lib.DataNode();
			
			if(query.queries('itemList')) {
				outData.addNode('itemList',this.getSetData(query.getChildQuery('itemList')));
			}

			if(query.queries('idList')) {
				outData.addData('idList',this.getIDList());
			}
			
			return outData;
			
		}
		
		setData(data) {
			
			if(data.hasChild('idList')) {
				let idList = data.getChild('idList').getData();
				
				for(let i in this.set) {
					if(!(idList.includes(i))) {
						this.delFunc(this.set[i].data,i);
						delete this.set[i];
					}
				}
			}
			
			if(data.hasChild('itemList')) {
				let itemList = data.getChild('itemList');
				
				itemList.forChildren((name,child)=>{
					
					let type = child.getChild('type').getData();
					let itemData = child.getChild('data');
					
					if(name in this.set && type === this.set[name].type) {
						if(type === null) {
							this.set[name].data = itemData.getData();
						} else {
							this.set[name].data.setData(itemData);
						}
					} else {
						if(type === null) {
							this.set[name] = {
								data:itemData.getData(),
								type:null
							};
						} else {
							this.set[name] = {
								data:this.typeFunc(type,itemData),
								type:type
							};
						}
						
						this.addFunc(this.set[name].data,name);
					}
					
				});
			}
		}
	};
	lib.NetSet.IDGenerator = class {
		constructor() {
			this.lastID = 0;
		}
		genNewID() {
			this.lastID += 1;
			return this.lastID.toString();
		}
	};
	
	//request
	
	lib.Request = class {
		constructor(data,id,responder,...moreArgs) {
			this.data = data;
			this.id = id;
			this.responder = responder;
			this.userData = {};
			
			this.responseMade = false;
			
			this.moreArgs = moreArgs;
		}
		respond(data) {
			this.responder.sendResponse(this.id,data,...(this.moreArgs));
			
			if(this.isInvalid()) {
				console.log("DID1");
				console.log(this.responseMade);
				
				console.trace();
				throw 'netlib.Request.respond: this request is invalid';
			}
			
			this.responseMade = true;
		}
		respondIfValid(data) {
			if(this.isValid()) {
				respond(data);
			}
		}
		
		getData() {
			return this.data;
		}
		
		isValid() {
			return this.responder.isConnected(...(this.moreArgs)) && (!this.responseMade);
		}
		isInvalid() {
			return !this.isValid();
		}
	};
	
	//compresion functions
	
	lib.SwapTable = class {
		constructor(swaps=[]) {
			this.swaps = {};
			
			for(let i in swaps) {
				this.addSwap(swaps[i][0],swaps[i][1]);
			}
		}
		addSwap(a,b) {
			if(a === b)
				throw "game.SwapTable.addSwap: swap equeal";
			
			if(a in this.swaps || b in this.swaps)
				throw "game.SwapTable.addSwap: conflicting swap already exists";
			
			this.swaps[a] = b;
			this.swaps[b] = a;
		}
		swap(text) {
			if(text in this.swaps) {
				return this.swaps[text];
			} else {
				return text;
			}
		}
		clone() {
			let obj = new lib.SwapTable();
			
			for(let i in this.swaps) {
				obj.swaps[i] = this.swaps[i];
			}
			
			return obj;
		}
	}
	
	const compressNumber = function() {
	};
	
	lib.swapJSON = function(json,swapTable=lib.defaultSwapTable) {		
		if(typeof json !== 'object' || json === null || Array.isArray(json)) {
			if(json === 9) return false;
			if(json === false) return 9;
			
			if(json === 8) return true;
			if(json === true) return 8;
			
			if(json === 7) return {};
			
			return json;
		}
		
		if(Object.keys(json).length === 0) return 7;
		
		let newJSON = {};
		
		for(let i in json) {
			newJSON[swapTable.swap(i)] = lib.swapJSON(json[i], swapTable);
		}
		
		return newJSON;
	}
	
	lib.defaultSwapTable = new lib.SwapTable([
		['c','childData'],
		['d','userData'],
		['e','isParentNode']
	]);
	
	//network interface
	
	const NetworkInterface = class {
		constructor(options) {
			
			if(options === undefined) {
				options = {};
			}
			
			//||= would be used, but node.js does not support it
			this.connectCallback = options.connectCallback || (()=>{}); //func(...moreArgs)
			this.generalMessageCallback = options.generalMessageCallback || (()=>{}); //func(type,data,...moreArgs)
			this.generalDataCallback = options.generalDataCallback || (()=>{});
			this.messageCallbackDict = options.messageCallbackDict || {}; //func(data,...moreArgs)
			this.generalRequestCallback = options.generalRequestCallback || (()=>{});
			this.requestCallbackDict = options.requestCallbackDict || {};
			this.disconnectCallback = options.disconnectCallback || (()=>{});
			this.generalResponseCallback = options.generalResponseCallback || (()=>{});
			
			this.requestIDGenerator = options.requestIDGenerator || new NetworkInterface.IDGenerator();
			
			this.requestList = [];
		}
		
		setConnectCallback(callback) {
			this.connectCallback = callback;
		}
		setGeneralMessageCallback(callback) {
			this.generalMessageCallback = callback;
		}
		addMessageTypeCallback(type,callback) {
			if(!(type in this.messageCallbackDict))
				this.messageCallbackDict[type] = [];
			this.messageCallbackDict[type].push(callback);
		}
		setDisconnectCallback(callback) {
			this.disconnectCallback = callback;
		}
		setGeneralRequestCallback(callback) {
			this.generalRequestCallback = callback;
		}
		addRequestTypeCallback(type,callback) {
			if(!(type in this.requestCallbackDict))
				this.requestCallbackDict[type] = [];
			this.requestCallbackDict[type].push(callback);
		}
		
		sendMessage(type,data,...moreArgs) {
			this.sendData(JSON.stringify({
				type:type,
				data:data,
				baseType:'message'
			}),...moreArgs);
		}
		sendRequest(type,data,callback,...moreArgs) {
			
			let id = this.requestIDGenerator.genNewID();
			
			//console.log("DID15");
			//console.log(data);
			
			this.sendData(JSON.stringify({
				type:type,
				data:data,
				id:id,
				baseType:'request'
			}),...moreArgs);
			
			this.requestList.push({
				id:id,
				callback:callback
			});
		}
		sendResponse(id,data,...moreArgs) {
			this.sendData(JSON.stringify({
				id:id,
				data:data,
				baseType:'response'
			}),...moreArgs);
		}
		
		runDataCallbacks(data,...moreArgs) {
			this.generalDataCallback(data,...moreArgs);
			
			let rawJSON = JSON.parse(data);
			
			switch(rawJSON.baseType) {
				case 'message':
					this.runMessageCallbacks(rawJSON,...moreArgs);
					break;
				case 'request':
					this.runRequestCallbacks(rawJSON,...moreArgs);
					break;
				case 'response':
					this.runResponseCallbacks(rawJSON,...moreArgs);
			}
		}
		runResponseCallbacks(rawJSON,...moreArgs) {
			
			this.generalResponseCallback(rawJSON.data,rawJSON.id,...moreArgs);
			
			for(let i in this.requestList) {
				if(this.requestList[i].id === rawJSON.id) {
					this.requestList[i].callback(rawJSON.data,...moreArgs);
					delete this.requestList[i];
					break;
				}
			}
			
		}
		runRequestCallbacks(rawJSON,...moreArgs) {
			
			let type = rawJSON.type;
			let request = new lib.Request(rawJSON.data,rawJSON.id,this,...moreArgs);
			
			this.generalRequestCallback(type,request,...moreArgs);
			
			if(type in this.requestCallbackDict)
				for(let i in this.requestCallbackDict[type])
					this.requestCallbackDict[type][i](request,...moreArgs);
		}
		runMessageCallbacks(rawJSON,...moreArgs) {
			
			let type = rawJSON.type;
			let data = rawJSON.data;
			
			this.generalMessageCallback(type,data,...moreArgs);
			
			if(type in this.messageCallbackDict)
				for(let i in this.messageCallbackDict[type])
					this.messageCallbackDict[type][i](data,...moreArgs);
		}
		runConnectCallback(...moreArgs) {
			this.connectCallback(...moreArgs);
		}
		runDisconnectCallback(...moreArgs) {
			this.disconnectCallback(...moreArgs);
		}
	};
	NetworkInterface.IDGenerator = class {
		constructor() {
			this.id = 0;
		}
		genNewID() {
			this.id += 1;
			return this.id;
		}
	};
	
	//queues
	
	const DataQueue = class {
		constructor(networkInterface,type,immediateCallback) {
			this.networkInterface = networkInterface;
			
			if(immediateCallback === undefined) immediateCallback = (()=>{});
			this.immediateCallback = immediateCallback;
			
			this.queue = new lib.Queue();
			
			this.addTypeCallback(type,(...moreArgs)=>{
				this.immediateCallback(...moreArgs);
				let request = moreArgs[0];
				
				if(this.requestGood(request)) {
					this.queue.enqueue({moreArgs:moreArgs});
				}
			});
		}
		forAll(callback) {
			while(this.queue.hasMore()) {
				let item = this.queue.dequeue();
				
				let request = item.moreArgs[0];
				
				if(this.requestGood(request)) {
					if(callback(...(item.moreArgs))) {
						break;
					}
				}
			}
		}
		forSome(n,callback) {
			for(let i = 0; i < n; i++) {
				if(this.queue.isEmpty()) break;
				
				let item = this.queue.dequeue();
				
				let request = item.moreArgs[0];
				
				if(this.requestGood(request)) {
					if(callback(...(item.moreArgs))) {
						break;
					}
				}
			}
		}
	};
	
	lib.RequestQueue = class extends DataQueue {
		constructor(...moreArgs) {
			super(...moreArgs);
		}
		addTypeCallback(type,callback) {
			this.networkInterface.addRequestTypeCallback(type,callback);
		}
		requestGood(request) {
			return request.isValid();
		}
	};
	lib.MessageQueue = class extends DataQueue {
		constructor(...moreArgs) {
			super(...moreArgs);
		}
		addTypeCallback(type,callback) {
			this.networkInterface.addMessageTypeCallback(type,callback);
		}
		requestGood() {
			return true;
		}
	};
	
	//specialization of network interface
	
	if(onNode) {
		const WebSocket = require('ws');
		
		//match this with other classes?
		lib.Connection = class extends NetworkInterface { //may also want to make a network interface thing
			constructor(socket,id,options={}) {
				
				super(options); 
				
				this.socket = socket;
				this.id = id;
				
				this.userData = {};
				this.connected = true;
				
				this.socket.on('message',(message)=>{
					this.runDataCallbacks(message);
				});
				this.socket.on('close',(code,reason)=>{
					this.connected = false;
					this.runDisconnectCallback(code,reason);
				});
			}
			isConnected() {
				return this.connected;
			}
			getID() {
				return this.id;
			}
			
			sendData(data) {
				this.socket.send(data);
			}
		};
		
		lib.WebSocketServer = class extends NetworkInterface{
			constructor(parentServer,options={}) {
				super(options);
				
				this.connectionDict = {};
				this.server = new WebSocket.Server({server:parentServer});
				
				this.idGenerator = new lib.WebSocketServer.IDGenerator(this);
				
				this.server.on('connection', (socket)=>{
					
					const connection = new lib.Connection(
						socket,
						this.idGenerator.genNewID(),
						{
							generalDataCallback:(data)=>{
								this.runDataCallbacks(data,connection);
							},
							disconnectCallback:(code,reason)=>{
								this.runDisconnectCallback(code,reason,connection);
							},
							requestIDGenerator:this.requestIDGenerator
						}
					);
					
					this.connectionDict[connection.getID()] = connection;
					this.runConnectCallback(connection);
				});
			}
			
			sendData(data,connection) {
				this.connectionDict[connection.getID()].sendData(data);
			}
			
			isConnected(connection,connectionID) { //may want to write better?
				return connection.isConnected();
			}				
			
			getConnectionByID(id) {
				return this.connectionDict[id];
			}
			
			removeDisconnected() { //may be a neater way to implement
				for(let i in this.connectionDict) {
					if(!(this.connectionDict[i].isConnected())) {
						delete this.connectionDict[i];
					}
				}
			}
		};
		lib.WebSocketServer.IDGenerator = class {
			constructor(parent) {
				this.newID = 0;
			}
			genNewID() {
				this.newID += 1;
				return this.newID;
			}
		}
	} else {
		lib.Connection = class extends NetworkInterface{
			constructor(url,options={}) {
				super(options);
				
				this.socket = new WebSocket(url);
				this.connected = false;
				
				this.socket.onopen = (event) => {
					this.connected = true;
					this.runConnectCallback();
				};
				this.socket.onmessage = (event) => {
					this.runDataCallbacks(event.data);
				};
				this.socket.onclose = (event) => {
					this.connected = false;
					this.runDisconnectCallback();
				};
				
			}
			sendData(data) {
				this.socket.send(data);
			}
			isConnected() {
				return this.connected;
			}
		}
	}
	
	if(onNode) {
		module.exports = lib;
	} else {
		library.addLib('netlib',lib);
	}
	
})();