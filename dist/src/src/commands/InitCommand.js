"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const _command_1 = __importDefault(require("./_command"));
const install_1 = require("../install");
const ConsoleService_1 = __importDefault(require("../services/ConsoleService"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const { log, warn, error, color } = ConsoleService_1.default;
const executionDir = process.cwd();
const moduleCfgDir = `${executionDir}/node_modules/.rws`;
const cfgPathFile = `${moduleCfgDir}/_cfg_path`;
const moduleDir = path_1.default.resolve(path_1.default.dirname(module.id), '..', '..').replace('dist', '');
class InitCommand extends _command_1.default {
    constructor() {
        super('init', module);
    }
    async execute(params) {
        ConsoleService_1.default.log(color().green('[RWS]') + ' starting systems...');
        const configPath = params.config || params._default;
        if (!configPath) {
            ConsoleService_1.default.error('[RWS] No config path provided! Use "npx rws init path/to/config/file"');
            return;
        }
        try {
            const cfgData = params._rws_config;
            try {
                await (0, install_1.SetupRWS)(cfgData);
                const prismaCfgPath = moduleDir + '/prisma/schema.prisma';
                fs_1.default.unlinkSync(prismaCfgPath);
                ConsoleService_1.default.log(color().green('[RWS]') + ' systems initialized.');
            }
            catch (error) {
                ConsoleService_1.default.error('Error while initiating RWS server installation:', error);
            }
        }
        catch (e) {
            ConsoleService_1.default.log(color().red('[RWS]') + ' wrong config file path...');
            throw new Error(e);
        }
    }
}
exports.default = InitCommand.createCommand();
//# sourceMappingURL=InitCommand.js.map