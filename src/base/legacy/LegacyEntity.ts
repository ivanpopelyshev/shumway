module Shumway.flash {
	export class LegacyEntity {
		_sec: statics.ISecurityDomain;

		constructor() {
			this._sec = statics._currentDomain;
		}
	}
}

module Shumway.flash.statics {
	export class LegacyNamespace extends LegacyEntity {
		key: string = null;

		classMap: MapObject<LegacyEntity>;

		_registerClass(cl: LegacyClass) {
			this.classMap[cl.key] = cl;
		}
	}

	export class LegacyClass<T extends LegacyEntity = any> extends LegacyEntity {
		key: string = null;

		jsClass: Function;

		constructor(jsClass: Function) {
			super();
			this.jsClass = jsClass;
		}

		create(args?: Array<any>): T {
			// new (Function.prototype.bind.apply(cls, [cls].concat(args)));
			const oldDomain = statics._currentDomain;
			const cls = this.jsClass as any;

			if (oldDomain === this._sec) {
				if (args) {
					return new (Function.prototype.bind.apply(cls, [cls].concat(args))) as any
				}
				return new cls();
			}
			statics._currentDomain = this._sec;
			try {
				if (args) {
					return new (Function.prototype.bind.apply(cls, [cls].concat(args))) as any
				}
				return new cls();
			} catch (e) {
				throwError("LegacyEntity.create", e);
				return null;
			} finally {
				statics._currentDomain = oldDomain;
			}
		}

		createObject(): T {
			let obj: any = Object.create(this.jsClass.prototype);
			obj._sec = this._sec;
			return obj;
		}

		axIsType(obj: any): obj is T {
			return obj instanceof (this.jsClass) && obj._sec === this._sec;
		}
	}
}
