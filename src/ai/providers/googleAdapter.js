const { GoogleGenerativeAI } = require('@google/generative-ai');

class GoogleAdapter {
  constructor(apiKey, logger) {
    this.logger = logger;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1000,
      }
    });
  }

  async generateResponse(prompt, context) {
    try {
      this.logger.debug('Sending request to Google AI...');
      
      // Format the prompt for Gemini
      const formattedPrompt = this.formatPrompt(prompt, context);
      
      const result = await this.model.generateContent(formattedPrompt);
      const response = result.response.text().trim();
      
      this.logger.debug(`Google AI response received: ${response.substring(0, 100)}...`);
      
      return response;
    } catch (error) {
      // LOG DETALHADO DO ERRO
      this.logger.error('Google AI API error details:', {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        details: error.response?.data || error
      });
      
      if (error.message?.includes('quota')) {
        throw new Error('API quota exceeded. Please wait or upgrade your plan.');
      } else if (error.message?.includes('API key')) {
        throw new Error('Invalid API key');
      } else if (error.message?.includes('PERMISSION_DENIED')) {
        throw new Error('API key não tem permissão. Ative a API Generative Language no Google Cloud Console.');
      }
      
      throw new Error(`Google AI Error: ${error.message}`);
    }
  }

  formatPrompt(prompt, context) {
    let formattedPrompt = prompt;
    
    // Add conversation history context if available
    if (context.messages && context.messages.length > 0) {
      const recentMessages = context.messages.slice(-10);
      const history = recentMessages
        .map(msg => `${msg.role === 'user' ? 'Paciente' : 'Assistente'}: ${msg.content}`)
        .join('\n');
      
      formattedPrompt = `${prompt}\n\nHistórico Recente:\n${history}`;
    }
    
    return formattedPrompt;
  }
}

module.exports = GoogleAdapter;