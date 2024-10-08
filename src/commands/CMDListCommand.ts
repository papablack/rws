import Command, { ICmdParams } from './_command';
import { setupRWS, setupPrisma } from '../install';
import ConsoleService from '../services/ConsoleService';
import UtilsService from '../services/UtilsService';
import path from 'path';
import fs from 'fs';
import { rwsPath } from '@rws-framework/console';

const { log, color } = ConsoleService;

const executionDir = process.cwd();


class CMDListCommand extends Command 
{
    public static cmdDescription: string | null = 'List of available rws commands.';

    constructor(){
        super('help:cmd:list');
    }

    async execute(params?: ICmdParams): Promise<void>
    {
        log(color().green('RWS'), 'Commands list:');
        const cfgData = params._rws_config;

        cfgData.commands.forEach((cmd: Command) => {
            const description: string | null = (cmd.constructor as any).cmdDescription;
            log(`${color().yellow('rws ' + cmd.getName())}${description ? (color().blue(' ' + description)) : ''}`);
        });
    }

    
}

export default CMDListCommand.createCommand();
