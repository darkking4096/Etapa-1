class ContextManager {
  constructor(logger) {
    this.conversations = new Map();
    this.logger = logger;
    this.maxMessages = parseInt(process.env.MAX_CONTEXT_MESSAGES) || 20;
    this.sessionTimeout = parseInt(process.env.SESSION_TIMEOUT_HOURS) || 24;
  }

  getContext(phoneNumber) {
    if (!this.conversations.has(phoneNumber)) {
      const newContext = {
        messages: [],
        stage: 'greeting',
        userData: {
          phone: phoneNumber,
          name: null,
          lastInteraction: Date.now()
        },
        appointmentData: {},
        createdAt: Date.now(),
        lastActivity: Date.now()
      };
      
      this.conversations.set(phoneNumber, newContext);
      this.logger.info(`New conversation context created for ${phoneNumber}`);
    }
    
    const context = this.conversations.get(phoneNumber);
    context.lastActivity = Date.now();
    return context;
  }

  updateContext(phoneNumber, update) {
    const context = this.getContext(phoneNumber);
    
    // Update fields
    if (update.stage) context.stage = update.stage;
    if (update.userData) Object.assign(context.userData, update.userData);
    if (update.appointmentData) Object.assign(context.appointmentData, update.appointmentData);
    
    // Add message to history
    if (update.message) {
      context.messages.push({
        role: update.message.role,
        content: update.message.content,
        timestamp: Date.now()
      });
      
      // Limit message history
      if (context.messages.length > this.maxMessages) {
        context.messages = context.messages.slice(-this.maxMessages);
      }
    }
    
    context.lastActivity = Date.now();
    this.logger.debug(`Context updated for ${phoneNumber}`, { stage: context.stage });
    
    return context;
  }

  addMessage(phoneNumber, role, content) {
    return this.updateContext(phoneNumber, {
      message: { role, content }
    });
  }

  clearOldContexts() {
    const now = Date.now();
    const timeout = this.sessionTimeout * 3600000; // Convert hours to milliseconds
    let cleared = 0;
    
    for (const [phone, context] of this.conversations) {
      if (now - context.lastActivity > timeout) {
        this.conversations.delete(phone);
        cleared++;
        this.logger.info(`Cleared old context for ${phone}`);
      }
    }
    
    return cleared;
  }

  getActiveConversationsCount() {
    return this.conversations.size;
  }

  getAllContexts() {
    return Array.from(this.conversations.entries()).map(([phone, context]) => ({
      phone,
      stage: context.stage,
      messagesCount: context.messages.length,
      lastActivity: new Date(context.lastActivity).toISOString(),
      createdAt: new Date(context.createdAt).toISOString()
    }));
  }

  clearContext(phoneNumber) {
    if (this.conversations.has(phoneNumber)) {
      this.conversations.delete(phoneNumber);
      this.logger.info(`Context cleared for ${phoneNumber}`);
      return true;
    }
    return false;
  }
}

module.exports = ContextManager;