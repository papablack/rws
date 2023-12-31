import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);

const runModule = (name, execFile) => {
    const binPath = `/mnt/efs/res/modules/${name}`;
    return `${binPath}/${execFile}`;
}

const printFolderStructure = (dirPath, indent = '') => {
    const files = fs.readdirSync(dirPath);
  
    const struct = [];
  
    files.forEach((file) => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
  
      if (stats.isDirectory()) {
        struct.push(indent + '📁 ' + file);
      }
    });
  
    return struct;
  }

const chmod = async (destFunctionDirPath, desiredPermissions = '755') => {
  return await runShell(`chmod -R ${desiredPermissions} ${destFunctionDirPath}`);
}

const runShell = async (command, context = null) => {
    try {
        const { stdout, stderr } = await execPromise(command);
        console.log(stdout);

        if (stderr) {
            console.error(stderr);
        }

        return stdout;
    } catch (error) {
        console.error(`Error executing command: ${error}`);
        throw new Error(`Error executing command: ${error}`);
    }
};

const runShellParallel = (command, context, workingDir = null) => {
    return new Promise((resolve, reject) => {
        const options = {};
        if (workingDir) {
            options.cwd = workingDir;
        }

        const childProcess = exec(command, options, (error, stdout, stderr) => {
            if (stdout) {
                console.log('Shell Output:', stdout);
            }
            if (stderr) {
                console.error('Shell Error Output:', stderr);
            }
            if (error) {
                console.error('Shell Error:', error);
                reject(error);
            } else {
                console.log('Artillery Execution Completed.');
                resolve(stdout);
            }
        });

        // Forward child process's output to Lambda's logs
        childProcess.stdout.pipe(process.stdout);
        childProcess.stderr.pipe(process.stderr);

        // Handle Lambda function timeout
        context.callbackWaitsForEmptyEventLoop = false;

        // Listen for the child process exit event
        childProcess.on('exit', (code) => {
            if (code !== 0) {
                console.error(`Process exited with code ${code}`);
                reject(new Error(`Process exited with code ${code}`));
            }
        });
    });
};

const deleteDirectoryRecursive = (dirPath) => {
    try {
      const files = fs.readdirSync(dirPath);
  
      for (const file of files) {
        const filePath = `${dirPath}/${file}`;
        const stat = fs.statSync(filePath);
  
        if (stat.isDirectory()) {
          deleteDirectoryRecursive(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
      }
  
      fs.rmdirSync(dirPath);
      console.log(`Successfully deleted directory: ${dirPath}`);
    } catch (error) {
      console.error(`Failed to delete directory: ${error}`);
      console.log(error);
    }
  };

export {
    runShell,
    runShellParallel,
    runModule,
    chmod,
    printFolderStructure,
    deleteDirectoryRecursive
}