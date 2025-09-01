const OpenAI = require('openai');

class OpenAIAdapter {
  constructor(apiKey, logger) {
    this.logger = logger;
    this.client = new OpenAI({
      apiKey: apiKey,
      timeout: 30000,
      maxRetries: 3
    });
    this.model = 'gpt-4-turbo-preview';
    this.maxTokens = 1000;
    this.temperature = 0.7;
  }

  async generateResponse(prompt, context) {
    try {
      const messages = this.formatMessages(prompt, context);
      
      this.logger.debug('Sending request to OpenAI...');
      
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        presence_penalty: 0.6,
        frequency_penalty: 0.3
      });

      const response = completion.choices[0].message.content.trim();
      
      this.logger.debug(`OpenAI response received: ${response.substring(0, 100)}...`);
      
      return response;
    } catch (error) {
      this.logger.error('OpenAI API error:', error);
      
      if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment.');
      } else if (error.status === 401) {
        throw new Error('Invalid API key');
      }
      
      throw error;
    }
  }

  formatMessages(prompt, context) {
    const messages = [
      {
        role: 'system',
        content: prompt
      }
    ];

    // Add conversation history if available
    if (context.messages && context.messages.length > 0) {
      // Get last 10 messages for context
      const recentMessages = context.messages.slice(-10);
      
      recentMessages.forEach(msg => {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        }
      });
    }

    return messages;
  }
}

module.exports = OpenAIAdapter;