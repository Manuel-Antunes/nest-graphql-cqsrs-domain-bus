import { z } from 'zod';
import { InheritValidatedMetadata, ValidatedDto } from '../../validated-dto/mixins';
import { TagId } from '../../domain/tag/vo/tag-id';
import { TagName } from '../../domain/tag/vo/tag-name';

/**
 * O shape da `Tag` no protocolo — dois value objects embutidos.
 *
 * O schema é **um** lugar, e a classe fica com o que é dela: comportamento. Nem um nem outro sabe
 * que existe GraphQL — o `type Tag` mora em `src/graphql/tag.graphql`, e o nome dos campos é a única
 * costura entre os dois.
 */
const TagViewSchema = z.object({
  id: TagId.field(),
  name: TagName.field(),
});

/**
 * Uma tag como o GraphQL a vê: id e nome. Serve tanto para a `Tag` agregada quanto para a que vem
 * copiada no Post.
 *
 * Os campos são **value objects**, não strings: `tag.name` é um `TagName`, com o `equals` e o
 * `toString` dele. No fio, mesmo assim, sai `"Untagged"` — o escalar embutido colapsa para o valor
 * cru na serialização, e o `GraphQLString` o alcança pelo `valueOf`.
 */
@InheritValidatedMetadata()
export class TagView extends ValidatedDto(TagViewSchema) {}
