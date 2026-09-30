import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { Inject, Injectable, Logger } from '@nestjs/common';

export interface InterruptMessageHumanizeInput {
  /** Verbatim message produced by the tool/interrupt source. */
  rawMessage: string;
  /**
   * Discriminator used by the prompt to pick tone. Free-form, but
   * `judit_polling_request` and `audio_consent` are recognized by the
   * template — anything else falls back to a generic rephrase.
   */
  kind: string;
  /** First name (or push_name) of the recipient. */
  userName?: string;
  /** Original user question that triggered the interrupt. */
  lastUserQuestion?: string;
  /** Short recent transcript "User: …" / "Bot: …" — helps avoid
   *  repeating recent phrasing. */
  recentHistory?: string;
}

const INTERRUPT_HUMANIZER_PROMPT =
  PromptTemplate.fromTemplate(`Voce e um humanizador de mensagens-ponte enviadas a um cliente do WhatsApp por uma assistente virtual. A assistente vai pausar o atendimento para processar algo em background (ex.: consultar um processo juridico, perguntar a preferencia de audio do cliente). Sua tarefa: pegar a mensagem bruta e reescrever de forma NATURAL, CONVERSACIONAL, contextualizada.

Mensagem bruta a humanizar:
"""
{raw_message}
"""

Tipo de ponte: {kind}
Nome do cliente: {user_name}
Pergunta original do cliente: {user_question}
Historico recente:
{recent_history}

Regras gerais:
- 1-2 frases curtas. Nunca um paragrafo longo.
- Tom cordial, profissional, empatico. Sem formalidade excessiva.
- Idioma: portugues brasileiro.
- Se o nome do cliente for conhecido, use-o NO MAXIMO UMA VEZ.
- Sem emojis, sem markdown, sem aspas envolvendo a saida.
- NAO invente fatos novos alem da mensagem bruta. Apenas reescreva.
- Varie a forma a cada vez que for chamado (evite repetir frase identica do historico recente).

Regras especificas por tipo:
- "judit_polling_request": comunique que esta verificando o processo, com tom de "ja estou nisso, aguenta um pouco". NAO mencione "API", "background", "tribunais" tecnicamente. Pode citar o numero CNJ se aparecer na mensagem bruta.
- "audio_consent": faca a pergunta de preferencia de audio de forma curta e natural. NAO peca para "responder sim ou nao" — deixe natural.
- outros tipos: apenas reescreva mantendo a intencao.

Gere APENAS a mensagem humanizada final, sem aspas e sem comentario.`);

/**
 * Wraps raw interrupt-payload messages through a quick LLM rephrase so
 * the user sees something natural/contextual instead of the hardcoded
 * template that the tool emitted. Cheap call (single model invocation,
 * no tools) — happens once per interrupt before channel dispatch.
 *
 * Failure-tolerant: on LLM error or empty output, returns the raw
 * message verbatim so the user always gets SOMETHING.
 */
@Injectable()
export class InterruptMessageHumanizer {
  private readonly logger = new Logger(InterruptMessageHumanizer.name);

  constructor(
    @Inject('CRIATIVE_CHAT_MODEL') private readonly llm: BaseChatModel,
  ) {}

  async humanize(input: InterruptMessageHumanizeInput): Promise<string> {
    const raw = input.rawMessage.trim();
    if (!raw) return raw;

    try {
      const chain = INTERRUPT_HUMANIZER_PROMPT.pipe(this.llm).pipe(
        new StringOutputParser(),
      );
      const out = await chain.invoke({
        raw_message: raw,
        kind: input.kind || 'generic',
        user_name: input.userName?.trim() || 'cliente',
        user_question: input.lastUserQuestion?.trim() || '(nao informada)',
        recent_history: input.recentHistory?.trim() || '(sem historico)',
      });
      const trimmed = out.trim();
      if (!trimmed) {
        this.logger.warn(
          `[humanize] empty output for kind=${input.kind} — falling back to raw`,
        );
        return raw;
      }
      this.logger.log(
        `[humanize] kind=${input.kind} rawChars=${raw.length} outChars=${trimmed.length} preview="${trimmed.slice(0, 120)}"`,
      );
      return trimmed;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[humanize] LLM failed for kind=${input.kind} (${errMsg}) — falling back to raw`,
      );
      return raw;
    }
  }
}
