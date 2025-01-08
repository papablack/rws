#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { rwsShell, rwsPath, rwsFS, rwsArgsHelper, RWSManagedConsole } = require('@rws-framework/console');


let forceReload = false;



const runCommand = rwsShell.runCommand;
const findRootWorkspacePath = rwsPath.findRootWorkspacePath;
const removeDirectory = rwsPath.removeDirectory;


let ConsoleService = null;
let MD5Service = null;

const os = require('os');
const chalk = require('chalk');
const webpackPath = path.resolve(__dirname, '..', '..');

const packageRootDir = findRootWorkspacePath(process.cwd());
const moduleCfgDir = `${packageRootDir}/node_modules/.rws`;
const cfgPathFile = `${moduleCfgDir}/_cfg_path`;   

module.exports = async (output) => {
    const program = output.program;
    const commandOptions = output.options;    
    const command2map = output.command;
    const args = output.rawArgs || [];    
    
    const lineArgs = args && args.length && Array.isArray(args) ? args.join(' ') : '';
    const cfgConfigArg = args[0];

    if(commandOptions.reload){
        forceReload = true;
    }

    if(fs.existsSync(cfgPathFile)){
        process.env.WEBPACK_CFG_FILE = fs.readFileSync(cfgPathFile, 'utf-8');
    }else{
        process.env.WEBPACK_CFG_FILE = cfgConfigArg || 'config/config';    
    }

    // await setVendors();    
    await generateCliClient();        

    log(`${chalk.green('[RWS]')} generated CLI client executing ${command2map} command`, `${webpackPath}/exec/dist/rws.js ${command2map} ${lineArgs}`);  

    // const relpath = path.relative(__dirname, 'dist',)

    try {
        await runCommand(`node ${path.resolve(webpackPath, 'exec/dist/vendors/build/cli')}/rws.cli.js ${command2map} ${lineArgs}`, process.cwd());
    } catch(err) {
        console.error(err);
    }

    return;
}

const consoleClientHashFile = `${moduleCfgDir}/_cli_hash`;

const shouldReload = async (tsFile) => true;

async function generateCliClient(command, args)
{               
    const webpackCmd = `${packageRootDir}/node_modules/.bin/webpack`;

    log = console.log;
 

    if(!fs.existsSync(moduleCfgDir)){
        fs.mkdirSync(moduleCfgDir);
    }    

    const tsFile = path.resolve(webpackPath, 'exec','src') + '/rws.ts';    
    
    if(await shouldReload(tsFile)){
        if(forceReload){
            log(chalk.yellow('[RWS] Forcing CLI client reload...'));
        }

        log(chalk.green('[RWS]') + chalk.yellowBright(' Detected CLI file changes. Generating CLI client file...'));      
        
        await runCommand(`${webpackCmd} --config ${webpackPath}/exec/exec.webpack.config.js`, process.cwd());
        log(chalk.green('[RWS]') + ' CLI client file generated.')       
    }else{
        log(chalk.green('[RWS]') + ' CLI client file is up to date.')  
    }        
}

function generatePM2Name(filePath)
{
  return 'RWS:' + path.basename(filePath);
}