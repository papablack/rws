import TheService from "./_service";
declare class AWSService extends TheService {
    private region;
    private s3;
    private efs;
    private lambda;
    private ec2;
    private iam;
    constructor();
    _initApis(): void;
    findDefaultSubnetForVPC(): Promise<[string, string]>;
    private getSubnetIdForVpc;
    listSecurityGroups(): Promise<string[]>;
    checkForRolePermissions(roleARN: string, permissions: string[]): Promise<{
        OK: boolean;
        policies: string[];
    }>;
    private firePermissionCheck;
    private getDefaultRouteTable;
    createVPCEndpointIfNotExist(vpcId: string): Promise<string>;
    ensureRouteToVPCEndpoint(vpcId: string, vpcEndpointId: string): Promise<void>;
    getS3(): AWS.S3;
    getEC2(): AWS.EC2;
    getEFS(): AWS.EFS;
    getLambda(): AWS.Lambda;
    getRegion(): string;
    getIAM(): AWS.IAM;
}
declare const _default: AWSService;
export default _default;
