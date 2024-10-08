import { Socket } from 'socket.io';

import ITheSocket, { TheSocketParams } from '../interfaces/ITheSocket';
import ServerService from '../services/ServerService';
import ConsoleService from '../services/ConsoleService';

import { JSONMessage, ErrorResponse, SocketWsResponse, BaseResponse } from '../types/SocketTypes';

abstract class TheSocket implements ITheSocket{
    protected server: any;

    constructor(server: ServerService) {        
        this.server = server;
    }

    handleConnection(socket: Socket<any, any, any, any>, routeName: string, params: TheSocketParams = null): Socket<any, any, any, any> {
        throw new Error('Method not implemented.');
    }
    middlewareImplementation?(next: any): void {
        throw new Error('Method not implemented.');
    }

    getJson(input: string): any
    {
        return JSON.parse(input);
    
    }

    sendJson(input: object): string
    {
        return JSON.stringify(input);
    }

    emitMessage<T>(method: string, socket: Socket, data?: T): void
    {
        const payload: SocketWsResponse<T> = { success: true, method, data: null };

        if(data){
            payload.data = data;
        }

        socket.emit(method, this.sendJson(payload));              
    }

    getData<T>(input: string): T
    {
        return this.getJson(input).msg as T
    }

    throwError(method: string, socket: Socket, error: Error | any): void
    {        
        ConsoleService.log({method})

        socket.emit(method, this.sendJson({
            error: JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error))),
            success: false
        }));
    }
}

export default TheSocket;
export {JSONMessage, BaseResponse as BaseWsResponse, ErrorResponse as ErrorWsResponse};