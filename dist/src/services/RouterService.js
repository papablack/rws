"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const _service_1 = __importDefault(require("./_service"));
const _controller_1 = __importDefault(require("../controllers/_controller"));
class RouterService extends _service_1.default {
    constructor() {
        super();
    }
    getRouterAnnotations(constructor) {
        const annotationsData = {};
        const propertyKeys = Reflect.getMetadataKeys(constructor.prototype).map((item) => {
            return item.split(':')[1];
        });
        propertyKeys.forEach(key => {
            const annotations = ['Route'];
            annotations.forEach(annotation => {
                const metadataKey = `${annotation}:${String(key)}`;
                const meta = Reflect.getMetadata(metadataKey, constructor.prototype);
                if (meta) {
                    annotationsData[String(key)] = { annotationType: annotation, metadata: meta };
                }
            });
        });
        return annotationsData;
    }
    async assignRoutes(app, routes, controllerList) {
        const controllerRoutes = {
            get: {}, post: {}, put: {}, delete: {}
        };
        controllerList.forEach((controllerInstance) => {
            const controllerMetadata = this.getRouterAnnotations(controllerInstance.constructor); // Pass the class constructor      
            if (controllerMetadata) {
                Object.keys(controllerMetadata).forEach((key) => {
                    if (controllerMetadata[key].annotationType !== 'Route') {
                        return;
                    }
                    const action = controllerInstance[key];
                    const meta = controllerMetadata[key].metadata;
                    switch (meta.method) {
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
        routes.forEach((route) => {
            Object.keys(controllerRoutes).forEach((_method) => {
                const actions = controllerRoutes[_method];
                if (!actions[route.name]) {
                    return;
                }
                const [routeMethod, appMethod] = actions[route.name];
                if (!appMethod) {
                    return;
                }
                appMethod(route.path, (req, res) => {
                    const result = routeMethod({
                        query: req.query,
                        params: req.params,
                        data: req.body,
                        res: res
                    });
                    res.setHeader('Content-Type', 'application/json');
                    res.send(_controller_1.default.prepareResponse(result));
                });
            });
        });
    }
}
exports.default = RouterService.getSingleton();
//# sourceMappingURL=RouterService.js.map