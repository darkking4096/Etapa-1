const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const pino = require('pino');

// Load environment variables
dotenv.config();

// Initialize logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

// Import components
const WhatsAppConnector = require('../whatsapp/whatsappConnector');
const MessageProcessor = require('./messageProcessor');
const ContextManager = require('./contextManager');

// Initialize Express app
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize core components
const contextManager = new ContextManager(logger);
const messageProcessor = new MessageProcessor(contextManager, logger);
const whatsappConnector = new WhatsAppConnector(messageProcessor, logger);

// Health check endpoint
app.get('/health', (req, res) => {
  const status = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    whatsapp: whatsappConnector.isConnected() ? 'connected' : 'disconnected',
    ai_provider: process.env.AI_PROVIDER,
    environment: process.env.NODE_ENV,
    activeConversations: contextManager.getActiveConversationsCount()
  };
  
  res.json(status);
  logger.info('Health check requested', status);
});

// WhatsApp QR code endpoint
app.get('/qr', (req, res) => {
  const qr = whatsappConnector.getQR();
  if (qr) {
    res.json({ qr, status: 'waiting_scan' });
  } else {
    res.json({ status: whatsappConnector.isConnected() ? 'connected' : 'initializing' });
  }
});

// Manual message send endpoint (for testing)
app.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message are required' });
    }
    
    await whatsappConnector.sendMessage(phone, message);
    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    logger.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get conversation context endpoint
app.get('/context/:phone', (req, res) => {
  const context = contextManager.getContext(req.params.phone);
  res.json(context);
});

// Clear old contexts periodically (every hour)
setInterval(() => {
  const cleared = contextManager.clearOldContexts();
  if (cleared > 0) {
    logger.info(`Cleared ${cleared} old conversation contexts`);
  }
}, 3600000);

// Initialize WhatsApp connection
async function initialize() {
  try {
    logger.info('🚀 Starting WhatsApp AI Agent System...');
    logger.info(`AI Provider: ${process.env.AI_PROVIDER}`);
    logger.info(`Clinic: ${process.env.CLINIC_NAME}`);
    
    await whatsappConnector.initialize();
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      logger.info(`✅ Server running on port ${PORT}`);
      logger.info(`📱 WhatsApp connector initializing...`);
      logger.info(`🤖 AI Provider: ${process.env.AI_PROVIDER}`);
    });
  } catch (error) {
    logger.error('Failed to initialize system:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await whatsappConnector.disconnect();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the system
initialize();