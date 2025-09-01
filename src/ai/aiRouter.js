const OpenAIAdapter = require('./providers/openaiAdapter');
const AnthropicAdapter = require('./providers/anthropicAdapter');
const GoogleAdapter = require('./providers/googleAdapter');

class AIRouter {
  constructor(provider, apiKey, logger) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.logger = logger;
    this.adapter = this.initializeAdapter();
  }

  initializeAdapter() {
    if (!this.apiKey) {
      throw new Error(`API key not provided for ${this.provider}`);
    }

    switch (this.provider) {
      case 'openai':
        this.logger.info('Initializing OpenAI adapter');
        return new OpenAIAdapter(this.apiKey, this.logger);
      
      case 'anthropic':
        this.logger.info('Initializing Anthropic adapter');
        return new AnthropicAdapter(this.apiKey, this.logger);
      
      case 'google':
        this.logger.info('Initializing Google AI adapter');
        return new GoogleAdapter(this.apiKey, this.logger);
      
      default:
        throw new Error(`Unknown AI provider: ${this.provider}`);
    }
  }

  async processMessage(prompt, context) {
    try {
      this.logger.debug(`Processing message with ${this.provider}`);
      
      const startTime = Date.now();
      const response = await this.adapter.generateResponse(prompt, context);
      const duration = Date.now() - startTime;
      
      this.logger.info(`AI response generated in ${duration}ms`);
      
      return response;
    } catch (error) {
      this.logger.error(`Error in AI Router (${this.provider}):`, error);
      
      // Try to reconnect/reinitialize on certain errors
      if (error.message.includes('401') || error.message.includes('403')) {
        throw new Error('API authentication failed. Please check your API key.');
      }
      
      throw error;
    }
  }

  async testConnection() {
    try {
      const testPrompt = 'Responda apenas com "OK" se você está funcionando.';
      const response = await this.processMessage(testPrompt, {});
      return response.toLowerCase().includes('ok');
    } catch (error) {
      this.logger.error(`Connection test failed for ${this.provider}:`, error);
      return false;
    }
  }

  getProviderInfo() {
    return {
      provider: this.provider,
      isConfigured: !!this.apiKey,
      adapterType: this.adapter.constructor.name
    };
  }
}

module.exports = AIRouter;