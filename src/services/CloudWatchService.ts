import { DescribeLogStreamsRequest, GetLogEventsRequest, GetLogEventsResponse, OutputLogEvent, PutLogEventsRequest, PutLogEventsResponse } from 'aws-sdk/clients/cloudwatchlogs';
import AWSService from './AWSService';
import TheService from './_service';
import ConsoleService from './ConsoleService';
import { AWSError } from 'aws-sdk/lib/error';
import { Error404 } from '../errors';
import moment from 'moment';
import getAppConfig from './AppConfigService';
const { log, error, color } = ConsoleService;

const _MS = 1000;

class CloudWatchService extends TheService {
  private nextForwardToken?: string;
  private logGroupName: string | null = null;
  private logStreamName: string | null = null;

  private lastLogGroupName: string | null = null;
  private lastLogStreamName: string | null = null;

  public async printLogsForLambda(lambdaFunctionName: string, startTime?: number, endTime?: number, terminateTimeout: number = 30 * _MS): Promise<{ core: NodeJS.Timeout }> {
    const cloudWatchLogs = AWSService.getCloudWatch();
    const logGroupName = `/aws/lambda/${lambdaFunctionName}`;  // Standard log group name format for Lambda

    let logStreamName: string;
    const logsTimeout: { core: NodeJS.Timeout } = { core: null };

    // Get the latest log stream
    const describeParams: DescribeLogStreamsRequest = {
      logGroupName,
      orderBy: 'LastEventTime',
      descending: true,
      limit: 1
    };

    try {
      const describeResult = await cloudWatchLogs.describeLogStreams(describeParams).promise();
      if (describeResult.logStreams && describeResult.logStreams[0]) {
        logStreamName = describeResult.logStreams[0].logStreamName!;
      } else {
        error('No log streams found for the specified Lambda function.');
        return;
      }
    } catch (err) {
      error('An error occurred while describing log streams:', err);
      return;
    }

    let terminateTimer: NodeJS.Timeout | null = null;

    const getLogs = async (nextToken?: string): Promise<void> => {
      // const lambdaDetails = await LambdaService.getLambdaFunction(lambdaFunctionName);     
      const params: GetLogEventsRequest = {
        logGroupName,
        logStreamName,
        startTime,
        endTime,
        nextToken,
        limit: 100
      };

      try {
        const data: GetLogEventsResponse = await cloudWatchLogs.getLogEvents(params).promise();
        if (data.events && data.events.length > 0) {
          this.printLogs(data.events);

          // Reset the termination timer since we've received new logs
          if (terminateTimer !== null) {
            clearTimeout(terminateTimer);
          }

          terminateTimer = setTimeout(() => {
            log('Terminating log fetch due to timeout.');
            clearTimeout(terminateTimer!);
            return;
          }, terminateTimeout);  // terminateTimeout is the time in milliseconds you want to wait
        }

        this.nextForwardToken = data.nextForwardToken;

        // Recursive call to keep polling for new logs
        logsTimeout.core = setTimeout(() => getLogs(this.nextForwardToken), 5000);  //
      } catch (err) {
        error('An error occurred while fetching logs:', err);
      }
    };

    getLogs();

    return logsTimeout;
  }

  private printLogs(events: OutputLogEvent[]): void {
    events.forEach(event => {
      log(color().blue('[AWS CloudWatch] ') + `{${new Date(event.timestamp!).toISOString()}} : ${event.message}`);
    });
  }

  async createLogGroup(logGroupName: string) {
    const cloudWatchLogs = AWSService.getCloudWatch();
    try {
      await cloudWatchLogs.createLogGroup({ logGroupName }).promise();
      ConsoleService.log('Log group created successfully');
    } catch (error: any) {
      if (error.code !== 'ResourceAlreadyExistsException') {
        console.error('Error creating log group:', error);
        throw error;
      }
    }
  }

  async createLogStream(logGroupName: string, logStreamName: string) {
    const cloudWatchLogs = AWSService.getCloudWatch();
    try {
      await cloudWatchLogs.createLogStream({ logGroupName, logStreamName }).promise();
      ConsoleService.log('Log stream created successfully');
    } catch (error: any) {
      if (error.code !== 'ResourceAlreadyExistsException') {
        console.error('Error creating log stream:', error);
        throw error;
      }
    }
  }

  async perpareGroupAndStream(groupName: string | null, streamName: string | null): Promise<[string,string]>
  {
    if(groupName && streamName){
      return [groupName, streamName];
    }

    if(!groupName){
      groupName = `RWS_backend_server`;
    }

    if(!streamName){
      streamName = `${getAppConfig().get('domain').replace(/\./g, '_')}_logs`;
    }

    if (!(await this.logGroupExists(groupName))) {
      await this.createLogGroup(groupName);
    }

    if (!(await this.logStreamExists(groupName, streamName))) {
      await this.createLogStream(groupName, streamName);
    }

    return [groupName, streamName]
  }

  async log(message: string, logGroup: string, logStream: string): Promise<void> {
    const cloudWatchLogs = AWSService.getCloudWatch();
    const outputEvent: OutputLogEvent = null;

    try {   
      const params: PutLogEventsRequest = {
        logGroupName: logGroup,
        logStreamName: logStream,
        logEvents: [
          {
            message: message,
            timestamp: new Date().getTime()
          }
        ]
      };

      try {           
        await cloudWatchLogs.putLogEvents(params).promise()   
      } catch(e){
          console.error(e);
      }
    } catch (error: AWSError | unknown) {
      console.error('Unexpected error putting log events:', error);      
    }
  }

  async logGroupExists(logGroupName: string): Promise<boolean> {
    const cloudWatchLogs = AWSService.getCloudWatch();
    return new Promise(async (resolve, reject) => {
      setTimeout(async () => {
        try {
          const response = await cloudWatchLogs.describeLogGroups({
            logGroupNamePrefix: logGroupName
          }).promise();

          resolve(response.logGroups?.some(group => group.logGroupName === logGroupName) || false);
        } catch (error: AWSError | unknown) {
          console.error('Unexpected error logGroupExists:', error);
          reject(error);
          throw error;
        }
      }, 300);
    });
  }

  async logStreamExists(logGroupName: string, logStreamName: string): Promise<boolean> {
    const cloudWatchLogs = AWSService.getCloudWatch();
    return new Promise(async (resolve, reject) => {
      setTimeout(async () => {
        try {
          const response = await cloudWatchLogs.describeLogStreams({
            logGroupName: logGroupName,
            logStreamNamePrefix: logStreamName
          }).promise();

          return resolve(response.logStreams?.some(stream => stream.logStreamName === logStreamName) || false);
        } catch (error: AWSError | unknown) {
          console.error('Unexpected error logStreamExists:', error);

          reject(error);
        }
      }, 300);
    });
  }
}

export default CloudWatchService.getSingleton();
export { CloudWatchService };