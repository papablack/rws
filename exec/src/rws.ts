import {  AppConfigService, IAppConfig, RWSCommand, IRWSCmdParams, ConsoleService, MD5Service, UtilsService } from '../../src/index';
import { rwsPath } from '@rws-framework/console';
const { error, color, log } = ConsoleService;

import RWSCommands from '../../src/commands';

const fs = require('fs');
const path = require('path');
// process.argv[2] will be the first command line argument after `rws`
const command = process.argv[2];
// process.argv[3] will be the parameter args for commands
const cmdParamString = process.argv[3];
const cmdArgs = !!cmdParamString && cmdParamString.length > 2 ? cmdParamString.split(',') : [];
const commandExecutionArgs: IRWSCmdParams = { _default: null, _extra_args: {} };

if (cmdParamString && cmdParamString.indexOf('=') > -1) {
    cmdArgs.forEach((arg) => {
        const argData = arg.split('=');
        commandExecutionArgs[argData[0].replace('--', '')] = argData[1];

        if (!commandExecutionArgs._default) {
            commandExecutionArgs._default = argData[1];
        }
    });
} else if (!cmdParamString || !cmdArgs.length) {
    commandExecutionArgs._default = null;
} else {
    commandExecutionArgs._default = cmdParamString;
}

if(process.argv.length > 3){
    for(let i = 3; i <= process.argv.length-1;i++){
        const parameter: string = process.argv[i].replace('--', '').replace('-', '_');
        const valuePair: string[] = parameter.split('=');

        if(valuePair && valuePair[0]){
            commandExecutionArgs._extra_args[valuePair[0]] = valuePair.length > 1 ? valuePair[1] : true;
        }
    }
}

const executionDir = process.cwd();

const packageRootDir = rwsPath.findRootWorkspacePath(executionDir);
const moduleCfgDir = `${packageRootDir}/node_modules/.rws`;

function getConfig(configPath: string, cfgPathFile: string | null = null) 
{                
    if(cfgPathFile === null){
        cfgPathFile = configPath;

        if(cfgPathFile){
            const rwsConfigVar = UtilsService.getRWSVar(cfgPathFile);

            if(rwsConfigVar){
                configPath = rwsConfigVar;
            }
        }      
    } else {
        UtilsService.setRWSVar(cfgPathFile, configPath);
    }                    

    
    const frameworkConfigFactory: () => IAppConfig = require( '@clientWorkDir/src/' + configPath).default;

    return frameworkConfigFactory();
}


const main = async () => {     
    const cfgPathFile = '_cfg_path';
    const execDir = path.resolve(rwsPath.findPackageDir(__dirname), 'exec');
    const tsFile = path.resolve(execDir,'src') + '/rws.ts';

    const configPath: string = commandExecutionArgs.config || commandExecutionArgs._default  || 'config/config';       

    const cfgData = command === 'init' ? getConfig(configPath,  cfgPathFile) :  getConfig(UtilsService.getRWSVar(cfgPathFile) as string);

    const APP_CFG: IAppConfig | null = cfgData;

    let savedHash = null;
    const consoleClientHashFile = `${moduleCfgDir}/_cli_hash`;

    if (fs.existsSync(`${moduleCfgDir}/_cli_hash`)) {
        savedHash = fs.readFileSync(consoleClientHashFile, 'utf-8');
    }

    if(!APP_CFG){
        throw new Error(`No config for CLI. Try to initialize with "yarn rws init config=path/to/config.ts" (config path from ${process.cwd()}/src)`);
    }    

    const APP = new AppConfigService();
    const MD5: any = null;

     
    const commands: RWSCommand[] = [...RWSCommands, ...APP.get('commands')];    

    // APP_CFG.commands = commands;

    const theCommand = commands.find((cmd: RWSCommand) => cmd.getName() == command);
    
    commandExecutionArgs._rws_config = APP_CFG;

    const cmdFiles = MD5.batchGenerateCommandFileMD5(moduleCfgDir);    

    const currentSumHashes = MD5.md5((await MD5.generateCliHashes([tsFile, ...cmdFiles])).join('/'));

    if (!savedHash || currentSumHashes !== savedHash) {        
        fs.writeFileSync(consoleClientHashFile, currentSumHashes);
    }

    if (theCommand) {        
        await theCommand.execute(commandExecutionArgs);
        return;
    }

    if (!fs.existsSync(`${moduleCfgDir}/${cfgPathFile}`)) {
        throw new Error('No config path generated for CLI. Try to initialize with "npx rws init config=path/to/config.ts"');
    }

    error(`Unknown command: ${command}.`);

    return;
};

main().then(() => {
    process.exit(0);
});