const dotenv = require('dotenv');
const pino = require('pino');
const axios = require('axios');

// Load environment variables
dotenv.config();

// Initialize logger
const logger = pino({
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard'
    }
  }
});

// Test configuration
const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

class SystemTester {
  constructor() {
    this.logger = logger;
    this.results = {
      passed: [],
      failed: []
    };
  }

  async runAllTests() {
    console.log('\n🧪 Starting WhatsApp AI Agent System Tests...\n');
    
    // Test 1: Server Health
    await this.testServerHealth();
    
    // Test 2: AI Providers
    await this.testAIProviders();
    
    // Test 3: Context Management
    await this.testContextManagement();
    
    // Test 4: Message Processing
    await this.testMessageProcessing();
    
    // Test 5: WhatsApp Connection
    await this.testWhatsAppConnection();
    
    // Print results
    this.printResults();
  }

  async testServerHealth() {
    try {
      console.log('📍 Testing server health...');
      const response = await axios.get(`${BASE_URL}/health`);
      
      if (response.data.status === 'ok') {
        this.results.passed.push('Server Health Check');
        console.log('✅ Server is healthy\n');
      } else {
        throw new Error('Server health check failed');
      }
    } catch (error) {
      this.results.failed.push(`Server Health Check: ${error.message}`);
      console.log('❌ Server health check failed:', error.message, '\n');
    }
  }

  async testAIProviders() {
    console.log('📍 Testing AI providers...');
    
    const AIRouter = require('./src/ai/aiRouter');
    const providers = ['openai', 'anthropic', 'google'];
    
    for (const provider of providers) {
      try {
        const apiKey = this.getAPIKey(provider);
        
        if (!apiKey || apiKey.includes('your-')) {
          console.log(`⏭️  Skipping ${provider} (no API key configured)`);
          continue;
        }
        
        const router = new AIRouter(provider, apiKey, logger);
        const testMessage = 'Responda apenas com OK se você está funcionando.';
        const response = await router.processMessage(testMessage, {});
        
        if (response && response.toLowerCase().includes('ok')) {
          this.results.passed.push(`${provider} AI Provider`);
          console.log(`✅ ${provider} is working`);
        } else {
          throw new Error('Invalid response');
        }
      } catch (error) {
        this.results.failed.push(`${provider} AI Provider: ${error.message}`);
        console.log(`❌ ${provider} test failed:`, error.message);
      }
    }
    console.log('');
  }

  async testContextManagement() {
    console.log('📍 Testing context management...');
    
    try {
      const ContextManager = require('./src/core/contextManager');
      const contextManager = new ContextManager(logger);
      
      // Test creating context
      const testPhone = '5511999999999';
      const context = contextManager.getContext(testPhone);
      
      if (!context) throw new Error('Failed to create context');
      
      // Test updating context
      contextManager.updateContext(testPhone, {
        stage: 'scheduling',
        userData: { name: 'Test User' }
      });
      
      // Test adding messages
      contextManager.addMessage(testPhone, 'user', 'Test message');
      contextManager.addMessage(testPhone, 'assistant', 'Test response');
      
      // Verify context
      const updatedContext = contextManager.getContext(testPhone);
      
      if (updatedContext.stage === 'scheduling' && 
          updatedContext.userData.name === 'Test User' &&
          updatedContext.messages.length === 2) {
        this.results.passed.push('Context Management');
        console.log('✅ Context management is working\n');
      } else {
        throw new Error('Context verification failed');
      }
    } catch (error) {
      this.results.failed.push(`Context Management: ${error.message}`);
      console.log('❌ Context management test failed:', error.message, '\n');
    }
  }

  async testMessageProcessing() {
    console.log('📍 Testing message processing...');
    
    try {
      const ContextManager = require('./src/core/contextManager');
      const MessageProcessor = require('./src/core/messageProcessor');
      
      const contextManager = new ContextManager(logger);
      const messageProcessor = new MessageProcessor(contextManager, logger);
      
      // Test message processing
      const testMessage = {
        from: '5511888888888',
        message: 'Olá, gostaria de agendar uma consulta',
        userName: 'Test Patient'
      };
      
      const response = await messageProcessor.processMessage(testMessage);
      
      if (response && response.length > 0) {
        this.results.passed.push('Message Processing');
        console.log('✅ Message processing is working');
        console.log(`   Response preview: ${response.substring(0, 100)}...\n`);
      } else {
        throw new Error('No response generated');
      }
    } catch (error) {
      this.results.failed.push(`Message Processing: ${error.message}`);
      console.log('❌ Message processing test failed:', error.message, '\n');
    }
  }

  async testWhatsAppConnection() {
    console.log('📍 Testing WhatsApp connection status...');
    
    try {
      const response = await axios.get(`${BASE_URL}/qr`);
      
      if (response.data.status) {
        if (response.data.status === 'connected') {
          this.results.passed.push('WhatsApp Connection');
          console.log('✅ WhatsApp is connected\n');
        } else {
          console.log(`⏳ WhatsApp status: ${response.data.status}`);
          if (response.data.qr) {
            console.log('   QR code available for scanning\n');
          }
        }
      }
    } catch (error) {
      console.log('⚠️  WhatsApp connection test skipped (server may not be running)\n');
    }
  }

  getAPIKey(provider) {
    switch (provider) {
      case 'openai':
        return process.env.OPENAI_API_KEY;
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY;
      case 'google':
        return process.env.GOOGLE_API_KEY;
      default:
        return null;
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(50));
    
    console.log(`\n✅ PASSED: ${this.results.passed.length} tests`);
    this.results.passed.forEach(test => {
      console.log(`   • ${test}`);
    });
    
    if (this.results.failed.length > 0) {
      console.log(`\n❌ FAILED: ${this.results.failed.length} tests`);
      this.results.failed.forEach(test => {
        console.log(`   • ${test}`);
      });
    }
    
    const totalTests = this.results.passed.length + this.results.failed.length;
    const successRate = totalTests > 0 
      ? Math.round((this.results.passed.length / totalTests) * 100)
      : 0;
    
    console.log(`\n📈 Success Rate: ${successRate}%`);
    console.log('='.repeat(50) + '\n');
    
    // Configuration check
    console.log('⚙️  CONFIGURATION STATUS:');
    console.log(`   • AI Provider: ${process.env.AI_PROVIDER || 'Not configured'}`);
    console.log(`   • Clinic Name: ${process.env.CLINIC_NAME || 'Not configured'}`);
    console.log(`   • Port: ${process.env.PORT || 3000}`);
    console.log(`   • Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('');
  }
}

// Run tests
const tester = new SystemTester();
tester.runAllTests().catch(error => {
  console.error('Fatal error during testing:', error);
  process.exit(1);
});