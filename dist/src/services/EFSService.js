"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_efs_1 = require("@aws-sdk/client-efs");
const _service_1 = __importDefault(require("./_service"));
const ConsoleService_1 = __importDefault(require("./ConsoleService"));
const AWSService_1 = __importDefault(require("./AWSService"));
const ProcessService_1 = __importDefault(require("./ProcessService"));
const path_1 = __importDefault(require("path"));
const LambdaService_1 = __importDefault(require("./LambdaService"));
const { log, warn, error, color, AWSProgressBar, rwsLog } = ConsoleService_1.default;
const __STATE_WAIT_TIME = 3000; //ms
class EFSService extends _service_1.default {
    constructor() {
        super();
        this.efs = AWSService_1.default.getEFS(); // Assuming AWSService.getEFS() returns an instance of EFSClient
    }
    async uploadToEFS(baseFunctionName, efsId, modulesS3Key, s3Bucket, vpcId, subnetId) {
        const efsLoaderFunctionName = await this.processEFSLoader(vpcId, subnetId);
        const params = {
            functionName: `${baseFunctionName}`,
            efsId,
            modulesS3Key,
            s3Bucket
        };
        try {
            log(`${color().green(`[RWS Lambda Service]`)} invoking EFS Loader as "${efsLoaderFunctionName}" lambda function for "${baseFunctionName}" with ${modulesS3Key} in ${s3Bucket} bucket.`);
            const response = await LambdaService_1.default.invokeLambda(efsLoaderFunctionName, params, 'Event');
            rwsLog('RWS Lambda Service', color().yellowBright(`"${efsLoaderFunctionName}" lambda function response:`));
            log(response);
            return; // JSON.parse(response.Response.Payload as string);
        }
        catch (error) {
            // await EFSService.deleteEFS(efsId);
            console.error('Error invoking Lambda:', error);
            throw error;
        }
    }
    async processEFSLoader(vpcId, subnetId) {
        const executionDir = process.cwd();
        const filePath = module.id;
        const cmdDir = filePath.replace('./', '').replace(/\/[^/]*\.ts$/, '');
        const moduleDir = path_1.default.resolve(cmdDir, '..', '..', '..', '..');
        const moduleCfgDir = `${executionDir}/node_modules/.rws`;
        const _UNZIP_FUNCTION_NAME = 'efs-loader';
        if (!(await LambdaService_1.default.functionExists('RWS-' + _UNZIP_FUNCTION_NAME))) {
            log(`${color().green(`[RWS Lambda Service]`)} creating EFS Loader as "${_UNZIP_FUNCTION_NAME}" lambda function.`, moduleDir);
            const zipPath = await LambdaService_1.default.archiveLambda(`${moduleDir}/lambda-functions/efs-loader`, moduleCfgDir);
            await LambdaService_1.default.deployLambda(_UNZIP_FUNCTION_NAME, zipPath, vpcId, subnetId, true);
        }
        return _UNZIP_FUNCTION_NAME;
    }
    async getOrCreateEFS(functionName, vpcId, subnetId) {
        const command = new client_efs_1.DescribeFileSystemsCommand({ CreationToken: functionName });
        const response = await this.efs.send(command);
        if (response.FileSystems && response.FileSystems.length > 0) {
            const fileSystemId = response.FileSystems[0].FileSystemId;
            const accessPoints = await this.getAccessPoints(fileSystemId);
            if (!accessPoints.length) {
                throw "No access point in EFS for RWS lambdas";
            }
            log(`${color().green('[RWS Cloud FS Service]')} EFS exists:`, {
                efsId: fileSystemId,
                apARN: accessPoints[0].AccessPointArn
            });
            return [fileSystemId, accessPoints[0].AccessPointArn, true];
        }
        else {
            const params = {
                CreationToken: functionName,
                PerformanceMode: 'generalPurpose',
            };
            try {
                const createResponse = await this.efs.send(new client_efs_1.CreateFileSystemCommand(params));
                await this.waitForEFS(createResponse.FileSystemId);
                const fsMountId = await this.createMountTarget(createResponse.FileSystemId, subnetId);
                await this.waitForFileSystemMount(createResponse.FileSystemId);
                const [accessPointId, accessPointArn] = await this.createAccessPoint(createResponse.FileSystemId);
                await this.waitForAccessPoint(accessPointId);
                const endpointId = await AWSService_1.default.createVPCEndpointIfNotExist(vpcId);
                await AWSService_1.default.ensureRouteToVPCEndpoint(vpcId, endpointId);
                log(`${color().green('[RWS Cloud FS Service]')} EFS Created:`, createResponse);
                return [createResponse.FileSystemId, accessPointArn, false];
            }
            catch (err) {
                error('Error creating EFS:', err);
                throw err;
            }
        }
    }
    async deleteEFS(fileSystemId, subnetId) {
        try {
            await this.efs.send(new client_efs_1.CreateMountTargetCommand({ FileSystemId: fileSystemId, SubnetId: subnetId }));
            error(`EFS with ID ${fileSystemId} has been deleted.`);
        }
        catch (err) {
            error('Error while deleting EFS:');
            log(err);
            throw err;
        }
    }
    async waitForEFS(fileSystemId) {
        let isAvailable = false;
        log(`${color().yellowBright('[EFS Listener] awaiting EFS state change')}`);
        while (!isAvailable) {
            const mountResponse = await this.efs.send(new client_efs_1.DescribeFileSystemsCommand({ FileSystemId: fileSystemId }));
            if (mountResponse.FileSystems && mountResponse.FileSystems.length && mountResponse.FileSystems[0].LifeCycleState === 'available') {
                isAvailable = true;
            }
            else {
                log(`${color().yellowBright('[EFS Listener] .')}`);
                await new Promise(resolve => setTimeout(resolve, __STATE_WAIT_TIME)); // wait for 5 seconds before checking again
            }
        }
    }
    async waitForFileSystemMount(fileSystemId) {
        while (true) {
            try {
                log(`${color().yellowBright('[EFS Mount Listener] awaiting EFS mount change')}`);
                const response = await this.efs.send(new client_efs_1.DescribeMountTargetsCommand({ FileSystemId: fileSystemId }));
                const isMounted = response.MountTargets.some(mountTarget => mountTarget.LifeCycleState === 'available');
                if (isMounted) {
                    log(`${color().yellowBright('[EFS Mount Listener] DONE')}`);
                    return true;
                }
                else {
                    log(`${color().yellowBright('[EFS Mount Listener] is during creation process...')}`);
                }
                log(`${color().yellowBright('[EFS Mount Listener] .')}`);
                await ProcessService_1.default.sleep(__STATE_WAIT_TIME);
            }
            catch (error) {
                console.error('Error while checking EFS mount status:', error);
                throw error;
            }
        }
    }
    async waitForAccessPoint(accessPointId) {
        let isAvailable = false;
        log(`${color().yellowBright('[EFS AP Listener] awaiting EFS access point change')}`, accessPointId);
        while (!isAvailable) {
            const accessPointResponse = await this.efs.send(new client_efs_1.DescribeAccessPointsCommand({ AccessPointId: accessPointId }));
            if (accessPointResponse.AccessPoints && accessPointResponse.AccessPoints.length && accessPointResponse.AccessPoints[0].LifeCycleState === 'available') {
                isAvailable = true;
            }
            else {
                log(`${color().yellowBright('[EFS AP Listener] .')}`);
                await new Promise(resolve => setTimeout(resolve, __STATE_WAIT_TIME)); // wait for 5 seconds before checking again
            }
        }
    }
    async getAccessPoints(fileSystemId) {
        const response = await this.efs.send(new client_efs_1.DescribeAccessPointsCommand({ FileSystemId: fileSystemId }));
        return response.AccessPoints || [];
    }
    async createMountTarget(fileSystemId, subnetId) {
        const params = {
            FileSystemId: fileSystemId,
            SubnetId: subnetId,
        };
        const response = await this.efs.send(new client_efs_1.CreateMountTargetCommand(params));
        return response.MountTargetId;
    }
    async createAccessPoint(fileSystemId) {
        const clientToken = this.generateClientToken();
        const params = {
            FileSystemId: fileSystemId,
            ClientToken: clientToken,
            PosixUser: {
                Uid: 1001,
                Gid: 1001
            },
            RootDirectory: {
                CreationInfo: {
                    OwnerGid: 1001,
                    OwnerUid: 1001,
                    Permissions: '755'
                },
                Path: '/'
            }
        };
        const response = await this.efs.send(new client_efs_1.CreateAccessPointCommand(params));
        return [response.AccessPointId, response.AccessPointArn];
    }
    generateClientToken() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 5);
    }
}
exports.default = EFSService.getSingleton();
//# sourceMappingURL=EFSService.js.map