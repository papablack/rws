declare const _default: ({
    execute(params?: import("./_command").ICmdParams): Promise<void>;
    executeLambdaLifeCycle: (lifeCycleEventName: keyof {
        preArchive?: (params: import("./LambdaCommand").ILambdaParams) => Promise<void>;
        postArchive?: (params: import("./LambdaCommand").ILambdaParams) => Promise<void>;
        preDeploy?: (params: import("./LambdaCommand").ILambdaParams) => Promise<void>;
        postDeploy?: (params: import("./LambdaCommand").ILambdaParams) => Promise<void>;
    }, lambdaDirName: string | number, params: import("./LambdaCommand").ILambdaParams) => Promise<void>;
    getLambdaParameters(params: import("./_command").ICmdParams): Promise<import("./LambdaCommand").ILambdaParamsReturn>;
    invoke(params: import("./_command").ICmdParams): Promise<void>;
    list(params: import("./_command").ICmdParams): Promise<void>;
    deploy(params: import("./_command").ICmdParams): Promise<void>;
    delete(params: import("./_command").ICmdParams): Promise<void>;
    name: string;
    getSourceFilePath(): string;
    getName(): string;
} | {
    execute(params: import("./_command").ICmdParams): Promise<void>;
    name: string;
    getSourceFilePath(): string;
    getName(): string;
} | {
    execute(params?: import("./_command").ICmdParams): Promise<void>;
    name: string;
    getSourceFilePath(): string;
    getName(): string;
})[];
export default _default;
