import { Socket } from 'socket.io';

import { RWSHTTPRoutingEntry, IPrefixedHTTProutes, IHTTProute, WsRoutes, ITheSocket } from './services/ServerService';

import init from './init';
import {setupPrisma, setupRWS} from './install';

import ITimeSeries from './models/interfaces/ITimeSeries';
import TimeSeriesModel from './models/types/TimeSeriesModel';

import ServerService, { ServerControlSet, RWSServerPair, RWSServerStarter } from './services/ServerService';
import DBService, { DBService as DBServiceInstance } from './services/DBService';
import AuthService, { AuthService as AuthServiceInstance } from './services/AuthService';
import S3Service, {S3Service as S3ServiceInstance} from './services/S3Service';
import ConsoleService, { ConsoleService as ConsoleServiceInstance } from './services/ConsoleService';
import ProcessService, {ProcessService as ProcessServiceInstance} from './services/ProcessService';

import LambdaService, { LambdaService as LambdaServiceInstance } from './services/LambdaService';
import AWSService, { AWSService as AWSServiceInstance } from './services/AWSService';
import EFSService, { EFSService as EFSServiceInstance } from './services/EFSService';
import MD5Service, { MD5Service as MD5ServiceInstance } from './services/MD5Service';
import TraversalService, { TraversalService as TraversalServiceInstance } from './services/TraversalService';
import UtilsService, { UtilsService as UtilsServiceInstance }  from './services/UtilsService';
import VectorStoreService, { VectorStoreService as VectorStoreServiceInstance } from './services/VectorStoreService';


import RWSPrompt, { ILLMChunk, IRWSPromptRequestExecutor, IRWSSinglePromptRequestExecutor, IRWSPromptStreamExecutor, IChainCallOutput, IRWSPromptJSON, ChainStreamType } from './models/prompts/_prompt';
import RWSConvo, { IConvoDebugXMLData, IEmbeddingsHandler, ISplitterParams } from './models/convo/ConvoLoader';
import RWSVectorStore from './models/convo/VectorStore';

import { InverseRelation, InverseTimeSeries, Relation, TrackType} from './models/annotations/index';
import { Route } from './routing/annotations/index';

import getAppConfig, { IAppConfig, AppConfigService } from './services/AppConfigService';

import { IContextToken } from './interfaces/IContextToken';
import IAuthUser from './interfaces/IAuthUser';
import IDbUser from './interfaces/IDbUser';

const RWSannotations = {
    modelAnnotations: { InverseRelation, InverseTimeSeries, Relation, TrackType },
    routingAnnotations: { Route }
};

import TheCommand, {ICmdParams} from './commands/_command';
import Model, { IModel, TrackType as RWSTrackType } from './models/_model';
import common, { Controller, Get, Post, Delete, Put } from '@nestjs/common';
import core from '@nestjs/core';

import TheService from './services/_service';
import TheSocket, { JSONMessage, BaseWsResponse, ErrorWsResponse } from './sockets/_socket';

import RWSAppCommands from './commands/index';

import * as RWSErrorCodes from './errors/index';

const NEST = {
    common,
    core
};

export {    
    init as serverInit,
    setupRWS,
    setupPrisma,
    getAppConfig,    
    AppConfigService,        
    TheService as RWSService,
    TheSocket as RWSSocket,
    TheCommand as RWSCommand,
    Model as RWSModel,
    IModel as IRWSModel,

    ServerService as RWSServer,
    DBServiceInstance,
    DBService,    
    AuthServiceInstance,
    AuthService,
    S3ServiceInstance,
    S3Service,
    ConsoleServiceInstance,
    ConsoleService,
    LambdaServiceInstance,
    LambdaService,
    AWSServiceInstance,
    AWSService,
    EFSServiceInstance,
    EFSService,
    MD5ServiceInstance,
    MD5Service,
    TraversalServiceInstance,
    TraversalService,
    UtilsServiceInstance,
    UtilsService,
    VectorStoreServiceInstance,
    VectorStoreService,
    ProcessServiceInstance,
    ProcessService,    

    TimeSeriesModel,

    WsRoutes,
    ITheSocket,    
    ITimeSeries,
    IAppConfig,
    IContextToken,
    ServerControlSet,
    IAuthUser,
    IDbUser,
    
    Socket,          
    RWSannotations,
    JSONMessage as RWSJSONMessage,
    ICmdParams,      
    IHTTProute,
    IPrefixedHTTProutes,
    RWSHTTPRoutingEntry,
    RWSAppCommands,
    
    RWSVectorStore,
    RWSConvo,
    RWSPrompt,    
    RWSErrorCodes,
    ChainStreamType,

    BaseWsResponse, ErrorWsResponse,

    IRWSPromptRequestExecutor,
    IRWSSinglePromptRequestExecutor,
    IRWSPromptStreamExecutor,
    IChainCallOutput,
    IConvoDebugXMLData,
    IEmbeddingsHandler,
    IRWSPromptJSON,
    ISplitterParams,
    ILLMChunk,
    RWSTrackType,
    RWSServerPair,
    RWSServerStarter,

    NEST,
    Controller, Get, Post, Delete, Put
};