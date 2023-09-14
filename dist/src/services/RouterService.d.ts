import 'reflect-metadata';
import express from 'express';
import TheService from "./_service";
import Controller from "../controllers/_controller";
import { IHTTPRoute } from "../routing/routes";
declare class RouterService extends TheService {
    constructor();
    getRouterAnnotations(constructor: typeof Controller): Record<string, {
        annotationType: string;
        metadata: any;
    }>;
    assignRoutes(app: express.Express, routes: IHTTPRoute[], controllerList: Controller[]): Promise<void>;
}
declare const _default: RouterService;
export default _default;
