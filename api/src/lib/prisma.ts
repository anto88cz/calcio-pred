/**
 * Prisma Client singleton
 * Riutilizza la stessa istanza in tutta l'applicazione
 */

import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: [
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  });
};

declare global {
  // eslint-disable-next-line no-var
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();

// Log Prisma warnings ed errors
prisma.$on('warn', (e: unknown) => {
  logger.warn({ prisma: e }, 'Prisma warning');
});

prisma.$on('error', (e: unknown) => {
  logger.error({ prisma: e }, 'Prisma error');
});

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;

export default prisma;
export { prisma }; // Named export for compatibility

// Graceful shutdown
export async function disconnectPrisma() {
  await prisma.$disconnect();
  logger.info('Prisma disconnected');
}
