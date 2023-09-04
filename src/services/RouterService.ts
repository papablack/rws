import 'reflect-metadata'
import express, { Request, Response } from 'express';
import TheService from "./_service";
import Controller, { IRequestParams, IHTTPRouteMethod } from "../controllers/_controller";
import { IHTTPRoute } from "../routing/routes";

type RouteEntry = {[key: string]: [IHTTPRouteMethod, CallableFunction]};

interface IControllerRoutes {
  get: RouteEntry;
  post: RouteEntry;
  put: RouteEntry;
  delete: RouteEntry;
}


class RouterService extends TheService{
    constructor() {
        super();
    }

    getRouterAnnotations(constructor: typeof Controller): Record<string, {annotationType: string, metadata: any}> {    
        const annotationsData: Record<string, {annotationType: string, metadata: any}> = {};
  
        const propertyKeys: string[] = Reflect.getMetadataKeys(constructor.prototype).map((item: string): string => {
          return item.split(':')[1];
        });
        
        propertyKeys.forEach(key => {
          const annotations: string[] = ['Route'];
  
          annotations.forEach(annotation => {
            const metadataKey = `${annotation}:${String(key)}`;
          
            const meta = Reflect.getMetadata(metadataKey, constructor.prototype);
            
            if (meta) {
              annotationsData[String(key)] = {annotationType: annotation, metadata: meta};
            }
          });                 
        });
  
        return annotationsData;
    }

    async assignRoutes(app: express.Express, routes: IHTTPRoute[], controllerList: Controller[])
    {                
        const controllerRoutes: IControllerRoutes = {
          get: {}, post: {}, put: {}, delete: {}
        }

        controllerList.forEach((controllerInstance: Controller) => {          
          const controllerMetadata: Record<string, {annotationType: string, metadata: any}> = this.getRouterAnnotations(controllerInstance.constructor as typeof Controller); // Pass the class constructor      
          
          if(controllerMetadata){            
            Object.keys(controllerMetadata).forEach((key: string) => {
              if(controllerMetadata[key].annotationType !== 'Route'){
                return;    
              }

              const action: IHTTPRouteMethod = (controllerInstance as any)[key];
              const meta = controllerMetadata[key].metadata;                                        
              switch(meta.method) {
                case 'GET':
                  controllerRoutes.get[meta.name] = [action, app.get.bind(app)]; 
                  break;

                case 'POST':
                  controllerRoutes.post[meta.name] = [action, app.post.bind(app)]; 
                  break;

                case 'PUT':
                  controllerRoutes.put[meta.name] = [action, app.put.bind(app)]; 
                  break;

                case 'DELETE':
                  controllerRoutes.delete[meta.name] = [action, app.delete.bind(app)]; 
                  break;  
              }              
            });
          }
        });      

        routes.forEach((route: IHTTPRoute) => {
          
            Object.keys(controllerRoutes).forEach((_method: string) => {
              const actions = controllerRoutes[_method as keyof IControllerRoutes];              
              if(!actions[route.name]){
                return;
              }
        
              const [routeMethod, appMethod] = actions[route.name];                                          

              if(!appMethod){
                return;
              }                                        

              appMethod(route.path, (req: Request, res: Response) => {
                const result = routeMethod({
                  query: req.query,
                  params: req.params,
                  data: req.body,
                  res: res
                });             
                
                res.setHeader('Content-Type', 'application/json');
                res.send(Controller.prepareResponse(result));
              });              
            });
        });
    }
}

export default RouterService.getSingleton();