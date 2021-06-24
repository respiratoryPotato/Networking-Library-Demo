library = new (class {
	constructor() {
		this.libRef = {};
	}
	addLib(name,lib) {
		if(name in this.libRef) throw "libs.addLib: name already in library reference";
		
		this.libRef[name] = lib;
	}
	requireByName(name) {
		return this.libRef[name];
	}
})();