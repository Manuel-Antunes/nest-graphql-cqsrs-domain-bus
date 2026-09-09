import type { Transport } from '@nestjs/microservices';
import 'reflect-metadata';
import { EVENT_TRANSPORTS_METADATA, EXCLUDE_LOCAL_METADATA } from './transport.constants';

/**
 * Declara **por quais transportes este evento é difundido** — a ideia central do
 * [nestjs-transport-eventbus](https://github.com/sergey-telpuk/nestjs-transport-eventbus), aqui
 * reimplementada para o @nestjs/cqrs 12 (a lib original ficou no NestJS 7 e no rxjs 6).
 *
 * O ponto é que a decisão é **do evento**, não da infraestrutura: quem escreveu o fato é quem sabe o
 * que ele significa, e portanto se ele é uma notificação ou uma obrigação.
 *
 * ```ts
 * // um aviso: quem estiver ouvindo, ouve
 * @TransportType(Transport.REDIS)
 * export class PaymentAuthorizedEvent extends OrderEvent {}
 *
 * // dinheiro mudou de mãos: além do aviso, uma cópia numa fila que ninguém perde
 * @TransportType(Transport.REDIS, Transport.RMQ)
 * export class PaymentCapturedEvent extends OrderEvent {}
 *
 * // sem decorator: não sai do processo (os eventos de Post são assim)
 * export class PostCreatedEvent {}
 * ```
 *
 * Um evento sem decorator não atravessa processo nenhum — que é o padrão certo: sair da máquina é
 * uma decisão, não um acidente.
 */
export const TransportType =
  (...transports: Transport[]): ClassDecorator =>
  (target) => {
    Reflect.defineMetadata(EVENT_TRANSPORTS_METADATA, transports, target);
  };

/**
 * "Este evento **só** viaja; não passe pelo `EventBus` local."
 *
 * O `@ExcludeDef()` da lib original. Por padrão um evento difundido também é publicado aqui — é o
 * mesmo fato, e quem está neste processo tem tanto direito a ele quanto os outros. Este decorator
 * serve para o caso raro em que publicar localmente seria errado: um evento que existe só para
 * avisar os outros, e cujo efeito local já aconteceu por outro caminho.
 */
export const ExcludeLocal =
  (): ClassDecorator =>
  (target) => {
    Reflect.defineMetadata(EXCLUDE_LOCAL_METADATA, true, target);
  };

/** Os transportes declarados por um evento — vazio quer dizer "não sai daqui". */
export function transportsOf(event: object): Transport[] {
  return Reflect.getMetadata(EVENT_TRANSPORTS_METADATA, Object.getPrototypeOf(event).constructor) ?? [];
}

/** Se o evento pediu para não passar pelo barramento local. */
export function excludesLocalBus(event: object): boolean {
  return Reflect.getMetadata(EXCLUDE_LOCAL_METADATA, Object.getPrototypeOf(event).constructor) === true;
}
