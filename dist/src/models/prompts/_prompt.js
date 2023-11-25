"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class RWSPrompt {
    constructor(params) {
        this.input = params.input;
        this.hyperParameters = params.hyperParameters;
        this.modelId = params.modelId;
        this.modelType = params.modelType;
    }
    async listen(source) {
        if (typeof source == 'string') {
            this.output = source;
            return;
        }
    }
    addEnchantment(enchantment) {
        this.enhancedInput.push(enchantment);
    }
    getEnchantedInput() {
        return this.enhancedInput[this.enhancedInput.length - 1].output;
    }
    readSentInput() {
        return this.sentInput;
    }
    readInput() {
        return this.input;
    }
    readOutput() {
        return this.output;
    }
    getHyperParameters() {
        return this.hyperParameters;
    }
    getModelMetadata() {
        return [this.modelType, this.modelId];
    }
    async sendWith(promptSender) {
        await promptSender(this);
    }
    async readStream(stream) {
        const chunks = []; // Replace 'any' with the actual type of your chunks
        for await (const event of stream) {
            // Assuming 'event' has a specific structure. Adjust according to actual event structure.
            if ('chunk' in event && event.chunk.bytes) {
                const chunk = JSON.parse(Buffer.from(event.chunk.bytes).toString("utf-8"));
                chunks.push(chunk.completion); // Use the actual property of 'chunk' you're interested in
            }
            else if ('internalServerException' in event ||
                'modelStreamErrorException' in event ||
                'throttlingException' in event ||
                'validationException' in event) {
                console.error(event);
                break;
            }
        }
        return chunks.join('');
    }
}
exports.default = RWSPrompt;
//# sourceMappingURL=_prompt.js.map