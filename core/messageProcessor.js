const AIRouter = require('../ai/aiRouter');
const { SYSTEM_PROMPT, STAGE_PROMPTS } = require('../config/prompts');

class MessageProcessor {
  constructor(contextManager, logger) {
    this.contextManager = contextManager;
    this.logger = logger;
    
    // Initialize AI Router with configured provider
    this.aiRouter = new AIRouter(
      process.env.AI_PROVIDER,
      this.getAPIKey(),
      logger
    );
  }

  getAPIKey() {
    const provider = process.env.AI_PROVIDER;
    switch (provider) {
      case 'openai':
        return process.env.OPENAI_API_KEY;
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY;
      case 'google':
        return process.env.GOOGLE_API_KEY;
      default:
        throw new Error(`Invalid AI provider: ${provider}`);
    }
  }

  async processMessage({ from, message, userName }) {
    try {
      // Get or create context
      const context = this.contextManager.getContext(from);
      
      // Update user data if we have a name
      if (userName && !context.userData.name) {
        this.contextManager.updateContext(from, {
          userData: { name: userName }
        });
      }

      // Add user message to context
      this.contextManager.addMessage(from, 'user', message);

      // Build prompt with context
      const prompt = this.buildPrompt(context, message);
      
      // Get AI response
      const response = await this.aiRouter.processMessage(prompt, context);
      
      // Add AI response to context
      this.contextManager.addMessage(from, 'assistant', response);

      // Analyze and update conversation stage
      this.updateConversationStage(context, message, response);

      this.logger.info(`Message processed for ${from} - Stage: ${context.stage}`);
      
      return response;
    } catch (error) {
      this.logger.error(`Error processing message from ${from}:`, error);
      
      // Return a fallback message
      return 'Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns instantes ou entre em contato pelo telefone ' + process.env.CLINIC_PHONE;
    }
  }

  buildPrompt(context, currentMessage) {
    // Build conversation history
    const conversationHistory = context.messages
      .slice(0, -1) // Exclude the current message we just added
      .map(msg => `${msg.role === 'user' ? 'Paciente' : 'Assistente'}: ${msg.content}`)
      .join('\n');

    // Get stage-specific instructions
    const stageInstructions = STAGE_PROMPTS[context.stage] || '';

    // Build complete prompt
    const prompt = `
${SYSTEM_PROMPT}

ESTÁGIO ATUAL DA CONVERSA: ${context.stage}
${stageInstructions}

DADOS DO USUÁRIO:
- Nome: ${context.userData.name || 'Não informado'}
- Telefone: ${context.userData.phone}

${conversationHistory ? `HISTÓRICO DA CONVERSA:\n${conversationHistory}\n` : ''}

MENSAGEM ATUAL DO PACIENTE: ${currentMessage}

Por favor, responda de forma apropriada ao estágio atual da conversa e à mensagem do paciente.
Lembre-se de ser cordial, profissional e proativo.`;

    return prompt;
  }

  updateConversationStage(context, userMessage, aiResponse) {
    const lowerMessage = userMessage.toLowerCase();
    const lowerResponse = aiResponse.toLowerCase();
    
    // Determine new stage based on conversation flow
    let newStage = context.stage;
    
    if (context.stage === 'greeting') {
      if (lowerMessage.includes('agendar') || lowerMessage.includes('consulta') || lowerMessage.includes('marcar')) {
        newStage = 'scheduling';
      } else if (lowerMessage.includes('valor') || lowerMessage.includes('preço') || lowerMessage.includes('quanto')) {
        newStage = 'info_collection';
      }
    } else if (context.stage === 'info_collection') {
      if (context.userData.name && (lowerMessage.includes('agendar') || lowerMessage.includes('marcar'))) {
        newStage = 'scheduling';
      }
    } else if (context.stage === 'scheduling') {
      if (lowerResponse.includes('agendado') || lowerResponse.includes('confirmado')) {
        newStage = 'confirmation';
      }
    }
    
    if (newStage !== context.stage) {
      this.contextManager.updateContext(context.userData.phone, { stage: newStage });
      this.logger.debug(`Stage updated from ${context.stage} to ${newStage}`);
    }
  }
}

module.exports = MessageProcessor;