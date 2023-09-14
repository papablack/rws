"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const _service_1 = __importDefault(require("./_service"));
const AppDefaultConfig = {
    mongo_url: null,
    mongo_db: null,
    port: null,
    test_port: null,
    domain: null,
    ssl_cert: null,
    ssl_key: null,
    secret_key: null,
    user_class: null,
    user_models: [],
    controller_list: [],
    ws_routes: {},
    http_routes: [],
    commands: [],
    aws_lambda_region: null,
    aws_access_key: null,
    aws_secret_key: null,
    aws_lambda_role: null,
    aws_lambda_bucket: null
};
class AppConfigService extends _service_1.default {
    constructor(cfg) {
        super();
        this.data = cfg;
    }
    get(key) {
        return this.data[key];
    }
    reloadConfig(cfgString) {
        const cfg = (require(cfgString)).defaults;
        this.data = cfg();
        return this;
    }
    static getConfigSingleton(cfg) {
        const className = this.name;
        const instanceExists = _service_1.default._instances[className];
        if (cfg) {
            _service_1.default._instances[className] = new this(cfg);
        }
        else if (!instanceExists && !cfg) {
            _service_1.default._instances[className] = new this(AppDefaultConfig);
        }
        return _service_1.default._instances[className];
    }
}
exports.default = (cfg) => AppConfigService.getConfigSingleton(cfg);
//# sourceMappingURL=AppConfigService.js.map