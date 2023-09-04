import TheService from "./_service";
declare class ConsoleService extends TheService {
    private isEnabled;
    private originalLogMethods?;
    constructor();
    color(): any;
    log(...obj: any[]): void;
    warn(...obj: any[]): void;
    error(...obj: any[]): void;
    stopLogging(): void;
    startLogging(): void;
    private getOriginalLogFunctions;
    private disableOriginalLogFunctions;
    private restoreOriginalLogFunctions;
}
declare const _default: ConsoleService;
export default _default;