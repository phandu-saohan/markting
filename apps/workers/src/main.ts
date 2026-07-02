import { NestFactory } from '@nestjs/core';
import { WorkersModule } from './workers.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Workers');

  // Workers chạy như standalone app (không cần HTTP server)
  const app = await NestFactory.createApplicationContext(WorkersModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received. Shutting down workers gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received. Shutting down workers gracefully...');
    await app.close();
    process.exit(0);
  });

  logger.log('🚀 Workers started and listening to queues');
}

bootstrap().catch((err) => {
  console.error('Workers failed to start:', err);
  process.exit(1);
});
