import 'reflect-metadata';
import express from 'express';
import TheService from "./_service";
import Controller from "../controllers/_controller";
import { RWSHTTPRoutingEntry } from "../routing/routes";
/**
 *
 */
declare class RouterService extends TheService {
    constructor();
    static responseTypeToMIME(responseType: string): "text/html" | "application/json";
    getRouterAnnotations(constructor: typeof Controller): Record<string, {
        annotationType: string;
        metadata: any;
    }>;
    assignRoutes(app: express.Express, routesPackage: RWSHTTPRoutingEntry[], controllerList: Controller[]): Promise<void>;
    private addRouteToServer;
    private setControllerRoutes;
}
declare const _default: RouterService;
export default _default;
