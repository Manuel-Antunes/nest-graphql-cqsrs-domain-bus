import { User } from './user.entity';

/**
 * Um User que **lê**: autentica, vê posts, assina atualizações. Não escreve — e não há método para
 * isso, o que é o ponto: a ausência é a regra.
 *
 * É o tipo de fallback da hierarquia. Qualquer papel que nenhum outro tipo reivindique nasce leitor,
 * inclusive papel nenhum (`null`). Quem faz essa triagem é quem traduz o papel do provedor de
 * identidade em tipo de domínio — ver `UserProvisioning`.
 */
export class Reader extends User {}
