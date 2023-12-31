"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const UtilsService_1 = __importDefault(require("../services/UtilsService"));
class TheCommand {
    constructor(name, childModule) {
        this.name = name;
        const rootPackageDir = UtilsService_1.default.findRootWorkspacePath(process.cwd());
        const moduleCfgDir = path_1.default.resolve(rootPackageDir, 'node_modules', '.rws');
        const cmdDirFile = `${moduleCfgDir}/_cli_cmd_dir`;
        if (!fs_1.default.existsSync(moduleCfgDir)) {
            fs_1.default.mkdirSync(moduleCfgDir);
        }
        const filePath = childModule.id;
        const cmdDir = `${filePath.replace('./', '').replace(/\/[^/]*\.ts$/, '')}`;
        let finalCmdDir = cmdDir;
        if (cmdDir.indexOf('node_modules') > -1) {
            finalCmdDir = rootPackageDir + '/' + finalCmdDir.substring(finalCmdDir.indexOf("node_modules"));
        }
        if (!fs_1.default.existsSync(cmdDirFile)) {
            fs_1.default.writeFileSync(cmdDirFile, finalCmdDir);
        }
    }
    getSourceFilePath() {
        const err = new Error();
        if (err.stack) {
            const match = err.stack.match(/at [^\s]+ \((.*):\d+:\d+\)/);
            if (match && match[1]) {
                return match[1];
            }
        }
        return '';
    }
    async execute(params = null) {
        throw new Error('Implement method.');
    }
    getName() {
        return this.name;
    }
    static createCommand() {
        const className = this.name;
        if (!TheCommand._instances[className]) {
            TheCommand._instances[className] = new this();
        }
        return TheCommand._instances[className];
    }
    getCommandParameters(params) {
        const cmdString = params.cmdString || params._default;
        const cmdStringArr = cmdString.split(':');
        const subCmd = cmdStringArr[0];
        const apiCmd = cmdStringArr[1];
        const apiArg = cmdStringArr.length > 2 ? cmdStringArr[2] : null;
        const extraParams = params._extra_args.deploy_loader;
        return {
            subCmd,
            apiCmd,
            apiArg,
            extraParams
        };
    }
}
TheCommand._instances = {};
exports.default = TheCommand;
//# sourceMappingURL=_command.js.map