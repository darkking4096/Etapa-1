const Anthropic = require('@anthropic-ai/sdk');

class AnthropicAdapter {
  constructor(apiKey, logger) {
    this.logger = logger;
    this.client = new Anthropic({
      apiKey: apiKey,
      timeout: 30000
    });
    this.model = 'claude-3-opus-20240229';
    this.maxTokens = 1000;
  }

  async generateResponse(prompt, context) {
    try {
      this.logger.debug('Sending request to Anthropic...');
      
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: 0.7,
        system: this.extractSystemPrompt(prompt),
        messages: this.formatMessages(prompt, context)
      });

      const response = message.content[0].text.trim();
      
      this.logger.debug(`Anthropic response received: ${response.substring(0, 100)}...`);
      
      return response;
    } catch (error) {
      this.logger.error('Anthropic API error:', error);
      
      if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment.');
      } else if (error.status === 401) {
        throw new Error('Invalid API key');
      }
      
      throw error;
    }
  }

  extractSystemPrompt(prompt) {
    // Extract the system instructions from the prompt
    const lines = prompt.split('\n');
    const systemLines = [];
    
    for (const line of lines) {
      if (line.includes('MENSAGEM ATUAL DO PACIENTE:')) {
        break;
      }
      systemLines.push(line);
    }
    
    return systemLines.join('\n');
  }

  formatMessages(prompt, context) {
    const messages = [];
    
    // Add conversation history if available
    if (context.messages && context.messages.length > 0) {
      const recentMessages = context.messages.slice(-10);
      
      recentMessages.forEach(msg => {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        });
      });
    }
    
    // Extract current user message from prompt
    const currentMessageMatch = prompt.match(/MENSAGEM ATUAL DO PACIENTE: (.+)/);
    if (currentMessageMatch && !messages.some(m => m.content === currentMessageMatch[1])) {
      messages.push({
        role: 'user',
        content: currentMessageMatch[1]
      });
    }
    
    // Ensure we have at least one message
    if (messages.length === 0) {
      messages.push({
        role: 'user',
        content: 'Olá'
      });
    }
    
    return messages;
  }
}

module.exports = AnthropicAdapter;