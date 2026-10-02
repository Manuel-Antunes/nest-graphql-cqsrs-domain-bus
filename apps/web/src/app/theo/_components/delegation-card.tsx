import { Badge } from '@nestposts/ui/components/ui/badge';
import { Bubble, BubbleContent } from '@nestposts/ui/components/ui/bubble';
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from '@nestposts/ui/components/ui/marker';
import { Spinner } from '@nestposts/ui/components/ui/spinner';
import { NetworkIcon } from 'lucide-react';

export function DelegationCard({
  agentName,
  task,
  said,
  result,
}: {
  agentName: string;
  task: string;
  said: string;
  result?: string;
}) {
  const done = result !== undefined;
  return (
    <section
      aria-label={`Delegation to ${agentName}`}
      className="w-full max-w-[80%] space-y-2 rounded-xl border border-dashed p-3"
    >
      <Marker>
        <MarkerIcon>
          <NetworkIcon />
        </MarkerIcon>
        <MarkerContent>
          Theo asked <strong className="text-foreground">{agentName}</strong>,
          over A2A
        </MarkerContent>
        <Badge variant={done ? 'secondary' : 'outline'} className="ms-auto">
          {done ? 'answered' : <Spinner className="size-3" />}
        </Badge>
      </Marker>
      {task ? (
        <p className="text-muted-foreground text-xs italic">“{task}”</p>
      ) : null}
      {said || result ? (
        <Bubble variant="muted">
          <BubbleContent className="whitespace-pre-wrap">
            {said || result}
          </BubbleContent>
        </Bubble>
      ) : null}
    </section>
  );
}
