const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, makeInMemoryStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs').promises;

class WhatsAppConnector {
  constructor(messageProcessor, logger) {
    this.messageProcessor = messageProcessor;
    this.logger = logger;
    this.socket = null;
    this.qr = null;
    this.isReady = false;
    this.store = makeInMemoryStore({
      logger: this.logger.child({ module: 'baileys-store' })
    });
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async initialize() {
    try {
      const authFolder = path.join(process.cwd(), '.auth', process.env.WHATSAPP_SESSION_NAME || 'session');
      await this.ensureAuthFolder(authFolder);
      
      const { state, saveCreds } = await useMultiFileAuthState(authFolder);
      
      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: this.logger.child({ module: 'baileys' }),
        browser: ['WhatsApp AI Agent', 'Chrome', '120.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: undefined,
        keepAliveIntervalMs: 10000,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: true
      });

      this.store?.bind(this.socket.ev);

      // Connection events
      this.socket.ev.on('connection.update', async (update) => {
        await this.handleConnectionUpdate(update);
      });

      // Save credentials
      this.socket.ev.on('creds.update', saveCreds);

      // Message events
      this.socket.ev.on('messages.upsert', async (messageUpdate) => {
        await this.handleIncomingMessages(messageUpdate);
      });

      // Handle message status updates
      this.socket.ev.on('messages.update', (messages) => {
        for (const message of messages) {
          this.logger.debug(`Message ${message.key.id} status:`, message.update);
        }
      });

      this.logger.info('WhatsApp connector initialized successfully');
    } catch (error) {
      this.logger.error('Error initializing WhatsApp connector:', error);
      throw error;
    }
  }

  async ensureAuthFolder(folderPath) {
    try {
      await fs.access(folderPath);
    } catch {
      await fs.mkdir(folderPath, { recursive: true });
      this.logger.info(`Created auth folder: ${folderPath}`);
    }
  }

  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.qr = await QRCode.toDataURL(qr);
      this.logger.info('QR Code generated - scan to connect');
      console.log('\n📱 Scan this QR code with WhatsApp:\n');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
        : true;

      this.logger.info(`Connection closed: ${lastDisconnect?.error?.message || 'Unknown reason'}`);

      if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        this.logger.info(`Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        setTimeout(() => this.initialize(), 5000);
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.logger.error('Max reconnection attempts reached. Please restart the service.');
      }

      this.isReady = false;
    } else if (connection === 'open') {
      this.logger.info('✅ WhatsApp connected successfully!');
      this.isReady = true;
      this.qr = null;
      this.reconnectAttempts = 0;
    }
  }

  async handleIncomingMessages(messageUpdate) {
    try {
      const messages = messageUpdate.messages;
      
      for (const message of messages) {
        // Ignore non-text messages and status updates
        if (!message.message || message.key.fromMe || message.message.protocolMessage) {
          continue;
        }

        const messageText = message.message.conversation || 
                          message.message.extendedTextMessage?.text || 
                          '';

        if (!messageText) continue;

        const from = message.key.remoteJid;
        const pushName = message.pushName || 'User';
        
        this.logger.info(`📩 New message from ${from} (${pushName}): ${messageText}`);

        // Mark message as read
        await this.socket.readMessages([message.key]);

        // Send typing indicator
        await this.socket.sendPresenceUpdate('composing', from);

        // Process message with AI
        const response = await this.messageProcessor.processMessage({
          from,
          message: messageText,
          userName: pushName,
          timestamp: message.messageTimestamp
        });

        // Stop typing indicator
        await this.socket.sendPresenceUpdate('paused', from);

        // Send response
        if (response) {
          await this.sendMessage(from, response);
          this.logger.info(`📤 Response sent to ${from}`);
        }
      }
    } catch (error) {
      this.logger.error('Error handling incoming message:', error);
    }
  }

  async sendMessage(to, message) {
    try {
      if (!this.isReady) {
        throw new Error('WhatsApp is not connected');
      }

      // Ensure the phone number is in the correct format
      const formattedNumber = this.formatPhoneNumber(to);

      await this.socket.sendMessage(formattedNumber, { text: message });
      
      this.logger.debug(`Message sent to ${formattedNumber}: ${message.substring(0, 50)}...`);
      return true;
    } catch (error) {
      this.logger.error(`Error sending message to ${to}:`, error);
      throw error;
    }
  }

  formatPhoneNumber(phone) {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Add country code if missing (assuming Brazil)
    if (!cleaned.startsWith('55')) {
      cleaned = '55' + cleaned;
    }
    
    // Add @s.whatsapp.net suffix if not present
    if (!cleaned.includes('@')) {
      cleaned = cleaned + '@s.whatsapp.net';
    }
    
    return cleaned;
  }

  getQR() {
    return this.qr;
  }

  isConnected() {
    return this.isReady;
  }

  async disconnect() {
    if (this.socket) {
      await this.socket.end();
      this.logger.info('WhatsApp disconnected');
    }
  }
}

module.exports = WhatsAppConnector;