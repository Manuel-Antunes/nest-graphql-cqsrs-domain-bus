/**
 * De onde saem as URLs dos brokers: variável de ambiente, com o padrão do `docker-compose.yml`
 * deste repositório.
 *
 * As portas não são as canônicas (6379/5672) de propósito. Quem desenvolve costuma ter um Redis e um
 * RabbitMQ de outro projeto ocupando as portas padrão, e o custo de descobrir isso é um teste que
 * falha de um jeito que não parece porta ocupada — ele *conecta*, no broker errado.
 */
export const rabbitUrl = (): string => process.env.RABBITMQ_URL ?? 'amqp://127.0.0.1:5699';
export const redisHost = (): string => process.env.REDIS_HOST ?? '127.0.0.1';
export const redisPort = (): number => Number(process.env.REDIS_PORT ?? 6399);
