import 'source-map-support/register';
import { Socket } from 'socket.io';


// import { RWSHTTPRoutingEntry, IPrefixedHTTProutes, IHTTProute, WsRoutes, ITheSocket } from './helpers/ServerBuilder';

import runNest from './runNest';
import {setupPrisma, setupRWS} from './install';

import ITimeSeries from './models/types/ITimeSeries';
import TimeSeriesModel from './models/types/TimeSeriesModel';

// import ServerService, { ServerControlSet, RWSServerPair, RWSServerStarter } from './helpers/ServerBuilder';
import { RWSCliBootstrap } from '../exec/src/rws';
import { CLIModule } from '../exec/src/application/cli.module';
import { DBService } from './services/DBService';
import { AuthService } from './services/AuthService';
import { ConsoleService } from './services/ConsoleService';
import { ProcessService }from './services/ProcessService';
import { MD5Service } from './services/MD5Service';
import { TraversalService } from './services/TraversalService';
import { UtilsService }  from './services/UtilsService';
import { RWSAutoApiController } from './controller/_autoApi';
import { InverseRelation, InverseTimeSeries, Relation, TrackType as RWSTrackType} from './models/decorators/index';

import IAppConfig from './types/IAppConfig';
import IDbUser from './types/IDbUser';

import { RWSFillService } from './services/RWSFillService';

const RWSannotations = {
    modelAnnotations: { InverseRelation, InverseTimeSeries, Relation, RWSTrackType }};

import {RWSCommand} from './commands/_command';
import { RWSGateway, JSONMessage, BaseWsResponse, ErrorWsResponse } from './gateways/_gateway';

import * as RWSErrorCodes from './errors';
import * as NEST from '../nest';
import Model from './models/_model';
import { ZipService } from './services/ZipService';
import { RWSModule, } from './runNest';
import { InjectServices } from './services/_inject';
import { RWSConfigService } from './services/RWSConfigService';
import { IRWSModel } from './types/IRWSModel';
import { Helper } from './helpers/_helper';

export {    
    RWSCommand,
    RWSFillService,
    RWSConfigService,
    RWSModule,
    runNest as serverInit,
    setupRWS,
    setupPrisma,         
    RWSGateway,    
    Model as RWSModel,
    IRWSModel,

    // ServerService as RWSServer,    
    DBService,        
    AuthService,        
    ConsoleService,             
    MD5Service,
    ZipService,    
    TraversalService,    
    UtilsService,     
    ProcessService,

    TimeSeriesModel,

    ITimeSeries,
    IAppConfig,
    IDbUser,
    
    Socket,          
    RWSannotations,
    JSONMessage as RWSJSONMessage,         
    RWSErrorCodes,
    BaseWsResponse, ErrorWsResponse,
    RWSTrackType,
    Helper,

    NEST,
    RWSAutoApiController,
    InjectServices,
    CLIModule, RWSCliBootstrap
};