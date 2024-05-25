import TheService from './_service';


import ConsoleService from './ConsoleService';
import LambdaService from './LambdaService';
import AWSService from './AWSService';
import ProcessService from './ProcessService';

import path from 'path';
import AWS from 'aws-sdk';
import VPCService from './VPCService';
import { rwsPath } from '@rws-framework/console';

const { log, error, color, rwsLog } = ConsoleService;

const __STATE_WAIT_TIME = 3000; //ms

class EFSService extends TheService {
    private region: string;

    private s3: AWS.S3;
    private efs: AWS.EFS;
    private lambda: AWS.Lambda;
    private ec2: AWS.EC2;

    constructor() {
        super();        
    }

    async getOrCreateEFS(functionName: string, vpcId: string): Promise<[string, string, boolean]> 
    {      
        const response = await AWSService.getEFS().describeFileSystems({ CreationToken: functionName }).promise();
    
        if (response.FileSystems && response.FileSystems.length > 0) {
            const fileSystemId = response.FileSystems[0].FileSystemId;
            const accessPoints = await this.getAccessPoints(fileSystemId);

            if(!accessPoints.length){
                throw 'No acces point in EFS for RWS lambdas';
            }

            log(`${color().green('[RWS Cloud FS Service]')} EFS exists:`, {
                efsId: fileSystemId,
                apARN: accessPoints[0].AccessPointArn                
            });

            return [fileSystemId, accessPoints[0].AccessPointArn, true];
        } else {
            const params = {
                CreationToken: functionName,
                PerformanceMode: 'generalPurpose',
            };
    
            try {
                const response = await AWSService.getEFS().createFileSystem(params).promise();
                await this.waitForEFS(response.FileSystemId);                
                   
                await this.waitForFileSystemMount(response.FileSystemId);                           
                const [accessPointId, accessPointArn] = await this.createAccessPoint(response.FileSystemId);
                await this.waitForAccessPoint(accessPointId);

                const endpointId = await VPCService.createVPCEndpointIfNotExist(vpcId);
                await VPCService.ensureRouteToVPCEndpoint(vpcId, endpointId);

                log(`${color().green('[RWS Cloud FS Service]')} EFS Created:`, response);
                return [response.FileSystemId, accessPointArn, false];
            } catch (err) {
                error('Error creating EFS:', err);
                throw err;  // It's a good practice to throw the error so the caller knows something went wrong.
            }
        }
    }

    async deleteEFS(fileSystemId: string): Promise<void> {
        try {
            await AWSService.getEFS().deleteFileSystem({ FileSystemId: fileSystemId }).promise();
            error(`EFS with ID ${fileSystemId} has been deleted.`);
        } catch (err) {
            error('Error while deleting EFS:');
            log(err);
            throw err;
        }
    }

    async waitForEFS(fileSystemId: string)
    {
        let isAvailable = false;

        log(`${color().yellowBright('[EFS Listener] awaiting EFS state change')}`);        
        
        while (!isAvailable) {
            const mountResponse = await AWSService.getEFS().describeFileSystems({ FileSystemId: fileSystemId }).promise();

            if (mountResponse.FileSystems && mountResponse.FileSystems.length && mountResponse.FileSystems[0].LifeCycleState === 'available') {
                isAvailable = true;
            } else {
                log(`${color().yellowBright('[EFS Listener] .')}`);
                await new Promise(resolve => setTimeout(resolve, __STATE_WAIT_TIME));  // wait for 5 seconds before checking again
            }
        }
    }

    sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async waitForFileSystemMount(fileSystemId: string): Promise<boolean> {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                log(`${color().yellowBright('[EFS Mount Listener] awaiting EFS mount change')}`);        

                const response = await AWSService.getEFS().describeMountTargets({ FileSystemId: fileSystemId }).promise();

                const isMounted = response.MountTargets.some(mountTarget => mountTarget.LifeCycleState === 'available');
    
                if (isMounted) {
                    log(`${color().yellowBright('[EFS Mount Listener] DONE')}`);
                    return true;
                }else{
                    log(`${color().yellowBright('[EFS Mount Listener] is during creation process...')}`);
                }

                log(`${color().yellowBright('[EFS Mount Listener] .')}`);

                await ProcessService.sleep(__STATE_WAIT_TIME);
    
            } catch (error) {
                console.error('Error while checking EFS mount status:', error);
                throw error;
            }
        }
    }

    async waitForAccessPoint(accessPointId: string) {
        let isAvailable = false;
    
        log(`${color().yellowBright('[EFS AP Listener] awaiting EFS access point change')}`, accessPointId);        
    
        while (!isAvailable) {
            const accessPointResponse = await AWSService.getEFS().describeAccessPoints({ AccessPointId: accessPointId }).promise();
    
            if (accessPointResponse.AccessPoints && accessPointResponse.AccessPoints.length && accessPointResponse.AccessPoints[0].LifeCycleState === 'available') {
                isAvailable = true;
            } else {
                log(`${color().yellowBright('[EFS AP Listener] .')}`);
                await new Promise(resolve => setTimeout(resolve, 5000));  // wait for 5 seconds before checking again                
            }
        }
    }
    

    generateClientToken(): string 
    {
        return Date.now().toString() + Math.random().toString(36).substr(2, 5);
    }

    async getAccessPoints(fileSystemId: string): Promise<AWS.EFS.AccessPointDescriptions | null>
    {
        try {
            const params = {
                FileSystemId: fileSystemId  // specify the FileSystemId to filter access points for a specific EFS
            };
      
            const response = await AWSService.getEFS().describeAccessPoints(params).promise();
            if (response.AccessPoints && response.AccessPoints.length > 0) {
                return response.AccessPoints;  // this will return an array of access points
            } else {
                log('No access points found for the specified EFS.');
                return null;
            }
        } catch (err) {
            error('Error getting access point:', error);
            throw err;
        }
    }

    async createAccessPoint(fileSystemId: string): Promise<[string, string]> 
    {
        const clientToken = this.generateClientToken();  // Generate a unique client token

        const params = {
            FileSystemId: fileSystemId,
            ClientToken: clientToken,  // Add the client token here
            PosixUser: {
                Uid: 1001,  // You can adjust these values as per your requirements.
                Gid: 1001
            },
            RootDirectory: {
                Path: '/mnt/efs',  // The path where Lambda will mount the EFS.
                CreationInfo: {
                    OwnerUid: 1001,
                    OwnerGid: 1001,
                    Permissions: '755'
                }
            }
        };
    
        try {
            const response = await AWSService.getEFS().createAccessPoint(params).promise();
            log(`${color().green('[RWS Cloud FS Service]')} EFS AP created:`, response);

            return [response.AccessPointId, response.AccessPointArn];
        } catch (err) {
            error('Error creating EFS access point:', err);
            throw err;
        }
    }

    async createMountTarget(fileSystemId: string, subnetId: string): Promise<string> 
    {
        const params = {
            FileSystemId: fileSystemId,
            SubnetId: subnetId,
        };

        try {
            const response = await AWSService.getEFS().createMountTarget(params).promise();
            log(`${color().green('[RWS Cloud FS Service]')} EFS Mount Target created:`, response);

            return response.MountTargetId;
        } catch (error) {
            console.error('Error creating Mount Target:', error);
        }
    }   

    async uploadToEFS(baseFunctionName: string, efsId: string, modulesS3Key: string, s3Bucket: string, vpcId: string, subnetId: string): Promise<void>
    {
        const efsLoaderFunctionName = await this.processEFSLoader(vpcId, subnetId);

        const params = {
            functionName: `${baseFunctionName}`,
            efsId,
            modulesS3Key,
            s3Bucket
        };
    
        try {
            log(`${color().green('[RWS Lambda Service]')} invoking EFS Loader as "${efsLoaderFunctionName}" lambda function for "${baseFunctionName}" with ${modulesS3Key} in ${s3Bucket} bucket.`);

            const response = await LambdaService.invokeLambda(efsLoaderFunctionName, params);
            rwsLog('RWS Lambda Service', color().yellowBright(`"${efsLoaderFunctionName}" lambda function response:`));
            log(response);            
            return;// JSON.parse(response.Response.Payload as string);
        } catch (error) {
            // await EFSService.deleteEFS(efsId);
            console.error('Error invoking Lambda:', error);
            throw error;
        }
    }

    async processEFSLoader(vpcId: string, subnetId: string): Promise<string>
    {
        const executionDir = process.cwd();
        const moduleDir = rwsPath.findPackageDir(executionDir);
        const moduleCfgDir = `${executionDir}/node_modules/.rws`;

        const _UNZIP_FUNCTION_NAME: string = 'efs-loader';

        if(!(await LambdaService.functionExists('RWS-' + _UNZIP_FUNCTION_NAME))){
            log(`${color().green('[RWS Lambda Service]')} creating EFS Loader as "${_UNZIP_FUNCTION_NAME}" lambda function.`, moduleDir);
            const zipPath = await LambdaService.archiveLambda(`${moduleDir}/lambda-functions/efs-loader`, moduleCfgDir);

            await LambdaService.deployLambda(_UNZIP_FUNCTION_NAME, zipPath, vpcId, subnetId, true);
        }

        return _UNZIP_FUNCTION_NAME;
    }    

    async deleteDir(): Promise<void>
    {
        
    }
}

export default EFSService.getSingleton();
export {
    EFSService
};
