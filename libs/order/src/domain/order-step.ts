/**
 * Os passos do fluxo, na ordem em que o cliente os vê. Cada evento carrega o seu — é o que a
 * subscription entrega ao frontend, e o que torna o progresso legível sem o cliente saber quais
 * serviços existem por trás.
 */
export enum OrderStep {
  PLACED = 'PLACED',
  AUTHORIZED = 'AUTHORIZED',
  DECLINED = 'DECLINED',
  CAPTURED = 'CAPTURED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/** O estado de um pedido: o que a query devolve, e onde o fluxo parou. */
export enum OrderStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
