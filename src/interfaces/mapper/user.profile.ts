import { createMap, type Mapper, type MappingProfile } from '@automapper/core';
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { Author } from '../../domain/user/author.entity';
import { Reader } from '../../domain/user/reader.entity';
import { AuthorView, ReaderView } from '../../dto/graphql/user.view';

/**
 * Os mapeamentos da hierarquia de usuário. Dois, e nenhuma linha de campo — as três propriedades têm
 * o mesmo nome e o mesmo value object dos dois lados.
 *
 * São **dois** porque o destino depende do tipo, e não dos campos: a mesma referência `User` vira
 * `ReaderView` ou `AuthorView` conforme o que o ORM instanciou ao carregar a linha. Quem escolhe entre
 * eles é o {@link UserViewInterceptor}.
 *
 * ## Nenhum conversor de value object
 * E não é esquecimento: `id`, `name` e `email` são o **mesmo** value object dos dois lados, então o
 * mapeador os copia por referência — não há tipo a cruzar. O `PostProfile` tem três porque lá um
 * `PostTitle` vira texto ao entrar no command e um texto vira `UserId` ao sair de um evento; aqui não
 * acontece nem uma coisa nem outra.
 *
 * ## Uma passada, view completa
 * Tudo o que o schema pede sobre um usuário sai daqui — os três campos estão na entidade que já foi
 * carregada. O único campo que fica devendo uma consulta é `Author.posts`, e ele a deve porque é uma
 * coleção aberta e paginada: ali a consulta à parte é o desenho certo, não desperdício.
 */
@Injectable()
export class UserProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile(): MappingProfile {
    return (mapper) => {
      createMap(mapper, Reader, ReaderView);
      createMap(mapper, Author, AuthorView);
    };
  }

}
