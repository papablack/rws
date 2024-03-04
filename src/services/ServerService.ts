import { Server as ServerBase, Socket } from 'socket.io';
import getConfigService from './AppConfigService';
import cors, {CorsOptions} from 'cors';
import HTTP, { ServerResponse } from 'http';
import ITheSocket from '../interfaces/ITheSocket';
import AuthService, { _DEFAULTS_USER_LIST_MANAGER } from './AuthService';
import fs from 'fs';
import RouterService from './RouterService';
import { AxiosRequestHeaders } from 'axios';
import { IHTTProute, IPrefixedHTTProutes, RWSHTTPRoutingEntry } from '../routing/routes';
import ConsoleService from './ConsoleService';
import UtilsService from './UtilsService';
import path from 'path';
import bodyParser from 'body-parser';
import Error404 from '../errors/Error404';
import RWSError from '../errors/_error';
import compression from 'compression';
import IAuthUser from '../interfaces/IAuthUser';
import MD5Service from './MD5Service';
import IDbUser from '../interfaces/IDbUser';
import { ExpressServer } from '../servers/ExpressServer';

//temporary static EXPRESS server set (@TODO: make abstractions that can include Fastify then Bun.serve)
import { Application as ExpressApp } from 'express';

//@ts-expect-error no-types
import fileUpload from 'express-fileupload';


import {
    WsRoutes,
    UserTokens,
    JWTUsers,
    CookieType,
    IInitOpts,
    RWSServer,
    ServerStarter,
    RWSServerPair,
    ServerControlSet
} from '../interfaces/ServerTypes';

const __HTTP_REQ_HISTORY_LIMIT = 50;
const getCurrentLineNumber = UtilsService.getCurrentLineNumber;

const wsLog = async (fakeError: Error, text: any, socketId: string = null, isError: boolean = false): Promise<void> => {
    const logit = isError ? console.error : console.log;
  
    const filePath = module.id;
    //const fileName = filePath.split('/').pop();

    const marker = '[RWS Websocket]';

    logit(isError ? ConsoleService.color().red(marker) : ConsoleService.color().green(marker), '|',`${filePath}:${await getCurrentLineNumber(fakeError)}`,`|${socketId ? ConsoleService.color().blueBright(` (${socketId})`) : ''}:`,`${text}`);
};

const MINUTE = 1000 * 60;

const _DEFAULT_SERVER_OPTS: IInitOpts = {
    ssl_enabled: null,
    port_http: null,
    port_ws: null
};


class ServerService extends ServerBase {    
    private static http_server: RWSServerPair;
    private static ws_server: RWSServerPair;       
    
    private srv: RWSServer<ExpressApp>;
    private options: IInitOpts;     
    private tokens: UserTokens = {};
    private users: JWTUsers = {};
    private corsOptions: CorsOptions;

    constructor(webServer: RWSServer<ExpressApp>, opts: IInitOpts){ 
        const _DOMAIN: string =  opts.cors_domain || opts.domain;

        const WEBSOCKET_CORS = {
            origin: _DOMAIN,
            methods: ['GET', 'POST']
        };

        const cors_headers: string[] = ['Content-Type', 'x-csrf-token','Accept', 'Authorization', 'x-junctionapi-version'];

        super(webServer.getHttpHandler(), {
            cors: WEBSOCKET_CORS,
            transports: [opts.transport || 'websocket'],
            pingTimeout: 5*MINUTE
        }); 
        
        
        this.srv = webServer;
        this.options = opts;

        const corsHeadersSettings = {
            'Access-Control-Allow-Origin': _DOMAIN, // Replace with your frontend domain
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': cors_headers.join(', '),
            'Access-Control-Allow-Credentials': 'true'
        };

        this.on('options', (req: any, res: any) => {
            res.writeHead(200, corsHeadersSettings);
            res.end();
        });

        this.webServer().addMiddleWare((req: any, res: any, next: () => void) => {
            Object.keys(corsHeadersSettings).forEach((key: string) => {
                res.setHeader(key, (corsHeadersSettings as any)[key]);
            });

            next();
        });

        this.corsOptions = {
            origin: _DOMAIN, // Replace with the appropriate origins or set it to '*'
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: cors_headers
        };

        const corsMiddleware = cors(this.corsOptions);                 

        this.use(async (socket, next) => {
            const request: HTTP.IncomingMessage = socket.request;
            const response: ServerResponse = new ServerResponse(request);
            corsMiddleware(request, response, next);            
        });        

        this.webServer().setOptionsHandling('*', cors(this.corsOptions));        
    }    

    public static async initializeApp<PassedUser extends IDbUser>(opts: IInitOpts = _DEFAULT_SERVER_OPTS, UserConstructor: new () => PassedUser = null): Promise<ServerControlSet>
    {                
        opts = Object.assign(_DEFAULT_SERVER_OPTS, opts);
        const isSSL = opts.ssl_enabled !== null || typeof opts.ssl_enabled === 'undefined' ? opts.ssl_enabled : getConfigService().get('features')?.ssl;

        if (!ServerService.http_server) { 
            const HTTPServer = await ServerService.createServerInstance(ExpressServer, opts);
           
            const http_instance = new ServerService(HTTPServer, opts);
            const httpPort = opts.port_http || getConfigService().get('port');
            
            ServerService.http_server = { instance: await http_instance.configureHTTPServer<PassedUser>(UserConstructor), starter: http_instance.createServerStarter(httpPort, () => {
                ConsoleService.log(ConsoleService.color().green('Request/response server' + ` is working on port ${httpPort} using HTTP${isSSL ? 'S' : ''} protocol`));
            })};  
        }

        if (!ServerService.ws_server) {
            const WSServer: RWSServer<ExpressApp> = await ServerService.createServerInstance(ExpressServer, opts);

            const ws_instance = new ServerService(WSServer, opts);
            const wsPort = opts.port_ws || getConfigService().get('ws_port');

            ServerService.ws_server = { instance: await ws_instance.configureWSServer<PassedUser>(UserConstructor), starter: ws_instance.createServerStarter(wsPort, () => {
                ConsoleService.log(ConsoleService.color().green('Websocket server' + ` is working on port ${wsPort}. SSL is ${isSSL ? 'enabled' : 'disabled'}.`));
            })};  
        }
        
        const pacakgeDir = UtilsService.findRootWorkspacePath(process.cwd());   
        const rwsDir = `${pacakgeDir}/node_modules/.rws`;

        if(!fs.existsSync(rwsDir)){
            fs.mkdirSync(rwsDir);
        }          
        
        return {
            websocket: this.ws_server,
            http: this.http_server,
        };
    }

    disconnectClient = (clientSocket: Socket) => {
        clientSocket.disconnect(true);
    };
    
    setJWTToken(socketId: string, token: string): void {
        if(token.indexOf('Bearer') > -1){
            this.tokens[socketId] = token.split(' ')[1];
        }else{
            this.tokens[socketId] = token;
        }
    }    

    public webServer(): RWSServer<ExpressApp>
    { 
        return this.srv; 
    }  

    static async createServerInstance<ServerAppClass>(serverAppClass: new (opts: IInitOpts) => ServerAppClass, opts: IInitOpts): Promise<ServerAppClass>
    {       
        return new serverAppClass(opts);
    }

    createServerStarter(port: number, injected: () => void = () => {}): ServerStarter
    {
        return (async (callback: () => void = () => {}) => {            
            this.webServer().start(port, () => {
                injected();
                callback();
            });
        }).bind(this);
    }

    public async configureHTTPServer<PassedUser extends IDbUser>(UserConstructor:  new (params: any) => PassedUser = null): Promise<ServerService>
    {
        if(this.options.authorization){
            this.webServer().addMiddleWare(async (req: any, res: any, next: () => void) => {
                const reqId: string = MD5Service.md5(req.url);
                let theUser: IAuthUser = null;
                let theToken: string = null;

                const setUser = (reqId: string, user: IAuthUser) => {
                    theUser = user;

                    if(UserConstructor){                   
                        this.users[reqId] = new UserConstructor(theUser);
                    }else{
                        this.users[reqId] = theUser;
                    }             
                };

                const setToken = (noneId: string, token: string) => {
                    theToken = token;

                    this.tokens[reqId] = theToken;
                };

                if(Object.keys(this.users).length > __HTTP_REQ_HISTORY_LIMIT){
                    this.users = {};
                    this.tokens = {};
                }

                const authPassed: boolean | null = await AuthService.authenticate(reqId, (req.headers as any).authorization, {
                    ..._DEFAULTS_USER_LIST_MANAGER,
                    set: setUser,
                    setToken,
                    getList: () => this.users,
                    get: (reqId: string) => this.users[reqId],     
                    getTokenList: () => this.tokens,
                    getToken: (reqId: string) => this.tokens[reqId]
                });

                const authHeader: string = (req.headers as any).authorization;                        
            
                if(authPassed === null || authHeader === undefined){         
                    ConsoleService.warn('RWS AUTH WARNING', ConsoleService.color().blue(`[${reqId}]`), 'XHR token is not passed');       
                    res.writeHead(400, 'Bad request: No token passed');
                    res.end();
                    
                    return;
                }   

                if(authPassed === false){                            
                    ConsoleService.error('RWS AUTH ERROR', ConsoleService.color().blue(`[${reqId}]`), 'XHR token unauthorized');
                    res.writeHead(403, 'Token unauthorized');
                    res.end();
                    
                    return;
                }   
                
                next();
            });

            this.use(async (socket, next ) => {
                await this.options.onAuthorize<PassedUser>(this.users[socket.id] as any, 'ws');
                next();
            });

        }

        this.webServer().addMiddleWare(fileUpload());
      
        // app.use(express.json({ limit: '200mb' }));
        this.webServer().addMiddleWare(bodyParser.json({ limit: '200mb' }));    
        
        if(getConfigService().get('features')?.routing_enabled){
            if(this.options.pub_dir){
                this.webServer().setPublicDir(this.options.pub_dir);
            }               

            const processed_routes: IHTTProute[] = await RouterService.assignRoutes<ExpressApp>(this.webServer(), this.options.httpRoutes, this.options.controllerList);

            this.webServer().addMiddleWare((req: any, res: any, next: () => void) => {                              
                if(!RouterService.hasRoute(req.originalUrl, processed_routes)){
                    ServerService.on404(req, res);
                }else{
                    next();
                }            
            });      
        }

        this.webServer().addMiddleWare(compression);        

        return this;
    }

    public async configureWSServer<PassedUser extends IDbUser>(UserConstructor:  new (params: any) => PassedUser = null): Promise<ServerService>
    {
        if(!getConfigService().get('features')?.ws_enabled){          
            console.error('[RWS] Websocket server is disabled in configuration');
            return this;
        }

        this.sockets.on('connection', async (socket: Socket) => {            
            const socketId: string = socket.id;

            wsLog(new Error(), 'Client connection recieved', socketId);

            socket.on('disconnect',  async (reason: string) => {                    
                wsLog(new Error(), `Client disconnected due to ${reason}`, socketId);
                
                if (reason === 'transport error') {
                    wsLog(new Error(), 'Transport error', socketId, true);
                }                    
            });

            socket.on('error', async (error) => {
                
                wsLog(new Error(), error, socketId, true);                    
            });
            

            socket.on('__PING__', async () => {
                wsLog(new Error(), 'Recieved ping... Emmiting response callback.', socketId);
                socket.emit('__PONG__', '__PONG__');
            });                

            Object.keys(this.options.wsRoutes).forEach((eventName) => {                
                const SocketClass = this.options.wsRoutes[eventName];                
                new SocketClass(ServerService.ws_server).handleConnection(socket, eventName);
            });
        });
    
        if(this.options.authorization){        
        
            this.use(async (socket, next ) => {                
                const request: HTTP.IncomingMessage = socket.request;
                const response: ServerResponse = new ServerResponse(request);

                const token = this.tokens[socket.id] || socket.handshake.auth.token;                

                const passedAuth: boolean | null = await AuthService.authenticate(socket.id, token, {
                    getList: () => this.users,
                    get: (socketId: string) => this.users[socketId],
                    set: (socketId: string, user: IAuthUser) => {
                        if(UserConstructor){
                            this.users[socketId] = new UserConstructor(user);
                        }else{
                            this.users[socketId] = user;
                        }
                       
                    },
                    getTokenList: () => this.tokens,
                    getToken: (socketId: string) => this.tokens[socketId],
                    setToken: (socketId: string, token: string) => {
                        this.tokens[socketId] = token;
                    },
                    disconnectClient: () => {
                        this.disconnectClient(socket);
                    }
                });

                if(passedAuth === false){                    
                    ConsoleService.error('RWS AUTH ERROR', ConsoleService.color().blue(`[${socket.id}]`), 'Websockets token unauthorized');
                    response.writeHead(403, 'Token unauthorized');
                    response.end();  
                }else if(passedAuth === null){                                 
                    ConsoleService.warn('RWS AUTH WARNING', ConsoleService.color().blue(`[${socket.id}]`), 'Websockets token is not passed');
                    response.writeHead(400, 'Bad request: No token');
                    response.end(); 
                }else{                    
                    next();
                }
            });
        }

        this.use(async (socket, next ) => {
            await this.options.onAuthorize<PassedUser>(this.users[socket.id] as any, 'http');
            next();
        });

        return this;
    }

    static on404(req: any, res: any): void
    {
        const error =  new Error404(new Error('Sorry, the page you\'re looking for doesn\'t exist.'), req.url);

        error.printFullError();    
        
        let response = error.getMessage();

        if((req.headers).accept.indexOf('text/html') > -1){
            const htmlTemplate = this.processErrorTemplate(error);

            response = htmlTemplate;
        }   
      
        res.status(404).send(response);
    }

    static processErrorTemplate(error: RWSError): string
    {
        return fs.readFileSync( path.resolve(__dirname, '..', '..', '..', 'html') + '/error.html', 'utf-8')
            .replace('{{error_number}}', error.getCode().toString())
            .replace('{{error_message}}', error.getMessage())
            .replace('{{error_stack_trace}}',  error.getStackTraceString() !== '' ? `<h4>Stack trace:</h4><pre>${error.getStackTraceString()}</pre>` : '')
        ;
    }

    static cookies = {                
        getCookies: async(headers: AxiosRequestHeaders): Promise<CookieType> =>
        {
            return new Promise((resolve) => {
                resolve(headers.cookie.split(';').map((cookieEntry: string) => {
                    const [key, value] = cookieEntry.split('=');
        
                    return {
                        [key]: value
                    };
                }));
            }); 
        },        
        getCookie: async (headers: AxiosRequestHeaders, key: string): Promise<string | null> => 
        {
            const cookiesBin: CookieType = await ServerService.cookies.getCookies(headers);
        
            if(!cookiesBin[key]){
                return null;
            }
        
            return cookiesBin[key];
        }        
    };

    public getOptions(): IInitOpts
    {
        return this.options;
    }

    public getCorsOptions(): CorsOptions
    {
        return this.corsOptions;
    }
}

export default ServerService;
export { WsRoutes, IHTTProute, IInitOpts, ITheSocket, IPrefixedHTTProutes, RWSHTTPRoutingEntry, RWSServer, RWSServerPair, ServerControlSet, ServerStarter as RWSServerStarter };